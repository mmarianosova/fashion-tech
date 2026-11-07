import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, sqliteDb } from './helpers.ts';
import { handleEvent, resolveApproval, resolveReview, sendApprovalTo, sendReviewTo } from '../lib/bridge.ts';
import { migrate } from '../lib/db.ts';
import { loadPeople } from '../lib/seed.ts';
import { DATA } from './helpers.ts';

async function heldReview() {
  const s = await setup();
  await handleEvent(s.deps, 'ses_1', { id: 'e1', cursor: 'c1', type: 'agent.custom_tool_use', call_id: 'call_1', name: 'hold_for_review',
    input: { item_key: 'T-001', reason: 'No readable fibre content', confidence: 0.4, proposed_tags: { stream: 'mixed', fibre_type: 'blend', color_group: 'mixed', condition: 'damaged' } } });
  return { ...s, r: (await s.db.all('SELECT * FROM reviews'))[0] };
}

test('sending a held item to someone keeps it in the queue, tells the inbox, and leaves the agent waiting', async () => {
  const { deps, db, zoo, r } = await heldReview();
  const out = await sendReviewTo(deps, r.review_id, 'Compliance owner', 'Label is torn');
  assert.deepEqual(out, { already: false, state: 'pending', sent_to: 'Compliance owner' });
  const after = (await db.all('SELECT * FROM reviews'))[0];
  assert.equal(after.state, 'pending'); assert.equal(after.sent_to, 'Compliance owner');
  assert.equal(zoo.resolved.length, 0, 'agent call must NOT be resolved by sending');
  const msg = (await db.all("SELECT * FROM alerts WHERE type='question'"))[0];
  assert.match(msg.summary, /Sent to Compliance owner: T-001/); assert.match(msg.summary, /Label is torn/);
  // idempotent for the same person; a different person gets a new message
  assert.equal((await sendReviewTo(deps, r.review_id, 'Compliance owner')).already, true);
  assert.equal((await sendReviewTo(deps, r.review_id, 'Vendor manager')).already, false);
  assert.equal((await db.all("SELECT 1 FROM alerts WHERE type='question'")).length, 2);
  // whoever decides, the agent then continues
  await resolveReview(deps, r.review_id, 'approve');
  assert.equal(zoo.resolved.length, 1);
  assert.equal((await sendReviewTo(deps, r.review_id, 'Vendor manager')).already, true); // a decided item cannot be sent
});

test('sending a pickup to someone leaves the booking waiting; approving it later still works', async () => {
  const s = await setup();
  await handleEvent(s.deps, 'ses_2', { id: 'a1', cursor: 'a1', type: 'approval.requested', approval_id: 'appr_1',
    tool: 'mcp__recyclerdirectory__book_pickup', input: { partner_id: 'R-MIX', route: 'recycle_mixed', items: ['X-1', 'X-2'], deadline: '2026-11-14' } });
  const out = await sendApprovalTo(s.deps, 'appr_1', 'Vendor manager', 'Are these bagged?');
  assert.equal(out.state, 'pending');
  const msg = (await s.db.all("SELECT * FROM alerts WHERE type='question'"))[0];
  assert.match(msg.summary, /Sent to Vendor manager: a recycle mixed pickup needs a second look\. Are these bagged\?/);
  assert.equal((await s.db.all('SELECT state,sent_to FROM approvals'))[0].state, 'pending');
  assert.equal(s.zoo.approvals.length, 0);
  await resolveApproval(s.deps, 'appr_1', true);
  assert.equal((await s.db.all('SELECT state FROM approvals'))[0].state, 'allowed');
});

test('people list is data, and migrate upgrades a first-release database', async () => {
  assert.ok(loadPeople(DATA).length >= 1);
  const db = sqliteDb();
  await db.exec("CREATE TABLE reviews (review_id TEXT PRIMARY KEY, state TEXT); CREATE TABLE approvals (approval_id TEXT PRIMARY KEY, state TEXT);");
  await migrate(db); await migrate(db);
  await db.run("INSERT INTO reviews (review_id,state,sent_to) VALUES ('r','pending','x')");
  assert.equal((await db.all('SELECT sent_to FROM reviews'))[0].sent_to, 'x');
});
