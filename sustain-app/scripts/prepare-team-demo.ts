// Public demo inventory. All garment records and warehouse details are fictional.
import { closeSync, copyFileSync, mkdirSync, openSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from '../lib/db.ts';

export const teamDemoBatchId = 'TEAM-DEMO';
export const teamDemoDate = '2026-11-07';

export function prepareTeamDemo(file: string) {
  closeSync(openSync(file, 'wx', 0o600));
  const db = new DatabaseSync(file);
  try {
    db.exec(SCHEMA);
    db.prepare('INSERT INTO batches (batch_id, created_at) VALUES (?, ?)').run(teamDemoBatchId, new Date().toISOString());
    const insert = db.prepare(`INSERT INTO batch_items
      (batch_id,item_key,garment_type,color,category,label_text,visible_note,condition,location,item_due_date)
      VALUES (?,?,?,?,'samples',?,?,?,'Demo sample library',?)`);
    for (let i = 1; i <= 28; i++) {
      insert.run(teamDemoBatchId, `SAMPLE-${String(i).padStart(2, '0')}`, i % 2 ? 'scarf' : 'beanie',
        i % 2 ? 'navy' : 'ivory', i % 2 ? '100% Polyester' : '78% Acrylic, 14% Nylon, 8% Polyester',
        '', 'wearable', i <= 3 ? teamDemoDate : '2026-12-01');
    }
    insert.run(teamDemoBatchId, 'M-001', 't-shirt', 'white', '', '', 'damaged', '2026-12-01');
    insert.run(teamDemoBatchId, 'REVIEW-02', 'felt hat', 'black', '100% Polyester',
      'Photo shows a garment that conflicts with the recorded label (demo inspection).', 'damaged', '2026-12-01');
    insert.run(teamDemoBatchId, 'REVIEW-03', 'wrap', 'blue', '7% Acrylic 22% Polyester 4% Elastane', '', 'damaged', '2026-12-01');
    insert.run(teamDemoBatchId, 'REVIEW-04', 'wrap', 'ivory', '', '', 'damaged', '2026-12-01');
  } finally {
    db.close();
  }
  mkdirSync('public', { recursive: true });
  copyFileSync('preview/index.html', 'public/team-preview.html');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? 'local.db.team-demo';
  prepareTeamDemo(file);
  console.log(`Created ${teamDemoBatchId} in ${file}`);
}
