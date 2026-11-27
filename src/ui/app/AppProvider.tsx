import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createMemoryListStore,
  createMemorySettingsStore,
  fetchSanctionsList,
  type AppStore,
  type ListStore,
  type SettingsStore,
} from '../../io/index.ts';
import {
  checkListSettings,
  checkScreeningRun,
  DEFAULT_LIST_SETTINGS,
  DEFAULT_RULES,
  fail,
  isListStale,
  ok,
  screenAll,
  screenMandates,
  todayKey,
  emptyLastScreening,
  type Backup,
  type DateKey,
  type Hit,
  type ListIndex,
  type ListSettings,
  type Reason,
  type Result,
  type Unscreenable,
  type UnscreenableMandate,
} from '../../logic/index.ts';
import { RestoreBackup } from '../screens/backup/RestoreBackup.tsx';
import { AppContext, type AppState, type FetchNote, type ScreeningResult } from './context.ts';
import { describeFailure } from './messages.ts';
import {
  CHUNK,
  liveHitsOf,
  screeningSubjects,
  sortHits,
  statusOf,
  subjectsSignature,
} from './screening.ts';

/** The latest settings, list and data for callbacks that must not change identity with every edit. */
class Latest {
  settings: ListSettings = DEFAULT_LIST_SETTINGS;
  list: ListIndex | null = null;
  backup: Backup | null = null;
  running = false;
  autoFetched = false;
  setRunning(v: boolean): void {
    this.running = v;
  }
  markAutoFetched(): void {
    this.autoFetched = true;
  }
  sync(settings: ListSettings, list: ListIndex | null, backup: Backup | null): void {
    this.settings = settings;
    this.list = list;
    this.backup = backup;
  }
}

const yieldToPage = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

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
    screeningDecisions: [],
    lastScreening: emptyLastScreening(),
  };
}

interface Props {
  store: AppStore;
  lockSettings?: ReactNode;
  /** Clock, replaceable in tests. Read once when the root renders. */
  now?: () => Date;
  /** Store of the public sanctions list (IndexedDB in the app); memory without it. */
  listStore?: ListStore | undefined;
  /** Store of the list settings (vault slot in the app); memory without it. */
  settingsStore?: SettingsStore | undefined;
  /** `fetch` for the list download, replaceable in tests. */
  fetchFn?: typeof fetch;
  children: ReactNode;
}

/**
 * Holds the data set. Loads once at start; damaged data locks the app (it never starts empty over it)
 * and offers only the restore from a backup file. Every change is saved through `store.save`.
 */
