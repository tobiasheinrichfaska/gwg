// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryStore } from '../../src/io/index.ts';
import { DEFAULT_RULES, serializeBackup, type Backup } from '../../src/logic/index.ts';
import { AppProvider } from '../../src/ui/app/AppProvider.tsx';
import { AppContext, useApp, type AppState } from '../../src/ui/app/context.ts';
import { BackupScreen } from '../../src/ui/screens/backup/BackupScreen.tsx';
import { mandate } from '../helpers.ts';

afterEach(cleanup);

const backup = (n: number): Backup => ({
  format: 'gwg-backup',
  version: 2,
  createdOn: '2026-11-27',
  rules: DEFAULT_RULES,
  mandates: Array.from({ length: n }, (_, i) => mandate({ id: String(10001 + i) })),
  persons: [],
  auditClosings: [],
  screeningDecisions: [],
  lastScreening: { sanktion: null, pep: null },
});
const clock = () => new Date(2026, 10, 27, 12, 0, 0);

function Probe() {
  const { backup: b, today } = useApp();
  return (
    <p>
      {b.mandates.length} Mandate, heute {today}, Regeln{' '}
      {b.rules === DEFAULT_RULES ? 'Standard' : 'eigene'}
    </p>
  );
}

describe('AppProvider', () => {
  it('starts with an empty data set when nothing is stored', async () => {
    render(
      <AppProvider store={createMemoryStore()} now={clock}>
        <Probe />
      </AppProvider>,
    );
    expect(await screen.findByText('0 Mandate, heute 2026-11-27, Regeln Standard')).toBeTruthy();
  });

  it('loads stored data', async () => {
    render(
      <AppProvider store={createMemoryStore(serializeBackup(backup(2)))} now={clock}>
        <Probe />
      </AppProvider>,
    );
    expect(await screen.findByText(/^2 Mandate/)).toBeTruthy();
  });

  it('locks with a German message and the code when the data is damaged', async () => {
    render(
      <AppProvider store={createMemoryStore('{"format":')} now={clock}>
        <Probe />
      </AppProvider>,
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Daten beschädigt, Sicherungsdatei einspielen');
    expect(alert.textContent).toContain('Code: bad-backup');
    expect(screen.queryByText(/Mandate, heute/)).toBeNull();
  });

  it('restores from the locked screen with a good file', async () => {
    const store = createMemoryStore('kaputt');
    render(
      <AppProvider store={store} now={clock}>
        <Probe />
      </AppProvider>,
    );
    await screen.findByRole('alert');
    const input = screen.getByLabelText(/Sicherung einspielen/);
    fireEvent.change(input, {
      target: { files: [new File([serializeBackup(backup(3))], 'x.gwg.json')] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ersetzen' }));
    expect(await screen.findByText(/^3 Mandate/)).toBeTruthy();
    const again = await store.load();
    expect(again.ok && again.value?.mandates.length).toBe(3);
  });
});

describe('damaged data with only orphan screening decisions', () => {
  const decision = (kind: 'person' | 'mandate', subjectId: string) => ({
    subjectKind: kind,
    subjectId,
    entryId: 'E1',
    listKind: 'sanktion',
    listFetchedOn: '2026-11-20',
    decision: 'kein-treffer',
    reason: 'Anderes Geburtsdatum',
    decidedOn: '2026-11-27',
    decidedBy: 'A. Beispiel',
    subjectSnapshot: 'x|',
    entrySnapshot: 'abc',
    actionNote: '',
  });
  const damaged = (extra: (o: any) => void = () => {}) => {
    const o = JSON.parse(serializeBackup(backup(2)));
    o.screeningDecisions = [
      decision('person', 'gone-P1'),
      decision('mandate', '99999'),
      decision('mandate', '10001'),
    ];
    extra(o);
    return JSON.stringify(o);
  };
  const open = (text: string) => {
    const store = createMemoryStore(text);
    render(
      <AppProvider store={store} now={clock}>
        <Probe />
      </AppProvider>,
    );
    return store;
  };

  it('offers to remove the orphans, names the number, asks for confirmation, then opens', async () => {
    const store = open(damaged());
    await screen.findByRole('alert');
    fireEvent.click(
      screen.getByRole('button', { name: 'Verwaiste Einträge entfernen und fortfahren' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('2 Entscheidungen');
    // nothing changed yet
    expect((await store.load()).ok).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Verwaiste Einträge entfernen' }));
    expect(await screen.findByText(/^2 Mandate/)).toBeTruthy();
    const again = await store.load();
    expect(again.ok && again.value?.screeningDecisions.map((d) => d.subjectId)).toEqual(['10001']);
  });

  it('cancel keeps the stored data untouched', async () => {
    const store = open(damaged());
    await screen.findByRole('alert');
    fireEvent.click(
      screen.getByRole('button', { name: 'Verwaiste Einträge entfernen und fortfahren' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((await store.load()).ok).toBe(false);
  });

  it('offers nothing when another defect is present too', async () => {
    open(damaged((o) => (o.mandates[0].name = '')));
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: /Verwaiste Einträge/ })).toBeNull();
  });
});

describe('save check', () => {
  it('refuses to save an invalid data set, shows code and place, stores nothing', async () => {
    const store = createMemoryStore(serializeBackup(backup(1)));
    let result: unknown = null;
    function Saver() {
      const { replace, saveError, saveErrorWhere } = useApp();
      return (
        <>
          <button
            type="button"
            onClick={() =>
              void replace({
                ...backup(1),
                persons: [
                  {
                    id: 'p1',
                    mandateId: '99999',
                    role: 'inhaber',
                    lastName: 'X',
                    firstName: '',
                    birth: null,
                    pep: {
                      answer: null,
                      askedOn: null,
                      funktion: '',
                      amtEndedOn: null,
                      nahestehend: null,
                      approvedOn: null,
                      approvedBy: '',
                    },
                  },
                ],
              }).then((r) => (result = r))
            }
          >
            los
          </button>
          <p>{saveError === null ? 'kein Fehler' : `${saveError} ${saveErrorWhere}`}</p>
        </>
      );
    }
    render(
      <AppProvider store={store} now={clock}>
        <Saver />
      </AppProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'los' }));
    expect(await screen.findByText('unknown-mandate persons[0]')).toBeTruthy();
    expect(result).toMatchObject({ ok: false, reason: 'unknown-mandate', where: 'persons[0]' });
    const stored = await store.load();
    expect(stored.ok && stored.value?.persons).toEqual([]);
  });
});

describe('backup download check', () => {
  it('hands out no file when the data set would not load again', () => {
    const create = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const bad = { ...backup(1), persons: [] as Backup['persons'] };
    bad.mandates = [mandate({ id: '1' }), mandate({ id: '1' })];
    const state = {
      backup: bad,
      today: '2026-11-27',
      replace: () => Promise.resolve({ ok: true, value: undefined }),
      saveError: null,
      saveErrorWhere: undefined,
      lockSettings: null,
    } as unknown as AppState;
    render(
      <AppContext.Provider value={state}>
        <BackupScreen />
      </AppContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sicherung speichern' }));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Sicherung nicht erstellt');
    expect(alert.textContent).toContain('Code: duplicate-id');
    expect(alert.textContent).toContain('mandates[1].id');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('BackupScreen restore', () => {
  const setup = (initial: Backup) => {
    const store = createMemoryStore(serializeBackup(initial));
    render(
      <AppProvider store={store} now={clock}>
        <BackupScreen />
      </AppProvider>,
    );
    return store;
  };
  const choose = async (text: string) => {
    const input = await screen.findByLabelText(/Sicherung einspielen/);
    fireEvent.change(input, { target: { files: [new File([text], 'x.gwg.json')] } });
  };

  it('always shows the warning and the lock hint', async () => {
    setup(backup(1));
    expect((await screen.findAllByText(/nicht verschlüsselt/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/App-Sperre/, { selector: 'h2' })).toBeTruthy();
  });

  it('replaces the data after confirmation, showing the number of mandates', async () => {
    const store = setup(backup(1));
    await choose(serializeBackup(backup(4)));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('4 Mandate');
    fireEvent.click(screen.getByRole('button', { name: 'Ersetzen' }));
    await waitFor(() => expect(screen.getByText('Bestand: 4 Mandate.')).toBeTruthy());
    const r = await store.load();
    expect(r.ok && r.value?.mandates.length).toBe(4);
  });

  it('does nothing when the dialog is cancelled', async () => {
    const store = setup(backup(1));
    await choose(serializeBackup(backup(4)));
    fireEvent.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByText('Bestand: 1 Mandate.')).toBeTruthy();
    const r = await store.load();
    expect(r.ok && r.value?.mandates.length).toBe(1);
  });

  it('reports a bad file with code and place and overwrites nothing', async () => {
    const store = setup(backup(1));
    const bad = JSON.parse(serializeBackup(backup(2)));
    bad.mandates[1].id = '';
    await choose(JSON.stringify(bad));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Code: bad-id');
    expect(alert.textContent).toContain('mandates[1]');
    expect(alert.textContent).toContain('nichts überschrieben');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const r = await store.load();
    expect(r.ok && r.value?.mandates.length).toBe(1);
  });

  it('a file nested 100 000 levels deep is refused with the code, nothing is overwritten', async () => {
    const store = setup(backup(1));
    await choose('['.repeat(100_000) + ']'.repeat(100_000));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Code: bad-backup');
    expect(alert.textContent).toContain('nichts überschrieben');
    const r = await store.load();
    expect(r.ok && r.value?.mandates.length).toBe(1);
  });

  it('an unexpected exception while reading shows "Datei konnte nicht gelesen werden"', async () => {
    setup(backup(1));
    const f = new File(['x'], 'x.gwg.json');
    Object.defineProperty(f, 'size', {
      get() {
        throw new Error('boom');
      },
    });
    const input = await screen.findByLabelText(/Sicherung einspielen/);
    fireEvent.change(input, { target: { files: [f] } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Datei konnte nicht gelesen werden');
    expect(alert.textContent).toContain('Code: bad-backup');
  });

  it('reports text that is not JSON', async () => {
    setup(backup(1));
    await choose('das ist keine Sicherung');
    expect((await screen.findByRole('alert')).textContent).toContain('Code: bad-backup');
  });
});
