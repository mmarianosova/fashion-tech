import test from 'node:test';
import assert from 'node:assert/strict';
import { assessIntake, type CatalogRow, type ProductLookup } from '../lib/intake.ts';
import { handleEvent, resolveReview } from '../lib/bridge.ts';
import { simulateIntake } from '../lib/sim.ts';
import { setup } from './helpers.ts';

const link = 'https://www.macys.com/shop/product/test?ID=123&cm_kws=123456789012';
const row: CatalogRow = { sheet: 'Products', row: 2, style: 'T123', upcs: ['123456789012'], urls: [link] };
const catalog = (...rows: CatalogRow[]) => ({ sourceUrl: 'https://example.test/catalog', rows });
const item = { item_key: 'T123', garment_type: 'hat', condition: 'wearable' };

test('complete label text classifies without looking up a product', async () => {
  const r = await assessIntake({ ...item, label_text: '80% cotton, 20% polyester', color: 'red', catalog: catalog(row) },
    async () => assert.fail('lookup was unnecessary'));
  assert.equal(r.status, 'tagged');
  assert.deepEqual(r.tags, { stream: 'shred', fibre_type: 'blend', color_group: 'brights', condition: 'wearable' });
  assert.equal(r.material?.[0].pct, 80);
});

test('only verified website matches fill absent fields and retain their evidence', async () => {
  const lookup: ProductLookup = async (query) => {
    assert.deepEqual(query.urls, [link]);
    assert.deepEqual(query.upcs, row.upcs);
    return { status: 'found', matches: [{ url: link, upc: row.upcs[0], composition: '100% wool', color: 'navy' }] };
  };
  const r = await assessIntake({ ...item, catalog: catalog(row, { ...row, row: 3, urls: [link.replace(row.upcs[0], '999')] }) }, lookup);
  assert.equal(r.status, 'tagged');
  assert.equal(r.tags.fibre_type, 'wool');
  assert.equal(r.evidence.lookup.matches[0].url, link);
  assert.equal(r.evidence.workbook?.rows.length, 2);
});

test('absent, multiple, wrong-variant and failed lookups require review', async () => {
  for (const status of ['not_found', 'unavailable'] as const) {
    const r = await assessIntake({ ...item, catalog: catalog(row) }, async () => ({ status }));
    assert.equal(r.status, 'needs_review');
    assert.equal(r.evidence.lookup.status, status);
  }
  const match = { url: link, upc: row.upcs[0], composition: '100% cotton', color: 'black' };
  for (const matches of [[{ ...match, upc: 'wrong' }], [match, match]]) {
    const r = await assessIntake({ ...item, catalog: catalog(row) }, async () => ({ status: 'found', matches }));
    assert.equal(r.status, 'needs_review');
    assert.equal(r.tags.fibre_type, 'unknown');
  }
  const r = await assessIntake({ ...item, catalog: catalog(row) }, async () => { throw new Error('403'); });
  assert.equal(r.evidence.lookup.status, 'unavailable');
});

test('catalog contradictions, incomplete compositions and missing physical condition require review', async () => {
  const input = { ...item, color: 'navy', label_text: '100% cotton' };
  const conflict = await assessIntake({ ...input, catalog: catalog({ ...row, composition: '100% wool', color: 'red' }) });
  assert.match(conflict.reason, /Conflicting compositions.*Conflicting colors/);
  for (const label_text of ['42% Acrylic, 28% Nylon, 30 PBT', '100% cotton, 10% mystery', '90.5% cotton, 9.5% wool']) {
    assert.equal((await assessIntake({ ...input, label_text })).status, 'needs_review', label_text);
  }
  const missing = await assessIntake({ ...input, condition: undefined });
  assert.equal(missing.tags.condition, 'unknown');
  assert.equal(missing.status, 'needs_review');
});

