// Server wiring for Next.js route handlers. Server-only: never import from client components.
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { libsqlDb, type Db } from './db.ts';
import { seed, loadRecyclers, loadPeople } from './seed.ts';
import { FakeZoo, checkStart, realZoo, type ZooClient } from './zoo.ts';
import { handleEvent, resolveApproval, deliverDemoReplies, type Deps } from './bridge.ts';
import { simulateDisposition, simulateIntake } from './sim.ts';
import type { McpDeps } from './mcp.ts';
import { dueReasons, plan, routeDecision, routeFor } from './rules.ts';
import { p } from './db.ts';
import { manufacturerSearch, createProductLookup } from './product-lookup.ts';
import { braveSearchIndex } from './product-index.ts';

export const env = {
  mode: (process.env.ZOO_MODE ?? 'fake') as 'fake' | 'real',
  today: process.env.DEMO_TODAY ?? '2026-11-07',
  floor: Number(process.env.BALANCE_FLOOR_USD ?? 20),
  runLimit: Number(process.env.RUN_COST_LIMIT_USD ?? 3),
  // Demo only: how long after "Send to someone" a made-up reply arrives. Off (-1) when talking to the real ZooWork unless DEMO_REPLY_MS is set.
  replyMs: Number(process.env.DEMO_REPLY_MS ?? (process.env.ZOO_MODE === 'real' ? -1 : 6000)),
};

// Give the recording a brief, observable gap between Intake and the pickup alert.
const pickupDemoDelay = () => env.mode === 'fake' ? Number(process.env.DEMO_PICKUP_REVIEW_DELAY_MS) || 0 : 0;

const zooAgentId = (kind: string) => kind === 'intake' ? process.env.INTAKE_AGENT_ID : process.env.DISPOSITION_AGENT_ID;

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
  const zoo = env.mode === 'real' ? await realZoo(process.env.ZOOWORK_API_KEY, process.env.ZOOWORK_BASE_URL, async (sessionId) => {
    const [run] = await db.all('SELECT agent FROM runs WHERE session_id=?', [sessionId]);
    const agentId = run && zooAgentId(run.agent);
    if (!agentId) throw new Error('ZooWork agent ID unavailable for this session');
    return agentId;
  }) : new FakeZoo();
  const now = () => new Date().toISOString();
  const newId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;
  const recyclers = loadRecyclers(dataDir);
  const indexKey = process.env.BRAVE_SEARCH_API_KEY;
  const lookupProduct = process.env.INTAKE_WEB_LOOKUP !== '0'
    ? createProductLookup(manufacturerSearch, undefined, indexKey ? braveSearchIndex(indexKey) : undefined) : undefined;
  return { db, zoo, deps: { db, zoo, now, newId, lookupProduct, materialOnly: true }, mcp: { db, recyclers, now, newId, today: env.today } };
}

// In fake mode the "person" decisions come from the UI; the simulator polls the DB until they arrive.
// There is deliberately no timeout: a held item or a pickup stays in its queue until a person decides. Nothing is auto-denied.
const pollWait = () => async (check: () => Promise<boolean>) => {
  while (!(await check())) await new Promise((r) => setTimeout(r, 400));
};
const pace = () => new Promise((r) => setTimeout(r, Number(process.env.PACE_MS ?? 350))); // slows fake runs so the live feed is visible

export async function startRun(kind: 'intake' | 'disposition', opts: { batchId?: string; threshold?: number }) {
  return startAgent(await getApp(), kind, opts);
}

