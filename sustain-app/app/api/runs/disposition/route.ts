import { startRun } from '@/lib/app';
export const dynamic = 'force-dynamic';
export async function POST() {
  try { return Response.json(await startRun('disposition', {})); }
  catch (e: any) { return Response.json({ error: e.message }, { status: 409 }); }
}
