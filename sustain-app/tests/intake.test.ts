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
