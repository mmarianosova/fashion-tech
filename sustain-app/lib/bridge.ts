// Event bridge: turns ZooWork events into app actions. Used by the webhook route, the poller, and the simulator.
// Event shape below is NORMALISED by normalizeEvent(); VERIFY field names against real events at the smoke test.
import type { Db } from './db.ts';
import { j, p } from './db.ts';
import type { ZooClient } from './zoo.ts';
import { PENDING, ToolError, tools } from './tools.ts';

export type Deps = { db: Db; zoo: ZooClient; now: () => string; newId: (prefix: string) => string };

export type AppEvent = {
  id: string; cursor: string; type: string;
  call_id?: string; name?: string; input?: any;       // agent.custom_tool_use
  approval_id?: string; tool?: string;                  // approval.requested
  status?: string; text?: string;
};

export function normalizeEvent(raw: any): AppEvent {
  const type = raw.type ?? raw.event_type ?? 'unknown';
  return {
    id: String(raw.id ?? raw.event_id ?? raw.cursor ?? ''),
    cursor: String(raw.cursor ?? raw.id ?? ''),
    type,
    call_id: raw.call_id ?? raw.tool_use_id ?? raw.custom_tool_call_id ?? raw.id,
    name: raw.name ?? raw.tool_name,
    input: raw.input ?? raw.arguments ?? raw.params,
    approval_id: raw.approval_id ?? raw.approvalId,
    tool: raw.tool ?? raw.tool_name ?? raw.name,
    status: raw.status, text: raw.text,
  };
}

const tn = (n?: string) => (n ?? '').split('__').pop() ?? '';

export async function handleEvent(d: Deps, sessionId: string, raw: any) {
  const ev = normalizeEvent(raw);
  const ins = await d.db.all('SELECT 1 AS x FROM events WHERE session_id=? AND cursor=?', [sessionId, ev.cursor]);
  if (ins.length) return { duplicate: true };
  await d.db.run('INSERT INTO events (session_id,cursor,type,payload,created_at) VALUES (?,?,?,?,?)', [sessionId, ev.cursor, ev.type, j(raw), d.now()]);

  if (ev.type === 'agent.custom_tool_use' && ev.call_id && ev.name) await runCustomTool(d, sessionId, ev);
  else if (ev.type === 'approval.requested' && ev.approval_id) {
    await d.db.run('INSERT OR IGNORE INTO approvals (approval_id,session_id,tool,input,created_at) VALUES (?,?,?,?,?)',
      [ev.approval_id, sessionId, tn(ev.tool), j(ev.input ?? null), d.now()]);
  } else if (ev.type === 'run.finished') {
    await d.db.run(`UPDATE runs SET finished_at=?,status=? WHERE session_id=?`, [d.now(), ev.status ?? 'succeeded', sessionId]);
  }
  return { duplicate: false };
}

async function runCustomTool(d: Deps, sessionId: string, ev: AppEvent) {
  const callId = ev.call_id!;
  let handled = (await d.db.all('SELECT * FROM handled_calls WHERE call_id=?', [callId]))[0];
  if (handled?.resolved) return;
  if (!handled) {
    let result: any; let isError = false;
    try {
      const fn = tools[ev.name!];
      if (!fn) throw new ToolError(`unknown tool ${ev.name}`);
      result = await fn({ db: d.db, now: d.now, callId, sessionId, newId: d.newId }, ev.input);
      if (result === PENDING) return; // hold_for_review: resolved later by resolveReview
    } catch (e: any) {
      isError = true; result = { error: e instanceof ToolError ? e.message : 'internal_error' };
    }
    await d.db.run('INSERT OR IGNORE INTO handled_calls (call_id,result,is_error,resolved) VALUES (?,?,?,0)', [callId, j(result), isError ? 1 : 0]);
    handled = { call_id: callId, result: j(result), is_error: isError ? 1 : 0 };
  }
  // result stored first, so a redelivery after a failed resolve reuses it instead of re-running the tool
  await d.zoo.resolveCustomToolCall(sessionId, callId, p(handled.result), !!handled.is_error);
  await d.db.run('UPDATE handled_calls SET resolved=1 WHERE call_id=?', [callId]);
}

export async function resolveReview(d: Deps, reviewId: string, decision: 'approve' | 'edit' | 'reject', tags?: any) {
  const r = (await d.db.all('SELECT * FROM reviews WHERE review_id=?', [reviewId]))[0];
  if (!r) throw new Error('unknown review');
  if (r.state !== 'pending') return { already: true, state: r.state };
  const proposed = p(r.proposed_tags);
  const final = decision === 'reject' ? null : (tags ?? proposed);
  if (decision !== 'reject' && !final) throw new Error('tags required: no proposed tags to approve');
  const state = decision === 'approve' ? 'approved' : decision === 'edit' ? 'edited' : 'rejected';
  await d.db.run('UPDATE reviews SET state=?,decided_tags=?,decided_at=? WHERE review_id=?', [state, j(final), d.now(), reviewId]);
  if (final) {
    await d.db.run(`UPDATE inventory SET stream=?,fibre_type=?,color_group=?,condition=?,status='tagged' WHERE item_key=?`,
      [final.stream, final.fibre_type, final.color_group, final.condition, r.item_key]);
    await d.db.run(`UPDATE batch_items SET state='tagged',stream=?,fibre_type=?,color_group=? WHERE batch_id=? AND item_key=?`,
      [final.stream, final.fibre_type, final.color_group, r.batch_id, r.item_key]);
  } else {
    await d.db.run(`UPDATE inventory SET status='rejected' WHERE item_key=?`, [r.item_key]);
    await d.db.run(`UPDATE batch_items SET state='rejected' WHERE batch_id=? AND item_key=?`, [r.batch_id, r.item_key]);
  }
  const result = { decision, tags: final };
  await d.db.run('INSERT OR IGNORE INTO handled_calls (call_id,result,is_error,resolved) VALUES (?,?,0,0)', [r.call_id, j(result)]);
  await d.zoo.resolveCustomToolCall(r.session_id, r.call_id, result, false);
  await d.db.run('UPDATE handled_calls SET resolved=1 WHERE call_id=?', [r.call_id]);
  return { already: false, state };
}

