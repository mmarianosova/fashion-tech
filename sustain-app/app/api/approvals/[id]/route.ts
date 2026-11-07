import { getApp } from '@/lib/app';
import { resolveApproval, sendApprovalTo } from '@/lib/bridge';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const b = await req.json().catch(() => ({}));
  try {
    const deps = (await getApp()).deps;
    if (b.send) return Response.json(await sendApprovalTo(deps, id, b.send.to, b.send.note));
    return Response.json(await resolveApproval(deps, id, b.allow === true));
  } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}
