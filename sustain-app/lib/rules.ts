// TypeScript port of prework/tools/sustain_ref.py. Cross-checked against
// data/expected_*.json in tests/rules.test.ts. Defaults are team choices, not regulations.
export const THRESHOLD = 0.8;
export const DAYS_SINCE_RECEIVED = 60;
export const PICKUP_LEAD_DAYS = 7;
export const NATURAL_SHARE_FOR_SHRED = 0.7;
export const SINGLE_FIBRE_NAME_PCT = 85;

export type Fibre = { fibre: string; pct: number };
export type Tags = { stream: string; fibre_type: string; color_group: string; condition: string };

const ALIASES: Record<string, string> = {
  cotton: 'cotton', linen: 'linen', flax: 'linen', hemp: 'hemp', wool: 'wool', silk: 'silk', cashmere: 'wool',
  rayon: 'rayon', viscose: 'rayon', lyocell: 'lyocell', modal: 'modal',
  polyester: 'polyester', nylon: 'nylon', polyamide: 'nylon', acrylic: 'acrylic', spandex: 'spandex', elastane: 'spandex',
};
const NATURAL = new Set(['cotton', 'linen', 'hemp', 'wool', 'silk', 'rayon', 'lyocell', 'modal']);
export const SEASON_END: Record<string, string> = {
  'Summer 2026': '2026-08-31', 'Fall 2026': '2026-10-31', 'Spring 2027': '2027-05-31',
};
const COLORS: Record<string, string[]> = {
  whites: ['white', 'ivory', 'cream', 'off-white'],
  darks: ['black', 'navy', 'charcoal', 'dark grey', 'brown', 'burgundy', 'forest green', 'dark blue', 'indigo', 'dark wash'],
  brights: ['red', 'orange', 'yellow', 'pink', 'royal blue', 'green', 'purple', 'teal', 'hot pink'],
};
const NO_DONATE = new Set(['swimwear', 'intimates', 'socks']);

export function parseLabelText(text: string) {
  const fibres: Fibre[] = [];
  for (const m of (text || '').matchAll(/(\d{1,3})\s*%\s*([A-Za-z]+)/g)) {
    const key = ALIASES[m[2].toLowerCase()];
    if (key) fibres.push({ fibre: key, pct: parseInt(m[1], 10) });
  }
  const total = fibres.reduce((s, f) => s + f.pct, 0);
  return { fibre: fibres.length ? fibres : null, sumOk: fibres.length > 0 && total === 100, legible: fibres.length > 0 };
}

export const colorGroup = (c: string) => {
  const k = (c || '').trim().toLowerCase();
  for (const [g, names] of Object.entries(COLORS)) if (names.includes(k)) return g;
  return 'mixed';
};
export const naturalShare = (f: Fibre[] | null) => {
  if (!f || !f.length) return 0;
  const t = f.reduce((s, x) => s + x.pct, 0) || 1;
  return f.filter((x) => NATURAL.has(x.fibre)).reduce((s, x) => s + x.pct, 0) / t;
};
export const fibreType = (f: Fibre[] | null) => {
  if (!f || !f.length) return 'unknown';
  const top = f.reduce((a, b) => (b.pct > a.pct ? b : a));
  return top.pct >= SINGLE_FIBRE_NAME_PCT ? top.fibre : 'blend';
};
const isDenim = (g: string) => /denim|jeans/i.test(g || '');

export function streamFor(garment: string, f: Fibre[] | null, condition: string) {
  if (condition === 'unusable') return 'trash';
  if (isDenim(garment)) return 'denim';
  if (!f) return 'mixed';
  return naturalShare(f) >= NATURAL_SHARE_FOR_SHRED ? 'shred' : 'mixed';
}
export function tagItem(garment: string, f: Fibre[] | null, color: string, condition: string): Tags {
  return { stream: streamFor(garment, f, condition), fibre_type: fibreType(f), color_group: colorGroup(color), condition };
}
export const shouldHold = (label: { legible: boolean; sumOk: boolean }, conflict: boolean) =>
  !label.legible || !label.sumOk || conflict;

// ---- dates (ISO strings, UTC) ----
const day = (s?: string | null) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const ms = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s ? ms : NaN;
};
export const isCalendarDate = (s: unknown): s is string => typeof s === 'string' && Number.isFinite(day(s));
const daysBetween = (a: string, b: string) => Math.floor((day(a) - day(b)) / 86400000);
export const addDays = (s: string, n: number) => new Date(day(s) + n * 86400000).toISOString().slice(0, 10);

