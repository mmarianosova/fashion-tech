import { parseLabelText, tagItem, type Fibre } from './rules.ts';

export type CatalogRow = {
  sheet: string; row: number; style: string; upcs: string[]; urls: string[];
  composition?: string; color?: string; description?: string;
};
export type CatalogInput = { sourceUrl: string; rows: CatalogRow[] };
type Item = {
  item_key: string; label_text?: string; garment_type?: string; color?: string;
  condition?: string; visible_note?: string; catalog?: CatalogInput;
};
export type LookupQuery = { style: string; upcs: string[]; urls: string[] };
export type ProductMatch = { url: string; style?: string; upc?: string; composition?: string; color?: string };
export type LookupAttempt = { method: 'catalog_url' | 'identifier_search'; target: string; outcome: string };
export type ProductLookup = (query: LookupQuery) => Promise<(
  { status: 'found'; matches: ProductMatch[] } | { status: 'not_found' | 'unavailable' }
) & { attempts?: LookupAttempt[] }>;

const normalized = (s?: string) => s?.trim().toLowerCase() ?? '';
const unique = (values: (string | undefined)[]) => [...new Set(values.map(normalized).filter(Boolean))];
const namedColor = (s?: string) => {
  const value = normalized(s);
  return /\p{L}/u.test(value) && !['unknown', 'n/a', 'none', 'missing'].includes(value) ? value : '';
};
const conditions = ['wearable', 'damaged', 'unusable'];

export function productUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.username || url.password) return;
    if (url.origin === 'https://www.macys.com' && url.pathname.startsWith('/shop/product/') &&
        /^\d+$/.test(url.searchParams.get('ID') ?? '')) return url;
    if (url.origin === 'https://www.marcusadlerny.com' && /^\/products\/[a-z0-9-]+\/?$/i.test(url.pathname)) return url;
    if (url.origin === 'https://www.dsw.com' && /^\/product\/[a-z0-9-]+\/\d+\/?$/i.test(url.pathname)) return url;
    if (url.origin === 'https://www.faire.com' && /^\/product\/p_[a-z0-9]+\/?$/i.test(url.pathname)) return url;
  } catch { /* invalid catalog link */ }
}

export function exactProduct(match: ProductMatch, query: LookupQuery) {
  if (!productUrl(match.url)) return false;
  if (match.upc && query.upcs.length) return query.upcs.includes(match.upc);
  return normalized(match.style) === normalized(query.style);
}

function material(text: string): Fibre[] | null {
  const { fibre, sumOk } = parseLabelText(text);
  // Require a single complete composition. Unknown fibres and extra percentages cannot be dropped.
  if (!sumOk || !fibre || fibre.some((f) => f.pct <= 0)) return null;
  const percentages = text.match(/\d+(?:[.,]\d+)?\s*%/g) ?? [];
  if (percentages.length !== fibre.length || percentages.some((p) => !/^\d{1,3}\s*%$/.test(p))) return null;
  const grouped = new Map<string, number>();
  for (const f of fibre) grouped.set(f.fibre, (grouped.get(f.fibre) ?? 0) + f.pct);
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([fibre, pct]) => ({ fibre, pct }));
}

export async function assessIntake(item: Item, lookup?: ProductLookup) {
  const rows = item.catalog?.rows ?? [];
  const style = rows[0]?.style ?? item.item_key;
  const upcs = [...new Set(rows.flatMap((r) => r.upcs))];
  const urls = [...new Set(rows.flatMap((r) => r.urls))];
  const sourceTexts = unique([item.label_text, ...rows.map((r) => r.composition)]);
  const parsed = sourceTexts.map(material);
  const complete = parsed.filter((f): f is Fibre[] => f !== null);
  const compositions = new Set(complete.map((f) => JSON.stringify(f)));
  const colors = unique([item.color, ...rows.map((r) => r.color)].map(namedColor));
  const reasons: string[] = [];
  let fibres = compositions.size === 1 && complete.length === parsed.length ? complete[0] : null;
  let color = colors.length === 1 ? colors[0] : '';
  const condition = conditions.includes(normalized(item.condition)) ? normalized(item.condition) : 'unknown';
  if (compositions.size > 1) reasons.push('Conflicting compositions');
  if (colors.length > 1) reasons.push('Conflicting colors');
  if (/^photo shows/i.test(item.visible_note ?? '')) reasons.push('Recorded label and garment conflict');

  let lookupStatus = 'not_needed';
  let matches: ProductMatch[] = [];
  let attempts: LookupAttempt[] = [];
  let verified: ProductMatch | null = null;
  if (rows.length && (!fibres || !color)) {
    const eligible = urls.filter((raw) => {
      const url = productUrl(raw);
      const hint = url?.searchParams.get('cm_kws');
      if (url && hint && upcs.length && !upcs.includes(hint)) {
        attempts.push({ method: 'catalog_url', target: raw, outcome: 'skipped_variant_mismatch' });
        return false;
      }
      return !!url;
    });
    lookupStatus = 'not_configured';
    if (lookup) {
      try {
        const query = { style, upcs, urls: eligible };
        const result = await lookup(query);
        attempts.push(...(result.attempts ?? []));
        lookupStatus = result.status;
        if (result.status === 'found') {
          matches = result.matches;
          const candidate = matches.length === 1 ? matches[0] : null;
          if (candidate && exactProduct(candidate, query)) {
            verified = candidate;
            const webFibre = candidate.composition ? material(candidate.composition) : null;
            if (webFibre && compositions.size && !compositions.has(JSON.stringify(webFibre))) reasons.push('Website composition conflicts with source');
            if (!fibres && !sourceTexts.length) fibres = webFibre;
            const webColor = namedColor(candidate.color);
            if (color && webColor && color !== webColor) reasons.push('Website color conflicts with source');
            if (!colors.length) color = webColor;
            lookupStatus = 'matched';
          } else {
            lookupStatus = 'unverified_match';
            reasons.push('Website match is ambiguous or unverified');
          }
        }
      } catch {
        lookupStatus = 'unavailable';
      }
    }
  }

  if (!fibres && compositions.size <= 1) {
    reasons.push(sourceTexts.length ? 'Incomplete or unsupported composition'
      : verified?.composition ? 'Website composition needs manual classification' : 'Missing composition');
  }
  if (!color && colors.length <= 1) reasons.push('Missing color');
  if (condition === 'unknown') reasons.push('Physical condition requires inspection');
  if (lookupStatus !== 'not_needed' && lookupStatus !== 'matched') reasons.push('Catalog lookup: ' + lookupStatus);
  const tags = tagItem(item.garment_type ?? '', fibres, color, condition);
  const needsReview = reasons.length > 0;
  return {
    tags, material: fibres, color: color || null, status: needsReview ? 'needs_review' as const : 'tagged' as const,
    confidence: needsReview ? 0.4 : 0.95,
    reason: needsReview ? reasons.join('. ') : `${fibres!.map((f) => `${f.pct}% ${f.fibre}`).join(', ')} → ${tags.stream}`,
    evidence: {
      input: { label_text: item.label_text, color: item.color, condition: item.condition, visible_note: item.visible_note },
      workbook: item.catalog, lookup: { status: lookupStatus, matches, attempts, verified },
    },
  };
}
