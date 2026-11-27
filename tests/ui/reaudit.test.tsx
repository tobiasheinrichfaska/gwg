// @vitest-environment jsdom
// Re-audit T8d (task T10): findings H1, H2, N1 in the provider.
import { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryListStore, createMemoryStore, type AppStore } from '../../src/io/index.ts';
import {
  currentSnapshot,
  DEFAULT_RULES,
  emptyPep,
  entrySnapshot,
  serializeBackup,
  type AuditClosing,
  type Backup,
  type ListIndex,
  type Person,
  type ScreeningDecision,
} from '../../src/logic/index.ts';
import { AppProvider } from '../../src/ui/app/AppProvider.tsx';
import { useApp } from '../../src/ui/app/context.ts';
import { mandate } from '../helpers.ts';

afterEach(cleanup);
const clock = () => new Date(2026, 11, 5, 12, 0, 0);
const clean = mandate({ lastCheckOn: '2026-11-01' });
const closed: AuditClosing = {
  stichtag: '2026-11-30',
  closedOn: '2026-12-01',
  by: 'A. Prüfer',
  note: 'x',
};
const LIST: ListIndex = {
  source: 'EU konsolidierte Finanzsanktionsliste',
  kind: 'sanktion',
  fetchedOn: '2026-12-04',
  entries: [
    { id: '100', kind: 'sanktion', names: ['Zorin Quelle'], births: ['1965-12-12'], remark: '' },
  ],
};
const quelle: Person = {
  id: '10001-P1',
  mandateId: clean.id,
  role: 'inhaber',
  lastName: 'Quelle',
  firstName: 'Zorin',
  birth: '1965-12-12',
  pep: emptyPep(),
};
const erika: Person = {
  ...quelle,
  id: '10001-P2',
  lastName: 'Beispiel',
  firstName: 'Erika',
  birth: '1980-01-01',
};
const decisionFor = (p: Person): ScreeningDecision => ({
  subjectKind: 'person',
  subjectId: p.id,
  entryId: '100',
  listKind: 'sanktion',
  listFetchedOn: '2026-12-04',
  decision: 'kein-treffer',
  reason: 'andere Person',
  decidedOn: '2026-12-05',
  decidedBy: 'A. Prüfer',
  actionNote: '',
  subjectSnapshot: currentSnapshot('person', p.id, [p], [clean]) ?? '',
  entrySnapshot: entrySnapshot(LIST.entries[0]!),
});
const backupOf = (persons: Person[], decisions: ScreeningDecision[] = []): Backup => ({
  format: 'gwg-backup',
  version: 2,
  createdOn: '2026-12-05',
  rules: DEFAULT_RULES,
  mandates: [clean],
  persons,
  auditClosings: [],
  screeningDecisions: decisions,
  lastScreening: { sanktion: null, pep: null },
});
async function stored(s: AppStore): Promise<Backup> {
  const r = await s.load();
  if (!r.ok || r.value === null) throw new Error('nothing stored');
  return r.value;
}

/** Test panel: buttons call the provider; results are shown as text. */
function Panel({ run }: { run: boolean }) {
  const app = useApp();
  const [out, setOut] = useState('-');
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (run && app.list !== null && !started) {
      setStarted(true);
      void app.runScreening();
    }
  }, [run, app, started]);
  const say = (r: { ok: boolean; reason?: string }) => setOut(r.ok ? 'ok' : (r.reason ?? '?'));
  return (
    <div>
      <span data-testid="run">{app.screening === null ? 'offen' : 'gelaufen'}</span>
      <span data-testid="status">{app.screeningStatus.state}</span>
      <span data-testid="out">{out}</span>
      <button
        type="button"
        onClick={() => void app.replace({ ...app.backup, auditClosings: [closed] }).then(say)}
      >
        restore
      </button>
      <button
        type="button"
        onClick={() => {
          const other: ListIndex = {
            ...LIST,
            entries: [
              ...LIST.entries,
              { id: '200', kind: 'sanktion', names: ['Erika Beispiel'], births: [], remark: '' },
            ],
          };
          void app.storeList(other).then(say);
        }}
      >
        newlist
      </button>
      <button
        type="button"
        onClick={() => {
          // No await in between: both calls sit in the queue one right after the other.
          void app.update((b) => ({
            ...b,
            persons: b.persons.map((p) => ({ ...p, lastName: 'Anders' })),
          }));
          void app.closeAudit(closed).then(say);
        }}
      >
        rename-and-close
      </button>
    </div>
  );
}

function setup(b: Backup, { list = true, run = true } = {}) {
  const store = createMemoryStore(serializeBackup(b));
  const listStore = createMemoryListStore();
  if (list) void listStore.save(LIST);
  render(
    <AppProvider store={store} now={clock} listStore={listStore}>
      <Panel run={run} />
    </AppProvider>,
  );
  return store;
}
const out = () => screen.getByTestId('out').textContent;

describe('H1: restoring a backup with closings is always possible', () => {
  it('replace saves auditClosings although the closing blockers stand', async () => {
    const store = setup(backupOf([quelle]), { list: false, run: false });
    fireEvent.click(await screen.findByRole('button', { name: 'restore' }));
    await waitFor(() => expect(out()).toBe('ok'));
    expect((await stored(store)).auditClosings).toEqual([closed]);
  });
});

describe('H2: another list with the same state date makes the run outdated', () => {
  it('shows "stale" after storeList of a different list with the same date', async () => {
    setup(backupOf([quelle, erika], [decisionFor(quelle)]));
    await waitFor(() => expect(screen.getByTestId('run').textContent).toBe('gelaufen'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ok'));
    fireEvent.click(screen.getByRole('button', { name: 'newlist' }));
    await waitFor(() => expect(out()).toBe('ok'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('stale'));
  });
});

describe('N1: the guard reads the newest data inside the queue', () => {
  it('a rename directly followed by the closing does not slip through', async () => {
    const store = setup(backupOf([quelle], [decisionFor(quelle)]));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ok'));
    fireEvent.click(screen.getByRole('button', { name: 'rename-and-close' }));
    await waitFor(() => expect(out()).toBe('closing-blocked'));
    const s = await stored(store);
    expect(s.auditClosings).toEqual([]);
    expect(s.persons[0]?.lastName).toBe('Anders');
  });
});

describe('M2: the import dialog refuses a state after today', () => {
  it('disables saving and says why', async () => {
    const { ListImportDialog } =
      await import('../../src/ui/screens/sanctions/ListImportDialog.tsx');
    const onConfirm = vi.fn();
    render(
      <ListImportDialog
        file={{
          index: { ...LIST, entries: [] },
          skipped: [],
          adjusted: [],
          suggestedOn: '2026-12-04',
          suggestedFrom: 'generationDate',
        }}
        today="2026-12-05"
        currentOn={null}
        currentCount={null}
        error={null}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );
    const save = screen.getByRole('button', { name: 'Liste speichern' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/Stand der Liste/), { target: { value: '2027-01-01' } });
    expect(save.disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('liegt nach heute');
  });
});
