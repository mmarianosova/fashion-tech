-- SQLite/libSQL-compatible schema for the sustainability app. Postgres users: swap TEXT JSON for JSONB.
CREATE TABLE batches (
  batch_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  threshold REAL NOT NULL DEFAULT 0.80,
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'new'          -- new|running|awaiting_review|done|error
);
CREATE TABLE items (
  item_key TEXT PRIMARY KEY,
  batch_id TEXT REFERENCES batches(batch_id),
  garment_type TEXT, color TEXT, category TEXT,
  label_text TEXT, visible_note TEXT, condition TEXT,
  image_path TEXT,                             -- app-side path or URL; null for text-only
  workspace_path TEXT,                         -- path inside the agent /workspace after upload_file
  -- tags (filled by save_tags)
  stream TEXT, fibre_type TEXT, color_group TEXT,
  confidence REAL, reason TEXT, label_data TEXT,   -- label_data is JSON
  -- inventory fields (Disposition)
  location TEXT, season TEXT, received_date TEXT, return_window_close TEXT, item_due_date TEXT,
  alert_status TEXT NOT NULL DEFAULT 'none',   -- none|sent
  status TEXT NOT NULL DEFAULT 'new'           -- new|tagged|held|rejected
);
CREATE TABLE reviews (
  review_id TEXT PRIMARY KEY,
  item_key TEXT NOT NULL REFERENCES items(item_key),
  call_id TEXT NOT NULL UNIQUE,                -- ZooWork custom tool call id, used to resolve
  session_id TEXT NOT NULL,
  reason TEXT, proposed_tags TEXT, confidence REAL, label_data TEXT,
  state TEXT NOT NULL DEFAULT 'pending',       -- pending|approved|edited|rejected
  decided_tags TEXT, decided_at TEXT
);
CREATE TABLE approvals (
  approval_id TEXT PRIMARY KEY,                -- ZooWork approval id
  session_id TEXT NOT NULL,
  tool TEXT NOT NULL, input TEXT NOT NULL,     -- book_pickup input JSON
  state TEXT NOT NULL DEFAULT 'pending',       -- pending|allowed|denied|expired
  created_at TEXT NOT NULL, decided_at TEXT
);
CREATE TABLE pickups (
  booking_id TEXT PRIMARY KEY, partner_id TEXT, route TEXT, items TEXT, lots TEXT,
  deadline TEXT, artifact_url TEXT, created_at TEXT
);
CREATE TABLE alerts (
  alert_id TEXT PRIMARY KEY, type TEXT NOT NULL, items TEXT NOT NULL, location TEXT,
  deadline TEXT, next_step TEXT, recycler_address TEXT, summary TEXT NOT NULL,
  created_at TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE events (                           -- raw event log for the live feed
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, cursor TEXT,
  type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(session_id, cursor)                    -- dedupe webhook/stream replays
);
CREATE TABLE handled_calls (                     -- idempotency for tool resolution
  call_id TEXT PRIMARY KEY, resolved_at TEXT NOT NULL
);
CREATE TABLE runs (
  session_id TEXT PRIMARY KEY, agent TEXT NOT NULL,     -- intake|disposition
  started_at TEXT NOT NULL, finished_at TEXT, status TEXT, summary TEXT, cost_usd REAL
);
CREATE INDEX idx_items_batch ON items(batch_id);
CREATE INDEX idx_reviews_state ON reviews(state);
