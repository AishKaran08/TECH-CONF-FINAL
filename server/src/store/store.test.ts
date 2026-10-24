import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createJsonStore } from './json';
import { createSqliteStore } from './sqlite';
import type { Store } from './types';

const impls: [string, () => Store][] = [
  ['sqlite', () => createSqliteStore(new Database(':memory:'))],
  ['json (memory)', () => createJsonStore(null)],
];

describe.each(impls)('%s store', (_name, make) => {
  it('stores and returns documents', () => {
    const s = make();
    expect(s.getDoc('x')).toBeUndefined();
    s.setDoc('x', { a: 1 });
    expect(s.getDoc('x')).toEqual({ a: 1 });
    s.deleteDoc('x');
    expect(s.getDoc('x')).toBeUndefined();
  });

  it('de-duplicates records by namespace + external id and counts changes', () => {
    const s = make();
    expect(s.upsertRecords('github:repo', [{ id: '1', data: { n: 'a' } }, { id: '2', data: { n: 'b' } }])).toEqual({ added: 2, updated: 0, unchanged: 0 });
    expect(s.upsertRecords('github:repo', [{ id: '1', data: { n: 'a' } }, { id: '2', data: { n: 'B' } }, { id: '3', data: { n: 'c' } }])).toEqual({
      added: 1,
      updated: 1,
      unchanged: 1,
    });
    expect(s.listRecords('github:repo')).toHaveLength(3);
    // same id in another namespace is a different record
    s.upsertRecords('codeforces:submission', [{ id: '1', data: {} }]);
    expect(s.listRecords('github:repo')).toHaveLength(3);
  });

  it('prunes records not in the keep list', () => {
    const s = make();
    s.upsertRecords('ns', [1, 2, 3].map((i) => ({ id: String(i), data: i })));
    expect(s.pruneRecords('ns', ['2'])).toBe(2);
    expect(s.listRecords('ns')).toEqual([2]);
    s.clearNamespace('ns');
    expect(s.listRecords('ns')).toEqual([]);
  });
});
