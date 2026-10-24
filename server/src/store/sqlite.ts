import type Database from 'better-sqlite3';
import type { Store, UpsertResult } from './types';

export function createSqliteStore(db: Database.Database): Store {
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS docs (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records (
      ns TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (ns, id)
    );
  `);
  const getDoc = db.prepare<[string], { value: string }>('SELECT value FROM docs WHERE key = ?');
  const setDoc = db.prepare('INSERT INTO docs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
  const delDoc = db.prepare('DELETE FROM docs WHERE key = ?');
  const getRec = db.prepare<[string, string], { data: string }>('SELECT data FROM records WHERE ns = ? AND id = ?');
  const putRec = db.prepare('INSERT INTO records (ns, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(ns, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
  const listRec = db.prepare<[string], { data: string }>('SELECT data FROM records WHERE ns = ? ORDER BY rowid');
  const listIds = db.prepare<[string], { id: string }>('SELECT id FROM records WHERE ns = ?');
  const delRec = db.prepare('DELETE FROM records WHERE ns = ? AND id = ?');
  const clearNs = db.prepare('DELETE FROM records WHERE ns = ?');

  const upsert = db.transaction((ns: string, items: { id: string; data: unknown }[]): UpsertResult => {
    const res: UpsertResult = { added: 0, updated: 0, unchanged: 0 };
    const now = new Date().toISOString();
    for (const it of items) {
      const json = JSON.stringify(it.data);
      const existing = getRec.get(ns, it.id);
      if (!existing) res.added++;
      else if (existing.data === json) {
        res.unchanged++;
        continue;
      } else res.updated++;
      putRec.run(ns, it.id, json, now);
    }
    return res;
  });

  const prune = db.transaction((ns: string, keep: string[]) => {
    const keepSet = new Set(keep);
    let removed = 0;
    for (const { id } of listIds.all(ns)) {
      if (!keepSet.has(id)) {
        delRec.run(ns, id);
        removed++;
      }
    }
    return removed;
  });

  return {
    kind: 'sqlite',
    getDoc<T>(key: string) {
      const row = getDoc.get(key);
      return row ? (JSON.parse(row.value) as T) : undefined;
    },
    setDoc(key, value) {
      setDoc.run(key, JSON.stringify(value), new Date().toISOString());
    },
    deleteDoc(key) {
      delDoc.run(key);
    },
    upsertRecords: (ns, items) => upsert(ns, items),
    listRecords<T>(ns: string) {
      return listRec.all(ns).map((r) => JSON.parse(r.data) as T);
    },
    pruneRecords: (ns, keep) => prune(ns, keep),
    clearNamespace(ns) {
      clearNs.run(ns);
    },
    close() {
      db.close();
    },
  };
}
