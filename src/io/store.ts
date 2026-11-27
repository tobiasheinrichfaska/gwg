import type { Vault } from 'local-vault';
import {
  checkListSettings,
  fail,
  ok,
  parseBackup,
  parseSettings,
  serializeBackup,
  serializeSettings,
  DEFAULT_LIST_SETTINGS,
  type Backup,
  type ListSettings,
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

/** Slot of the list settings; not part of the backup file (device setting). */
export const SETTINGS_SLOT = 'einstellungen';

/** Writes a text to a slot and waits until it is stored; a late storage error counts as failure. */
async function writeText(vault: Vault, name: string, text: string): Promise<Result<void>> {
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
function readText(vault: Vault, name: string): string | null | undefined {
  try {
    return vault.readSlot(name);
  } catch {
    return undefined;
  }
}

/**
 * Store on a local-vault slot (device mode, optional app lock). The slot holds exactly the text of
 * `serializeBackup` and is read only through `parseBackup`. A slot is a text in localStorage, held in
 * memory: right for a client list, not for large binaries.
 */
export function createVaultStore(vault: Vault, slot: string = VAULT_SLOT): AppStore {
  return {
    load() {
      const text = readText(vault, slot);
      if (text === undefined) return Promise.resolve(fail('store-failed'));
      if (text === null) return Promise.resolve(ok(null));
      return Promise.resolve(parseBackup(text));
    },
    save: (b) => writeText(vault, slot, serializeBackup(b)),
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

/** Settings of the list download; defaults when nothing is stored, a damaged slot is an error. */
export interface SettingsStore {
  load(): Promise<Result<ListSettings>>;
  save(s: ListSettings): Promise<Result<void>>;
}

/** Settings in their own vault slot (`SETTINGS_SLOT`), apart from the backup slot and the backup file. */
export function createVaultSettingsStore(
  vault: Vault,
  slot: string = SETTINGS_SLOT,
): SettingsStore {
  return {
    load() {
      const text = readText(vault, slot);
      if (text === undefined) return Promise.resolve(fail('store-failed'));
      if (text === null) return Promise.resolve(ok({ ...DEFAULT_LIST_SETTINGS }));
      return Promise.resolve(parseSettings(text));
    },
    save(s) {
      const checked = checkListSettings(s);
      if (!checked.ok) return Promise.resolve(checked);
      return writeText(vault, slot, serializeSettings(checked.value));
    },
  };
}

export function createMemorySettingsStore(initialText: string | null = null): SettingsStore {
  let text = initialText;
  return {
    load() {
      return Promise.resolve(
        text === null ? ok({ ...DEFAULT_LIST_SETTINGS }) : parseSettings(text),
      );
    },
    save(s) {
      const checked = checkListSettings(s);
      if (!checked.ok) return Promise.resolve(checked);
      text = serializeSettings(checked.value);
      return Promise.resolve(ok(undefined));
    },
  };
}
