import { getApp } from '@/lib/app';
import { handleMcp } from '@/lib/mcp';
export const dynamic = 'force-dynamic';
// Public, unauthenticated, fictional data. Must never redirect.
export async function POST(req: Request) {
  const a = await getApp();
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleMcp(a.mcp, m)))).filter((x) => x !== null);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const res = await handleMcp(a.mcp, body);
  return res === null ? new Response(null, { status: 202 }) : Response.json(res);
}
export async function GET() { return new Response('recycler-directory MCP: POST JSON-RPC here', { status: 405, headers: { Allow: 'POST' } }); }
