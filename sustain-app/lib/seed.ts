import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db.ts';
import { migrate } from './db.ts';

const rd = (dir: string, f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

export async function seed(db: Db, dataDir: string, now = () => new Date().toISOString()) {
  await migrate(db);
  if ((await db.all('SELECT 1 AS x FROM batches LIMIT 1')).length) return { seeded: false };
  await db.run('INSERT INTO batches (batch_id,created_at,threshold,status) VALUES (?,?,?,?)', ['SEED-1', now(), 0.8, 'new']);
  for (const i of rd(dataDir, 'intake_items.json')) {
    await db.run(`INSERT INTO batch_items (batch_id,item_key,garment_type,color,category,label_text,visible_note,condition,image_path) VALUES (?,?,?,?,?,?,?,?,?)`,
      ['SEED-1', i.item_key, i.garment_type, i.color, i.category, i.label_text, i.visible_note, i.condition, i.image_path ?? null]);
  }
  for (const r of rd(dataDir, 'inventory.json')) {
    await db.run(`INSERT INTO inventory (item_key,category,stream,fibre_type,color_group,condition,location,season,received_date,return_window_close,item_due_date,alert_status,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.item_key, r.category, r.tags.stream, r.tags.fibre_type, r.tags.color_group, r.tags.condition, r.location, r.season, r.received_date,
       r.return_window_close, r.item_due_date, r.alert_status, r.status]);
  }
  return { seeded: true };
}

export const loadRecyclers = (dataDir: string) => rd(dataDir, 'recyclers.json');
