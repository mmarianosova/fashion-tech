// recycler-directory MCP server (JSON-RPC over streamable HTTP, JSON responses). Fictional data only.
import type { Db } from './db.ts';
import { j, p } from './db.ts';
import { dueReasons, isCalendarDate, routeFor, type Recycler } from './rules.ts';

export type McpDeps = { db: Db; recyclers: Recycler[]; now: () => string; newId: (p: string) => string; today?: string };

const TOOLS = [
  { name: 'search_recyclers', description: 'Find recycling or donation partners that accept a route. Returns partners with minimum item counts and addresses.',
    inputSchema: { type: 'object', properties: { route: { type: 'string', enum: ['donate', 'recycle_shred', 'recycle_denim', 'recycle_mixed'] } }, required: ['route'] } },
  { name: 'book_pickup', description: 'Book a pickup with a partner. Requires approval by a person.',
    inputSchema: { type: 'object', properties: {
      partner_id: { type: 'string' }, route: { type: 'string' }, items: { type: 'array', items: { type: 'string' } },
      lots: { type: ['object', 'null'], additionalProperties: { type: 'array', items: { type: 'string' } } }, deadline: { type: 'string' } },
      required: ['partner_id', 'route', 'items', 'deadline'] } },
];

const failure = (error: string) => ({ data: { error }, isError: true });

function itemKeys(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.some((key) => typeof key !== 'string' || !key.trim())) return null;
  return new Set(value).size === value.length ? [...value].sort() as string[] : null;
}

function bookingInput(a: any) {
  const items = itemKeys(a?.items);
  if (!items || typeof a.partner_id !== 'string' || typeof a.route !== 'string' || !isCalendarDate(a.deadline)) return null;
  if (a.lots != null && (typeof a.lots !== 'object' || Array.isArray(a.lots))) return null;
  const lots = Object.entries(a.lots ?? {}).sort(([a], [b]) => a.localeCompare(b))
    .map(([color, keys]) => [color, itemKeys(keys)] as const);
  if (lots.some(([, keys]) => !keys)) return null;
  return { partner_id: a.partner_id, route: a.route, items, lots: Object.fromEntries(lots), deadline: a.deadline };
}

const pickupRows = (d: McpDeps, items: string[]) => d.db.all(
  'SELECT * FROM inventory WHERE item_key IN (SELECT value FROM json_each(?)) ORDER BY item_key', [j(items)],
);
const eligible = (row: any, route: string) => row.status === 'tagged' && row.alert_status !== 'sent' &&
  !!row.location?.trim() && routeFor({ category: row.category, tags: row }) === route;
function colourLots(rows: any[], route: string) {
  const lots: Record<string, string[]> = {};
  if (route === 'recycle_shred') for (const row of rows) (lots[row.color_group] ??= []).push(row.item_key);
  return Object.fromEntries(Object.entries(lots).sort(([a], [b]) => a.localeCompare(b)));
}

export async function preparePickupEdit(d: McpDeps, approvalId: string, original: unknown, selection: unknown) {
  const input = bookingInput(original);
  const items = itemKeys(selection);
  if (!input || !items) throw new Error('Select at least one unique item for the pickup.');
  if (j(input.items) === j(items)) return undefined;
  const partner = d.recyclers.find((r) => r.id === input.partner_id && r.accepts.includes(input.route));
  if (!partner || items.length < partner.min_items) throw new Error('This pickup does not meet the partner minimum.');
  const rows = await pickupRows(d, items);
  if (rows.length !== items.length || rows.some((row) => !eligible(row, input.route))) {
    throw new Error('Every selected item must be confirmed and eligible for this pickup route.');
  }
  const added = items.filter((item) => !input.items.includes(item));
  const taken = await d.db.all(`SELECT 1 FROM pickups p, json_each(p.items) item WHERE item.value IN (SELECT value FROM json_each(?))
    UNION ALL SELECT 1 FROM approvals a, json_each(json_extract(COALESCE(a.approved_input,a.input),'$.items')) item
      WHERE a.approval_id<>? AND a.state IN ('pending','allowed') AND item.value IN (SELECT value FROM json_each(?)) LIMIT 1`,
    [j(items), approvalId, j(added)]);
  if (taken.length) throw new Error('A selected item is already assigned to another pickup.');
  return { ...input, items, lots: colourLots(rows, input.route) };
}

