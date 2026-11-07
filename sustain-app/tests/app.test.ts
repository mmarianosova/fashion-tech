import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { setup } from './helpers.ts';
import { verifyWebhook } from '../lib/webhook.ts';

process.env.PACE_MS = '0';
process.env.ZOO_MODE = 'fake';

async function boot() {
  const s = await setup();
  (globalThis as any).__sustain = Promise.resolve({ db: s.db, zoo: s.zoo, deps: s.deps, mcp: s.mcp });
  const app = await import('../lib/app.ts');
  const bridge = await import('../lib/bridge.ts');
  return { ...s, app, bridge };
}
const until = async (fn: () => Promise<boolean>, ms = 15000) => { const t = Date.now(); while (!(await fn())) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 50)); } };

test('server flow: intake run with UI-style review decisions, then disposition with approvals', async () => {
  const { app, bridge, db, deps } = await boot();
  const { sessionId } = await app.startRun('intake', { batchId: 'SEED-1', threshold: 0.8 });
  await assert.rejects(app.startRun('intake', {}), /already active/);
  // act like the reviewer clicking Approve in the UI while the agent is paused
  await until(async () => {
    for (const r of await db.all("SELECT review_id FROM reviews WHERE state='pending'")) await bridge.resolveReview(deps, r.review_id, 'approve');
    return !!(await db.all('SELECT finished_at FROM runs WHERE session_id=?', [sessionId]))[0].finished_at;
  });
  let snap = await app.snapshot();
  assert.equal(snap.items.filter((i: any) => i.state === 'tagged').length, 32);
  assert.equal(snap.reviews.length, 5);

  const d = await app.startRun('disposition', {});
  await until(async () => {
    for (const a of await db.all("SELECT approval_id FROM approvals WHERE state='pending'")) await bridge.resolveApproval(deps, a.approval_id, true);
    return !!(await db.all('SELECT finished_at FROM runs WHERE session_id=?', [d.sessionId]))[0].finished_at;
  });
  snap = await app.snapshot();
  assert.equal(snap.pickups.length, 2);
  assert.ok(snap.alerts.length >= 5);
  assert.equal(snap.plan.routes.length, 0); // everything due is now flagged
  assert.ok(snap.events.length > 0);
});

test('startRun refuses when the balance is below the floor', async () => {
  const { app, zoo } = await boot();
  zoo.balance = 5;
  await assert.rejects(app.startRun('disposition', {}), /below the floor/);
});

test('webhook signature: valid, tampered body, stale timestamp, wrong secret', () => {
  const secretRaw = Buffer.from('super-secret-key-bytes').toString('base64');
  const secret = `whsec_${secretRaw}`;
  const body = '{"session_id":"s1"}', id = 'msg_1', ts = '1800000000';
  const sig = 'v1,' + createHmac('sha256', Buffer.from(secretRaw, 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  const h = { id, timestamp: ts, signature: sig };
  assert.equal(verifyWebhook(secret, h, body, 1800000100), true);
  assert.equal(verifyWebhook(secret, h, body + ' ', 1800000100), false);
  assert.equal(verifyWebhook(secret, h, body, 1800000400), false);
  assert.equal(verifyWebhook('whsec_' + Buffer.from('other').toString('base64'), h, body, 1800000100), false);
  assert.equal(verifyWebhook(secret, { ...h, signature: 'v1,AAAA ' + sig }, body, 1800000100), true); // multiple signatures
});

test('rescheduling a pickup tells the agent no, then the next run proposes the items again with the new date', async () => {
  const { app, bridge, db, deps } = await boot();
  const first = await app.startRun('disposition', {});
  let moved: any = null;
  await until(async () => {
    const pend = await db.all("SELECT approval_id,input FROM approvals WHERE state='pending'");
    for (const a of pend) {
      if (!moved) { moved = JSON.parse(a.input); await bridge.rescheduleApproval(deps, a.approval_id, '2026-11-21'); }
      else await bridge.resolveApproval(deps, a.approval_id, false);
    }
    return !!(await db.all('SELECT finished_at FROM runs WHERE session_id=?', [first.sessionId]))[0].finished_at;
  });
  assert.equal((await db.all("SELECT state FROM approvals WHERE state='rescheduled'")).length, 1);
  assert.equal((await db.all('SELECT 1 FROM pickups')).length, 0);
  await assert.rejects(bridge.rescheduleApproval(deps, 'nope', '2026-11-21'), /unknown approval/);
  const second = await app.startRun('disposition', {});
  await until(async () => {
    for (const a of await db.all("SELECT approval_id FROM approvals WHERE state='pending'")) await bridge.resolveApproval(deps, a.approval_id, true);
    return !!(await db.all('SELECT finished_at FROM runs WHERE session_id=?', [second.sessionId]))[0].finished_at;
  });
  const booked = await db.all('SELECT items,deadline FROM pickups');
  const hit = booked.find((b: any) => moved.items.every((k: string) => JSON.parse(b.items).includes(k)));
  assert.ok(hit, 'rescheduled items are proposed and booked again');
  assert.equal(hit.deadline, '2026-11-21');
});

test('Textile Flow reads agent results and records review decisions without inventing pickups', async () => {
  const { app, db, deps } = await boot();
  const { textileInputs, handleTextileEvent } = await import('../lib/textile-flow.ts');
  const { tools } = await import('../lib/tools.ts');
  const { items } = await tools.get_batch({ ...deps, sessionId: 'textile-flow', callId: 'get' }, { batch_id: 'SEED-1' });
  const item = items.find((i: any) => i.item_key === 'T-001');
  await tools.hold_for_review({ ...deps, sessionId: 'textile-flow', callId: 'hold' }, {
    item_key: item.item_key, proposed_tags: item.assessment.tags, confidence: 0.8, reason: 'Verify test label',
  });
  const input = textileInputs(await app.snapshot());
  const review = input.reviews.find((r) => r.item === item.item_key)!;
  assert.equal(review.state, 'pending');
  assert.match(review.label, /100% COTTON/);
  await assert.rejects(handleTextileEvent(deps, { id: 'wrong', mode: 'live', type: 'review.decision',
    item: 'OTHER', review_id: review.id, decision: 'approve' }), /does not match/);
  await handleTextileEvent(deps, { id: 'correct', mode: 'live', type: 'review.decision',
    item: item.item_key, review_id: review.id, decision: 'approve' });
  const saved = textileInputs(await app.snapshot());
  assert.equal(saved.items.find((i) => i.key === item.item_key)?.fibre, 'cotton');
  assert.equal(saved.reviews.find((r) => r.id === review.id)?.state, 'approved');
  assert.equal((await db.all('SELECT * FROM pickups')).length, 0);
});
