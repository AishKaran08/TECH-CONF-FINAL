import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Store, UpsertResult } from './types';

interface JsonShape {
  docs: Record<string, unknown>;
  records: Record<string, Record<string, unknown>>;
}

/**
 * JSON-file store used when better-sqlite3 cannot be loaded. Same interface; writes are
 * debounced and atomic (write to a temp file, then rename). Pass `null` for an in-memory store (tests).
 */
export function createJsonStore(file: string | null): Store {
  let data: JsonShape = { docs: {}, records: {} };
  if (file && existsSync(file)) {
    try {
      data = JSON.parse(readFileSync(file, 'utf8')) as JsonShape;
      data.docs ??= {};
      data.records ??= {};
    } catch {
      console.warn('[store] JSON store unreadable, starting fresh (old file kept as .corrupt)');
      try {
        renameSync(file, `${file}.corrupt`);
      } catch {
        /* ignore */
      }
    }
  }
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    if (!file) return;
    timer = null;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file);
  };
  const schedule = () => {
    if (!file || timer) return;
    timer = setTimeout(flush, 150);
  };
  const clone = <T>(v: unknown): T => (v === undefined ? (undefined as T) : (JSON.parse(JSON.stringify(v)) as T));

  return {
    kind: file ? 'json' : 'memory',
    getDoc: <T>(key: string) => clone<T>(data.docs[key]),
    setDoc(key, value) {
      data.docs[key] = clone(value);
      schedule();
    },
    deleteDoc(key) {
      delete data.docs[key];
      schedule();
    },
    upsertRecords(ns, items) {
      const bucket = (data.records[ns] ??= {});
      const res: UpsertResult = { added: 0, updated: 0, unchanged: 0 };
      for (const it of items) {
        const json = JSON.stringify(it.data);
        const prev = bucket[it.id];
        if (prev === undefined) res.added++;
        else if (JSON.stringify(prev) === json) {
          res.unchanged++;
          continue;
        } else res.updated++;
        bucket[it.id] = JSON.parse(json);
      }
      schedule();
      return res;
    },
    listRecords: <T>(ns: string) => Object.values(data.records[ns] ?? {}).map((v) => clone<T>(v)),
    pruneRecords(ns, keep) {
      const bucket = data.records[ns] ?? {};
      const keepSet = new Set(keep);
      let removed = 0;
      for (const id of Object.keys(bucket)) {
        if (!keepSet.has(id)) {
          delete bucket[id];
          removed++;
        }
      }
      schedule();
      return removed;
    },
    clearNamespace(ns) {
      delete data.records[ns];
      schedule();
    },
    close() {
      if (timer) {
        clearTimeout(timer);
        flush();
      }
    },
  };
}
