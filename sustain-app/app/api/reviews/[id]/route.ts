import { getApp } from '@/lib/app';
import { resolveReview, sendReviewTo } from '@/lib/bridge';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const b = await req.json().catch(() => ({}));
  if (!['approve', 'edit', 'reject', 'send'].includes(b.decision)) return Response.json({ error: 'decision must be approve|edit|reject|send' }, { status: 400 });
  try {
    const deps = (await getApp()).deps;
    return Response.json(b.decision === 'send' ? await sendReviewTo(deps, id, b.to, b.note) : await resolveReview(deps, id, b.decision, b.tags));
  } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}
