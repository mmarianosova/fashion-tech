import { exactProduct, productUrl, type LookupQuery, type ProductMatch } from './intake.ts';

export type IndexedPage = { url: string; text: string };
export type SearchIndex = (query: LookupQuery) => Promise<IndexedPage[]>;

// Only use explicit product fields from supported retailers. Do not treat search
// terms, a title, or an identifier embedded in a URL as variant evidence.
export function matchIndexedPage(page: IndexedPage, query: LookupQuery): ProductMatch | undefined {
  const url = productUrl(page.url);
  if (!url) return;
  const text = page.text.replace(/<\/?(?:strong|b|em|mark)>/gi, '').replace(/&nbsp;/g, ' ');
  const upcs = new Set([...text.matchAll(/\b(?:UPC|GTIN)(?:\s*#)?\s*:?\s*(\d{12,14})\b/gi)].map((m) => m[1]));
  const styles = new Set([...text.matchAll(/\b(?:SKU|Style (?:Number|#))\s*:?\s*([A-Z0-9][A-Z0-9._/-]{2,63})\b/gi)].map((m) => m[1]));
  if (upcs.size > 1 || styles.size > 1) return;
  const match: ProductMatch = { url: url.href, upc: [...upcs][0], style: [...styles][0] };
  if (!exactProduct(match, query)) return;

  if (url.hostname === 'www.dsw.com') {
    match.color = text.match(/^\s*Color[ \t]*:?\s+([\p{L}][\p{L} /-]{0,35})\s*$/imu)?.[1].trim();
    const features = text.split(/^\s*#{1,6}\s*FEATURES\s*$/im)[1]?.split(/^\s*#{1,6}\s+/m)[0];
    match.composition = features?.match(/^\s*\*\s*((?:\d{1,3}\s*%\s*[\p{L}]+)(?:\s*,\s*\d{1,3}\s*%\s*[\p{L}]+)*)\s*$/imu)?.[1];
  } else if (url.hostname === 'www.faire.com') {
    match.color = text.match(/^\s*Color[ \t]*:?\s+([\p{L}][\p{L} /-]{0,35})\s*$/imu)?.[1].trim();
    match.composition = text.match(/^\s*Fabric:\s*([^\r\n]{1,200})$/im)?.[1].trim();
    const layers = text.match(/(?:Features\s*[•·]\s*)?(100\s*%\s+(?:genuine\s+)?leather)\s*[•·]\s*Lining:\s*(100\s*%\s+polyester)\b/i);
    if (layers) match.composition = `Outer: ${layers[1]} / lining: ${layers[2]}`;
  }
  return match.composition || match.color ? match : undefined;
}

export function braveSearchIndex(apiKey: string): SearchIndex {
  return async ({ style, upcs }) => {
    const identifiers = [style, ...upcs].filter((id) => /^[\w ./-]{1,64}$/.test(id)).slice(0, 5);
    if (!identifiers.length) return [];
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', identifiers.map((id) => `"${id}"`).join(' OR '));
    url.searchParams.set('count', '8');
    url.searchParams.set('extra_snippets', 'true');
    const response = await fetch(url, {
      headers: { 'X-Subscription-Token': apiKey }, redirect: 'error', signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(`Search index HTTP ${response.status}`);
    const body = await response.json() as {
      web?: { results?: { url: string; description?: string; extra_snippets?: string[] }[] };
    };
    // Excerpts can describe different variants. Verify each independently.
    return (body.web?.results ?? []).flatMap((entry) => [entry.description, ...(entry.extra_snippets ?? [])]
      .filter((text): text is string => typeof text === 'string')
      .map((text) => ({ url: entry.url, text })));
  };
}
