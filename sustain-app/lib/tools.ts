// Handlers for the Intake/Disposition custom tools. Plain functions over Db so they are testable offline.
import { isCalendarDate } from './rules.ts';
import type { Db } from './db.ts';
import { j, p } from './db.ts';
import { assessIntake, type CatalogInput, type ProductLookup } from './intake.ts';

export const PENDING = Symbol('pending'); // tool result withheld until a person decides

export type Ctx = { db: Db; now: () => string; callId: string; sessionId: string; newId: (prefix: string) => string; materialOnly?: boolean; lookupProduct?: ProductLookup };

const STREAMS = ['mixed', 'shred', 'denim', 'trash'];
const GROUPS = ['whites', 'darks', 'brights', 'mixed'];
const CONDS = ['wearable', 'damaged', 'unusable'];
const ALERTS = ['donate_recycle_due', 'review_waiting', 'dispute_deadline', 'delay_risk'];

export class ToolError extends Error {}
const need = (c: unknown, msg: string) => { if (!c) throw new ToolError(msg); };
export const isTags = (t: any, materialOnly = false) =>
  t && STREAMS.includes(t.stream) && GROUPS.includes(t.color_group) && (materialOnly ? t.condition === 'unknown' : CONDS.includes(t.condition)) && typeof t.fibre_type === 'string';

async function upsertInventory(c: Ctx, key: string, tags: any, status: string, conf: number, reason: string, src: any) {
  await c.db.run(
    `INSERT INTO inventory (item_key,category,stream,fibre_type,color_group,condition,location,season,received_date,return_window_close,item_due_date,status,confidence,reason)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(item_key) DO UPDATE SET stream=excluded.stream,fibre_type=excluded.fibre_type,color_group=excluded.color_group,
       condition=excluded.condition,status=excluded.status,confidence=excluded.confidence,reason=excluded.reason`,
    [key, src?.category ?? null, tags.stream, tags.fibre_type, tags.color_group, tags.condition, src?.location ?? null, src?.season ?? null,
     src?.received_date ?? null, src?.return_window_close ?? null, src?.item_due_date ?? null, status, conf, reason],
  );
}

async function batchItem(c: Ctx, key: string) {
  return (await c.db.all(`SELECT b.*,a.result AS assessment,i.catalog FROM batch_items b
    LEFT JOIN intake_assessments a ON a.batch_id=b.batch_id AND a.item_key=b.item_key AND a.session_id=?
    LEFT JOIN intake_inputs i ON i.batch_id=b.batch_id AND i.item_key=b.item_key
    WHERE b.item_key=? ORDER BY a.result IS NOT NULL DESC,b.rowid DESC LIMIT 1`, [c.sessionId, key]))[0];
}

