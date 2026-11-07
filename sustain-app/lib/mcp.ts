// recycler-directory MCP server (JSON-RPC over streamable HTTP, JSON responses). Fictional data only.
import type { Db } from './db.ts';
import { j } from './db.ts';
import type { Recycler } from './rules.ts';

export type McpDeps = { db: Db; recyclers: Recycler[]; now: () => string; newId: (p: string) => string };

const TOOLS = [
  { name: 'search_recyclers', description: 'Find recycling or donation partners that accept a route. Returns partners with minimum item counts and addresses.',
    inputSchema: { type: 'object', properties: { route: { type: 'string', enum: ['donate', 'recycle_shred', 'recycle_denim', 'recycle_mixed'] } }, required: ['route'] } },
  { name: 'book_pickup', description: 'Book a pickup with a partner. Requires approval by a person.',
    inputSchema: { type: 'object', properties: {
      partner_id: { type: 'string' }, route: { type: 'string' }, items: { type: 'array', items: { type: 'string' } },
      lots: { type: ['object', 'null'], additionalProperties: { type: 'array', items: { type: 'string' } } }, deadline: { type: 'string' } },
      required: ['partner_id', 'route', 'items', 'deadline'] } },
];

export async function callTool(d: McpDeps, name: string, a: any): Promise<{ data: any; isError: boolean }> {
  if (name === 'search_recyclers') {
    return { data: { recyclers: d.recyclers.filter((r) => r.accepts.includes(a?.route)) }, isError: false };
  }
  if (name === 'book_pickup') {
    const partner = d.recyclers.find((r) => r.id === a?.partner_id);
    if (!partner) return { data: { error: 'unknown_partner' }, isError: true };
    if (!partner.accepts.includes(a.route)) return { data: { error: 'route_not_accepted' }, isError: true };
    if (!Array.isArray(a.items) || a.items.length < partner.min_items) return { data: { error: 'below_minimum', min_items: partner.min_items }, isError: true };
    const id = d.newId('bk');
    await d.db.run('INSERT INTO pickups (booking_id,partner_id,route,items,lots,deadline,created_at) VALUES (?,?,?,?,?,?,?)',
      [id, a.partner_id, a.route, j(a.items), j(a.lots ?? null), a.deadline, d.now()]);
    return { data: { booking_id: id, status: 'confirmed', partner_id: a.partner_id, deadline: a.deadline }, isError: false };
  }
  return { data: { error: 'unknown_tool' }, isError: true };
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
      const { data, isError } = await callTool(d, msg.params?.name, msg.params?.arguments ?? {});
      return ok({ content: [{ type: 'text', text: JSON.stringify(data) }], isError });
    }
    default: return err(-32601, `Method not found: ${msg.method}`);
  }
}
