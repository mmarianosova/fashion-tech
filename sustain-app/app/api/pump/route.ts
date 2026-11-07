import { getApp, pumpSession, retryDispositionHandoff } from '@/lib/app';
export const dynamic = 'force-dynamic';
// Poller fallback for real mode: pulls events for unfinished runs. Safe to call repeatedly (events are deduped).
export async function POST() {
  const a = await getApp();
  const open = await a.db.all('SELECT session_id FROM runs WHERE finished_at IS NULL');
  for (const r of open) await pumpSession(r.session_id).catch(() => null);
  await retryDispositionHandoff();
  return Response.json({ pumped: open.length });
}