export async function callTool(d: McpDeps, name: string, a: any): Promise<{ data: any; isError: boolean }> {
  if (name === 'search_recyclers') {
    return { data: { recyclers: d.recyclers.filter((r) => r.accepts.includes(a?.route)) }, isError: false };
  }
  if (name !== 'book_pickup') return failure('unknown_tool');
  const requested = bookingInput(a);
  if (!requested) return failure('invalid_booking_input');
  const approvals = await d.db.all("SELECT approval_id,session_id,input,approved_input FROM approvals WHERE tool='book_pickup' AND state='allowed'");
  const approval = approvals.find((row) => j(bookingInput(p(row.input))) === j(requested));
  const input = approval?.approved_input ? bookingInput(p(approval.approved_input)) : requested;
  if (!input) return failure('invalid_booking_input');
  const { partner_id, route, items, lots, deadline } = input;
  const partner = d.recyclers.find((r) => r.id === partner_id);
  if (!partner) return failure('unknown_partner');
  if (route === 'dispose' || !partner.accepts.includes(route)) return failure('route_not_accepted');
  if (items.length < partner.min_items) return failure('below_minimum');

  if (!approval) return failure('approval_required');
  const booked = async () => (await d.db.all(
    'SELECT booking_id FROM pickups WHERE partner_id=? AND route=? AND deadline=? AND items=? AND COALESCE(lots, ?) = ?',
    [partner_id, route, deadline, j(items), j({}), j(lots)],
  ))[0];
  const confirmed = (id: string) => ({ data: { booking_id: id, status: 'confirmed', partner_id, deadline, items, lots }, isError: false });
  const existing = await booked();
  if (existing) return confirmed(existing.booking_id);

  const now = d.now();
  const today = d.today ?? now.slice(0, 10);
  if (!isCalendarDate(today) || deadline < today) return failure('invalid_pickup_deadline');
  const fields = ['item_key', 'category', 'stream', 'fibre_type', 'color_group', 'condition', 'location',
    'season', 'received_date', 'return_window_close', 'item_due_date', 'status', 'alert_status'];
  const rows = await pickupRows(d, items);
  // An explicit human addition can travel early. Originally proposed items still need to be due.
  if (rows.length !== items.length || rows.some((row) => !eligible(row, route) ||
      (requested.items.includes(row.item_key) && !dueReasons(row, today).length))) {
    return failure('inventory_not_eligible');
  }
  if (j(lots) !== j(colourLots(rows, route))) return failure('invalid_pickup_lots');

  const id = d.newId('bk');
  const inserted = await d.db.all(`INSERT INTO pickups (booking_id,partner_id,route,items,lots,deadline,created_at,session_id)
    SELECT ?,?,?,?,?,?,?,?
    WHERE EXISTS (SELECT 1 FROM approvals WHERE approval_id=? AND state='allowed' AND input=? AND approved_input IS ?)
      AND (SELECT COUNT(*) FROM inventory
        WHERE json_array(${fields.join(',')}) IN (SELECT json(value) FROM json_each(?))) = ?
      AND NOT EXISTS (SELECT 1 FROM pickups p, json_each(p.items) old
        WHERE old.value IN (SELECT value FROM json_each(?)))
    RETURNING booking_id`,
    [id, partner_id, route, j(items), j(lots), deadline, now, approval.session_id, approval.approval_id, approval.input, approval.approved_input,
      j(rows.map((row) => fields.map((field) => row[field]))), items.length, j(items)]);
  if (inserted.length) return confirmed(id);
  const retry = await booked();
  return retry ? confirmed(retry.booking_id) : failure('inventory_changed_or_already_booked');
}

// Returns a JSON-RPC response object, or null for notifications (reply 202 with no body).
export async function handleMcp(d: McpDeps, msg: any): Promise<any | null> {
  const id = msg?.id;
  const ok = (result: any) => ({ jsonrpc: '2.0', id, result });
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(-32600, 'Invalid Request');
  if (msg.method.startsWith('notifications/')) return null;
  switch (msg.method) {
    case 'initialize':
      return ok({ protocolVersion: msg.params?.protocolVersion ?? '2025-03-26', capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'recycler-directory', version: '1.0.0' } });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      const { data, isError } = await callTool(d, msg.params?.name, msg.params?.arguments ?? {})
        .catch(() => failure('internal_error'));
      return ok({ content: [{ type: 'text', text: JSON.stringify(data) }], isError });
    }
    default: return err(-32601, `Method not found: ${msg.method}`);
  }
}
