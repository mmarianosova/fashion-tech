import { retryDispositionHandoff, snapshot } from '@/lib/app';
import { textileInputs } from '@/lib/textile-flow';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.TEXTILE_FLOW_BRIDGE !== '1') return new Response(null, { status: 404 });
  await retryDispositionHandoff();
  return Response.json(textileInputs(await snapshot()), { headers: { 'Cache-Control': 'no-store' } });
}
