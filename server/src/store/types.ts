/** Small repository interface. Implemented by SQLite (preferred) and a JSON file (fallback). */
export interface UpsertResult {
  added: number;
  updated: number;
  unchanged: number;
}

export interface Store {
  readonly kind: 'sqlite' | 'json' | 'memory';
  getDoc<T>(key: string): T | undefined;
  setDoc(key: string, value: unknown): void;
  deleteDoc(key: string): void;
  /** Insert or update records keyed by (namespace, external id). Namespace is e.g. "github:repo". */
  upsertRecords(ns: string, items: { id: string; data: unknown }[]): UpsertResult;
  listRecords<T>(ns: string): T[];
  /** Remove records in the namespace whose id is not in keepIds. Returns how many were removed. */
  pruneRecords(ns: string, keepIds: string[]): number;
  clearNamespace(ns: string): void;
  close(): void;
}
