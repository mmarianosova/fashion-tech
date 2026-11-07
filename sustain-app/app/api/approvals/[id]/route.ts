import { getApp } from '@/lib/app';
import { resolveApproval } from '@/lib/bridge';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const b = await req.json().catch(() => ({}));
  try { return Response.json(await resolveApproval((await getApp()).deps, id, b.allow === true)); }
  catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}
