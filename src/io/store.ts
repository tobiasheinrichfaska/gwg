import type { Vault } from 'local-vault';
import {
  fail,
  ok,
  parseBackup,
  parseIndex,
  serializeBackup,
  serializeIndex,
  type Backup,
  type ListIndex,
  type ListKind,
  type Result,
} from '../logic/index.ts';

/** The whole data set lives in one place; load and save never drop anything silently. */
export interface AppStore {
  /** `ok(null)` = nothing stored yet. Damaged data is an error code, never an empty data set. */
  load(): Promise<Result<Backup | null>>;
  save(b: Backup): Promise<Result<void>>;
  /** The stored sanctions or PEP list; `ok(null)` = none loaded yet. Damaged data is an error code. */
  loadList(kind: ListKind): Promise<Result<ListIndex | null>>;
  saveList(index: ListIndex): Promise<Result<void>>;
}

/**
 * Slot of a list in the vault; the vault config of the app must list it in `slots` (`LIST_SLOTS`).
 * The installed local-vault 0.1.0 has slots only (no blobs): a real EU index is several MB of text
 * in localStorage, which may be too much (see docs/io-schnittstellen.md, "EU-Liste").
 */
export const listSlotName = (kind: ListKind): string => `liste-${kind}`;
export const LIST_SLOTS: string[] = [listSlotName('sanktion'), listSlotName('pep')];

/** Slot name inside the vault; the vault config of the app must list it in `slots`. */
export const VAULT_SLOT = 'bestand';

/**
 * Store on a local-vault slot (device mode, optional app lock). The slot holds exactly the text of
 * `serializeBackup` and is read only through `parseBackup`. A slot is a text in localStorage, held in
 * memory: right for a client list, not for large binaries.
 */
export function createVaultStore(vault: Vault, slot: string = VAULT_SLOT): AppStore {
  /** Writes a text to a slot and waits until it is stored; a late storage error counts as failure. */
  async function write(name: string, text: string): Promise<Result<void>> {
    let late: string | undefined;
    const off = vault.onError((e) => {
      late = e;
    });
    try {
      const refused = vault.writeSlot(name, text);
      if (refused !== undefined) return fail('store-failed');
      await vault.saved();
    } catch {
      return fail('store-failed');
    } finally {
      off();
    }
    return late === undefined ? ok(undefined) : fail('store-failed');
  }
  /** `null` = nothing stored; a closed vault or unreadable slot is an error, never "empty". */
  function read(name: string): string | null | undefined {
    try {
      return vault.readSlot(name);
    } catch {
      return undefined;
    }
  }
  return {
    load() {
      const text = read(slot);
      if (text === undefined) return Promise.resolve(fail('store-failed'));
      if (text === null) return Promise.resolve(ok(null));
      return Promise.resolve(parseBackup(text));
    },
    save: (b) => write(slot, serializeBackup(b)),
    loadList(kind) {
      const text = read(listSlotName(kind));
      if (text === undefined) return Promise.resolve(fail('store-failed'));
      if (text === null) return Promise.resolve(ok(null));
      return Promise.resolve(parseIndex(text));
    },
    saveList: (index) => write(listSlotName(index.kind), serializeIndex(index)),
  };
}

/** Store in memory, for tests and screens without a vault. Keeps the serialized text like the real one. */
export function createMemoryStore(initialText: string | null = null): AppStore {
  let text = initialText;
  const lists = new Map<ListKind, string>();
  return {
    load() {
      return Promise.resolve(text === null ? ok(null) : parseBackup(text));
    },
    save(b) {
      text = serializeBackup(b);
      return Promise.resolve(ok(undefined));
    },
    loadList(kind) {
      const t = lists.get(kind);
      return Promise.resolve(t === undefined ? ok(null) : parseIndex(t));
    },
    saveList(index) {
      lists.set(index.kind, serializeIndex(index));
      return Promise.resolve(ok(undefined));
    },
  };
}