export async function resolveApproval(d: Deps, approvalId: string, allow: boolean) {
  const a = (await d.db.all('SELECT * FROM approvals WHERE approval_id=?', [approvalId]))[0];
  if (!a) throw new Error('unknown approval');
  if (a.state !== 'pending') return { already: true, state: a.state };
  await d.zoo.resolveApproval(approvalId, allow ? 'allow-once' : 'deny');
  await d.db.run('UPDATE approvals SET state=?,decided_at=? WHERE approval_id=?', [allow ? 'allowed' : 'denied', d.now(), approvalId]);
  return { already: false, state: allow ? 'allowed' : 'denied' };
}

// ---- "Send to someone": the reviewer is not sure and wants a named person to decide ----
// Nothing is decided and the agent keeps waiting: the item or pickup stays in the queue, marked with who it was sent to,
// and a message goes to the inbox. There is no timeout and nothing is ever auto-denied.
async function postMessage(d: Deps, items: string[], summary: string, next_step: string) {
  await d.db.run(
    `INSERT INTO alerts (alert_id,type,items,location,deadline,next_step,recycler_address,summary,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [d.newId('msg'), 'question', j(items), null, null, next_step, null, summary, d.now()]);
}

export async function sendReviewTo(d: Deps, reviewId: string, person: string, note?: string) {
  const r = (await d.db.all('SELECT * FROM reviews WHERE review_id=?', [reviewId]))[0];
  if (!r) throw new Error('unknown review');
  if (!person) throw new Error('person required');
  if (r.state !== 'pending') return { already: true, state: r.state };
  if (r.sent_to === person) return { already: true, state: 'pending', sent_to: person };
  await d.db.run('UPDATE reviews SET sent_to=?,sent_at=? WHERE review_id=?', [person, d.now(), reviewId]);
  await postMessage(d, [r.item_key], `Sent to ${person}: ${r.item_key} needs a second look. ${note || r.reason}`, `${person} to decide. It stays in Check labels until someone answers.`);
  return { already: false, state: 'pending', sent_to: person };
}

export async function sendApprovalTo(d: Deps, approvalId: string, person: string, note?: string) {
  const a = (await d.db.all('SELECT * FROM approvals WHERE approval_id=?', [approvalId]))[0];
  if (!a) throw new Error('unknown approval');
  if (!person) throw new Error('person required');
  if (a.state !== 'pending') return { already: true, state: a.state };
  if (a.sent_to === person) return { already: true, state: 'pending', sent_to: person };
  const input = p(a.input) ?? {};
  await d.db.run('UPDATE approvals SET sent_to=? WHERE approval_id=?', [person, approvalId]);
  await postMessage(d, input.items ?? [], `Sent to ${person}: a ${String(input.route ?? '').replace('_', ' ')} pickup needs a second look.${note ? ' ' + note : ''}`, `${person} to decide. The booking stays in Approve pickups until someone answers.`);
  return { already: false, state: 'pending', sent_to: person };
}

/** Move a proposed pickup to a later hand-over date. The agent is told no (so it is not left waiting), the app remembers the new date,
 *  and the items are proposed again on the next Disposition run with that date. Not final: nothing is lost. */
export async function rescheduleApproval(d: Deps, approvalId: string, deadline: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline ?? '')) throw new Error('deadline must be YYYY-MM-DD');
  const a = (await d.db.all('SELECT * FROM approvals WHERE approval_id=?', [approvalId]))[0];
  if (!a) throw new Error('unknown approval');
  if (a.state !== 'pending') return { already: true, state: a.state };
  const input = p(a.input) ?? {};
  if (input.deadline && deadline <= input.deadline) throw new Error('new date must be later than the current one');
  await d.zoo.resolveApproval(approvalId, 'deny');
  await d.db.run("UPDATE approvals SET state='rescheduled',resched_to=?,decided_at=? WHERE approval_id=?", [deadline, d.now(), approvalId]);
  await postMessage(d, input.items ?? [], `Pickup moved to ${deadline}: the ${String(input.route ?? '').replace('_', ' ')} pickup will be proposed again on the next run.`, 'Nothing to do now. Run now proposes it again with the new date.');
  return { already: false, state: 'rescheduled', resched_to: deadline };
}
