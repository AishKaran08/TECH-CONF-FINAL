import type BetterSqlite3 from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createJsonStore } from './json';
import { createSqliteStore } from './sqlite';
import type { Store } from './types';

export type { Store, UpsertResult } from './types';
export { createJsonStore } from './json';

/** SQLite via better-sqlite3 when its native module loads; otherwise the JSON-file store. */
export function createStore(dataDir: string): Store {
  mkdirSync(dataDir, { recursive: true });
  try {
    const require = createRequire(import.meta.url);
    const Database = require('better-sqlite3') as typeof BetterSqlite3;
    const db = new Database(join(dataDir, 'runway.sqlite'));
    return createSqliteStore(db);
  } catch (err) {
    console.warn(`[store] SQLite unavailable (${(err as Error).message.split('\n')[0]}); using JSON file store instead.`);
    return createJsonStore(join(dataDir, 'runway.json'));
  }
}
