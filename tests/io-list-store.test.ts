// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  createIndexedDbListStore,
  createMemoryListStore,
  LIST_DB_NAME,
  type ListStore,
} from '../src/io/index.ts';
import { serializeIndex, type ListIndex } from '../src/logic/index.ts';

const index = (kind: 'sanktion' | 'pep' = 'sanktion'): ListIndex => ({
  source: 'Test',
  kind,
  fetchedOn: '2026-11-20',
  entries: [{ id: '1', kind, names: ['Zorin Quelle'], births: ['1965'], remark: 'x' }],
});

function contract(make: () => ListStore) {
  it('is empty at first, round-trips and keeps the kinds apart', async () => {
    const s = make();
    expect(await s.load('sanktion')).toEqual({ ok: true, value: null });
    expect((await s.save(index())).ok).toBe(true);
    const r = await s.load('sanktion');
    expect(r.ok && r.value && serializeIndex(r.value)).toBe(serializeIndex(index()));
    expect(await s.load('pep')).toEqual({ ok: true, value: null });
  });
  it('clear removes the list', async () => {
    const s = make();
    await s.save(index());
    expect((await s.clear('sanktion')).ok).toBe(true);
    expect(await s.load('sanktion')).toEqual({ ok: true, value: null });
  });
}

describe('memory list store', () => contract(createMemoryListStore));

describe('IndexedDB list store (fake-indexeddb)', () => {
  let n = 0;
  contract(() => createIndexedDbListStore(new IDBFactory(), `db${n++}`));

  it('survives a new store object on the same database', async () => {
    const factory = new IDBFactory();
    await createIndexedDbListStore(factory).save(index());
    const r = await createIndexedDbListStore(factory).load('sanktion');
    expect(r.ok && r.value?.entries.length).toBe(1);
  });
  it('keeps the list in the database named gwg-listen, not in localStorage', async () => {
    localStorage.clear();
    await createIndexedDbListStore().save(index());
    expect(LIST_DB_NAME).toBe('gwg-listen');
    expect(localStorage.length).toBe(0);
    const db = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open('gwg-listen');
      r.onsuccess = () => res(r.result);
    });
    expect(db.objectStoreNames.length).toBe(1);
    db.close();
  });
  it('reports damaged stored data as bad-list, never as empty', async () => {
    const factory = new IDBFactory();
    const s = createIndexedDbListStore(factory, 'dmg');
    await s.save(index());
    const db = await new Promise<IDBDatabase>((res) => {
      const r = factory.open('dmg');
      r.onsuccess = () => res(r.result);
    });
    const name = db.objectStoreNames[0]!;
    await new Promise<void>((res) => {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).put('kaputt', 'sanktion');
      tx.oncomplete = () => res();
    });
    db.close();
    expect(await s.load('sanktion')).toMatchObject({ ok: false, reason: 'bad-list' });
    // a list stored under the wrong key is refused as well
    await s.save(index('pep'));
    const db2 = await new Promise<IDBDatabase>((res) => {
      const r = factory.open('dmg');
      r.onsuccess = () => res(r.result);
    });
    await new Promise<void>((res) => {
      const tx = db2.transaction(name, 'readwrite');
      tx.objectStore(name).put(serializeIndex(index('pep')), 'sanktion');
      tx.oncomplete = () => res();
    });
    db2.close();
    expect(await s.load('sanktion')).toMatchObject({ ok: false, reason: 'bad-list' });
  });
  it('reports a missing IndexedDB as store-failed', async () => {
    const s = createIndexedDbListStore(undefined as unknown as IDBFactory, 'x');
    // `undefined` falls back to the global one; a factory that throws is a failure
    const broken = createIndexedDbListStore(
      {
        open() {
          throw new Error('no');
        },
      } as unknown as IDBFactory,
      'y',
    );
    expect(s).toBeDefined();
    expect(await broken.load('sanktion')).toMatchObject({ ok: false, reason: 'store-failed' });
    expect((await broken.save(index())).ok).toBe(false);
  });
});
