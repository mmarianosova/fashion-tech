import { getApp } from '@/lib/app';
export const dynamic = 'force-dynamic';
// Opening a message counts as checking it. Body {id} marks one; no body marks all.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = (await getApp()).db;
  if (b?.id) await db.run('UPDATE alerts SET is_read=1 WHERE alert_id=?', [b.id]); else await db.run('UPDATE alerts SET is_read=1');
  return Response.json({ ok: true });
}
