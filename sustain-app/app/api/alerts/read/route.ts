import { getApp } from '@/lib/app';
export const dynamic = 'force-dynamic';
export async function POST() { await (await getApp()).db.run('UPDATE alerts SET is_read=1'); return Response.json({ ok: true }); }
