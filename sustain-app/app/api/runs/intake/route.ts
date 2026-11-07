import { startRun } from '@/lib/app';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  try { return Response.json(await startRun('intake', { batchId: b.batch_id, threshold: Number(b.threshold) || 0.8 })); }
  catch (e: any) { return Response.json({ error: e.message }, { status: 409 }); }
}
