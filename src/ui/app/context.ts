import { createContext, useContext, type ReactNode } from 'react';
import type { AppStore, ListNote } from '../../io/index.ts';
import type {
  Backup,
  ClosingCheck,
  DateKey,
  Hit,
  ListIndex,
  ListSettings,
  Reason,
  Result,
  Unscreenable,
  UnscreenableMandate,
} from '../../logic/index.ts';

/** Result of one screening run. Kept in memory only (the decisions and `lastScreening` are saved). */
export interface ScreeningResult {
  /** All yellow and red hits of the run, sorted (red first). */
  hits: Hit[];
  unscreenable: Unscreenable[];
  unscreenableMandates: UnscreenableMandate[];
  ranOn: DateKey;
  listFetchedOn: DateKey;
  /** Fingerprint of the persons and mandates the run saw; a change makes the run outdated. */
  signature: string;
}

/** What the last download of the list did, for the screen (also after the automatic start fetch). */
export type FetchNote =
  | {
      ok: true;
      auto: boolean;
      /** The relay answered from an old copy (`X-Stale`). */
      stale: boolean;
      /** The downloaded list was older than the stored one; the stored one stays. */
      keptNewer: DateKey | null;
      /** The download had fewer than half the entries of the stored list; nothing was replaced. */
      shrunk: { had: number; got: number } | null;
      skipped: ListNote[];
      adjusted: ListNote[];
    }
  | { ok: false; auto: boolean; reason: Reason };

/** How far the screening can be trusted right now: `ok`, outdated (with reasons) or impossible. */
export interface ScreeningStatus {
  state: 'ok' | 'stale' | 'no-list';
  reasons: string[];
}

export interface AppState {
  /** The whole data set. Never null once the children render: first start gives an empty set. */
  backup: Backup;
  store: AppStore;
  /** "Today", read once per root from the clock; screens never call `new Date()`. */
  today: DateKey;
  /** Saves the new data set and, only if that worked, shows it. A save error is returned. */
  replace(next: Backup): Promise<Result<void>>;
  /** Set when the last save failed. */
  saveError: Reason | null;
  /** Where `checkBackup` found the problem, when it was the check that refused the save. */
  saveErrorWhere: string | undefined;
  /** App-lock card of the vault, when there is a vault. */
  lockSettings: ReactNode;
  /**
   * Mandate number another screen asked to open: the wheel cannot be steered from inside a page, so the
   * request waits here and the "Mandanten" screen takes it (once) when it opens.
   */
  requestedClientId: string | null;
  requestClient(id: string | null): void;
  /** Same for a hit (`decisionKey`): the "Abgleich" screen opens its detail page. */
  requestedHitKey: string | null;
  requestHit(key: string | null): void;

  /** The loaded sanctions list; null = none (yet). */
  list: ListIndex | null;
  /** The list store could not be read; `list` is null then. */
  listError: Reason | null;
  settings: ListSettings;
  /** The stored settings have been read (before that `settings` holds the defaults). */
  settingsLoaded: boolean;
  settingsError: Reason | null;
  /** Checks and saves the settings (not part of the backup file). */
  saveSettings(next: unknown): Promise<Result<ListSettings>>;
  /** Saves a list read from a file and makes it the current one. */
  storeList(index: ListIndex): Promise<Result<void>>;
  /** Downloads the list through the relay of the settings and stores it. Never throws. */
  fetchList(): Promise<FetchNote>;
  fetching: boolean;
  lastFetch: FetchNote | null;
  /** Result of the last run in this session; null = no run yet since the start. */
  screening: ScreeningResult | null;
  /** Hits of the last run whose person/mandate still exists and whose mandate is active. */
  liveHits: Hit[];
  progress: { done: number; total: number } | null;
  /** Runs the screening in chunks; saves `lastScreening` at the end. */
  runScreening(): Promise<Result<void>>;
  screeningStatus: ScreeningStatus;
  /** What blocks (or only warns about) closing the yearly audit right now. */
  closing: ClosingCheck;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(AppContext);
  if (v === null) throw new Error('useApp outside AppProvider');
  return v;
}
