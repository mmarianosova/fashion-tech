import { getApp } from '@/lib/app';
import { handleUiEvent, preflight, UiEventError, uiHeaders } from '@/lib/ui-bridge';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export async function POST(req: Request) {
  const headers = uiHeaders(req);
  if (!headers) return new Response(null, { status: 403 });
  try {
    const input = await req.json().catch(() => null);
    return Response.json(await handleUiEvent((await getApp()).deps, input), { headers });
  } catch (error) {
    const known = error instanceof UiEventError;
    return Response.json({ error: known ? error.message : 'Could not process decision' },
      { status: known ? error.status : 502, headers });
  }
}
