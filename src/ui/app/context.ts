import { createContext, useContext, type ReactNode } from 'react';
import type { AppStore } from '../../io/index.ts';
import type { Backup, DateKey, Reason, Result } from '../../logic/index.ts';

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
  /** App-lock card of the vault, when there is a vault. */
  lockSettings: ReactNode;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(AppContext);
  if (v === null) throw new Error('useApp outside AppProvider');
  return v;
}
