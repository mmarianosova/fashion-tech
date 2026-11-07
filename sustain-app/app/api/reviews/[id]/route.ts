import { getApp } from '@/lib/app';
import { resolveReview } from '@/lib/bridge';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const b = await req.json().catch(() => ({}));
  if (!['approve', 'edit', 'reject'].includes(b.decision)) return Response.json({ error: 'decision must be approve|edit|reject' }, { status: 400 });
  try { return Response.json(await resolveReview((await getApp()).deps, id, b.decision, b.tags)); }
  catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}
