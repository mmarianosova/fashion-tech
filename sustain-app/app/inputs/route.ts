import { getApp, pumpSession, snapshot } from '@/lib/app';
import { preflight, toInputs, uiHeaders } from '@/lib/ui-bridge';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
let pumping: Promise<void> | undefined;

export async function GET(req: Request) {
  const headers = uiHeaders(req);
  if (!headers) return new Response(null, { status: 403 });
  pumping ??= (async () => {
    const { db } = await getApp();
    const runs = await db.all('SELECT session_id FROM runs WHERE finished_at IS NULL');
    for (const run of runs) await pumpSession(run.session_id);
  })().finally(() => { pumping = undefined; });
  try {
    await pumping;
    return Response.json(toInputs(await snapshot()), { headers });
  } catch {
    return Response.json({ error: 'Agent inputs temporarily unavailable' }, { status: 502, headers });
  }
}
