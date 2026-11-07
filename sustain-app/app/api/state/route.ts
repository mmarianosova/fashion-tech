import { snapshot } from '@/lib/app';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(await snapshot()); }
