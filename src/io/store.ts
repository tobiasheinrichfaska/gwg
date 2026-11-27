import type { Vault } from 'local-vault';
import {
  fail,
  ok,
  parseBackup,
  serializeBackup,
  type Backup,
  type Result,
} from '../logic/index.ts';

/** The whole data set lives in one place; load and save never drop anything silently. */
export interface AppStore {
  /** `ok(null)` = nothing stored yet. Damaged data is an error code, never an empty data set. */
  load(): Promise<Result<Backup | null>>;
  save(b: Backup): Promise<Result<void>>;
}

/** Slot name inside the vault; the vault config of the app must list it in `slots`. */
export const VAULT_SLOT = 'bestand';

/**
 * Store on a local-vault slot (device mode, optional app lock). The slot holds exactly the text of
 * `serializeBackup` and is read only through `parseBackup`. A slot is a text in localStorage, held in
 * memory: right for a client list, not for large binaries.
 */
export function createVaultStore(vault: Vault, slot: string = VAULT_SLOT): AppStore {
  return {
    load() {
      let text: string | null;
      try {
        text = vault.readSlot(slot);
      } catch {
        // Closed vault or a slot that could not be opened: never treated as "empty".
        return Promise.resolve(fail('store-failed'));
      }
      if (text === null) return Promise.resolve(ok(null));
      return Promise.resolve(parseBackup(text));
    },
    async save(b) {
      const text = serializeBackup(b);
      let late: string | undefined;
      const off = vault.onError((e) => {
        late = e;
      });
      try {
        const refused = vault.writeSlot(slot, text);
        if (refused !== undefined) return fail('store-failed');
        await vault.saved();
      } catch {
        return fail('store-failed');
      } finally {
        off();
      }
      return late === undefined ? ok(undefined) : fail('store-failed');
    },
  };
}

/** Store in memory, for tests and screens without a vault. Keeps the serialized text like the real one. */
export function createMemoryStore(initialText: string | null = null): AppStore {
  let text = initialText;
  return {
    load() {
      return Promise.resolve(text === null ? ok(null) : parseBackup(text));
    },
    save(b) {
      text = serializeBackup(b);
      return Promise.resolve(ok(undefined));
    },
  };
}
