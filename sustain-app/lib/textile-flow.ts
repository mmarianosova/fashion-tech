import type { snapshot } from './app.ts';
import { preparePickupEdit, type McpDeps } from './mcp.ts';
import { p } from './db.ts';
import { resolveReview, sendReviewTo, resolveApproval, rescheduleApproval, sendApprovalTo, type Deps } from './bridge.ts';

export function textileInputs(s: Awaited<ReturnType<typeof snapshot>>) {
  const keys = new Set(s.items.map((i) => i.item_key));
  const assigned = new Set([
    ...s.approvals.filter((a) => a.state === 'pending' || a.state === 'allowed').flatMap((a) => a.input?.items ?? []),
    ...s.pickups.flatMap((p) => p.items ?? []),
  ]);
  return {
    today: s.today,
    items: s.items.map((i) => ({ key: i.item_key, garment: i.garment_type, color: i.color,
      label: i.label_text, state: i.state, stream: i.stream, fibre: i.fibre_type,
      color_group: i.color_group, confidence: i.confidence, condition: i.condition })),
    reviews: s.reviews.filter((r) => keys.has(r.item_key)).map((r) => ({
      id: r.review_id, item: r.item_key, label: r.label_text, proposed: r.proposed_tags,
      reason: r.reason, state: r.state,
    })),
    approvals: s.approvals.map((a) => ({ id: a.approval_id, state: a.state, input: a.input,
      addable_items: s.pickupCandidates.filter((i) => keys.has(i.key) && i.route === a.input?.route && !assigned.has(i.key)).map((i) => i.key),
    })),
    pickups: s.pickups.map((p) => ({ id: p.booking_id, route: p.route, partner: p.partner_id,
      deadline: p.deadline, n: p.items?.length ?? 0, items: p.items, lots: p.lots })),
    alerts: s.alerts.map((a) => ({ id: a.alert_id, type: a.type, summary: a.summary, items: a.items,
      deadline: a.deadline, next: a.next_step, ref: a.ref_kind, from: a.from_name, read: !!a.is_read })),
    partners: Object.fromEntries(s.recyclers.map((r) => [r.id, { name: r.name, address: r.address }])),
    people: s.people.map((person) => person.name),
  };
}

const required = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing event field.');
  return value;
};

export async function handleTextileEvent(d: Deps, event: Record<string, unknown>, mcp?: McpDeps) {
  required(event.id);
  if (event.mode !== 'live') throw new Error('Only live events can change the test batch.');
  if (event.reopened) throw new Error('Completed decisions cannot be reopened by the agent backend.');
  switch (event.type) {
    case 'review.decision': {
      const id = required(event.review_id);
      const [review] = await d.db.all('SELECT * FROM reviews WHERE review_id=?', [id]);
      if (!review || review.item_key !== event.item) throw new Error('Review does not match the item.');
      if (event.decision === 'approve' || event.decision === 'reject') {
        return resolveReview(d, id, event.decision);
      }
      if (event.decision !== 'edit') throw new Error('Unknown review decision.');
      const [assessment] = await d.db.all('SELECT result FROM intake_assessments WHERE session_id=? AND batch_id=? AND item_key=?',
        [review.session_id, review.batch_id, review.item_key]);
      if (p(assessment?.result)?.materialOnly) {
        throw new Error('The current interface sends a sorting stream, so it cannot edit a material-only review.');
      }
      const stream = (event.tags as { stream?: unknown } | null)?.stream;
      return resolveReview(d, id, 'edit', { ...p(review.proposed_tags), stream: required(stream) });
    }
    case 'review.send':
      return sendReviewTo(d, required(event.review_id), required(event.to));
    case 'approval.decision': {
      const id = required(event.approval_id);
      if (event.decision === 'reschedule') return rescheduleApproval(d, id, required(event.deadline));
      if (event.decision === 'deny') return resolveApproval(d, id, false);
      if (event.decision === 'allow') {
        if (event.items === undefined) {
          if (Array.isArray(event.items_added) && event.items_added.length ||
              Array.isArray(event.items_removed) && event.items_removed.length) {
            throw new Error('The final pickup list is required.');
          }
          return resolveApproval(d, id, true);
        }
        const [approval] = await d.db.all('SELECT * FROM approvals WHERE approval_id=?', [id]);
        if (!approval || approval.tool !== 'book_pickup') throw new Error('Unknown pickup approval.');
        if (approval.state !== 'pending') return { already: true, state: approval.state };
        if (!mcp) throw new Error('Pickup validation is unavailable.');
        const edited = await preparePickupEdit(mcp, id, p(approval.input), event.items);
        return resolveApproval(d, id, true, edited);
      }
      throw new Error('Unknown approval decision.');
    }
    case 'approval.send':
      return sendApprovalTo(d, required(event.approval_id), required(event.to));
    case 'alert.read':
      await d.db.run('UPDATE alerts SET is_read=1 WHERE alert_id=?', [required(event.alert_id)]);
      return { ok: true };
    default:
      throw new Error('Unknown Textile Flow event.');
  }
}