async function startAgent(a: App, kind: 'intake' | 'disposition',
  opts: { batchId?: string; threshold?: number; handoffToken?: string }) {
  const active = await a.db.all("SELECT session_id FROM runs WHERE finished_at IS NULL AND agent=?", [kind]);
  if (active.length) throw new Error(`A ${kind} run is already active`);
  if (kind === 'disposition' && !opts.handoffToken && (await a.db.all(
    'SELECT 1 FROM disposition_handoffs WHERE claim_token IS NOT NULL AND claim_until > ?', [Date.now()],
  )).length) throw new Error('An automatic Disposition run is starting');
  await checkStart(a.zoo, env.floor);
  const threshold = opts.threshold ?? 0.8;
  const batchId = opts.batchId ?? 'SEED-1';
  // Items from a pickup that was denied or rescheduled come back: clear their alert flag so they can be proposed again.
  const overrides: Record<string, string> = {};
  if (kind === 'disposition' && !opts.handoffToken) {
    const booked = new Set((await a.db.all('SELECT items FROM pickups')).flatMap((r: any) => p<string[]>(r.items) ?? []));
    for (const r of await a.db.all("SELECT input,state,resched_to FROM approvals WHERE state IN ('denied','rescheduled') ORDER BY rowid")) {
      for (const k of (p<any>(r.input)?.items ?? []).filter((k: string) => !booked.has(k))) {
        await a.db.run("UPDATE inventory SET alert_status='none' WHERE item_key=?", [k]);
        if (r.state === 'rescheduled') overrides[k] = r.resched_to; else delete overrides[k];
      }
    }
  }
  const message = kind === 'intake'
    ? `Process batch ${batchId} with a confidence threshold of ${threshold}. Use each item’s assessment from get_batch. Hold needs_review items and anything below the threshold. Finish with the summary.`
    : `Run the ${opts.handoffToken ? 'disposition review for batch ' + batchId : 'daily disposition review'}. Today is ${env.today}. Pickup lead time is 7 days. Review inventory returned by list_inventory, route due items, book pickups, send alerts, and finish with the summary.`;
  const agentId = zooAgentId(kind);
  const idem = opts.handoffToken
    ? 'disposition-' + createHash('sha256').update(batchId).digest('hex').slice(0, 32)
    : `${kind}-${a.deps.newId('run')}`;
  const dateOverrides = Object.entries(overrides).map(([key, date]) => `${key}=${date}`);
  const sessionMessage = dateOverrides.length
    ? `${message} A person moved some items to a later hand-over date: use these deadlines instead of today plus 7 days: ${dateOverrides.join(', ')}.`
    : message;
  const { sessionId } = env.mode === 'real'
    ? await a.zoo.createSession(agentId!, sessionMessage, idem)
    : await a.zoo.createSession('fake', sessionMessage, idem);
  const [inserted] = await a.db.all(`INSERT OR IGNORE INTO runs (session_id,agent,ref,started_at,handoff_batch)
    VALUES (?,?,?,?,?) RETURNING session_id`, [sessionId, kind, batchId, a.deps.now(), opts.handoffToken ? batchId : null]);
  if (!inserted) return { sessionId };
  if (kind === 'intake') {
    await a.db.run(`INSERT INTO disposition_handoffs (batch_id, intake_session_id) VALUES (?, ?)
      ON CONFLICT(batch_id) DO UPDATE SET intake_session_id=excluded.intake_session_id
      WHERE claim_until <= ? AND NOT EXISTS (SELECT 1 FROM runs WHERE handoff_batch=excluded.batch_id)`, [batchId, sessionId, Date.now()]);
    await a.db.run("UPDATE batch_items SET state='pending' WHERE batch_id=? AND state<>'tagged'", [batchId]);
  }
  if (env.mode === 'fake') {
    const d: Deps = { ...a.deps, zoo: wrapPace(a.zoo) };
    const run = kind === 'intake'
      ? simulateIntake(d, sessionId, batchId, { threshold, wait: pollWait() })
      : simulateDisposition(d, sessionId, env.today, a.mcp, { wait: pollWait(), overrides, announceReview: !!opts.handoffToken && pickupDemoDelay() > 0 });
    void run.catch(async (e) => {
      await a.db.run('UPDATE runs SET finished_at=?,status=? WHERE session_id=?', [a.deps.now(), `error: ${e.message}`, sessionId]);
    }).then(retryDispositionHandoff).catch(console.error);
  }
  return { sessionId };
}
const wrapPace = (z: ZooClient): ZooClient => ({ ...z, createSession: z.createSession.bind(z),
  resolveCustomToolCall: async (...a) => { await pace(); return z.resolveCustomToolCall(...a); },
  resolveApproval: z.resolveApproval.bind(z), interrupt: z.interrupt.bind(z), getBalance: z.getBalance.bind(z),
  getSessionCosts: z.getSessionCosts.bind(z), listAllEvents: z.listAllEvents.bind(z) });

// Claim one eligible batch across workers. A stable ZooWork key lets a retry
// reuse the session if the remote start succeeded before we recorded it locally.
export async function retryDispositionHandoff() {
  const a = await getApp();
  const now = Date.now();
  const token = randomUUID();
  const delay = pickupDemoDelay();
  const [claim] = await a.db.all(`UPDATE disposition_handoffs SET claim_token=?, claim_until=?
    WHERE batch_id = (
      SELECT h.batch_id FROM disposition_handoffs h JOIN runs r ON r.session_id=h.intake_session_id
      WHERE h.claim_until <= ? AND NOT EXISTS (SELECT 1 FROM runs WHERE handoff_batch=h.batch_id)
        AND (r.finished_at IS NULL OR r.status='succeeded')
        AND (? <= 0 OR r.finished_at IS NULL OR unixepoch(r.finished_at) * 1000 + ? <= ?)
        AND NOT EXISTS (
          SELECT 1 FROM batch_items b WHERE b.batch_id=h.batch_id AND b.state NOT IN ('tagged','rejected')
            AND NOT (b.state='held' AND EXISTS (
              SELECT 1 FROM reviews v WHERE v.session_id=r.session_id AND v.batch_id=b.batch_id
                AND v.item_key=b.item_key AND v.state='pending' AND v.sent_to IS NOT NULL
            ))
        )
        AND NOT EXISTS (
          SELECT 1 FROM reviews v WHERE v.session_id=r.session_id AND v.state='pending' AND v.sent_to IS NULL
        )
        AND (r.finished_at IS NOT NULL OR EXISTS (
          SELECT 1 FROM reviews v WHERE v.session_id=r.session_id AND v.state='pending' AND v.sent_to IS NOT NULL
        ))
        AND EXISTS (SELECT 1 FROM batch_items b JOIN inventory i ON i.item_key=b.item_key
          WHERE b.batch_id=h.batch_id AND b.state='tagged' AND i.status='tagged' AND TRIM(i.location) <> ''
            AND (i.item_due_date IS NOT NULL OR i.return_window_close IS NOT NULL OR i.received_date IS NOT NULL OR i.season IS NOT NULL))
      ORDER BY r.started_at, h.batch_id LIMIT 1
    )
    AND NOT EXISTS (SELECT 1 FROM runs WHERE agent='disposition' AND finished_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM disposition_handoffs WHERE claim_token IS NOT NULL AND claim_until > ?)
    RETURNING batch_id`, [token, now + 120_000, now, delay, delay, now, now]);
  if (!claim) return;
  try {
    await startAgent(a, 'disposition', { batchId: claim.batch_id, handoffToken: token });
    await a.db.run(`UPDATE disposition_handoffs SET claim_token=NULL, claim_until=0
      WHERE batch_id=? AND claim_token=?`, [claim.batch_id, token]);
  } catch (error) {
    await a.db.run(`UPDATE disposition_handoffs SET claim_token=NULL, claim_until=?
      WHERE batch_id=? AND claim_token=?`, [Date.now() + 15_000, claim.batch_id, token]);
    console.error('Automatic Disposition start failed', error);
  }
}