export function AppProvider({
  store,
  lockSettings = null,
  now,
  listStore: listStoreProp,
  settingsStore: settingsStoreProp,
  fetchFn: fetchFnProp,
  children,
}: Props) {
  const [today] = useState(() => todayKey(now ? now() : new Date()));
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [saveError, setSaveError] = useState<Reason | null>(null);
  const [requestedClientId, requestClient] = useState<string | null>(null);
  const [requestedHitKey, requestHit] = useState<string | null>(null);
  const [fallbackListStore] = useState(() => createMemoryListStore());
  const [fallbackSettingsStore] = useState(() => createMemorySettingsStore());
  const listStore = listStoreProp ?? fallbackListStore;
  const settingsStore = settingsStoreProp ?? fallbackSettingsStore;
  const fetchFn = useMemo<typeof fetch>(
    () => fetchFnProp ?? ((input, init) => globalThis.fetch(input, init)),
    [fetchFnProp],
  );

  const [list, setList] = useState<ListIndex | null>(null);
  const [listLoaded, setListLoaded] = useState(false);
  const [listError, setListError] = useState<Reason | null>(null);
  const [settings, setSettings] = useState<ListSettings>(DEFAULT_LIST_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState<Reason | null>(null);
  const [fetching, setFetching] = useState(false);
  const [lastFetch, setLastFetch] = useState<FetchNote | null>(null);
  const [screening, setScreening] = useState<ScreeningResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Latest values for the callbacks below (they must not change identity with every edit).
  const [live] = useState(() => new Latest());
  // Layout effect: the commit that shows a new list/backup also updates `live`, so a click right after
  // it never reads stale values (a passive effect could still be pending and make the run fail).
  useLayoutEffect(() => {
    live.sync(settings, list, loaded.kind === 'ready' ? loaded.backup : null);
  }, [live, settings, list, loaded]);

  useEffect(() => {
    let cancelled = false;
    void listStore.load('sanktion').then((r) => {
      if (cancelled) return;
      if (r.ok) setList(r.value);
      else setListError(r.reason);
      setListLoaded(true);
    });
    void settingsStore.load().then((r) => {
      if (cancelled) return;
      if (r.ok) setSettings(r.value);
      else setSettingsError(r.reason);
      setSettingsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [listStore, settingsStore]);

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

  const saveSettings = useCallback(
    async (next: unknown): Promise<Result<ListSettings>> => {
      const checked = checkListSettings(next);
      if (!checked.ok) return checked;
      const r = await settingsStore.save(checked.value);
      if (!r.ok) return r;
      setSettings(checked.value);
      setSettingsError(null);
      return ok(checked.value);
    },
    [settingsStore],
  );

  const storeList = useCallback(
    async (index: ListIndex): Promise<Result<void>> => {
      const r = await listStore.save(index);
      if (!r.ok) return r;
      setList(index);
      setListError(null);
      return r;
    },
    [listStore],
  );

  const fetchList = useCallback(
    async (auto = false): Promise<FetchNote> => {
      const s = live.settings;
      let note: FetchNote;
      if (s.relayUrl === '') {
        note = { ok: false, auto, reason: 'bad-settings' };
      } else {
        setFetching(true);
        try {
          const r = await fetchSanctionsList({ relayUrl: s.relayUrl, fetchFn, today });
          if (!r.ok) {
            note = { ok: false, auto, reason: r.reason };
          } else {
            const have = live.list;
            const older = have !== null && r.value.index.fetchedOn < have.fetchedOn;
            const saved = older ? ok(undefined) : await storeList(r.value.index);
            note = saved.ok
              ? {
                  ok: true,
                  auto,
                  stale: r.value.stale,
                  keptNewer: older && have !== null ? have.fetchedOn : null,
                  skipped: r.value.skipped,
                  adjusted: r.value.adjusted,
                }
              : { ok: false, auto, reason: saved.reason };
          }
        } catch {
          note = { ok: false, auto, reason: 'fetch-failed' };
        } finally {
          setFetching(false);
        }
      }
      setLastFetch(note);
      return note;
    },
    [fetchFn, today, storeList, live],
  );

  // Once at start: with "Abruf beim Start" on and an outdated list, download it. A failure is only a note.
  const ready = loaded.kind === 'ready';
  useEffect(() => {
    if (!ready || !listLoaded || !settingsLoaded || live.autoFetched) return;
    live.markAutoFetched();
    const s = live.settings;
    if (s.autoFetch && s.relayUrl !== '' && isListStale(live.list, today, s.maxAgeDays)) {
      // Starting the one download at start is the purpose of this effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchList(true);
    }
  }, [ready, listLoaded, settingsLoaded, today, fetchList, live]);

  const runScreening = useCallback(async (): Promise<Result<void>> => {
    const data = live.backup;
    const index = live.list;
    if (data === null || index === null) return fail('bad-list');
    if (live.running) return ok(undefined);
    live.setRunning(true);
    try {
      const thresholds = data.rules.sanctionThresholds;
      const subjects = screeningSubjects(data.persons, data.mandates);
      const total = subjects.persons.length + subjects.mandates.length;
      const hits: Hit[] = [];
      const unscreenable: Unscreenable[] = [];
      const unscreenableMandates: UnscreenableMandate[] = [];
      let done = 0;
      setProgress({ done, total });
      for (let i = 0; i < subjects.persons.length; i += CHUNK) {
        const part = subjects.persons.slice(i, i + CHUNK);
        const r = screenAll(part, data.mandates, index, thresholds);
        hits.push(...r.hits);
        unscreenable.push(...r.unscreenable);
        done += part.length;
        setProgress({ done, total });
        await yieldToPage();
      }
      for (let i = 0; i < subjects.mandates.length; i += CHUNK) {
        const part = subjects.mandates.slice(i, i + CHUNK);
        const r = screenMandates(part, index, thresholds);
        hits.push(...r.hits);
        unscreenableMandates.push(...r.unscreenable);
        done += part.length;
        setProgress({ done, total });
        await yieldToPage();
      }
      const result: ScreeningResult = {
        hits: sortHits(hits),
        unscreenable,
        unscreenableMandates,
        ranOn: today,
        listFetchedOn: index.fetchedOn,
        signature: subjectsSignature(data.persons, data.mandates),
      };
      setScreening(result);
      const run = checkScreeningRun(
        {
          ranOn: today,
          listKind: 'sanktion',
          listFetchedOn: index.fetchedOn,
          hitCount: result.hits.length,
        },
        'sanktion',
      );
      if (!run.ok) return run;
      const latest = live.backup ?? data;
      return await replace({
        ...latest,
        lastScreening: { ...latest.lastScreening, sanktion: run.value },
      });
    } finally {
      live.setRunning(false);
      setProgress(null);
    }
  }, [today, replace, live]);

  const persons = loaded.kind === 'ready' ? loaded.backup.persons : null;
  const mandates = loaded.kind === 'ready' ? loaded.backup.mandates : null;
  const lastScreening =
    loaded.kind === 'ready' ? loaded.backup.lastScreening : emptyLastScreening();
  const liveHits = useMemo(
    () => (persons === null || mandates === null ? [] : liveHitsOf(screening, persons, mandates)),
    [screening, persons, mandates],
  );
  const screeningStatus = useMemo(
    () =>
      statusOf(
        list,
        screening,
        lastScreening,
        persons === null || mandates === null ? '' : subjectsSignature(persons, mandates),
        settings,
        today,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, screening, lastScreening.sanktion, persons, mandates, settings, today],
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
            requestedHitKey,
            requestHit,
            list,
            listError,
            settings,
            settingsLoaded,
            settingsError,
            saveSettings,
            storeList,
            fetchList: () => fetchList(false),
            fetching,
            lastFetch,
            screening,
            liveHits,
            progress,
            runScreening,
            screeningStatus,
          }
        : null,
    [
      loaded,
      store,
      today,
      replace,
      saveError,
      lockSettings,
      requestedClientId,
      requestedHitKey,
      list,
      listError,
      settings,
      settingsLoaded,
      settingsError,
      saveSettings,
      storeList,
      fetchList,
      fetching,
      lastFetch,
      screening,
      liveHits,
      progress,
      runScreening,
      screeningStatus,
    ],
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
