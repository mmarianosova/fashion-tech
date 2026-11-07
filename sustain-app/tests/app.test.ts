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

test('server flow: Intake waits for review and hands the batch to Disposition once', async () => {
  const { app, bridge, db, deps } = await boot();
  const { sessionId } = await app.startRun('intake', { batchId: 'SEED-1', threshold: 0.8 });
  await assert.rejects(app.startRun('intake', {}), /already active/);
  await until(async () => (await db.all("SELECT 1 FROM reviews WHERE state='pending'")).length > 0);
  await app.retryDispositionHandoff();
  assert.equal((await db.all("SELECT 1 FROM runs WHERE agent='disposition'")).length, 0);
  // Act like the reviewer clicking Approve in the UI while the agent is paused.
  await until(async () => {
    for (const r of await db.all("SELECT review_id FROM reviews WHERE state='pending'")) await bridge.resolveReview(deps, r.review_id, 'approve');
    return !!(await db.all('SELECT finished_at FROM runs WHERE session_id=?', [sessionId]))[0].finished_at;
  });
  let snap = await app.snapshot();
  assert.equal(snap.items.filter((i: any) => i.state === 'tagged').length, 32);
  assert.equal(snap.reviews.length, 5);

  await Promise.all(Array.from({ length: 5 }, () => app.retryDispositionHandoff()));
  await until(async () => (await db.all("SELECT 1 FROM runs WHERE agent='disposition'")).length > 0);
  const [d] = await db.all("SELECT session_id FROM runs WHERE agent='disposition'");
  assert.ok(d, 'the handoff started Disposition');
  await until(async () => {
    for (const a of await db.all("SELECT approval_id FROM approvals WHERE state='pending'")) await bridge.resolveApproval(deps, a.approval_id, true);
    return !!(await db.all('SELECT finished_at FROM runs WHERE session_id=?', [d.session_id]))[0].finished_at;
  });
  snap = await app.snapshot();
  assert.equal(snap.pickups.length, 2);
  assert.ok(snap.alerts.length >= 5);
  assert.equal(snap.plan.routes.length, 0); // everything due is now flagged
  assert.ok(snap.events.length > 0);
  await app.retryDispositionHandoff();
  assert.equal((await db.all("SELECT 1 FROM runs WHERE agent='disposition'")).length, 1);
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
  const { handleTextileEvent, textileInputs } = await import('../lib/textile-flow.ts');
  const [rescheduled] = await db.all("SELECT approval_id,input FROM approvals WHERE state='rescheduled'");
  const update = { id: 'history-date', mode: 'live', type: 'approval.decision', decision: 'reschedule',
    approval_id: rescheduled.approval_id, reopened: true, previous_deadline: '2026-11-21' };
  const original = JSON.parse(rescheduled.input).deadline;
  await assert.rejects(handleTextileEvent(deps, { ...update, deadline: '2026-11-06' }), /future/);
  await handleTextileEvent(deps, { ...update, deadline: original });
  assert.equal((await handleTextileEvent(deps, { ...update, deadline: original }) as any).already, true);
  await assert.rejects(handleTextileEvent(deps, { ...update, deadline: '2026-11-18' }), /date changed/);
  const snap = textileInputs(await app.snapshot());
  assert.equal(snap.approvals.find((a) => a.id === rescheduled.approval_id)?.resched_to, original);
  assert.ok(snap.alerts.some((a) => a.summary.includes('pickup rescheduled to ' + original)));
  const second = await app.startRun('disposition', {});
  await until(async () => {
    for (const a of await db.all("SELECT approval_id FROM approvals WHERE state='pending'")) await bridge.resolveApproval(deps, a.approval_id, true);
    return !!(await db.all('SELECT finished_at FROM runs WHERE session_id=?', [second.sessionId]))[0].finished_at;
  });
  const booked = await db.all('SELECT items,deadline FROM pickups');
  const hit = booked.find((b: any) => moved.items.every((k: string) => JSON.parse(b.items).includes(k)));
  assert.ok(hit, 'rescheduled items are proposed and booked again');
  assert.equal(hit.deadline, original);
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

test('pickup edit books the final selection using the original agent request', async () => {
  const { db, deps, mcp, bridge } = await boot();
  const { handleTextileEvent } = await import('../lib/textile-flow.ts');
  const { callTool } = await import('../lib/mcp.ts');
  const original = { partner_id: 'R-DEN', route: 'recycle_denim',
    deadline: '2026-11-14', items: ['D-001', 'D-003', 'D-005'] };
  await bridge.handleEvent(deps, 'edit-pickup', { id: 'propose', type: 'approval.requested',
    approval_id: 'edit-1', tool: 'book_pickup', input: original });
  const event = { id: 'allow', mode: 'live', type: 'approval.decision', approval_id: 'edit-1', decision: 'allow' };
  await assert.rejects(handleTextileEvent(deps, { ...event, items: [...original.items, 'T-001'] }, mcp), /eligible/);
  const items = [...original.items, 'D-002'];
  await handleTextileEvent(deps, { ...event, items }, mcp);
  const booked = await callTool({ ...mcp, today: '2026-11-07' }, 'book_pickup', original);
  assert.equal(booked.isError, false, JSON.stringify(booked));
  assert.deepEqual(booked.data.items, [...items].sort());
  const retry = await callTool({ ...mcp, today: '2026-11-07' }, 'book_pickup', original);
  assert.equal(retry.data.booking_id, booked.data.booking_id);
  assert.equal((await db.all('SELECT 1 FROM pickups')).length, 1);
});

test('delegated labels stay held while confirmed items get a single Disposition handoff', async () => {
  const { app, bridge, db, deps } = await boot();
  const { sessionId } = await app.startRun('intake', { batchId: 'SEED-1' });
  await until(async () => !(await db.all("SELECT 1 FROM batch_items WHERE state='pending'")).length);
  const pending = await db.all("SELECT review_id,item_key FROM reviews WHERE state='pending' ORDER BY rowid");
  const [delegated, ordinary, ...rest] = pending;
  assert.ok(delegated && ordinary);
  await bridge.sendReviewTo(deps, delegated.review_id, 'Vendor manager');
  for (const review of rest) await bridge.resolveReview(deps, review.review_id, 'approve');
  await app.retryDispositionHandoff();
  assert.equal((await db.all("SELECT 1 FROM runs WHERE agent='disposition'")).length, 0);
  await bridge.resolveReview(deps, ordinary.review_id, 'approve');
  await Promise.all([app.retryDispositionHandoff(), app.retryDispositionHandoff()]);
  await until(async () => (await db.all("SELECT 1 FROM approvals WHERE state='pending'")).length > 0);
  const [intake] = await db.all('SELECT finished_at FROM runs WHERE session_id=?', [sessionId]);
  assert.equal(intake.finished_at, null);
  assert.deepEqual((await db.all("SELECT item_key FROM reviews WHERE state='pending'")).map((row) => row.item_key), [delegated.item_key]);
  const [disposition] = await db.all("SELECT session_id FROM runs WHERE agent='disposition'");
  const [inventory] = await db.all("SELECT result FROM handled_calls WHERE call_id LIKE ? AND json_type(result,'$.items')='array'", [`call_${disposition.session_id}_%`]);
  assert.ok(!JSON.parse(inventory.result).items.some((item: any) => item.item_key === delegated.item_key));
  await bridge.resolveReview(deps, delegated.review_id, 'reject');
  await until(async () => {
    for (const approval of await db.all("SELECT approval_id FROM approvals WHERE state='pending'")) {
      await bridge.resolveApproval(deps, approval.approval_id, true);
    }
    return !(await db.all('SELECT 1 FROM runs WHERE finished_at IS NULL')).length;
  });
  await app.retryDispositionHandoff();
  assert.equal((await db.all("SELECT 1 FROM runs WHERE agent='disposition'")).length, 1);
});