// Real mode: pull events for a session (webhook trigger or UI poll), idempotent via the events table.
export async function pumpSession(sessionId: string) {
  const a = await getApp();
  if (env.mode !== 'real') return { events: 0 };
  const evs = await a.zoo.listAllEvents(sessionId);
  for (const ev of evs) await handleEvent(a.deps, sessionId, ev);
  await retryDispositionHandoff();
  return { events: evs.length };
}

export async function snapshot() {
  const a = await getApp();
  if (env.replyMs >= 0) await deliverDemoReplies(a.deps, env.replyMs);
  const q = (s: string, args: any[] = []) => a.db.all(s, args);
  const inventory = (await q('SELECT * FROM inventory ORDER BY item_key')).map((r) => ({
    item_key: r.item_key, category: r.category, tags: { stream: r.stream, fibre_type: r.fibre_type, color_group: r.color_group, condition: r.condition },
    location: r.location, season: r.season, received_date: r.received_date, return_window_close: r.return_window_close,
    item_due_date: r.item_due_date, alert_status: r.alert_status, status: r.status }));
  const batch = (await q('SELECT * FROM batches ORDER BY created_at DESC LIMIT 1'))[0];
  const pl = plan(inventory as any, a.mcp.recyclers, env.today);
  return {
    mode: env.mode, today: env.today, balance: await a.zoo.getBalance().catch(() => null),
    pickupDownloads: env.mode === 'real' && process.env.ENABLE_ZOOWORK_ARTIFACT_DOWNLOAD === '1',
    batch, items: await q('SELECT * FROM batch_items WHERE batch_id=? ORDER BY item_key', [batch?.batch_id]),
    reviews: (await q(`SELECT r.*,a.result AS assessment FROM reviews r LEFT JOIN intake_assessments a
      ON r.session_id=a.session_id AND r.batch_id=a.batch_id AND r.item_key=a.item_key ORDER BY r.rowid DESC`))
      .map(({ assessment, ...r }) => ({ ...r, proposed_tags: p(r.proposed_tags), decided_tags: p(r.decided_tags),
        materialOnly: p(assessment)?.materialOnly, evidence: p(assessment)?.evidence })),
    approvals: (await q('SELECT * FROM approvals ORDER BY rowid DESC')).map((r) => ({ ...r, input: p(r.approved_input ?? r.input) })),
    pickups: (await q('SELECT * FROM pickups ORDER BY rowid DESC')).map((r) => ({ ...r, items: p(r.items), lots: p(r.lots) })),
    alerts: (await q('SELECT * FROM alerts ORDER BY rowid DESC')).map((r) => ({ ...r, items: p(r.items) })),
    runs: await q('SELECT * FROM runs ORDER BY started_at DESC LIMIT 6'),
    events: (await q('SELECT id,session_id,type,payload,created_at FROM events ORDER BY id DESC LIMIT 40')).map((e) => ({ ...e, payload: p(e.payload) })),
    itemDecisions: Object.fromEntries(inventory.map((row) => [row.item_key, {
      ...routeDecision(row), fibre: row.tags.fibre_type, due: dueReasons(row, env.today),
    }])),
    pickupCandidates: inventory.filter((i) => i.status === 'tagged' && i.alert_status !== 'sent' && i.location?.trim())
      .map((i) => ({ key: i.item_key, route: routeFor(i) })),
    plan: pl, recyclers: a.mcp.recyclers, people: loadPeople(join(process.cwd(), 'data')), inventoryCount: inventory.length,
  };
}

export { resolveApproval };
