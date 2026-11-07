// Records a full simulated run (Intake -> reviews -> Disposition -> approvals -> alerts) through the REAL app code,
// then writes preview/index.html: a standalone, dependency-free replay. Also the fallback demo if a live run stalls.
// Usage: node scripts/make-preview.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setup } from '../tests/helpers.ts';

process.env.PACE_MS = '0';
const root = join(import.meta.dirname, '..');
const s = await setup();
(globalThis as any).__sustain = Promise.resolve({ db: s.db, zoo: s.zoo, deps: s.deps, mcp: s.mcp });
const app = await import('../lib/app.ts');
const bridge = await import('../lib/bridge.ts');

type Frame = any;
const frames: Frame[] = [];
let phase = 'start'; // start -> intake -> intake_done -> disp -> disp_done: lets the replay know which run a frame belongs to
const trim = (snap: any, gate: string | null, note: string): Frame => ({
  gate, note, phase, today: snap.today,
  items: snap.items.map((i: any) => [i.item_key, i.garment_type, i.color, i.label_text, i.state, i.stream, i.fibre_type, i.color_group, i.confidence, i.condition]),
  reviews: snap.reviews.map((r: any) => ({ id: r.review_id, item: r.item_key, state: r.state, reason: r.reason, conf: r.confidence, label: r.label_text, proposed: r.proposed_tags, decided: r.decided_tags })),
  approvals: snap.approvals.map((a: any) => ({ id: a.approval_id, state: a.state, input: a.input })),
  pickups: snap.pickups.map((p: any) => ({ id: p.booking_id, route: p.route, partner: p.partner_id, n: p.items.length, deadline: p.deadline, items: p.items, lots: p.lots })),
  alerts: snap.alerts.map((a: any) => ({ id: a.alert_id, type: a.type, summary: a.summary, items: a.items, location: a.location, deadline: a.deadline, next: a.next_step })),
});
let tick = 0;
const rec = async (gate: string | null = null, note = '') => { frames.push(trim(await app.snapshot(), gate, note)); };
const origResolve = s.zoo.resolveCustomToolCall.bind(s.zoo);
s.zoo.resolveCustomToolCall = async (...a: any[]) => { await (origResolve as any)(...a); if (++tick % 3 === 0) await rec(null, 'agent working'); };

await rec(null, 'Ready: 32 items waiting in batch SEED-1');
phase = 'intake';
const run1 = await app.startRun('intake', { batchId: 'SEED-1', threshold: 0.8 });
// intake: the sim waits on holds; we record the pending frame, then play the reviewer
let sawIntakeDone = false;
const waitReview = async () => {
  for (let k = 0; k < 400 && !sawIntakeDone; k++) {
    const pend = await s.db.all("SELECT review_id FROM reviews WHERE state='pending'");
    if (pend.length) {
      await rec('review', `Agent paused: item ${pend.length} waiting for a person`);
      await bridge.resolveReview(s.deps, pend[0].review_id, 'approve');
      await rec(null, 'Reviewer approved; agent continues');
    }
    const fin = (await s.db.all('SELECT finished_at FROM runs WHERE session_id=?', [run1.sessionId]))[0].finished_at;
    if (fin) sawIntakeDone = true;
    await new Promise((r) => setTimeout(r, 30));
  }
};
await waitReview();
if (!sawIntakeDone) throw new Error('Intake replay did not finish');
phase = 'intake_done';
await rec(null, 'Intake run finished: 27 tagged automatically, 5 reviewed by a person');

phase = 'disp';

let dispDone = false;
for (let k = 0; k < 400 && !dispDone; k++) {
  const pend = await s.db.all("SELECT approval_id FROM approvals WHERE state='pending'");
  if (pend.length) {
    await rec('approval', 'Agent paused: pickup booking needs approval');
    await bridge.resolveApproval(s.deps, pend[0].approval_id, true);
    await rec(null, 'Booking approved; agent continues');
  }
  const [run2] = await s.db.all("SELECT finished_at FROM runs WHERE handoff_batch='SEED-1'");
  if (run2?.finished_at) dispDone = true;
  await new Promise((r) => setTimeout(r, 30));
}
if (!dispDone) throw new Error('Disposition replay did not finish');
phase = 'disp_done';
await rec(null, 'Disposition run finished: pickups booked, alerts sent');

const tpl = readFileSync(join(root, 'scripts', 'preview.template.html'), 'utf8');
const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8');
const partners = Object.fromEntries(s.mcp.recyclers.map((r: any) => [r.id, { name: r.name.replace(' (fictional)', ''), address: r.address }]));
const people = JSON.parse(readFileSync(join(root, 'data', 'people.json'), 'utf8')).map((p: any) => p.name);
const logo = readFileSync(join(root, 'public', 'sortix-logo.svg'), 'utf8').trim()
  .replace('width="241" height="96"', 'width="108" height="43"');
const html = tpl.replace('/*SORTIX_LOGO*/', logo).replace('/*CSS*/', css).replace('/*FRAMES*/', 'const FRAMES=' + JSON.stringify(frames) + ';const PARTNERS=' + JSON.stringify(partners) + ';const PEOPLE=' + JSON.stringify(people) + ';');
mkdirSync(join(root, 'preview'), { recursive: true });
writeFileSync(join(root, 'preview', 'index.html'), html);
console.log(`frames=${frames.length} gates=${frames.filter((f) => f.gate).length} size=${(html.length / 1024).toFixed(0)} KB`);
