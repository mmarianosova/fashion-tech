import { getApp } from '@/lib/app';
import { rescheduleApproval, resolveApproval, sendApprovalTo } from '@/lib/bridge';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const b = await req.json().catch(() => ({}));
  try {
    const { deps, mcp } = await getApp();
    if (b.reschedule) return Response.json(await rescheduleApproval(deps, id, b.reschedule.deadline, { today: mcp.today, previous: b.reschedule.previous }));
    if (b.send) return Response.json(await sendApprovalTo(deps, id, b.send.to, b.send.note));
    return Response.json(await resolveApproval(deps, id, b.allow === true, undefined, mcp));
  } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}
