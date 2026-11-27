import {
  fail,
  ok,
  parseIndex,
  serializeIndex,
  type ListIndex,
  type ListKind,
  type Result,
} from '../logic/index.ts';

/**
 * Store of the public sanctions or PEP list. The list is public, so it is not encrypted and stays out
 * of the vault (and out of localStorage): a real EU index is several MB. Reading goes only through
 * `parseIndex`; damaged data is an error code, never an empty list.
 */
export interface ListStore {
  /** `ok(null)` = none loaded yet. */
  load(kind: ListKind): Promise<Result<ListIndex | null>>;
  save(index: ListIndex): Promise<Result<void>>;
  clear(kind: ListKind): Promise<Result<void>>;
}

export const LIST_DB_NAME = 'gwg-listen';
const OBJECT_STORE = 'listen';

/** Wraps one IndexedDB request into a promise; any failure is `store-failed`. */
function request<T>(r: IDBRequest<T>): Promise<Result<T>> {
  return new Promise((resolve) => {
    r.onsuccess = () => resolve(ok(r.result));
    r.onerror = () => resolve(fail('store-failed'));
  });
}

/** Resolves when the transaction has committed (a write counts as stored only then). */
function committed(tx: IDBTransaction): Promise<Result<void>> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(ok(undefined));
    tx.onerror = () => resolve(fail('store-failed'));
    tx.onabort = () => resolve(fail('store-failed'));
  });
}

export function createIndexedDbListStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
  name: string = LIST_DB_NAME,
): ListStore {
  let opened: Promise<Result<IDBDatabase>> | null = null;
  const open = (): Promise<Result<IDBDatabase>> => {
    if (!factory) return Promise.resolve(fail('store-failed'));
    opened ??= new Promise<Result<IDBDatabase>>((resolve) => {
      let req: IDBOpenDBRequest;
      try {
        req = factory.open(name, 1);
      } catch {
        resolve(fail('store-failed'));
        return;
      }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(OBJECT_STORE)) {
          req.result.createObjectStore(OBJECT_STORE);
        }
      };
      req.onsuccess = () => resolve(ok(req.result));
      req.onerror = () => resolve(fail('store-failed'));
      req.onblocked = () => resolve(fail('store-failed'));
    }).then((r) => {
      if (!r.ok) opened = null; // a failed open may be retried later
      return r;
    });
    return opened;
  };

  async function run<T>(
    mode: IDBTransactionMode,
    work: (os: IDBObjectStore) => IDBRequest<T>,
  ): Promise<Result<T>> {
    const db = await open();
    if (!db.ok) return db;
    try {
      const tx = db.value.transaction(OBJECT_STORE, mode);
      const done = committed(tx);
      const r = await request(work(tx.objectStore(OBJECT_STORE)));
      const c = await done;
      if (!c.ok) return c;
      return r;
    } catch {
      return fail('store-failed');
    }
  }

  return {
    async load(kind) {
      const r = await run('readonly', (os) => os.get(kind));
      if (!r.ok) return r;
      if (r.value === undefined) return ok(null);
      if (typeof r.value !== 'string') return fail('bad-list');
      const parsed = parseIndex(r.value);
      if (!parsed.ok) return parsed;
      return parsed.value.kind === kind ? parsed : fail('bad-list');
    },
    async save(index) {
      const r = await run('readwrite', (os) => os.put(serializeIndex(index), index.kind));
      return r.ok ? ok(undefined) : r;
    },
    async clear(kind) {
      const r = await run('readwrite', (os) => os.delete(kind));
      return r.ok ? ok(undefined) : r;
    },
  };
}

/** Store in memory, for tests and screens without IndexedDB. Keeps the serialized text like the real one. */
export function createMemoryListStore(): ListStore {
  const lists = new Map<ListKind, string>();
  return {
    load(kind) {
      const t = lists.get(kind);
      return Promise.resolve(t === undefined ? ok(null) : parseIndex(t));
    },
    save(index) {
      lists.set(index.kind, serializeIndex(index));
      return Promise.resolve(ok(undefined));
    },
    clear(kind) {
      lists.delete(kind);
      return Promise.resolve(ok(undefined));
    },
  };
}
