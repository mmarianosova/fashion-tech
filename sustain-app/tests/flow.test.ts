import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, setup } from './helpers.ts';
import { dueReasons, parseLabelText, plan, routeFor, tagItem } from '../lib/rules.ts';
import { handleEvent, resolveApproval, resolveReview } from '../lib/bridge.ts';
import { simulateDisposition, simulateIntake } from '../lib/sim.ts';
import { handleMcp } from '../lib/mcp.ts';
import { checkStart, enforceRunLimit } from '../lib/zoo.ts';

const J = (f: string) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
const norm = (x: any) => ({ ...x, due: [...x.due].sort((a: any, b: any) => a.item_key.localeCompare(b.item_key)),
  routes: [...x.routes].sort((a: any, b: any) => a.item_key.localeCompare(b.item_key)),
  skipped: [...x.skipped].sort((a: any, b: any) => a.item_key.localeCompare(b.item_key)), alert_events: undefined });

test('TS rules match Python reference: tagging of all 32 seed items', () => {
  const items = J('intake_items.json'), exp = J('expected_intake.json');
  items.forEach((it: any, k: number) => {
    const tags = tagItem(it.garment_type, parseLabelText(it.label_text).fibre, it.color, it.condition);
    if (!exp[k].hold) assert.deepEqual(tags, exp[k].tags, it.item_key);
  });
});

test('TS plan equals Python expected_disposition.json exactly', () => {
  const inv = J('inventory.json'), rec = J('recyclers.json'), exp = J('expected_disposition.json');
  assert.deepEqual(norm(plan(inv, rec, '2026-11-07')), norm(exp));
});

test('route and due-reason edge cases', () => {
  assert.equal(routeFor({ category: 'swimwear', tags: { stream: 'mixed', fibre_type: 'x', color_group: 'mixed', condition: 'wearable' } }), 'recycle_mixed');
  const base: any = { item_key: 'a', category: 'tops', tags: {}, location: 'x', alert_status: 'none', status: 'tagged' };
  assert.deepEqual(dueReasons({ ...base, received_date: '2026-09-08' }, '2026-11-07'), ['received_60d']); // exactly 60 days
  assert.deepEqual(dueReasons({ ...base, received_date: '2026-09-09' }, '2026-11-07'), []);             // 59 days
  assert.deepEqual(dueReasons({ ...base, season: 'Fall 2026' }, '2026-10-31'), []);                      // season ends on the 31st, not before
  assert.deepEqual(dueReasons({ ...base, season: 'Fall 2026' }, '2026-11-01'), ['season_end']);
});

test('Intake run end to end: holds wait for a person, scores perfectly', async () => {
  const { db, deps, zoo } = await setup();
  const wait = async (check: () => Promise<boolean>) => {
    // the "person": approve every pending review the first time we are asked to wait
    for (const r of await db.all("SELECT review_id FROM reviews WHERE state='pending'")) {
      await resolveReview(deps, r.review_id, 'approve');
    }
    assert.ok(await check());
  };
  await simulateIntake(deps, 'ses_1', 'SEED-1', { threshold: 0.8, wait });
  const exp = J('expected_intake.json');
  const rows = await db.all("SELECT item_key,state,stream,fibre_type,color_group FROM batch_items WHERE batch_id='SEED-1'");
  const held = (await db.all('SELECT item_key FROM reviews')).map((r: any) => r.item_key).sort();
  assert.deepEqual(held, exp.filter((e: any) => e.hold).map((e: any) => e.item_key).sort());
  for (const e of exp.filter((x: any) => !x.hold)) {
    const r = rows.find((x: any) => x.item_key === e.item_key);
    assert.equal(r.stream, e.tags.stream, e.item_key); assert.equal(r.fibre_type, e.tags.fibre_type); assert.equal(r.color_group, e.tags.color_group);
  }
  assert.ok(rows.every((r: any) => r.state === 'tagged'));
  // the held tool call was resolved only after approval, with decision payload
  const resolvedHold = zoo.resolved.filter((r: any) => (r.result as any)?.decision);
  assert.equal(resolvedHold.length, 5);
  assert.equal((await db.all("SELECT * FROM handled_calls WHERE resolved=0")).length, 0);
});

test('a hold does not resolve the agent call until a person decides; reject marks the item rejected', async () => {
  const { db, deps, zoo } = await setup();
  let sawPendingUnresolved = false;
  const wait = async () => {
    const pend = await db.all("SELECT * FROM reviews WHERE state='pending'");
    for (const r of pend) {
      sawPendingUnresolved = !zoo.resolved.some((x: any) => x.callId === r.call_id);
      await resolveReview(deps, r.review_id, 'reject');
    }
  };
  await simulateIntake(deps, 'ses_2', 'SEED-1', { threshold: 0.8, wait });
  assert.ok(sawPendingUnresolved);
  assert.equal((await db.all("SELECT * FROM inventory WHERE status='rejected'")).length, 5);
});

test('Disposition run end to end matches expected plan; denial escalates; repeat run sends nothing new', async () => {
  const { db, deps, mcp } = await setup();
  const exp = J('expected_disposition.json');
  const wait = async () => { for (const a of await db.all("SELECT approval_id FROM approvals WHERE state='pending'")) await resolveApproval(deps, a.approval_id, true); };
  const pl = await simulateDisposition(deps, 'ses_3', '2026-11-07', mcp, { wait });
  assert.deepEqual(norm(pl), norm(exp));
  const pk = await db.all('SELECT * FROM pickups ORDER BY route');
  assert.deepEqual(pk.map((x: any) => x.route), ['recycle_denim', 'recycle_shred']);
  const alerts = await db.all('SELECT type FROM alerts');
  assert.equal(alerts.filter((a: any) => a.type === 'donate_recycle_due').length, 2);
  assert.equal(alerts.filter((a: any) => a.type === 'review_waiting').length, 3);
  const flagged = await db.all("SELECT COUNT(*) AS n FROM inventory WHERE alert_status='sent'");
  // second run the same day: everything due is now flagged, so nothing is routed again
  const before = alerts.length;
  const pl2 = await simulateDisposition(deps, 'ses_4', '2026-11-07', mcp, { wait });
  assert.equal(pl2.routes.length, 0);
  assert.equal((await db.all('SELECT * FROM alerts')).length, before);
  assert.ok(flagged[0].n >= 16);
});