export type InvRow = {
  item_key: string; category: string; tags: Tags; location: string; season?: string | null;
  received_date?: string | null; return_window_close?: string | null; item_due_date?: string | null;
  alert_status: string; status: string;
};
export function dueReasons(row: InvRow, today: string) {
  const r: string[] = [];
  const se = row.season ? SEASON_END[row.season] : undefined;
  if (se && day(se) < day(today)) r.push('season_end');
  if (row.return_window_close && day(row.return_window_close) <= day(today)) r.push('return_window');
  if (row.item_due_date && day(row.item_due_date) <= day(today)) r.push('item_date');
  if (row.received_date && daysBetween(today, row.received_date) >= DAYS_SINCE_RECEIVED) r.push('received_60d');
  return r;
}
const RECYCLE_ROUTES = {
  shred: { route: 'recycle_shred', reason: 'Tagged for fibre shredding. Shred lots are separated by colour.' },
  denim: { route: 'recycle_denim', reason: 'Tagged as denim. Denim goes to its own recycling stream.' },
  mixed: { route: 'recycle_mixed', reason: 'Tagged for mixed-fibre recycling.' },
} as const;

export function routeDecision(row: Pick<InvRow, 'category' | 'tags'>) {
  const t = row.tags;
  if (!t || !['trash', 'shred', 'denim', 'mixed'].includes(t.stream) ||
      !['wearable', 'damaged', 'unusable'].includes(t.condition) ||
      !['whites', 'darks', 'brights', 'mixed'].includes(t.color_group) ||
      typeof t.fibre_type !== 'string' || !t.fibre_type.trim() ||
      typeof row.category !== 'string' || !row.category.trim()) {
    return { route: 'review', reason: 'Material tags, condition, colour group or category need checking.' };
  }
  if (t.stream === 'trash' || t.condition === 'unusable') {
    return { route: 'dispose', reason: 'Unusable or tagged for disposal. A person must confirm disposal.' };
  }
  const category = row.category.trim().toLowerCase();
  if (t.condition === 'wearable' && !NO_DONATE.has(category)) {
    return { route: 'donate', reason: 'Wearable and in a donation-eligible category. Donation takes priority over recycling.' };
  }
  if (t.fibre_type.trim().toLowerCase() === 'unknown') {
    return { route: 'review', reason: 'The fibre is unknown. Confirm composition before choosing a recycling stream.' };
  }
  const result = RECYCLE_ROUTES[t.stream as keyof typeof RECYCLE_ROUTES];
  const why = t.condition === 'wearable' ? `${category} is excluded from donation.` : 'Damaged item.';
  return { ...result, reason: `${why} ${result.reason}` };
}

export const routeFor = (row: Pick<InvRow, 'category' | 'tags'>) => routeDecision(row).route;

export type Recycler = { id: string; name: string; accepts: string[]; min_items: number; address: string; contact: string };
export function plan(inventory: InvRow[], recyclers: Recycler[], today: string) {
  const skipped: { item_key: string; reason: string }[] = [];
  const due: { row: InvRow; reasons: string[] }[] = [];
  for (const row of inventory) {
    if (row.status === 'held' || row.status === 'rejected') { skipped.push({ item_key: row.item_key, reason: row.status }); continue; }
    const reasons = dueReasons(row, today);
    if (!reasons.length) { skipped.push({ item_key: row.item_key, reason: 'not_due' }); continue; }
    if (row.alert_status === 'sent') { skipped.push({ item_key: row.item_key, reason: 'already_flagged' }); continue; }
    if (row.status !== 'tagged') { skipped.push({ item_key: row.item_key, reason: 'not_tagged' }); continue; }
    due.push({ row, reasons });
  }
  const routes = due.map(({ row, reasons }) => ({
    item_key: row.item_key, route: row.location?.trim() ? routeFor(row) : 'review', color_group: row.tags?.color_group, reasons: [...reasons].sort(),
  }));
  const rows = new Map(due.map((d) => [d.row.item_key, d.row]));
  const byRoute = new Map<string, string[]>();
  for (const r of routes) byRoute.set(r.route, [...(byRoute.get(r.route) || []), r.item_key]);
  const deadline = addDays(today, PICKUP_LEAD_DAYS);
  const pickups: any[] = [];
  const escalations: { items: string[]; reason: string }[] = [];
  for (const route of [...byRoute.keys()].sort()) {
    const items = byRoute.get(route)!.sort();
    if (route === 'dispose') { escalations.push({ items, reason: 'dispose_confirm' }); continue; }
    if (route === 'review') { escalations.push({ items, reason: 'invalid_inventory' }); continue; }
    const candidates = recyclers.filter((r) => r.accepts.includes(route));
    const partner = candidates.find((r) => items.length >= r.min_items);
    if (!partner) { escalations.push({ items, reason: candidates.length ? 'below_minimum' : 'no_partner' }); continue; }
    const lots: Record<string, string[]> = {};
    if (route === 'recycle_shred') for (const k of items) (lots[rows.get(k)!.tags.color_group] ||= []).push(k);
    const sortedLots = Object.fromEntries(Object.keys(lots).sort().map((g) => [g, lots[g].sort()]));
    pickups.push({
      route, partner_id: partner.id, items, lots: sortedLots,
      locations: [...new Set(items.map((k) => rows.get(k)!.location))].sort(), deadline,
    });
  }
  return { today, due: routes.map((r) => ({ item_key: r.item_key, reasons: r.reasons })), routes, pickups, escalations, skipped };
}
