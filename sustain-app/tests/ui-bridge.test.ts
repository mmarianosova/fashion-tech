import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.ts';
import { handleEvent } from '../lib/bridge.ts';
import { handleUiEvent, toInputs } from '../lib/ui-bridge.ts';
import { callTool } from '../lib/mcp.ts';

test('team UI approval event authorizes the exact proposal and replays without resolving twice', async () => {
  const { db, deps, zoo, mcp } = await setup();
  const input = { route: 'recycle_denim', partner_id: 'R-DEN', items: ['D-001', 'D-003', 'D-005'], deadline: '2026-11-14' };
  await handleEvent(deps, 'run-1', { cursor: 'approval-1', type: 'approval.requested', approval_id: 'ap-1', tool: 'book_pickup', input });
  const event = { id: 'browser-1', mode: 'live', at: '2026-11-07T12:00:00Z', type: 'approval.decision',
    approval_id: 'ap-1', route: input.route, partner_id: input.partner_id, items: [...input.items].reverse(), decision: 'allow' };
  await assert.rejects(handleUiEvent(deps, { ...event, items: ['D-001'] }), { status: 409 });
  assert.equal((await db.all('SELECT state FROM approvals'))[0].state, 'pending');
  assert.deepEqual(await handleUiEvent(deps, event), { already: false, state: 'allowed' });
  assert.deepEqual(await handleUiEvent(deps, event), { already: false, state: 'allowed' });
  assert.equal(zoo.approvals.length, 1);
  assert.equal((await callTool(mcp, 'book_pickup', input)).data.status, 'confirmed');
  assert.equal((await db.all('SELECT COUNT(*) AS count FROM pickups'))[0].count, 1);
});

test('agent snapshot maps to the team UI input keys without raw events', async () => {
  const s = await setup();
  (globalThis as any).__sustain = Promise.resolve(s);
  const { snapshot } = await import('../lib/app.ts');
  const input = toInputs(await snapshot());
  assert.equal(input.items.length, 32);
  assert.equal(typeof input.items[0].key, 'string');
  assert.equal(input.partners['R-DEN'].address, '22 Indigo St');
  assert.ok(input.people.length > 0);
  assert.ok(!('events' in input));
});

test('bridge accepts the actual same-origin host when Next normalizes its request URL', async () => {
  const { uiHeaders } = await import('../lib/ui-bridge.ts');
  const request = (origin: string) => new Request('http://localhost:4318/events', {
    headers: { host: '127.0.0.1:4318', origin },
  });
  assert.equal(uiHeaders(request('http://127.0.0.1:4318'))?.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:4318');
  assert.equal(uiHeaders(request('http://unrelated.example')), null);
});
