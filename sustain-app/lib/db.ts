// Minimal DB interface. Production: libSQL/Turso. Tests/preview: node:sqlite adapter (tests/helpers.ts).
export interface Db {
  all(sql: string, args?: any[]): Promise<any[]>;
  run(sql: string, args?: any[]): Promise<void>;
  exec(sql: string): Promise<void>;
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS batches (batch_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, threshold REAL NOT NULL DEFAULT 0.8, session_id TEXT, status TEXT NOT NULL DEFAULT 'new');
CREATE TABLE IF NOT EXISTS batch_items (batch_id TEXT NOT NULL, item_key TEXT NOT NULL, garment_type TEXT, color TEXT, category TEXT, label_text TEXT, visible_note TEXT, condition TEXT, image_path TEXT, workspace_path TEXT, location TEXT, season TEXT, received_date TEXT, return_window_close TEXT, item_due_date TEXT, state TEXT NOT NULL DEFAULT 'pending', stream TEXT, fibre_type TEXT, color_group TEXT, confidence REAL, reason TEXT, PRIMARY KEY (batch_id, item_key));
CREATE TABLE IF NOT EXISTS inventory (item_key TEXT PRIMARY KEY, category TEXT, stream TEXT, fibre_type TEXT, color_group TEXT, condition TEXT, location TEXT, season TEXT, received_date TEXT, return_window_close TEXT, item_due_date TEXT, alert_status TEXT NOT NULL DEFAULT 'none', status TEXT NOT NULL DEFAULT 'tagged', confidence REAL, reason TEXT);
CREATE TABLE IF NOT EXISTS reviews (review_id TEXT PRIMARY KEY, batch_id TEXT, item_key TEXT NOT NULL, call_id TEXT NOT NULL UNIQUE, session_id TEXT NOT NULL, reason TEXT, proposed_tags TEXT, confidence REAL, label_text TEXT, state TEXT NOT NULL DEFAULT 'pending', decided_tags TEXT, decided_at TEXT);
CREATE TABLE IF NOT EXISTS approvals (approval_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, tool TEXT NOT NULL, input TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, decided_at TEXT);
CREATE TABLE IF NOT EXISTS pickups (booking_id TEXT PRIMARY KEY, partner_id TEXT, route TEXT, items TEXT, lots TEXT, deadline TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS alerts (alert_id TEXT PRIMARY KEY, type TEXT NOT NULL, items TEXT NOT NULL, location TEXT, deadline TEXT, next_step TEXT, recycler_address TEXT, summary TEXT NOT NULL, created_at TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, cursor TEXT, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(session_id, cursor));
CREATE TABLE IF NOT EXISTS handled_calls (call_id TEXT PRIMARY KEY, result TEXT NOT NULL, is_error INTEGER NOT NULL DEFAULT 0, resolved INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS runs (session_id TEXT PRIMARY KEY, agent TEXT NOT NULL, ref TEXT, started_at TEXT NOT NULL, finished_at TEXT, status TEXT, summary TEXT, cost_usd REAL);
`;

export async function migrate(db: Db) {
  await db.exec(SCHEMA);
}

export async function libsqlDb(url: string, authToken?: string): Promise<Db> {
  const { createClient } = await import('@libsql/client');
  const c = createClient({ url, authToken });
  const rows = (r: any) => r.rows.map((row: any) => Object.fromEntries(r.columns.map((col: string, i: number) => [col, row[i]])));
  return {
    all: async (sql, args = []) => rows(await c.execute({ sql, args })),
    run: async (sql, args = []) => { await c.execute({ sql, args }); },
    exec: async (sql) => { await c.executeMultiple(sql); },
  };
}

export const j = (v: unknown) => JSON.stringify(v);
export const p = <T = any>(s: string | null | undefined, d: T | null = null): T | null => (s ? JSON.parse(s) : d);
