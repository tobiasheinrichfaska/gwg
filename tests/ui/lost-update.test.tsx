// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import {
  createMemoryListStore,
  createMemorySettingsStore,
  createMemoryStore,
  type AppStore,
} from '../../src/io/index.ts';
import {
  DEFAULT_RULES,
  ok,
  serializeBackup,
  parseBackup,
  type Backup,
  type ListIndex,
} from '../../src/logic/index.ts';
import { AppProvider } from '../../src/ui/app/AppProvider.tsx';
import { useApp, type AppState } from '../../src/ui/app/context.ts';
import { mandate } from '../helpers.ts';

afterEach(cleanup);

const clock = () => new Date(2026, 10, 27, 12, 0, 0);
const data: Backup = {
  format: 'gwg-backup',
  version: 2,
  createdOn: '2026-11-27',
  rules: DEFAULT_RULES,
  mandates: Array.from({ length: 30 }, (_, i) =>
    mandate({ id: String(10001 + i), name: `Fiktiv Firma ${i}` }),
  ),
  persons: [],
  auditClosings: [],
  screeningDecisions: [],
  lastScreening: { sanktion: null, pep: null },
};
const list: ListIndex = {
  source: 'Test',
  kind: 'sanktion',
  fetchedOn: '2026-11-26',
  entries: [{ id: '1', kind: 'sanktion', names: ['Zorin Quelle'], births: [], remark: '' }],
};

/** A store whose saves are slow and record the order in which they started and finished. */
function slowStore(text: string) {
  const inner = createMemoryStore(text);
  const saved: Backup[] = [];
  let running = 0;
  let maxParallel = 0;
  const store: AppStore = {
    ...inner,
    async save(b) {
      running++;
      maxParallel = Math.max(maxParallel, running);
      await new Promise((r) => setTimeout(r, 15));
      saved.push(b);
      running--;
      return inner.save(b);
    },
  };
  return { store, saved, parallel: () => maxParallel, inner };
}

async function mount() {
  const s = slowStore(serializeBackup(data));
  const listStore = createMemoryListStore();
  await listStore.save(list);
  let app: AppState | null = null;
  function Probe() {
    app = useApp();
    return <p>{app.backup.mandates.length}</p>;
  }
  render(
    <AppProvider
      store={s.store}
      listStore={listStore}
      settingsStore={createMemorySettingsStore()}
      now={clock}
    >
      <Probe />
    </AppProvider>,
  );
  await waitFor(() => {
    if (app === null || app.list === null) throw new Error('not ready');
  });
  return { s, get: () => app as unknown as AppState };
}

describe('lost update during a screening run', () => {
  it('keeps a mandate added while the run is under way, and saves one at a time', async () => {
    const { s, get } = await mount();
    const run = get().runScreening();
    // The run yields to the page between chunks; these edits happen while it is still running.
    const a = get().update((b) => ({ ...b, mandates: [...b.mandates, mandate({ id: '20001' })] }));
    const b = get().update((x) => ({ ...x, mandates: [...x.mandates, mandate({ id: '20002' })] }));
    expect((await a).ok && (await b).ok).toBe(true);
    expect(await run).toEqual(ok(undefined));

    const stored = await s.inner.load();
    expect(stored.ok).toBe(true);
    const v = stored.ok ? stored.value : null;
    expect(v?.mandates.map((m) => m.id)).toEqual(expect.arrayContaining(['20001', '20002']));
    expect(v?.mandates).toHaveLength(32);
    expect(v?.lastScreening.sanktion).not.toBeNull();
    expect(s.parallel()).toBe(1);
    await waitFor(() => expect(get().backup.mandates).toHaveLength(32));
    expect(parseBackup(serializeBackup(get().backup)).ok).toBe(true);
  });

  it('marks the result of the run as outdated when the data changed meanwhile', async () => {
    const { get } = await mount();
    const run = get().runScreening();
    await get().update((b) => ({ ...b, mandates: [...b.mandates, mandate({ id: '20001' })] }));
    await run;
    await waitFor(() => expect(get().screening).not.toBeNull());
    await waitFor(() => expect(get().screeningStatus.state).toBe('stale'));
    expect(get().screeningStatus.reasons.length).toBeGreaterThan(0);
  });
});
