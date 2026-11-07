// Scripted stand-ins for the two ZooWork agents. They emit the SAME events the real agents would
// (custom tool calls, approval requests, run.finished) into the SAME bridge, so tests, the replay
// preview, and ZOO_MODE=fake exercise the real app code path. They cost nothing.
import { routeFor, dueReasons } from './rules.ts';
import type { Db } from './db.ts';
import { p } from './db.ts';
import { handleEvent, type Deps } from './bridge.ts';
import { callTool, type McpDeps } from './mcp.ts';
import { plan, type InvRow, type Recycler } from './rules.ts';

type Wait = (check: () => Promise<boolean>) => Promise<void>;
let n = 0;
const emit = (d: Deps, sid: string, e: any) => handleEvent(d, sid, { id: `${sid}:${++n}`, cursor: `${sid}:${n}`, ...e });
const callResult = async (db: Db, callId: string) => p((await db.all('SELECT result FROM handled_calls WHERE call_id=?', [callId]))[0]?.result);

async function call(d: Deps, sid: string, name: string, input: any) {
  const call_id = `call_${sid}_${++n}`;
  await emit(d, sid, { type: 'agent.custom_tool_use', call_id, name, input });
  return call_id;
}

export async function simulateIntake(d: Deps, sid: string, batchId: string, o: { threshold: number; wait: Wait }) {
  const gid = await call(d, sid, 'get_batch', { batch_id: batchId });
  const { items } = await callResult(d.db, gid);
  for (const it of items) {
    const { tags, status, confidence, reason } = it.assessment;
    if (status === 'needs_review' || confidence < o.threshold) {
      const cid = await call(d, sid, 'hold_for_review', { item_key: it.item_key, reason, proposed_tags: tags, confidence });
      await o.wait(async () => (await d.db.all('SELECT state FROM reviews WHERE call_id=?', [cid]))[0]?.state !== 'pending');
    } else {
      await call(d, sid, 'save_tags', { item_key: it.item_key, tags, confidence, reason });
    }
  }
  await emit(d, sid, { type: 'run.finished', status: 'succeeded' });
}

export async function simulateDisposition(d: Deps, sid: string, today: string, mcp: McpDeps, o: { wait: Wait; overrides?: Record<string, string> }) {
  const lid = await call(d, sid, 'list_inventory', { today });
  const inv = await callResult(d.db, lid);
  const rows: InvRow[] = inv.items;
  const routes = new Set(rows.filter((row) => row.status === 'tagged' && row.alert_status !== 'sent' && dueReasons(row, today).length)
    .map(routeFor).filter((route) => route !== 'dispose' && route !== 'review'));
  const partners = await Promise.all([...routes].map((route) => callTool(mcp, 'search_recyclers', { route })));
  const recyclers: Recycler[] = [...new Map<string, Recycler>(partners.flatMap((result) =>
    (result.data.recyclers as Recycler[]).map((partner) => [partner.id, partner]))).values()];
  const pl = plan(rows, recyclers, today);

  for (const pk of pl.pickups) {
    const approval_id = `appr_${sid}_${++n}`;
    const later = pk.items.map((k: string) => o.overrides?.[k]).filter(Boolean) as string[]; // a person moved these to a later date
    const deadline = later.length ? later.sort().at(-1)! : pk.deadline;
    const input = { partner_id: pk.partner_id, route: pk.route, items: pk.items, lots: pk.lots, deadline };
    await emit(d, sid, { type: 'approval.requested', approval_id, tool: 'mcp__recyclerdirectory__book_pickup', input });
    await o.wait(async () => (await d.db.all('SELECT state FROM approvals WHERE approval_id=?', [approval_id]))[0]?.state !== 'pending');
    const st = (await d.db.all('SELECT state FROM approvals WHERE approval_id=?', [approval_id]))[0].state;
    const partner = recyclers.find((r) => r.id === pk.partner_id)!;
    let booking;
    if (st === 'allowed') {
      const attempt = () => callTool({ ...mcp, today }, 'book_pickup', input)
        .catch(() => ({ data: { error: 'internal_error' }, isError: true }));
      booking = await attempt();
      if (booking.isError && booking.data.error === 'internal_error') booking = await attempt();
    }
    if (booking && !booking.isError) {
      const items: string[] = booking.data.items;
      await call(d, sid, 'send_alert', { type: 'donate_recycle_due', items, location: pk.locations.join(', '), deadline,
        next_step: `Hand over to ${partner.name} at ${partner.address} by ${deadline}`, recycler_address: partner.address,
        summary: `${items.length} ${pk.route.replace('_', ' ')} items ready for pickup, ${deadline}` });
    } else if (st === 'rescheduled') {
      const to = (await d.db.all('SELECT resched_to FROM approvals WHERE approval_id=?', [approval_id]))[0].resched_to;
      await call(d, sid, 'send_alert', { type: 'review_waiting', items: pk.items, location: pk.locations.join(', '),
        next_step: `Moved to ${to}. It will be proposed again on the next run.`, summary: `${pk.route.replace('_', ' ')} pickup rescheduled to ${to}` });
    } else {
      await call(d, sid, 'send_alert', { type: 'review_waiting', items: pk.items, location: pk.locations.join(', '),
        next_step: booking ? 'Review the booking error before trying again.' : 'Not booked. These items will be proposed again on the next run.',
        summary: booking ? `${pk.route} pickup: ${booking.data.error}, review needed` : `${pk.route} pickup not booked` });
    }
  }
  const text: Record<string, string> = {
    dispose_confirm: 'Confirm disposal of unusable items', below_minimum: 'Below the partner minimum: hold until more arrive or approve another partner',
    no_partner: 'No partner accepts this route: choose one',
  };
  for (const e of pl.escalations) {
    const locs = [...new Set(rows.filter((r) => e.items.includes(r.item_key)).map((r) => r.location))].join(', ');
    await call(d, sid, 'send_alert', { type: 'review_waiting', items: e.items, location: locs, next_step: text[e.reason] ?? e.reason,
      summary: `${e.items.length} items: ${e.reason.replace('_', ' ')}` });
  }
  await emit(d, sid, { type: 'run.finished', status: 'succeeded' });
  return pl;
}
