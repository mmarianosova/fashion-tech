import { closeSync, openSync } from 'node:fs';
import { resolve } from 'node:path';
import { libsqlDb } from '../lib/db.ts';
import { seed } from '../lib/seed.ts';

const path = resolve(process.argv[2] ?? 'local.db.disposition-demo');
closeSync(openSync(path, 'wx', 0o600));
const db = await libsqlDb(`file:${path}`);
await seed(db, resolve(import.meta.dirname, '../data'));
await db.run("DELETE FROM inventory WHERE item_key NOT IN ('D-001','D-003','D-005','T-001','T-007','D-004','S-001')");
await db.run("UPDATE inventory SET item_due_date='2026-11-07' WHERE item_key='T-007'");
await db.run('DELETE FROM batch_items');
console.log(`Prepared seven fictional inventory items in ${path}. Use DEMO_TODAY=2026-11-07.`);
