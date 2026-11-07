import { getApp } from '@/lib/app';
import { handleTextileEvent } from '@/lib/textile-flow';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (process.env.TEXTILE_FLOW_BRIDGE !== '1') return new Response(null, { status: 404 });
  const interfaceOrigin = process.env.TEXTILE_FLOW_ORIGIN || new URL(request.url).origin;
  if (request.headers.get('origin') !== interfaceOrigin) {
    return Response.json({ error: 'The interface and agent bridge must share an origin.' }, { status: 403 });
  }
  try {
    const event = await request.json();
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid event.');
    return Response.json(await handleTextileEvent((await getApp()).deps, event));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid event.' }, { status: 400 });
  }
}
