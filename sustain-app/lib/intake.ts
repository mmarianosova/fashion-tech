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
type Query = { style: string; upcs: string[]; urls: string[] };
type Match = { url: string; style?: string; upc?: string; composition?: string; color?: string };
export type ProductLookup = (query: Query) => Promise<
  { status: 'found'; matches: Match[] } | { status: 'not_found' | 'unavailable' }
>;

const normalized = (s?: string) => s?.trim().toLowerCase() ?? '';
const unique = (values: (string | undefined)[]) => [...new Set(values.map(normalized).filter(Boolean))];
const conditions = ['wearable', 'damaged', 'unusable'];

function macysProduct(raw: string) {
  try {
    const url = new URL(raw);
    if (url.origin === 'https://www.macys.com' && !url.username && !url.password &&
        url.pathname.startsWith('/shop/product/') && /^\d+$/.test(url.searchParams.get('ID') ?? '')) return url;
  } catch { /* invalid catalog link */ }
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
  const colors = unique([item.color, ...rows.map((r) => r.color)]);
  const reasons: string[] = [];
  let fibres = compositions.size === 1 && complete.length === parsed.length ? complete[0] : null;
  let color = colors.length === 1 ? colors[0] : '';
  const condition = conditions.includes(normalized(item.condition)) ? normalized(item.condition) : 'unknown';
  if (compositions.size > 1) reasons.push('Conflicting compositions');
  if (colors.length > 1) reasons.push('Conflicting colors');
  if (/^photo shows/i.test(item.visible_note ?? '')) reasons.push('Recorded label and garment conflict');

  let lookupStatus = 'not_needed';
  let matches: Match[] = [];
  if (rows.length && (!fibres || !color)) {
    const eligible = urls.filter((raw) => {
      const url = macysProduct(raw);
      const hint = url?.searchParams.get('cm_kws');
      return url && (!hint || !upcs.length || upcs.includes(hint));
    });
    lookupStatus = 'not_configured';
    if (lookup) {
      try {
        const result = await lookup({ style, upcs, urls: eligible });
        lookupStatus = result.status;
        if (result.status === 'found') {
          matches = result.matches;
          const candidate = matches.length === 1 ? matches[0] : null;
          if (candidate && macysProduct(candidate.url) && (upcs.length
            ? candidate.upc && upcs.includes(candidate.upc) &&
              (!candidate.style || normalized(candidate.style) === normalized(style))
            : normalized(candidate.style) === normalized(style))) {
            const webFibre = candidate.composition ? material(candidate.composition) : null;
            if (webFibre && compositions.size && !compositions.has(JSON.stringify(webFibre))) reasons.push('Website composition conflicts with source');
            if (!fibres && !sourceTexts.length) fibres = webFibre;
            const webColor = normalized(candidate.color);
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

  if (!fibres && compositions.size <= 1) reasons.push(sourceTexts.length ? 'Incomplete or unsupported composition' : 'Missing composition');
  if (!color && colors.length <= 1) reasons.push('Missing color');
  if (condition === 'unknown') reasons.push('Physical condition requires inspection');
  if (lookupStatus !== 'not_needed' && lookupStatus !== 'matched') reasons.push('Catalog lookup: ' + lookupStatus);
  const tags = tagItem(item.garment_type ?? '', fibres, color, condition);
  const needsReview = reasons.length > 0;
  return {
    tags, material: fibres, status: needsReview ? 'needs_review' as const : 'tagged' as const,
    confidence: needsReview ? 0.4 : 0.95,
    reason: needsReview ? reasons.join('. ') : `${fibres!.map((f) => `${f.pct}% ${f.fibre}`).join(', ')} → ${tags.stream}`,
    evidence: {
      input: { label_text: item.label_text, color: item.color, condition: item.condition, visible_note: item.visible_note },
      workbook: item.catalog, lookup: { status: lookupStatus, matches },
    },
  };
}
