// Import only the styles actually being assessed. The optional condition comes from a physical inspection.
import { readFileSync } from 'node:fs';
import { createClient, type InStatement } from '@libsql/client';
import { SCHEMA, j } from '../lib/db.ts';
import type { CatalogInput, CatalogRow } from '../lib/intake.ts';

const [catalogPath, batchId, ...items] = process.argv.slice(2);
if (!catalogPath || !batchId || !items.length) {
  throw new Error('Usage: node scripts/import-intake.ts CATALOG.json BATCH_ID STYLE[:CONDITION] ...');
}
const { sourceUrl, styles }: { sourceUrl: string; styles: Record<string, CatalogRow[]> } =
  JSON.parse(readFileSync(catalogPath, 'utf8'));
const keys = new Set<string>();
const statements: InStatement[] = [{
  sql: 'INSERT INTO batches (batch_id,created_at) VALUES (?,?)',
  args: [batchId, new Date().toISOString()],
}];
for (const entry of items) {
  const [style, condition, extra] = entry.split(':');
  const key = style.trim().toUpperCase();
  const rows = Object.hasOwn(styles, key) ? styles[key] : [];
  if (!rows.length || keys.has(key)) throw new Error(`Unknown or duplicate style: ${style}`);
  if (extra !== undefined || (condition !== undefined && !['wearable', 'damaged', 'unusable'].includes(condition))) {
    throw new Error(`Invalid condition for ${style}`);
  }
  keys.add(key);
  const catalog: CatalogInput = { sourceUrl, rows };
  // The inventory key identifies this intake record. A style is not a physical item identifier.
  const itemKey = `${batchId}:${key}`;
  const descriptions = [...new Set(rows.map((r) => r.description?.trim()).filter(Boolean))];
  const garmentType = descriptions.length === 1 ? descriptions[0] ?? null : null;
  statements.push(
    { sql: 'INSERT INTO batch_items (batch_id,item_key,garment_type,condition) VALUES (?,?,?,?)',
      args: [batchId, itemKey, garmentType, condition ?? null] },
    { sql: 'INSERT INTO intake_inputs (batch_id,item_key,catalog) VALUES (?,?,?)',
      args: [batchId, itemKey, j(catalog)] },
  );
}
const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
try {
  await client.executeMultiple(SCHEMA);
  await client.batch(statements, 'write');
  console.log(`Imported ${keys.size} intake records into ${batchId}`);
} finally {
  client.close();
}