test('catalog batch persists evidence, refuses automatic tagging and allows a human correction', async () => {
  const { db, deps, zoo } = await setup();
  await db.run("INSERT INTO batches (batch_id,created_at) VALUES ('B','2026-11-07')");
  await db.run("INSERT INTO batch_items (batch_id,item_key,garment_type) VALUES ('B','B:T123','hat')");
  await db.run("INSERT INTO intake_inputs VALUES ('B','B:T123',?)",
    [JSON.stringify(catalog({ ...row, composition: '100% polyester', color: 'black' }))]);
  const wait = async (check: () => Promise<boolean>) => {
    const [review] = await db.all("SELECT * FROM reviews WHERE state='pending'");
    const [assessment] = await db.all("SELECT result FROM intake_assessments WHERE item_key='B:T123'");
    assert.equal(JSON.parse(assessment.result).evidence.workbook.rows[0].row, 2);
    const proposal = JSON.parse(review.proposed_tags);
    await assert.rejects(resolveReview(deps, review.review_id, 'approve'), /Complete and valid tags/);
    await handleEvent(deps, 'session', { id: 'bypass', type: 'agent.custom_tool_use', call_id: 'bypass', name: 'save_tags',
      input: { item_key: 'B:T123', tags: { ...proposal, condition: 'wearable' }, confidence: 1 } });
    assert.equal(zoo.resolved.find((r) => r.callId === 'bypass')?.isError, true);
    await resolveReview(deps, review.review_id, 'edit', { ...proposal, condition: 'damaged' });
    assert.ok(await check());
  };
  await simulateIntake(deps, 'session', 'B', { threshold: 0, wait });
  const [saved] = await db.all("SELECT status,fibre_type,condition FROM inventory WHERE item_key='B:T123'");
  assert.deepEqual({ ...saved }, { status: 'tagged', fibre_type: 'polyester', condition: 'damaged' });
});

test('website lookup tries the catalog link first and falls back to a verified exact style', async () => {
  const order: string[] = [];
  const official = 'https://www.marcusadlerny.com/products/example?variant=42';
  const { createProductLookup } = await import('../lib/product-lookup.ts');
  const lookup = createProductLookup(async (query) => {
    order.push('search');
    assert.deepEqual(query.upcs, row.upcs);
    return [{ url: official, style: 'T123', composition: '100% polyester', color: 'Black' }];
  }, async () => {
    order.push('direct');
    return { outcome: 'http_403', matches: [] };
  });
  const r = await assessIntake({ ...item, catalog: catalog(row) }, lookup);
  assert.deepEqual(order, ['direct', 'search']);
  assert.equal(r.status, 'tagged');
  assert.equal(r.evidence.lookup.verified?.url, official);
  assert.deepEqual(r.evidence.lookup.attempts.map((a) => a.outcome), ['http_403', 'verified']);
});

test('a verified direct product skips fallback; a wrong UPC cannot be rescued by style', async () => {
  const { createProductLookup } = await import('../lib/product-lookup.ts');
  const lookup = createProductLookup(async () => assert.fail('fallback unnecessary'), async () => ({
    outcome: 'read',
    matches: [
      { url: link, upc: 'wrong', style: row.style, composition: '100% nylon' },
      { url: link, upc: row.upcs[0], composition: '100% wool', color: 'ivory' },
    ],
  }));
  const r = await assessIntake({ ...item, catalog: catalog(row) }, lookup);
  assert.equal(r.tags.fibre_type, 'wool');
  assert.equal(r.evidence.lookup.attempts.length, 1);
});

