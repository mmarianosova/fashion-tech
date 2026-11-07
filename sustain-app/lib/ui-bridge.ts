import { j, p } from './db.ts';
import { resolveApproval, rescheduleApproval, resolveReview, sendApprovalTo, sendReviewTo, type Deps } from './bridge.ts';

type Snapshot = Awaited<ReturnType<typeof import('./app.ts').snapshot>>;

export function toInputs(s: Snapshot) {
  return {
    today: s.today,
    items: s.items.map(i => ({ key: i.item_key, garment: i.garment_type, color: i.color, label: i.label_text,
      state: i.state, stream: i.stream, fibre: i.fibre_type, color_group: i.color_group, confidence: i.confidence, condition: i.condition })),
    reviews: s.reviews.map(r => ({ id: r.review_id, item: r.item_key, label: r.label_text, proposed: r.proposed_tags,
      reason: r.reason, state: r.state, sent_to: r.sent_to })),
    approvals: s.approvals.map(a => ({ id: a.approval_id, state: a.state, input: a.input, sent_to: a.sent_to })),
    pickups: s.pickups.map(p => ({ id: p.booking_id, route: p.route, partner: p.partner_id,
      deadline: p.deadline, n: p.items?.length ?? 0, items: p.items, lots: p.lots })),
    alerts: s.alerts.map(a => ({ id: a.alert_id, type: a.type, summary: a.summary, items: a.items, deadline: a.deadline,
      next: a.next_step, ref: a.ref_kind, from: a.from_name, read: !!a.is_read })),
    partners: Object.fromEntries(s.recyclers.map(r => [r.id, { name: r.name, address: r.address }])),
    people: s.people.map(person => person.name),
  };
}

export class UiEventError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new UiEventError(`Invalid ${name}`);
  return value;
}

type Event = Record<string, unknown>;
async function apply(d: Deps, event: Event) {
  switch (event.type) {
    case 'approval.decision': {
      const id = required(event.approval_id, 'approval_id');
      const [approval] = await d.db.all('SELECT input FROM approvals WHERE approval_id=?', [id]);
      if (!approval) throw new UiEventError('Unknown approval', 404);
      const input = p(approval.input);
      const items = event.items;
      if (!input || !Array.isArray(items) || !items.every(key => typeof key === 'string') ||
          j([...items].sort()) !== j([...(input.items ?? [])].sort()) ||
          event.route !== input.route || event.partner_id !== input.partner_id) {
        throw new UiEventError('Changed pickup requires a new ZooWork proposal and approval', 409);
      }
      if (event.decision === 'reschedule') return rescheduleApproval(d, id, required(event.deadline, 'deadline'));
      if (event.decision === 'allow' || event.decision === 'deny') return resolveApproval(d, id, event.decision === 'allow');
      throw new UiEventError('Invalid approval decision');
    }
    case 'approval.send':
      return sendApprovalTo(d, required(event.approval_id, 'approval_id'), required(event.to, 'to'));
    case 'review.decision': {
      const id = required(event.review_id, 'review_id');
      const [review] = await d.db.all('SELECT item_key,state,proposed_tags FROM reviews WHERE review_id=?', [id]);
      if (!review || review.item_key !== event.item) throw new UiEventError('Unknown review', 404);
      if (event.reopened || review.state !== 'pending') throw new UiEventError('Review is final and must be requested again', 409);
      if (event.decision === 'approve' || event.decision === 'reject') return resolveReview(d, id, event.decision);
      if (event.decision !== 'edit') throw new UiEventError('Invalid review decision');
      const stream = (event.tags as { stream?: unknown } | null)?.stream;
      const previous = p(review.proposed_tags);
      if (!['shred', 'denim', 'mixed', 'trash'].includes(String(stream)) || !previous?.fibre_type ||
          !previous?.color_group || !previous?.condition) throw new UiEventError('Complete material and condition tags are required');
      return resolveReview(d, id, 'edit', { ...previous, stream });
    }
    case 'review.send':
      return sendReviewTo(d, required(event.review_id, 'review_id'), required(event.to, 'to'));
    case 'alert.read': {
      const id = required(event.alert_id, 'alert_id');
      await d.db.run('UPDATE alerts SET is_read=1 WHERE alert_id=?', [id]);
      return { ok: true };
    }
    default: throw new UiEventError('Unsupported event type');
  }
}

export async function handleUiEvent(d: Deps, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new UiEventError('Invalid event');
  const event = input as Event;
  const id = required(event.id, 'id');
  if (event.mode !== 'live' || typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at))) {
    throw new UiEventError('Expected a dated live event');
  }
  const payload = j(Object.fromEntries(Object.entries(event).sort(([a], [b]) => a.localeCompare(b))));
  const inserted = await d.db.all('INSERT OR IGNORE INTO ui_events (id,payload) VALUES (?,?) RETURNING id', [id, payload]);
  if (!inserted.length) {
    const [prior] = await d.db.all('SELECT payload,result FROM ui_events WHERE id=?', [id]);
    if (!prior || prior.payload !== payload || !prior.result) throw new UiEventError('Conflicting or pending event', 409);
    return p(prior.result);
  }
  try {
    const result = await apply(d, event);
    await d.db.run('UPDATE ui_events SET result=? WHERE id=?', [j(result), id]);
    return result;
  } catch (error) {
    await d.db.run('DELETE FROM ui_events WHERE id=? AND result IS NULL', [id]);
    throw error;
  }
}

export function uiHeaders(req: Request) {
  const origin = req.headers.get('origin');
  const configured = process.env.TEXTILE_UI_ORIGIN;
  if (origin && origin !== new URL(req.url).origin && origin !== configured) return null;
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return headers;
}

export function preflight(req: Request) {
  const headers = uiHeaders(req);
  return headers ? new Response(null, { status: 204, headers }) : new Response(null, { status: 403 });
}
