import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppStore } from '../../io/index.ts';
import {
  DEFAULT_RULES,
  todayKey,
  type Backup,
  type DateKey,
  type Reason,
  type Result,
} from '../../logic/index.ts';
import { RestoreBackup } from '../screens/backup/RestoreBackup.tsx';
import { AppContext, type AppState } from './context.ts';
import { describeFailure } from './messages.ts';

type Loaded =
  | { kind: 'loading' }
  | { kind: 'ready'; backup: Backup }
  | { kind: 'damaged'; reason: Reason; where: string | undefined };

function emptyBackup(today: DateKey): Backup {
  return {
    format: 'gwg-backup',
    version: 2,
    createdOn: today,
    rules: DEFAULT_RULES,
    mandates: [],
    persons: [],
    auditClosings: [],
  };
}

interface Props {
  store: AppStore;
  lockSettings?: ReactNode;
  /** Clock, replaceable in tests. Read once when the root renders. */
  now?: () => Date;
  children: ReactNode;
}

/**
 * Holds the data set. Loads once at start; damaged data locks the app (it never starts empty over it)
 * and offers only the restore from a backup file. Every change is saved through `store.save`.
 */
export function AppProvider({ store, lockSettings = null, now, children }: Props) {
  const [today] = useState(() => todayKey(now ? now() : new Date()));
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [saveError, setSaveError] = useState<Reason | null>(null);
  const [requestedClientId, requestClient] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void store.load().then((r) => {
      if (cancelled) return;
      if (!r.ok) setLoaded({ kind: 'damaged', reason: r.reason, where: r.where });
      else setLoaded({ kind: 'ready', backup: r.value ?? emptyBackup(today) });
    });
    return () => {
      cancelled = true;
    };
  }, [store, today]);

  const replace = useCallback(
    async (next: Backup): Promise<Result<void>> => {
      const r = await store.save(next);
      if (!r.ok) {
        setSaveError(r.reason);
        return r;
      }
      setSaveError(null);
      setLoaded({ kind: 'ready', backup: next });
      return r;
    },
    [store],
  );

  const value = useMemo<AppState | null>(
    () =>
      loaded.kind === 'ready'
        ? {
            backup: loaded.backup,
            store,
            today,
            replace,
            saveError,
            lockSettings,
            requestedClientId,
            requestClient,
          }
        : null,
    [loaded, store, today, replace, saveError, lockSettings, requestedClientId],
  );

  if (loaded.kind === 'loading') return <p role="status">Daten werden geladen …</p>;
  if (loaded.kind === 'damaged') {
    return (
      <main className="page">
        <h1>GwG-Pflege gesperrt</h1>
        <p role="alert">
          Daten beschädigt, Sicherungsdatei einspielen.{' '}
          {describeFailure(loaded.reason, loaded.where)}
        </p>
        <p>
          Die gespeicherten Daten wurden nicht verändert. Erst wenn Sie unten eine Sicherung
          einspielen und bestätigen, werden sie ersetzt.
        </p>
        <RestoreBackup
          currentCount={null}
          onRestore={async (b) => {
            const r = await replace(b);
            return r;
          }}
        />
      </main>
    );
  }
  return value === null ? null : (
    <AppContext.Provider value={value}>{children}</AppContext.Provider>
  );
}