export const tools: Record<string, (c: Ctx, input: any) => Promise<any>> = {
  async get_batch(c, i) {
    need(typeof i?.batch_id === 'string', 'batch_id required');
    const rows = await c.db.all(`SELECT b.*,i.catalog FROM batch_items b LEFT JOIN intake_inputs i
      ON b.batch_id=i.batch_id AND b.item_key=i.item_key WHERE b.batch_id=? ORDER BY b.item_key`, [i.batch_id]);
    need(rows.length > 0, `unknown batch ${i.batch_id}`);
    const items = [];
    for (const r of rows) {
      const item = { item_key: r.item_key, garment_type: r.garment_type, color: r.color, category: r.category,
        label_text: r.label_text ?? '', visible_note: r.visible_note ?? '', condition: r.condition };
      const params = [c.sessionId, i.batch_id, r.item_key];
      let assessment = p((await c.db.all('SELECT result FROM intake_assessments WHERE session_id=? AND batch_id=? AND item_key=?', params))[0]?.result);
      if (!assessment) {
        assessment = await assessIntake({ ...item, catalog: p<CatalogInput>(r.catalog) ?? undefined, materialOnly: !!r.catalog && c.materialOnly }, c.lookupProduct);
        await c.db.run('INSERT OR IGNORE INTO intake_assessments (session_id,batch_id,item_key,result) VALUES (?,?,?,?)', [...params, j(assessment)]);
        assessment = p((await c.db.all('SELECT result FROM intake_assessments WHERE session_id=? AND batch_id=? AND item_key=?', params))[0]?.result);
      }
      const { tags, status, confidence, reason } = assessment;
      items.push({ ...item, assessment: { tags, status, confidence, reason } });
    }
    return { items };
  },

  async save_tags(c, i) {
    need(typeof i?.item_key === 'string', 'item_key required');
    need(typeof i.confidence === 'number' && i.confidence >= 0 && i.confidence <= 1, 'confidence 0..1 required');
    const bi = await batchItem(c, i.item_key);
    need(bi, `unknown item ${i.item_key}`);
    const assessment = p(bi.assessment);
    need(!bi.catalog || assessment, 'get_batch must assess this catalog item first');
    need(isTags(i.tags, assessment?.materialOnly), 'invalid tags');
    if (assessment) {
      const review = (await c.db.all("SELECT state,decided_tags FROM reviews WHERE session_id=? AND batch_id=? AND item_key=? ORDER BY rowid DESC LIMIT 1",
        [c.sessionId, bi.batch_id, i.item_key]))[0];
      const expected = review ? p(review.decided_tags) : assessment.status === 'tagged' ? assessment.tags : null;
      need(expected && ['stream', 'fibre_type', 'color_group', 'condition'].every((k) => expected[k] === i.tags[k]),
        'tags must match the assessment or the human decision');
    }
    await c.db.run(`UPDATE batch_items SET state='tagged',stream=?,fibre_type=?,color_group=?,confidence=?,reason=? WHERE batch_id=? AND item_key=?`,
      [i.tags.stream, i.tags.fibre_type, i.tags.color_group, i.confidence, i.reason ?? '', bi.batch_id, i.item_key]);
    await upsertInventory(c, i.item_key, i.tags, assessment?.materialOnly ? 'material_tagged' : 'tagged', i.confidence, i.reason ?? '', bi);
    return { ok: true };
  },

  async hold_for_review(c, i) {
    need(typeof i?.item_key === 'string', 'item_key required');
    need(typeof i.reason === 'string' && typeof i.confidence === 'number', 'reason and confidence required');
    const bi = await batchItem(c, i.item_key);
    need(bi, `unknown item ${i.item_key}`);
    const assessment = p(bi.assessment);
    need(!bi.catalog || assessment, 'get_batch must assess this catalog item first');
    const proposal = assessment?.tags ?? i.proposed_tags;
    const reason = assessment?.status === 'needs_review' ? assessment.reason : i.reason;
    const existing = await c.db.all('SELECT review_id FROM reviews WHERE call_id=?', [c.callId]);
    if (!existing.length) {
      await c.db.run(
        `INSERT INTO reviews (review_id,batch_id,item_key,call_id,session_id,reason,proposed_tags,confidence,label_text) VALUES (?,?,?,?,?,?,?,?,?)`,
        [c.newId('rev'), bi.batch_id, i.item_key, c.callId, c.sessionId, reason, j(proposal ?? null), i.confidence, bi.label_text ?? ''],
      );
      await c.db.run(`UPDATE batch_items SET state='held',confidence=?,reason=? WHERE batch_id=? AND item_key=?`, [i.confidence, reason, bi.batch_id, i.item_key]);
      const t = assessment?.tags ?? (isTags(proposal) ? proposal
        : { stream: 'mixed', fibre_type: 'unknown', color_group: 'mixed', condition: bi.condition || 'unknown' });
      await upsertInventory(c, i.item_key, t, 'held', i.confidence, reason, bi);
    }
    return PENDING;
  },

  async list_inventory(c, i) {
    need(isCalendarDate(i?.today), 'today must be YYYY-MM-DD');
    const rows = await c.db.all("SELECT * FROM inventory WHERE status <> 'material_tagged' ORDER BY item_key");
    return { today: i.today, items: rows.map((r) => ({
      item_key: r.item_key, category: r.category, tags: { stream: r.stream, fibre_type: r.fibre_type, color_group: r.color_group, condition: r.condition },
      location: r.location, season: r.season, received_date: r.received_date, return_window_close: r.return_window_close,
      item_due_date: r.item_due_date, alert_status: r.alert_status, status: r.status })) };
  },

  async send_alert(c, i) {
    need(ALERTS.includes(i?.type), 'invalid alert type');
    need(Array.isArray(i.items) && i.items.length > 0 && i.items.every((x: any) => typeof x === 'string'), 'items required');
    need(typeof i.next_step === 'string' && typeof i.summary === 'string', 'next_step and summary required');
    const items = [...new Set<string>(i.items)].sort();
    need(items.length === i.items.length, 'duplicate item in alert');
    const id = c.newId('alt');
    const inserted = await c.db.all(`INSERT INTO alerts (alert_id,type,items,location,deadline,next_step,recycler_address,summary,created_at)
      SELECT ?,?,?,?,?,?,?,?,?
      WHERE (SELECT COUNT(*) FROM inventory WHERE item_key IN (SELECT value FROM json_each(?))
        AND alert_status <> 'sent' AND NOT EXISTS (
          SELECT 1 FROM alerts a, json_each(a.items) old WHERE a.type NOT IN ('question','reply') AND old.value=inventory.item_key
            AND (? <> 'donate_recycle_due' OR a.type <> 'review_waiting')
        )) = ?
      AND (? <> 'donate_recycle_due' OR EXISTS (
        SELECT 1 FROM pickups p WHERE json_array_length(p.items)=?
          AND NOT EXISTS (SELECT value FROM json_each(?) EXCEPT SELECT value FROM json_each(p.items))
      ))
      RETURNING alert_id`,
      [id, i.type, j(items), i.location ?? null, i.deadline ?? null, i.next_step, i.recycler_address ?? null,
        i.summary, c.now(), j(items), i.type, items.length, i.type, items.length, j(items)]);
    need(inserted.length, 'already alerted, unknown item, or missing confirmed pickup');
    return { alert_id: id };
  },
};

export { p };
