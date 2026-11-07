// Server wiring for Next.js route handlers. Server-only: never import from client components.
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { libsqlDb, type Db } from './db.ts';
import { seed, loadRecyclers, loadPeople } from './seed.ts';
import { FakeZoo, checkStart, realZoo, type ZooClient } from './zoo.ts';
import { handleEvent, resolveApproval, type Deps } from './bridge.ts';
import { simulateDisposition, simulateIntake } from './sim.ts';
import type { McpDeps } from './mcp.ts';
import { plan } from './rules.ts';
import { p } from './db.ts';

export const env = {
  mode: (process.env.ZOO_MODE ?? 'fake') as 'fake' | 'real',
  today: process.env.DEMO_TODAY ?? '2026-11-07',
  floor: Number(process.env.BALANCE_FLOOR_USD ?? 20),
  runLimit: Number(process.env.RUN_COST_LIMIT_USD ?? 3),
};

type App = { db: Db; zoo: ZooClient; deps: Deps; mcp: McpDeps };
const g = globalThis as any;

export async function getApp(): Promise<App> {
  if (!g.__sustain) g.__sustain = init();
  return g.__sustain;
}

async function init(): Promise<App> {
  const dataDir = join(process.cwd(), 'data');
  const db = await libsqlDb(process.env.DATABASE_URL ?? 'file:local.db', process.env.DATABASE_AUTH_TOKEN);
  await seed(db, dataDir);
  const zoo = env.mode === 'real' ? await realZoo(process.env.ZOOWORK_API_KEY!, process.env.ZOOWORK_BASE_URL) : new FakeZoo();
  const now = () => new Date().toISOString();
  const newId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;
  const recyclers = loadRecyclers(dataDir);
  return { db, zoo, deps: { db, zoo, now, newId }, mcp: { db, recyclers, now, newId } };
}

// In fake mode the "person" decisions come from the UI; the simulator polls the DB until they arrive.
// There is deliberately no timeout: a held item or a pickup stays in its queue until a person decides. Nothing is auto-denied.
const pollWait = () => async (check: () => Promise<boolean>) => {
  while (!(await check())) await new Promise((r) => setTimeout(r, 400));
};
const pace = () => new Promise((r) => setTimeout(r, Number(process.env.PACE_MS ?? 350))); // slows fake runs so the live feed is visible

export async function startRun(kind: 'intake' | 'disposition', opts: { batchId?: string; threshold?: number }) {
  const a = await getApp();
  const active = await a.db.all("SELECT session_id FROM runs WHERE finished_at IS NULL AND agent=?", [kind]);
  if (active.length) throw new Error(`A ${kind} run is already active`);
  await checkStart(a.zoo, env.floor);
  const threshold = opts.threshold ?? 0.8;
  const batchId = opts.batchId ?? 'SEED-1';
  // Items from a pickup that was denied or rescheduled come back: clear their alert flag so they can be proposed again.
  const overrides: Record<string, string> = {};
  if (kind === 'disposition') {
    const booked = new Set((await a.db.all('SELECT items FROM pickups')).flatMap((r: any) => p<string[]>(r.items) ?? []));
    for (const r of await a.db.all("SELECT input,state,resched_to FROM approvals WHERE state IN ('denied','rescheduled') ORDER BY rowid")) {
      for (const k of (p<any>(r.input)?.items ?? []).filter((k: string) => !booked.has(k))) {
        await a.db.run("UPDATE inventory SET alert_status='none' WHERE item_key=?", [k]);
        if (r.state === 'rescheduled') overrides[k] = r.resched_to; else delete overrides[k];
      }
    }
  }
  const message = kind === 'intake'
    ? `Process batch ${batchId} with a confidence threshold of ${threshold}. Tag every item and hold anything you are not sure about. Finish with the summary.`
    : `Run the daily disposition review. Today is ${env.today}. Pickup lead time is 7 days. Review all inventory, route due items, book pickups, send alerts, and finish with the summary.${Object.keys(overrides).length ? ` A person moved some items to a later hand-over date: use these deadlines instead of today plus 7 days: ${Object.entries(overrides).map(([k, v]) => `${k}=${v}`).join(', ')}.` : ''}`;
  const agentId = kind === 'intake' ? process.env.INTAKE_AGENT_ID : process.env.DISPOSITION_AGENT_ID;
  const idem = `${kind}-${a.deps.newId('run')}`;
  const { sessionId } = env.mode === 'real'
    ? await a.zoo.createSession(agentId!, message, idem)
    : await a.zoo.createSession('fake', message, idem);
  await a.db.run('INSERT INTO runs (session_id,agent,ref,started_at) VALUES (?,?,?,?)', [sessionId, kind, batchId, a.deps.now()]);
  if (kind === 'intake') {
    await a.db.run("UPDATE batch_items SET state='pending' WHERE batch_id=? AND state<>'tagged'", [batchId]);
  }
  if (env.mode === 'fake') {
    const d: Deps = { ...a.deps, zoo: wrapPace(a.zoo) };
    const run = kind === 'intake'
      ? simulateIntake(d, sessionId, batchId, { threshold, wait: pollWait() })
      : simulateDisposition(d, sessionId, env.today, a.mcp, { wait: pollWait(), overrides });
    run.catch(async (e) => { await a.db.run('UPDATE runs SET finished_at=?,status=? WHERE session_id=?', [a.deps.now(), `error: ${e.message}`, sessionId]); });
  }
  return { sessionId };
}
const wrapPace = (z: ZooClient): ZooClient => ({ ...z, createSession: z.createSession.bind(z),
  resolveCustomToolCall: async (...a) => { await pace(); return z.resolveCustomToolCall(...a); },
  resolveApproval: z.resolveApproval.bind(z), interrupt: z.interrupt.bind(z), getBalance: z.getBalance.bind(z),
  getSessionCosts: z.getSessionCosts.bind(z), listAllEvents: z.listAllEvents.bind(z) });

