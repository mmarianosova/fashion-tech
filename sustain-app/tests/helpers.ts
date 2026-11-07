import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import type { Db } from '../lib/db.ts';
import { FakeZoo } from '../lib/zoo.ts';
import { seed, loadRecyclers } from '../lib/seed.ts';
import type { Deps } from '../lib/bridge.ts';

export const DATA = join(import.meta.dirname, '..', 'data');

export function sqliteDb(): Db {
  const s = new DatabaseSync(':memory:');
  return {
    all: async (sql, args = []) => s.prepare(sql).all(...args) as any[],
    run: async (sql, args = []) => { s.prepare(sql).run(...args); },
    exec: async (sql) => { s.exec(sql); },
  };
}

export async function setup() {
  const db = sqliteDb();
  await seed(db, DATA);
  const zoo = new FakeZoo();
  let t = 0, id = 0;
  const now = () => `2026-11-07T10:00:${String(t++ % 60).padStart(2, '0')}Z`;
  const newId = (p: string) => `${p}_${++id}`;
  const deps: Deps = { db, zoo, now, newId };
  const mcp = { db, recyclers: loadRecyclers(DATA), now, newId };
  return { db, zoo, deps, mcp };
}
