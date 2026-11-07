import { createZooworkClient } from '@zoowork-ai/sdk';
import { env, getApp } from '@/lib/app';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(req.url).hostname);
  if (!local || env.mode !== 'real' || process.env.ENABLE_ZOOWORK_ARTIFACT_DOWNLOAD !== '1') {
    return new Response('Not found', { status: 404 });
  }
  const { id } = await params;
  if (!/^bk_[a-z0-9-]+$/i.test(id)) return new Response('Not found', { status: 404 });
  const { db } = await getApp();
  const [booking] = await db.all("SELECT p.session_id FROM pickups p JOIN runs r USING(session_id) WHERE p.booking_id=? AND r.agent='disposition'", [id]);
  const agent = process.env.DISPOSITION_AGENT_ID;
  if (!booking || !agent) return new Response('Not found', { status: 404 });

  try {
    const client = createZooworkClient();
    const filename = `pickup-${id}.md`;
    const { artifacts } = await client.listArtifacts(agent, { sessionId: booking.session_id });
    const artifact = artifacts.find(row => row.file_name === filename && row.status === 'ready');
    if (!artifact) return new Response('The ZooWork file is not available yet. Refresh after the run finishes.', { status: 404 });
    const { url } = await client.downloadArtifact(agent, artifact.artifact_id);
    if (!url || new URL(url).protocol !== 'https:') throw new Error('Invalid artifact URL');
    const upstream = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!upstream.ok || !upstream.body) throw new Error('Artifact download failed');
    return new Response(upstream.body, { headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch {
    return new Response('ZooWork download unavailable', { status: 502 });
  }
}