test('manufacturer search checks the variant on the product page and keeps its own color', async (t) => {
  const { createProductLookup, manufacturerSearch } = await import('../lib/product-lookup.ts');
  const urls: string[] = [];
  const composition = '<p>Hand wash.</p><p>100% cotton</p>';
  t.mock.method(globalThis, 'fetch', async (input: URL) => {
    urls.push(input.href);
    if (input.pathname === '/search/suggest.json') {
      return Response.json({ resources: { results: { products: [{ handle: 'example' }] } } });
    }
    const product = { description: composition, options: ['Color'], variants: [
      { id: 41, sku: 'T124', barcode: '123456789099', options: ['Ivory'] },
      { id: 42, sku: 'T123', barcode: '123456789012', options: ['Black'] },
    ] };
    return new Response(`<script type="application/json" id="ProductJson-1">${JSON.stringify(product)}</script>`,
      { headers: { 'content-type': 'text/html' } });
  });
  const r = await assessIntake({ ...item, catalog: catalog({ ...row, urls: [] }) }, createProductLookup(manufacturerSearch));
  assert.equal(r.tags.fibre_type, 'cotton');
  assert.equal(r.tags.color_group, 'darks');
  assert.match(r.evidence.lookup.verified?.url ?? '', /variant=42$/);
  assert.ok(urls.some((url) => new URL(url).searchParams.get('q') === row.upcs[0]));
});

test('a numeric workbook color is replaced by the exact variant color, but layered fabric is held', async () => {
  const r = await assessIntake({ ...item, catalog: catalog({ ...row, color: '9.75' }) }, async () => ({
    status: 'found', matches: [{ url: link, upc: row.upcs[0], color: 'Olive',
      composition: 'Outer: 100% leather / lining: 100% polyester' }],
  }));
  assert.equal(r.color, 'olive');
  assert.match(r.reason, /Website composition needs manual classification/);
  assert.equal(r.material, null);
});

test('index verifies retailer fields only on the exact variant after both site steps fail', async () => {
  const { createProductLookup } = await import('../lib/product-lookup.ts');
  const { matchIndexedPage } = await import('../lib/product-index.ts');
  const url = 'https://www.dsw.com/product/example/42?activeColor=001';
  const text = 'Color Black\n\n* UPC # 123456789012\n\n##### FEATURES\n\n* 100% polyester';
  assert.equal(matchIndexedPage({ url, text: text + '\nUPC: 999999999999' }, { style: row.style, upcs: row.upcs, urls: [] }), undefined);
  assert.equal(matchIndexedPage({ url, text: text.replace('UPC # ', '') }, { style: row.style, upcs: row.upcs, urls: [] }), undefined);
  const lookup = createProductLookup(async () => { throw new Error('429'); },
    async () => ({ outcome: 'http_403', matches: [] }), async () => [{ url, text }]);
  const r = await assessIntake({ ...item, condition: undefined, materialOnly: true, catalog: catalog(row) }, lookup);
  assert.equal(r.status, 'tagged');
  assert.equal(r.tags.fibre_type, 'polyester');
  assert.equal(r.tags.condition, 'unknown');
  assert.deepEqual(r.evidence.lookup.attempts.map((a) => a.method), ['catalog_url', 'identifier_search', 'index_search']);
});

test('material-only catalog intake stores outer and lining separately and excludes the item from disposition', async () => {
  const { db, deps } = await setup();
  await db.run("INSERT INTO batches (batch_id,created_at) VALUES ('M','2026-11-07')");
  await db.run("INSERT INTO batch_items (batch_id,item_key) VALUES ('M','M:T123')");
  await db.run("INSERT INTO intake_inputs VALUES ('M','M:T123',?)", [JSON.stringify(catalog(row))]);
  await simulateIntake({ ...deps, materialOnly: true, lookupProduct: async () => ({
    status: 'found', matches: [{ url: link, upc: row.upcs[0], composition: 'Outer: 100% genuine leather / lining: 100% polyester' }],
  }) }, 'material-session', 'M', { threshold: 0.8, wait: async () => assert.fail('material is complete') });
  const [result] = await db.all("SELECT result FROM intake_assessments WHERE item_key='M:T123'");
  assert.deepEqual(JSON.parse(result.result).materialComponents, {
    outer: [{ fibre: 'leather', pct: 100 }], lining: [{ fibre: 'polyester', pct: 100 }],
  });
  assert.equal((await db.all("SELECT status FROM inventory WHERE item_key='M:T123'"))[0].status, 'material_tagged');
});
