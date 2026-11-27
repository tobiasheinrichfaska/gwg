// @vitest-environment jsdom
import { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryListStore, createMemoryStore, type AppStore } from '../../src/io/index.ts';
import {
  auditExceptions,
  currentSnapshot,
  DEFAULT_RULES,
  emptyPep,
  entrySnapshot,
  serializeBackup,
  type AuditClosing,
  type Backup,
  type ListIndex,
  type Mandate,
  type Person,
  type ScreeningDecision,
} from '../../src/logic/index.ts';
import { AppProvider } from '../../src/ui/app/AppProvider.tsx';
import { useApp } from '../../src/ui/app/context.ts';
import { AuditScreen } from '../../src/ui/screens/audit/AuditScreen.tsx';
import { auditText } from '../../src/ui/screens/audit/export.ts';
import { OverviewScreen } from '../../src/ui/screens/overview/OverviewScreen.tsx';
import { defaultStichtag } from '../../src/ui/screens/audit/stichtag.ts';
import { mandate } from '../helpers.ts';

afterEach(cleanup);

// 2026-12-05: after the default cut-off date (30.11.2026), so closing is possible.
const clock = () => new Date(2026, 11, 5, 12, 0, 0);
const backupOf = (
  mandates: Mandate[],
  auditClosings: AuditClosing[] = [],
  persons: Person[] = [],
  screeningDecisions: ScreeningDecision[] = [],
): Backup => ({
  format: 'gwg-backup',
  version: 3,
  createdOn: '2026-12-05',
  rules: DEFAULT_RULES,
  mandates,
  persons,
  auditClosings,
  screeningDecisions,
  lastScreening: { sanktion: null, pep: null },
});

// Invented list with one person; a client "Zorin Quelle" born 1965-12-12 is a red hit.
const LIST: ListIndex = {
  source: 'EU konsolidierte Finanzsanktionsliste',
  kind: 'sanktion',
  fetchedOn: '2026-12-04',
  entries: [
    { id: '100', kind: 'sanktion', names: ['Zorin Quelle'], births: ['1965-12-12'], remark: '' },
  ],
};

/** Runs the screening once as soon as the list is loaded (the hits live in memory only). */
function AutoRun() {
  const { runScreening, list, screening } = useApp();
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (list !== null && !started) {
      setStarted(true);
      void runScreening();
    }
  }, [list, started, runScreening]);
  return <span data-testid="run">{screening === null ? 'offen' : 'gelaufen'}</span>;
}

interface Opts {
  list?: boolean;
  run?: boolean;
}
function setup(ui: React.ReactNode, b: Backup, { list = true, run = true }: Opts = {}) {
  const store = createMemoryStore(serializeBackup(b));
  const listStore = createMemoryListStore();
  // The memory store writes synchronously inside save().
  if (list) void listStore.save(LIST);
  render(
    <AppProvider store={store} now={clock} listStore={listStore}>
      {run && <AutoRun />}
      {ui}
    </AppProvider>,
  );
  return store;
}
const ran = () => waitFor(() => expect(screen.getByTestId('run').textContent).toBe('gelaufen'));
async function stored(s: AppStore): Promise<Backup> {
  const r = await s.load();
  if (!r.ok || r.value === null) throw new Error('nothing stored');
  return r.value;
}

const clean = mandate({ lastCheckOn: '2026-11-01' });
const closed: AuditClosing = {
  stichtag: '2026-11-30',
  closedOn: '2026-12-01',
  by: 'A. Prüfer',
  note: 'alles gesehen',
};

describe('defaultStichtag', () => {
  it('is 30 November of this year from 1 November on, else of last year', () => {
    expect(defaultStichtag('2026-11-01')).toBe('2026-11-30');
    expect(defaultStichtag('2026-12-31')).toBe('2026-11-30');
    expect(defaultStichtag('2026-10-31')).toBe('2025-11-30');
    expect(defaultStichtag('2027-01-01')).toBe('2026-11-30');
    expect(defaultStichtag('2027-03-15')).toBe('2026-11-30');
  });
});