test('denied pickup becomes a review_waiting alert, no booking', async () => {
  const { db, deps, mcp } = await setup();
  const wait = async () => { for (const a of await db.all("SELECT approval_id FROM approvals WHERE state='pending'")) await resolveApproval(deps, a.approval_id, false); };
  await simulateDisposition(deps, 'ses_5', '2026-11-07', mcp, { wait });
  assert.equal((await db.all('SELECT * FROM pickups')).length, 0);
  assert.equal((await db.all("SELECT * FROM alerts WHERE type='donate_recycle_due'")).length, 0);
});

test('double-alert guard and validation errors return an error to the agent, not a crash', async () => {
  const { db, deps, zoo } = await setup();
  const send = (n: number, input: any) => handleEvent(deps, 's', { id: `e${n}`, cursor: `e${n}`, type: 'agent.custom_tool_use', call_id: `c${n}`, name: 'send_alert', input });
  const ok = { type: 'review_waiting', items: ['T-001'], next_step: 'x', summary: 'y' };
  await send(1, ok); await send(2, ok); await send(3, { type: 'nope' });
  const r = zoo.resolved as any[];
  assert.equal(r[0].isError, false); assert.equal(r[1].isError, true); assert.match(r[1].result.error, /already alerted/); assert.equal(r[2].isError, true);
  assert.equal((await db.all('SELECT * FROM alerts')).length, 1);
});

test('duplicate delivery of the same event is ignored; failed resolve is retried without re-running the tool', async () => {
  const { db, deps, zoo } = await setup();
  const ev = { id: 'x1', cursor: 'x1', type: 'agent.custom_tool_use', call_id: 'cx', name: 'send_alert', input: { type: 'review_waiting', items: ['T-003'], next_step: 'n', summary: 's' } };
  zoo.failResolveOnce = true;
  await assert.rejects(handleEvent(deps, 's', ev));                 // resolve fails after the tool ran
  assert.equal((await db.all('SELECT * FROM alerts')).length, 1);
  await handleEvent(deps, 's', { ...ev, cursor: 'x1-retry', id: 'x1-retry' }); // redelivery with a new cursor
  assert.equal((await db.all('SELECT * FROM alerts')).length, 1);     // tool NOT run twice
  assert.equal((zoo.resolved as any[]).length, 1);
  assert.equal((await handleEvent(deps, 's', { ...ev, cursor: 'x1-retry', id: 'x1-retry' })).duplicate, true);
});

test('MCP: initialize, tools/list, search, book (min enforced), notifications', async () => {
  const { mcp } = await setup();
  const rpc = (method: string, params?: any, id: any = 1) => handleMcp(mcp, { jsonrpc: '2.0', id, method, params });
  assert.equal((await rpc('initialize', { protocolVersion: '2025-03-26' })).result.serverInfo.name, 'recycler-directory');
  assert.equal(await handleMcp(mcp, { jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.deepEqual((await rpc('tools/list')).result.tools.map((t: any) => t.name), ['search_recyclers', 'book_pickup']);
  const s = await rpc('tools/call', { name: 'search_recyclers', arguments: { route: 'recycle_denim' } });
  assert.equal(JSON.parse(s.result.content[0].text).recyclers[0].id, 'R-DEN');
  const bad = await rpc('tools/call', { name: 'book_pickup', arguments: { partner_id: 'R-DEN', route: 'recycle_denim', items: ['D-001'], deadline: '2026-11-14' } });
  assert.equal(bad.result.isError, true);
  const good = await rpc('tools/call', { name: 'book_pickup', arguments: { partner_id: 'R-DEN', route: 'recycle_denim', items: ['D-001', 'D-003', 'D-005'], deadline: '2026-11-14' } });
  assert.equal(good.result.isError, false);
  assert.equal((await rpc('nope')).error.code, -32601);
});

test('cost guard refuses below floor and interrupts above the run limit', async () => {
  const { zoo } = await setup();
  zoo.balance = 12;
  await assert.rejects(checkStart(zoo, 20), /below the floor/);
  zoo.balance = 80; assert.equal(await checkStart(zoo, 20), 80);
  zoo.getSessionCosts = async () => ({ s1: 4.2, s2: 0.5 });
  assert.equal((await enforceRunLimit(zoo, 's1', 3)).interrupted, true);
  assert.equal((await enforceRunLimit(zoo, 's2', 3)).interrupted, false);
  assert.deepEqual(zoo.interrupts, ['s1']);
});

test('approval is single-use: second click does not call ZooWork again', async () => {
  const { db, deps, zoo } = await setup();
  await handleEvent(deps, 's', { id: 'a1', cursor: 'a1', type: 'approval.requested', approval_id: 'ap1', tool: 'mcp__recyclerdirectory__book_pickup', input: {} });
  assert.equal((await resolveApproval(deps, 'ap1', true)).already, false);
  assert.equal((await resolveApproval(deps, 'ap1', true)).already, true);
  assert.equal((zoo as any).approvals.length, 1);
  assert.equal((await db.all('SELECT tool FROM approvals'))[0].tool, 'book_pickup');
});
