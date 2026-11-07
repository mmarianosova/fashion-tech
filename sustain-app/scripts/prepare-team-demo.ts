// Create an isolated fictional batch and serve the team's existing interface.
import { copyFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from '../lib/db.ts';

const file = 'local.db.team-demo';
closeSync(openSync(file, 'wx'));
const db = new DatabaseSync(file);
try {
  db.exec(SCHEMA);
  db.prepare('INSERT INTO batches (batch_id, created_at) VALUES (?, ?)').run('TEAM-DEMO', new Date().toISOString());
  const insert = db.prepare(`INSERT INTO batch_items
    (batch_id, item_key, garment_type, color, category, label_text, condition, location, item_due_date)
    VALUES ('TEAM-DEMO', ?, 'jeans', 'indigo', 'bottoms', ?, 'damaged', 'Demo warehouse', '2026-11-07')`);
  for (const id of ['DEMO-D01', 'DEMO-D02', 'DEMO-D03']) {
    insert.run(id, '98% Cotton 2% Elastane');
  }
  insert.run('DEMO-REVIEW', 'Faded label: 65% Cotton');
} finally {
  db.close();
}
mkdirSync('public', { recursive: true });
copyFileSync('preview/index.html', 'public/team-preview.html');
console.log('Created TEAM-DEMO in ' + file);