describe('closing the audit', () => {
  it('offers no closing button while findings remain', async () => {
    setup(<AuditScreen />, backupOf([mandate({ idStatus: 'leer' })]));
    await screen.findByText(/Noch 1 Auffälligkeit/);
    expect(screen.queryByRole('button', { name: 'Audit abschließen' })).toBeNull();
  });

  it('requires a name, saves the closing and then forbids a second one', async () => {
    const store = setup(<AuditScreen />, backupOf([clean]));
    await ran();
    fireEvent.click(await screen.findByRole('button', { name: 'Audit abschließen' }));
    expect(screen.getByRole('dialog').textContent).toContain(
      'Sie bestätigen, dass die Ausnahmelisten geprüft wurden; das Programm entscheidet nichts rechtlich.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Audit abschließen bestätigen' }));
    expect(screen.getByRole('alert').textContent).toContain('bad-closing');
    expect((await stored(store)).auditClosings).toEqual([]);
    fireEvent.change(screen.getByLabelText('Name der abschließenden Person'), {
      target: { value: ' A. Prüfer ' },
    });
    fireEvent.change(screen.getByLabelText('Notiz (optional)'), { target: { value: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Audit abschließen bestätigen' }));
    await screen.findByText(/Abgeschlossen am/);
    expect((await stored(store)).auditClosings).toEqual([
      { stichtag: '2026-11-30', closedOn: '2026-12-05', by: 'A. Prüfer', note: 'ok' },
    ]);
    expect(document.body.textContent).toContain('05.12.2026');
    expect(document.body.textContent).toContain('A. Prüfer');
    expect(screen.queryByRole('button', { name: 'Audit abschließen' })).toBeNull();
  });

  it('cannot close a cut-off date that lies in the future', async () => {
    setup(<AuditScreen />, backupOf([clean]));
    fireEvent.change(await screen.findByLabelText('Stichtag'), { target: { value: '2026-12-31' } });
    expect(screen.queryByRole('button', { name: 'Audit abschließen' })).toBeNull();
    expect(screen.getByText(/liegt in der Zukunft/)).toBeTruthy();
  });

  it('takes a closing back only after confirmation', async () => {
    const store = setup(<AuditScreen />, backupOf([clean], [closed]));
    await ran();
    // let the run save its result first (it writes the whole data set)
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.click(await screen.findByRole('button', { name: 'Abschluss zurücknehmen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect((await stored(store)).auditClosings).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Abschluss zurücknehmen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abschluss zurücknehmen bestätigen' }));
    await waitFor(() => expect(screen.queryByText(/Abgeschlossen am/)).toBeNull());
    expect((await stored(store)).auditClosings).toEqual([]);
    expect(screen.getByRole('button', { name: 'Audit abschließen' })).toBeTruthy();
  });

  it('warns when findings arose after the closing, and only then', async () => {
    setup(<AuditScreen />, backupOf([clean], [closed]));
    await screen.findByText(/Abgeschlossen am/);
    expect(screen.queryByText(/Seit dem Abschluss sind Auffälligkeiten entstanden/)).toBeNull();
    cleanup();
    // Overdue today (2026-12-05) but not on the cut-off date.
    setup(
      <AuditScreen />,
      backupOf([mandate({ id: '10002', lastCheckOn: '2023-12-01' }), clean], [closed]),
    );
    expect(
      await screen.findByText(/Seit dem Abschluss sind Auffälligkeiten entstanden/),
    ).toBeTruthy();
  });

  it('adds the closing line to the cut-off export', () => {
    const e = auditExceptions([clean], [], '2026-11-30', DEFAULT_RULES);
    expect(auditText(e, '2026-11-30')).toContain('Abschluss: nicht abgeschlossen');
    expect(auditText(e, '2026-11-30', closed)).toContain(
      'Abschluss: abgeschlossen am 01.12.2026 durch A. Prüfer, Notiz: alles gesehen',
    );
  });

  it('prefixes values that start with = + - @ with an apostrophe, in the export only', () => {
    const evil = mandate({ id: '=1+1', name: '@SUM(A1)', lastCheckOn: null, idStatus: 'leer' });
    const e = auditExceptions([evil], [], '2026-11-30', DEFAULT_RULES);
    const text = auditText(e, '2026-11-30', { ...closed, by: '-cmd', note: '+x' });
    expect(text).toContain("'=1+1;'@SUM(A1)");
    expect(text).toContain("durch '-cmd, Notiz: '+x");
    expect(evil.name).toBe('@SUM(A1)');
  });

  it('shows the audit state of the current cut-off date on the overview', async () => {
    setup(<OverviewScreen />, backupOf([clean]));
    expect(await screen.findByText(/Audit zum Stichtag 30\.11\.2026/)).toBeTruthy();
    expect(document.body.textContent).toContain('offen');
    cleanup();
    setup(<OverviewScreen />, backupOf([clean], [closed]));
    await screen.findByText(/Audit zum Stichtag 30\.11\.2026/);
    expect(document.body.textContent).toContain('abgeschlossen am 01.12.2026');
  });
});

describe('closing blockers (T9b / U1)', () => {
  const quelle = (over: Partial<Person> = {}): Person => ({
    id: '10001-P1',
    mandateId: '10001',
    role: 'inhaber',
    lastName: 'Quelle',
    firstName: 'Zorin',
    birth: '1965-12-12',
    pep: emptyPep(),
    ...over,
  });
  const erika = (pep: Person['pep']): Person => ({
    ...quelle({ id: '10001-P2', lastName: 'Beispiel', firstName: 'Erika', birth: '1980-01-01' }),
    pep,
  });
  const pepYes = {
    ...emptyPep(),
    answer: 'ja' as const,
    askedOn: '2026-11-01' as const,
    funktion: 'Bürgermeisterin',
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
  const closeButton = () =>
    screen.getByRole('button', { name: 'Audit abschließen' }) as HTMLButtonElement;

  it('disables the button for an open red hit and says how many and where', async () => {
    setup(<AuditScreen />, backupOf([clean], [], [quelle()]));
    await ran();
    await screen.findByText(/Das Audit lässt sich noch nicht abschließen/);
    expect(closeButton().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('1 offener roter Treffer');
    expect(screen.getByRole('alert').textContent).toContain('Bereich „Abgleich“');
  });

  it('can be closed once the red hit has a decision', async () => {
    const p = quelle();
    const store = setup(<AuditScreen />, backupOf([clean], [], [p], [decisionFor(p)]));
    await ran();
    await waitFor(() => expect(closeButton().disabled).toBe(false));
    expect(screen.queryByText(/lässt sich noch nicht abschließen/)).toBeNull();
    fireEvent.click(closeButton());
    fireEvent.change(screen.getByLabelText('Name der abschließenden Person'), {
      target: { value: 'A. Prüfer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Audit abschließen bestätigen' }));
    await screen.findByText(/Abgeschlossen am/);
    expect((await stored(store)).auditClosings).toHaveLength(1);
  });

  it('blocks on an open PEP approval and is free after the approval', async () => {
    setup(<AuditScreen />, backupOf([clean], [], [erika(pepYes)]));
    await ran();
    await screen.findByText(/1 PEP-Freigabe fehlt/);
    expect(closeButton().disabled).toBe(true);
    cleanup();
    const approved = { ...pepYes, approvedOn: '2026-11-20' as const, approvedBy: 'Chef' };
    setup(<AuditScreen />, backupOf([clean], [], [erika(approved)]));
    await ran();
    await waitFor(() => expect(closeButton().disabled).toBe(false));
    expect(screen.queryByText(/PEP-Freigabe/)).toBeNull();
  });

  it('blocks without a list, with a clear sentence', async () => {
    setup(<AuditScreen />, backupOf([clean]), { list: false, run: false });
    await screen.findByText(/Es ist keine Sanktionsliste geladen/);
    expect(closeButton().disabled).toBe(true);
    expect(screen.getByText(/Die Ausnahmelisten sind leer, der Abschluss ist aber noch gesperrt/));
  });

  it('blocks when no screening ran in this session (hits live in memory only)', async () => {
    setup(<AuditScreen />, backupOf([clean]), { run: false });
    await screen.findByText(/noch kein Sanktionsabgleich durchgeführt/);
    expect(closeButton().disabled).toBe(true);
  });

  it('warns about open yellow hits in the dialog but still closes', async () => {
    // Birth year only: same name, year matches, full date unknown: yellow, never red.
    setup(<AuditScreen />, backupOf([clean], [], [quelle({ birth: '1965' })]));
    await ran();
    await waitFor(() => expect(closeButton().disabled).toBe(false));
    expect(screen.queryByText(/offener gelber Treffer/)).toBeNull();
    fireEvent.click(closeButton());
    expect(screen.getByRole('dialog').textContent).toContain('1 offener gelber Treffer');
  });

  it('closeAudit refuses to save a new closing while blockers stand', async () => {
    function Sneak() {
      const { closeAudit } = useApp();
      const [msg, setMsg] = useState('');
      return (
        <button
          type="button"
          onClick={() =>
            void closeAudit(closed).then((r) => setMsg(r.ok ? 'gespeichert' : r.reason))
          }
        >
          {msg === '' ? 'Sneak' : msg}
        </button>
      );
    }
    const store = setup(<Sneak />, backupOf([clean], [], [quelle()]));
    await ran();
    // wait until the red hit is known to the provider
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.click(await screen.findByRole('button', { name: 'Sneak' }));
    await screen.findByRole('button', { name: 'closing-blocked' });
    expect((await stored(store)).auditClosings).toEqual([]);
  });
});
