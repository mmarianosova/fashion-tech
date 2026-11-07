import { exactProduct, productUrl, type LookupAttempt, type LookupQuery, type ProductLookup, type ProductMatch } from './intake.ts';
import { matchIndexedPage, type SearchIndex } from './product-index.ts';

type IdentifierSearch = (query: LookupQuery) => Promise<ProductMatch[]>;
type ReadPage = (url: URL) => Promise<{ outcome: string; matches: ProductMatch[] }>;
const scalar = (value: unknown) => typeof value === 'string' ? value.trim() || undefined : undefined;

function productMatches(html: string, url: string) {
  const matches: ProductMatch[] = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if ([node['@type']].flat().some((type) => type === 'Product' || type === 'https://schema.org/Product')) {
      const upc = [node.gtin12, node.gtin13, node.gtin14, node.gtin].map(scalar).find(Boolean);
      const style = scalar(node.sku) ?? scalar(node.mpn);
      const composition = scalar(node.material);
      const color = scalar(node.color);
      if (upc || style) matches.push({ url, upc, style, composition, color });
    }
    visit(node['@graph']);
    visit(node.hasVariant);
    visit(node.mainEntity);
  }
  for (const script of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(script[1])); } catch { /* malformed JSON-LD provides no evidence */ }
  }
  if (new URL(url).origin === manufacturer) {
    const variants: ProductMatch[] = [];
    for (const script of html.matchAll(/<script\b[^>]*\bid=["']ProductJson-[^"']+["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const product = JSON.parse(script[1]);
        const description = scalar(product.description) ?? '';
        const lines = description.replace(/<\/(?:li|p|div)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
          .replace(/&nbsp;|&#160;/g, ' ').split('\n').map((line) => line.trim()).filter((line) => /\d\s*%/.test(line));
        const composition = lines.length ? lines.join(' / ') : undefined;
        const colorIndex = product.options?.findIndex((option: unknown) => typeof option === 'string' && /^(color|colour)$/i.test(option)) ?? -1;
        for (const variant of product.variants ?? []) {
          const upc = scalar(variant.barcode);
          const style = scalar(variant.sku);
          const color = colorIndex >= 0 ? scalar(variant.options?.[colorIndex]) : undefined;
          if (upc || style) variants.push({ url: url + '?variant=' + encodeURIComponent(String(variant.id)), upc, style, composition, color });
        }
      } catch { /* malformed product data provides no evidence */ }
    }
    if (variants.length) return variants;
  }
  return matches;
}

export const readProductPage: ReadPage = async (url) => {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html') || !response.body) {
      await response.body?.cancel();
      return { outcome: response.ok ? 'not_html' : `http_${response.status}`, matches: [] };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let html = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 3_000_000) {
        await reader.cancel();
        return { outcome: 'page_too_large', matches: [] };
      }
      html += decoder.decode(value, { stream: true });
    }
    return { outcome: 'read', matches: productMatches(html + decoder.decode(), url.href) };
  } catch {
    return { outcome: 'unavailable', matches: [] };
  }
};

const manufacturer = 'https://www.marcusadlerny.com';

export const manufacturerSearch: IdentifierSearch = async (query) => {
  const identifiers = [query.style, ...query.upcs].filter((id) => /^[\w ./-]{1,64}$/.test(id)).slice(0, 5);
  const handles = new Set<string>();
  let searched = false;
  for (const identifier of identifiers) {
    const url = new URL('/search/suggest.json', manufacturer);
    url.searchParams.set('q', identifier);
    url.searchParams.set('resources[type]', 'product');
    url.searchParams.set('resources[limit]', '3');
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const data = await response.json() as { resources?: { results?: { products?: { handle: string }[] } } };
      for (const result of data.resources?.results?.products ?? []) {
        if (/^[a-z0-9-]+$/.test(result.handle)) handles.add(result.handle);
      }
      searched = true;
    } catch { /* try the remaining identifiers */ }
  }
  if (!searched) throw new Error('Manufacturer search unavailable');
  const pages = await Promise.all([...handles].slice(0, 4).map((handle) => readProductPage(new URL('/products/' + handle, manufacturer))));
  if (pages.length && pages.every((page) => page.outcome !== 'read')) throw new Error('Manufacturer product pages unavailable');
  return pages.flatMap((page) => page.matches);
};

export function createProductLookup(search?: IdentifierSearch, read = readProductPage, index?: SearchIndex): ProductLookup {
  return async (query) => {
    const attempts: LookupAttempt[] = [];
    const exact = (matches: ProductMatch[]) => {
      const verified = matches.filter((m) => exactProduct(m, query) && (m.composition || (!query.materialOnly && m.color)));
      return [...new Map(verified.map((m) => [JSON.stringify([m.composition, m.color]), m])).values()];
    };
    const direct: ProductMatch[] = [];
    for (const raw of query.urls.slice(0, 4)) {
      const url = productUrl(raw);
      if (!url) continue;
      const page = await read(url);
      direct.push(...exact(page.matches));
      attempts.push({ method: 'catalog_url', target: url.href, outcome: page.outcome });
    }
    const matches = exact(direct);
    if (matches.length) return { status: 'found', matches, attempts };

    const target = [query.style, ...query.upcs].join(', ');
    let searched = false;
    if (search) {
      try {
        const found = exact(await search(query));
        searched = true;
        attempts.push({ method: 'identifier_search', target, outcome: found.length ? 'verified' : 'no_verified_match' });
        if (found.length) return { status: 'found', matches: found, attempts };
      } catch {
        attempts.push({ method: 'identifier_search', target, outcome: 'unavailable' });
      }
    }
    if (index) {
      try {
        const pages = (await index(query)).slice(0, 24);
        const indexed = pages.map((page) => matchIndexedPage(page, query)).filter((match): match is ProductMatch => !!match);
        // Open allowlisted result URLs when the index only provides discovery.
        const verifiedUrls = new Set(indexed.map((match) => match.url));
        const urls = [...new Set(pages.map((page) => productUrl(page.url)?.href))]
          .filter((url): url is string => !!url && !verifiedUrls.has(url));
        const readMatches = await Promise.all(urls.slice(0, 4).map((url) => read(new URL(url))));
        const found = exact([...indexed, ...readMatches.flatMap((page) => page.matches)]);
        searched = true;
        attempts.push({ method: 'index_search', target, outcome: found.length ? 'verified' : 'no_verified_match' });
        if (found.length) return { status: 'found', matches: found, attempts };
      } catch {
        attempts.push({ method: 'index_search', target, outcome: 'unavailable' });
      }
    }
    if (!search && !index) attempts.push({ method: 'identifier_search', target, outcome: 'not_configured' });
    return { status: searched ? 'not_found' : 'unavailable', attempts };
  };
}