// Real mode: pull events for a session (webhook trigger or UI poll), idempotent via the events table.
export async function pumpSession(sessionId: string) {
  const a = await getApp();
  if (env.mode !== 'real') return { events: 0 };
  const evs = await a.zoo.listAllEvents(sessionId);
  for (const ev of evs) await handleEvent(a.deps, sessionId, ev);
  return { events: evs.length };
}

export async function snapshot() {
  const a = await getApp();
  const q = (s: string, args: any[] = []) => a.db.all(s, args);
  const inventory = (await q('SELECT * FROM inventory ORDER BY item_key')).map((r) => ({
    item_key: r.item_key, category: r.category, tags: { stream: r.stream, fibre_type: r.fibre_type, color_group: r.color_group, condition: r.condition },
    location: r.location, season: r.season, received_date: r.received_date, return_window_close: r.return_window_close,
    item_due_date: r.item_due_date, alert_status: r.alert_status, status: r.status }));
  const batch = (await q('SELECT * FROM batches ORDER BY created_at DESC LIMIT 1'))[0];
  const pl = plan(inventory as any, a.mcp.recyclers, env.today);
  return {
    mode: env.mode, today: env.today, balance: await a.zoo.getBalance().catch(() => null),
    batch, items: await q('SELECT * FROM batch_items WHERE batch_id=? ORDER BY item_key', [batch?.batch_id]),
    reviews: (await q("SELECT * FROM reviews ORDER BY rowid DESC")).map((r) => ({ ...r, proposed_tags: p(r.proposed_tags), decided_tags: p(r.decided_tags) })),
    approvals: (await q('SELECT * FROM approvals ORDER BY rowid DESC')).map((r) => ({ ...r, input: p(r.input) })),
    pickups: (await q('SELECT * FROM pickups ORDER BY rowid DESC')).map((r) => ({ ...r, items: p(r.items), lots: p(r.lots) })),
    alerts: (await q('SELECT * FROM alerts ORDER BY rowid DESC')).map((r) => ({ ...r, items: p(r.items) })),
    runs: await q('SELECT * FROM runs ORDER BY started_at DESC LIMIT 6'),
    events: (await q('SELECT id,session_id,type,payload,created_at FROM events ORDER BY id DESC LIMIT 40')).map((e) => ({ ...e, payload: p(e.payload) })),
    plan: pl, recyclers: a.mcp.recyclers, people: loadPeople(join(process.cwd(), 'data')), inventoryCount: inventory.length,
  };
}

export { resolveApproval };
