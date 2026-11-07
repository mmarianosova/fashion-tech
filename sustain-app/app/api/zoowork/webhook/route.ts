import { pumpSession } from '@/lib/app';
import { verifyWebhook } from '@/lib/webhook';
export const dynamic = 'force-dynamic';
// Verify the signature on the RAW body, then re-read the session's events (webhooks can duplicate or reorder).
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.ZOOWORK_WEBHOOK_SECRET;
  if (!secret) return new Response('webhook secret not configured', { status: 500 });
  const ok = verifyWebhook(secret, {
    id: req.headers.get('webhook-id'), timestamp: req.headers.get('webhook-timestamp'), signature: req.headers.get('webhook-signature') }, raw);
  if (!ok) return new Response('invalid signature', { status: 401 });
  let body: any = {}; try { body = JSON.parse(raw); } catch {}
  const sessionId = body.session_id ?? body.data?.session_id;   // VERIFY payload shape
  if (sessionId) await pumpSession(sessionId);
  return new Response(null, { status: 204 });
}
