import { p, type Db } from './db.ts';
import { productUrl, type assessIntake } from './intake.ts';
import type { Fibre } from './rules.ts';

type Assessment = Awaited<ReturnType<typeof assessIntake>>;
const format = (fibres: Fibre[]) => fibres.map(({ fibre, pct }) => `${pct}% ${fibre}`).join(', ');

function workbookLink(source?: string) {
  if (source && /^https:\/\/(drive|docs)\.google\.com\//.test(source)) return source;
}

export async function readBatchResults(db: Db, batchId?: string) {
  const [batch] = await (batchId
    ? db.all('SELECT batch_id FROM batches WHERE batch_id=?', [batchId])
    : db.all('SELECT batch_id FROM batches ORDER BY created_at DESC, rowid DESC LIMIT 1'));
  if (!batch) return null;

  const rows = await db.all(`SELECT b.item_key,b.garment_type,b.label_text,b.fibre_type,b.state,
      a.result,r.state AS review_state,r.decided_tags,r.decided_at
    FROM batch_items b
    LEFT JOIN intake_assessments a ON a.rowid=(
      SELECT rowid FROM intake_assessments WHERE batch_id=b.batch_id AND item_key=b.item_key ORDER BY rowid DESC LIMIT 1)
    LEFT JOIN reviews r ON r.rowid=(
      SELECT rowid FROM reviews WHERE batch_id=b.batch_id AND item_key=b.item_key
        AND (a.session_id IS NULL OR session_id=a.session_id) ORDER BY rowid DESC LIMIT 1)
    WHERE b.batch_id=? ORDER BY b.item_key`, [batch.batch_id]);

  const items = rows.map((row) => {
    const assessment = p<Assessment>(row.result);
    const evidence = assessment?.evidence;
    const material = assessment?.material ? format(assessment.material)
      : assessment?.materialComponents
        ? `Outer: ${format(assessment.materialComponents.outer)} · Lining: ${format(assessment.materialComponents.lining)}`
        : !assessment && row.fibre_type !== 'unknown' ? row.fibre_type ?? null : null;
    const editedMaterial = row.review_state === 'edited' ? p(row.decided_tags)?.fibre_type ?? null : null;
    const website = evidence?.lookup.verified;
    const websiteUrl = website?.url && productUrl(website.url)?.href;
    const workbook = evidence?.workbook;
    const prefix = batch.batch_id + ':';
    return {
      style: row.item_key.startsWith(prefix) ? row.item_key.slice(prefix.length) : row.item_key,
      description: row.garment_type as string | null,
      state: row.state as string,
      reason: assessment?.status === 'needs_review' ? assessment.reason : null,
      material: editedMaterial ?? material,
      review: row.review_state && row.review_state !== 'pending' ? {
        state: row.review_state as string, before: material, after: editedMaterial as string | null,
        at: row.decided_at as string,
      } : null,
      evidence: {
        label: (evidence?.input.label_text || row.label_text) as string | null,
        workbookUrl: workbookLink(workbook?.sourceUrl),
        workbookRows: workbook?.rows.map(({ sheet, row, composition }) => ({ sheet, row, composition })) ?? [],
        website: websiteUrl ? { url: websiteUrl, composition: website?.composition } : null,
      },
    };
  });
  return { batchId: batch.batch_id as string, items };
}
