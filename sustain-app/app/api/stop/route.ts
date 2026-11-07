import { getApp } from '@/lib/app';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const { session_id } = await req.json().catch(() => ({}));
  if (!session_id) return Response.json({ error: 'session_id required' }, { status: 400 });
  const a = await getApp(); await a.zoo.interrupt(session_id);
  await a.db.run("UPDATE runs SET finished_at=?,status='interrupted' WHERE session_id=? AND finished_at IS NULL", [a.deps.now(), session_id]);
  return Response.json({ ok: true });
}
