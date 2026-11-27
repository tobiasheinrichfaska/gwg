// @vitest-environment jsdom
import { useState } from 'react';
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  createMemoryListStore,
  createMemorySettingsStore,
  createMemoryStore,
  type AppStore,
  type ListStore,
  type SettingsStore,
} from '../../src/io/index.ts';
import {
  DEFAULT_RULES,
  emptyPep,
  serializeBackup,
  serializeSettings,
  type Backup,
  type ListIndex,
  type Mandate,
  type Person,
} from '../../src/logic/index.ts';
import { AppProvider } from '../../src/ui/app/AppProvider.tsx';
import { useApp } from '../../src/ui/app/context.ts';
import { OverviewScreen } from '../../src/ui/screens/overview/OverviewScreen.tsx';
import { SanctionsScreen } from '../../src/ui/screens/sanctions/SanctionsScreen.tsx';
import { TasksScreen } from '../../src/ui/screens/tasks/TasksScreen.tsx';
import { mandate } from '../helpers.ts';

// Several screens read the list and run the screening in chunks; give slow machines room.
configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

const clock = () => new Date(2026, 10, 27, 12, 0, 0);

const NS = 'xmlns="http://eu.europa.ec/fpi/fsd/export"';
const alias = (whole: string) => `<nameAlias wholeName="${whole}" strong="true" logicalId="9"/>`;
const entity = (id: string, inner: string, type = 'person') =>
  `<sanctionEntity logicalId="${id}"><regulation programme="TESTPROG"/>` +
  `<subjectType code="${type}"/>${inner}</sanctionEntity>`;
/** Invented list: one person, one enterprise, one entry without a name (skipped). */
const xml = (gen = '2026-11-20T10:00:00.000+01:00') =>
  `<?xml version="1.0" encoding="UTF-8"?><export ${NS} generationDate="${gen}" globalFileId="1">` +
  entity(
    '100',
    alias('Zorin Quelle') +
      alias('Z. Quelle') +
      '<remark>Erfundener Eintrag</remark><birthdate birthdate="1965-12-12" year="1965"/>',
  ) +
  entity('200', alias('Muster Handels AG'), 'enterprise') +
  entity('300', '<birthdate year="1950"/>') +
  `</export>`;

const person = (over: Partial<Person> = {}): Person => ({
  id: 'p1',
  mandateId: '10001',
  role: 'inhaber',
  lastName: 'Quelle',
  firstName: 'Zorin',
  birth: '1965-12-12',
  pep: emptyPep(),
  ...over,
});

const backupOf = (mandates: Mandate[], persons: Person[]): Backup => ({
  format: 'gwg-backup',
  version: 3,
  createdOn: '2026-11-27',
  rules: DEFAULT_RULES,
  mandates,
  persons,
  auditClosings: [],
  screeningDecisions: [],
  lastScreening: { sanktion: null, pep: null },
});

const RELAY = 'https://relay.example/app';
const mandates = [mandate({ id: '10001', name: 'Muster Handels AG', lastCheckOn: '2026-11-01' })];

interface Setup {
  store: AppStore;
  listStore: ListStore;
  settingsStore: SettingsStore;
  calls: { url: string; init: RequestInit | undefined }[];
}

async function listOf(on: string, extra = 0): Promise<ListIndex> {
  return {
    source: 'EU konsolidierte Finanzsanktionsliste',
    kind: 'sanktion',
    fetchedOn: on as ListIndex['fetchedOn'],
    entries: [
      {
        id: '100',
        kind: 'sanktion',
        names: ['Zorin Quelle', 'Z. Quelle'],
        births: ['1965-12-12'],
        remark: 'Erfundener Eintrag',
      },
      { id: '200', kind: 'sanktion', names: ['Muster Handels AG'], births: [], remark: 'TESTPROG' },
      ...Array.from({ length: extra }, (_, i) => ({
        id: `X${i}`,
        kind: 'sanktion' as const,
        names: [`Fiktiv Nummer${i}`],
        births: [],
        remark: '',
      })),
    ],
  };
}

function setup(
  ui: React.ReactNode,
  opts: {
    mandates?: Mandate[];
    persons?: Person[];
    listOn?: string | null;
    /** Extra entries in the stored list (it has 2 without them). */
    listExtra?: number;
    settings?: { relayUrl: string; autoFetch: boolean; maxAgeDays: number };
    fetchFn?: typeof fetch;
    data?: Backup;
  } = {},
): Promise<Setup> {
  const data = opts.data ?? backupOf(opts.mandates ?? mandates, opts.persons ?? [person()]);
  const store = createMemoryStore(serializeBackup(data));
  const listStore = createMemoryListStore();
  const settingsStore = createMemorySettingsStore(
    opts.settings ? serializeSettings(opts.settings) : null,
  );
  const calls: Setup['calls'] = [];
  const fetchFn: typeof fetch =
    opts.fetchFn ??
    ((url, init) => {
      calls.push({ url: String(url), init });
      return Promise.resolve(
        new Response(xml(), { headers: { 'Content-Type': 'application/xml' } }),
      );
    });
  const wrapped: typeof fetch = (url, init) => {
    if (opts.fetchFn) calls.push({ url: String(url), init });
    return fetchFn(url, init);
  };
  const go = async () => {
    if (opts.listOn !== null && opts.listOn !== undefined)
      await listStore.save(await listOf(opts.listOn, opts.listExtra));
    render(
      <AppProvider
        store={store}
        now={clock}
        listStore={listStore}
        settingsStore={settingsStore}
        fetchFn={wrapped}
      >
        {ui}
      </AppProvider>,
    );
    return { store, listStore, settingsStore, calls };
  };
  return go();
}

const stored = async (s: AppStore): Promise<Backup> => {
  const r = await s.load();
  if (!r.ok || r.value === null) throw new Error('nothing stored');
  return r.value;
};

async function runScreening() {
  fireEvent.click(await screen.findByRole('button', { name: 'Abgleich starten' }));
  await screen.findByText('Abgleich abgeschlossen.');
}

describe('list: read from a file', () => {
  it('shows "keine Liste" and blocks the screening without a list', async () => {
    await setup(<SanctionsScreen />);
    expect((await screen.findAllByText(/Keine Sanktionsliste geladen/)).length).toBe(2);
    const start = screen.getByRole('button', { name: 'Abgleich starten' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(screen.getByText(/Der Abgleich braucht eine Sanktionsliste/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Jetzt abrufen' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/keine Mandantendaten gesendet/)).toBeTruthy();
  });

  it('confirms the proposed date in a dialog, reports skipped entries and stores the list', async () => {
    const s = await setup(<SanctionsScreen />);
    const input = await screen.findByLabelText('Datei der EU-Liste wählen');
    fireEvent.change(input, { target: { files: [new File([xml()], 'liste.xml')] } });
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('2 Einträge');
    // the skipped entry is named with its reason, not dropped silently
    expect(dialog.textContent).toContain('Übersprungene Einträge: 1');
    expect(dialog.textContent).toContain('300: kein verwendbarer Name');
    const date = within(dialog).getByLabelText(/Stand der Liste/) as HTMLInputElement;
    expect(date.value).toBe('2026-11-20');
    fireEvent.change(date, { target: { value: '2026-11-19' } });
    // nothing stored before the confirmation
    expect(
      (await s.listStore.load('sanktion')).ok && (await s.listStore.load('sanktion')),
    ).toMatchObject({ value: null });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Liste speichern' }));
    await screen.findByText(/Liste eingelesen: 2 Einträge, Stand 19\.11\.2026/);
    const r = await s.listStore.load('sanktion');
    expect(r.ok && r.value?.fetchedOn).toBe('2026-11-19');
    expect(screen.getByText('8 Tage')).toBeTruthy();
    expect(screen.getByText('EU konsolidierte Finanzsanktionsliste')).toBeTruthy();
  });

  it('cancelling the dialog stores nothing; a bad file is reported', async () => {
    const s = await setup(<SanctionsScreen />);
    const input = await screen.findByLabelText('Datei der EU-Liste wählen');
    fireEvent.change(input, { target: { files: [new File([xml()], 'liste.xml')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await s.listStore.load('sanktion')).toMatchObject({ ok: true, value: null });
    fireEvent.change(input, { target: { files: [new File(['<kaputt'], 'x.xml')] } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Datei nicht eingelesen');
    expect(alert.textContent).toContain('Code: bad-list');
  });

  it('an unexpected exception while reading shows "Datei konnte nicht gelesen werden"', async () => {
    await setup(<SanctionsScreen />);
    const f = new File(['x'], 'x.xml');
    Object.defineProperty(f, 'size', {
      get() {
        throw new Error('boom');
      },
    });
    const input = await screen.findByLabelText('Datei der EU-Liste wählen');
    fireEvent.change(input, { target: { files: [f] } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Datei konnte nicht gelesen werden');
    expect(alert.textContent).toContain('Code: bad-list');
  });

  it('warns with text and symbol when the list is older than the maximum age', async () => {
    await setup(<SanctionsScreen />, { listOn: '2026-11-10' });
    const warning = await screen.findByText(/Liste veraltet: Stand 10\.11\.2026, 17 Tage alt/);
    expect(warning.textContent).toContain('⚠');
    expect(warning.textContent).toContain('Höchstalter 7 Tage');
  });
});

describe('list: strong shrinkage', () => {
  const settings = { relayUrl: RELAY, autoFetch: false, maxAgeDays: 7 };

  it('the file import asks for an explicit confirmation naming both numbers', async () => {
    const s = await setup(<SanctionsScreen />, { listOn: '2026-11-10', listExtra: 4 });
    const input = await screen.findByLabelText('Datei der EU-Liste wählen');
    fireEvent.change(input, { target: { files: [new File([xml()], 'liste.xml')] } });
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('2 Einträge');
    expect(dialog.textContent).toContain('6 Einträge');
    const save = within(dialog).getByRole('button', { name: 'Liste speichern' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Ich habe geprüft/ }));
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    await screen.findByText(/Liste eingelesen: 2 Einträge/);
    const r = await s.listStore.load('sanktion');
    expect(r.ok && r.value?.entries).toHaveLength(2);
  });

  it('a normal change (50 percent or more left) needs no confirmation', async () => {
    await setup(<SanctionsScreen />, { listOn: '2026-11-10', listExtra: 2 });
    const input = await screen.findByLabelText('Datei der EU-Liste wählen');
    fireEvent.change(input, { target: { files: [new File([xml()], 'liste.xml')] } });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    expect(
      (within(dialog).getByRole('button', { name: 'Liste speichern' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('the fetch at start does not replace the list and says so', async () => {
    const s = await setup(<SanctionsScreen />, {
      settings: { ...settings, autoFetch: true },
      listOn: '2026-11-10',
      listExtra: 4,
    });
    expect(await screen.findByText(/Die Liste wurde nicht ersetzt/)).toBeTruthy();
    expect(screen.getByText(/6 Einträge/, { selector: 'p.warning' }).textContent).toContain(
      '2 Einträge',
    );
    const r = await s.listStore.load('sanktion');
    expect(r.ok && r.value?.entries).toHaveLength(6);
    expect(r.ok && r.value?.fetchedOn).toBe('2026-11-10');
  });
});

describe('list: fetch through the relay', () => {
  const settings = { relayUrl: RELAY, autoFetch: false, maxAgeDays: 7 };

  it('fetches with a plain GET and stores the list', async () => {
    const s = await setup(<SanctionsScreen />, { settings });
    const button = await screen.findByRole('button', { name: 'Jetzt abrufen' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await screen.findByText(/Liste abgerufen: Stand 20\.11\.2026, 2 Einträge/);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.url).toBe(`${RELAY}/liste`);
    expect(s.calls[0]?.init?.method).toBe('GET');
    expect(s.calls[0]?.init?.body).toBeUndefined();
    const r = await s.listStore.load('sanktion');
    expect(r.ok && r.value?.entries.map((e) => e.id)).toEqual(['100', '200']);
  });

  it('shows the error code and text when the relay fails and keeps the stored list', async () => {
    const s = await setup(<SanctionsScreen />, {
      settings,
      listOn: '2026-11-25',
      fetchFn: () => Promise.reject(new Error('offline')),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Jetzt abrufen' }));
    const alert = await screen.findByText(/Abruf fehlgeschlagen/);
    expect(alert.textContent).toContain('Code: fetch-failed');
    expect(alert.textContent).toContain('Die gespeicherte Liste bleibt unverändert');
    const r = await s.listStore.load('sanktion');
    expect(r.ok && r.value?.fetchedOn).toBe('2026-11-25');
  });

  it('reports a relay answer of the wrong type', async () => {
    await setup(<SanctionsScreen />, {
      settings,
      fetchFn: () =>
        Promise.resolve(new Response('<html>', { headers: { 'Content-Type': 'text/html' } })),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Jetzt abrufen' }));
    expect((await screen.findByText(/Abruf fehlgeschlagen/)).textContent).toContain(
      'relay-bad-response',
    );
  });

  it('shows a hint for X-Stale', async () => {
    await setup(<SanctionsScreen />, {
      settings,
      fetchFn: () =>
        Promise.resolve(
          new Response(xml(), { headers: { 'Content-Type': 'application/xml', 'X-Stale': '1' } }),
        ),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Jetzt abrufen' }));
    expect(await screen.findByText(/Relay hat eine ältere Kopie geliefert/)).toBeTruthy();
  });

  it('does not replace a newer stored list by an older download', async () => {
    const s = await setup(<SanctionsScreen />, {
      settings,
      listOn: '2026-11-26',
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Jetzt abrufen' }));
    expect(
      await screen.findByText(/Die abgerufene Liste ist älter als die gespeicherte/),
    ).toBeTruthy();
    const r = await s.listStore.load('sanktion');
    expect(r.ok && r.value?.fetchedOn).toBe('2026-11-26');
  });

  it('makes no request in the default state (fetch off)', async () => {
    const s = await setup(<SanctionsScreen />, { listOn: '2026-11-01' });
    await screen.findAllByText(/Liste veraltet/);
    expect(s.calls).toHaveLength(0);
  });

  it('fetches once at start when "beim Start" is on and the list is outdated', async () => {
    const s = await setup(<SanctionsScreen />, {
      settings: { ...settings, autoFetch: true },
      listOn: '2026-11-01',
    });
    await screen.findByText(/Abruf beim Start: Liste abgerufen/);
    expect(s.calls).toHaveLength(1);
  });

  it('does not fetch at start when the list is fresh, and a failing start fetch is only a hint', async () => {
    const fresh = await setup(<SanctionsScreen />, {
      settings: { ...settings, autoFetch: true },
      listOn: '2026-11-26',
    });
    await screen.findByText('Stand');
    await new Promise((r) => setTimeout(r, 30));
    expect(fresh.calls).toHaveLength(0);
    cleanup();
    await setup(<SanctionsScreen />, {
      settings: { ...settings, autoFetch: true },
      listOn: '2026-11-01',
      fetchFn: () => Promise.reject(new Error('offline')),
    });
    const hint = await screen.findByText(/Abruf beim Start fehlgeschlagen/);
    expect(hint.textContent).toContain('fetch-failed');
    expect(screen.getByRole('button', { name: 'Abgleich starten' })).toBeTruthy();
  });
});

describe('list: settings', () => {
  it('rejects invalid settings with a message and stores nothing', async () => {
    const s = await setup(<SanctionsScreen />);
    const relay = await screen.findByLabelText(/Relay-Adresse/);
    fireEvent.change(relay, { target: { value: 'http://relay.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen speichern' }));
    expect((await screen.findByText(/Nicht gespeichert\./)).textContent).toContain('bad-settings');
    fireEvent.change(relay, { target: { value: RELAY } });
    fireEvent.change(screen.getByLabelText(/Höchstalter/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen speichern' }));
    expect((await screen.findByText(/Nicht gespeichert\./)).textContent).toContain('bad-settings');
    expect(await s.settingsStore.load()).toMatchObject({ ok: true, value: { relayUrl: '' } });
  });

  it('saves valid settings and activates the fetch button', async () => {
    const s = await setup(<SanctionsScreen />);
    fireEvent.change(await screen.findByLabelText(/Relay-Adresse/), { target: { value: RELAY } });
    fireEvent.click(screen.getByLabelText(/Beim Start abrufen/));
    fireEvent.change(screen.getByLabelText(/Höchstalter/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen speichern' }));
    await screen.findByText('Einstellungen gespeichert.');
    expect(await s.settingsStore.load()).toMatchObject({
      ok: true,
      value: { relayUrl: RELAY, autoFetch: true, maxAgeDays: 3 },
    });
    expect(
      (screen.getByRole('button', { name: 'Jetzt abrufen' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe('screening', () => {
  it('shows progress while it runs, then the summary and the open hits (red before yellow)', async () => {
    // 60 further persons without a match make the run take several chunks.
    const many = Array.from({ length: 60 }, (_, i) =>
      person({ id: `x${i}`, firstName: 'Eva', lastName: `Unauffaellig${i}`, birth: '1980' }),
    );
    const s = await setup(<SanctionsScreen />, {
      listOn: '2026-11-26',
      persons: [person(), ...many],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Abgleich starten' }));
    expect(await screen.findByText(/0 von 62 geprüft/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Abgleich läuft …' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await screen.findByText('Abgleich abgeschlossen.');
    expect(screen.queryByText(/von 62 geprüft/)).toBeNull();
    const summary = screen.getByRole('heading', {
      name: /Ergebnis vom 27\.11\.2026/,
    }).nextElementSibling!;
    expect(summary.textContent).toContain('Offen, rot: 1');
    expect(summary.textContent).toContain('Offen, gelb: 1');
    expect(summary.textContent).toContain('Nicht prüfbar: 0');
    const rows = within(screen.getByRole('region', { name: 'Offene Treffer' })).getAllByRole('row');
    expect(rows[1]?.textContent).toContain('● ROT – Treffer');
    expect(rows[1]?.textContent).toContain('Zorin Quelle');
    expect(rows[1]?.textContent).toContain('100 %');
    expect(rows[1]?.textContent).toContain('100: Zorin Quelle');
    expect(rows[2]?.textContent).toContain('◐ GELB – prüfen');
    expect(rows[2]?.textContent).toContain('Mandat: Muster Handels AG');
    const saved = await stored(s.store);
    expect(saved.lastScreening.sanktion).toEqual({
      ranOn: '2026-11-27',
      listKind: 'sanktion',
      listFetchedOn: '2026-11-26',
      hitCount: 2,
    });
  });

  it('reports persons that cannot be compared', async () => {
    await setup(<SanctionsScreen />, {
      listOn: '2026-11-26',
      persons: [person({ id: 'leer', lastName: '--', firstName: '' })],
    });
    await runScreening();
    expect(screen.getByText(/Person leer .*: Nachname leer oder ohne Buchstaben/)).toBeTruthy();
  });

  it('says "Abgleich veraltet" when persons change after the run or the list is old', async () => {
    function Editor() {
      const { backup, replace } = useApp();
      return (
        <button
          type="button"
          onClick={() =>
            void replace({
              ...backup,
              persons: backup.persons.map((p) => ({ ...p, lastName: 'Andere' })),
            })
          }
        >
          Name ändern
        </button>
      );
    }
    await setup(
      <>
        <SanctionsScreen />
        <Editor />
      </>,
      { listOn: '2026-11-26' },
    );
    // before any run
    expect((await screen.findAllByText(/Abgleich veraltet/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Es wurde noch kein Abgleich durchgeführt.')).toBeTruthy();
    await runScreening();
    expect(screen.queryByText(/Abgleich veraltet/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Name ändern' }));
    expect(
      await screen.findByText(
        /Personen oder Mandate wurden seit dem Abgleich vom 27\.11\.2026 geändert/,
      ),
    ).toBeTruthy();
    expect(screen.getAllByText(/Abgleich veraltet/).length).toBeGreaterThan(0);
  });

  it('tasks and overview show the open hits and the outdated banner', async () => {
    await setup(
      <>
        <SanctionsScreen />
        <TasksScreen />
        <OverviewScreen />
      </>,
      { listOn: '2026-11-26' },
    );
    expect((await screen.findAllByText(/Abgleich veraltet/)).length).toBeGreaterThan(1);
    await runScreening();
    const h = await screen.findByRole('heading', { name: 'Sanktions-/PEP-Treffer klären (2)' });
    const section = h.closest('section')!;
    expect(section.textContent).toContain('● ROT: Zorin Quelle gegen Zorin Quelle');
    expect(section.textContent).toContain('◐ GELB: Muster Handels AG gegen Muster Handels AG');
    expect(within(section).getAllByRole('button', { name: /Treffer öffnen/ })).toHaveLength(2);
    expect(screen.getAllByText('Sanktions-/PEP-Treffer klären:').length).toBeGreaterThan(0);
  });

  it('"Treffer öffnen" leaves a request that opens the detail page of the screen', async () => {
    function Wheel() {
      const [shown, setShown] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setShown(true)}>
            Rad: Abgleich
          </button>
          {shown ? <SanctionsScreen /> : <TasksScreen />}
        </>
      );
    }
    function Runner() {
      const { runScreening, screening } = useApp();
      return (
        <button type="button" onClick={() => void runScreening()} data-done={screening !== null}>
          Lauf
        </button>
      );
    }
    await setup(
      <>
        <Runner />
        <Wheel />
      </>,
      { listOn: '2026-11-26' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Lauf' }));
    const open = await screen.findByRole('button', { name: /Treffer öffnen: 10001 Zorin Quelle/ });
    fireEvent.click(open);
    expect(screen.getByText(/Wählen Sie im Rad den Bereich „Abgleich“/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rad: Abgleich' }));
    expect(await screen.findByRole('heading', { name: 'Treffer klären' })).toBeTruthy();
  });
});

describe('clearing a hit', () => {
  async function openDetail(name: RegExp, options: Parameters<typeof setup>[1] = {}) {
    const s = await setup(<SanctionsScreen />, { listOn: '2026-11-26', ...options });
    await runScreening();
    fireEvent.click(await screen.findByRole('button', { name: name }));
    await screen.findByRole('heading', { name: 'Treffer klären' });
    return s;
  }

  it('shows both sides next to each other with the meaning of the traffic light', async () => {
    await openDetail(/Treffer klären: Zorin Quelle gegen/);
    const left = screen.getByRole('heading', { name: 'Person im Bestand' }).closest('section')!;
    expect(left.textContent).toContain('Zorin Quelle');
    expect(left.textContent).toContain('12.12.1965');
    expect(left.textContent).toContain('Inhaber');
    expect(left.textContent).toContain('10001 Muster Handels AG');
    const right = screen.getByRole('heading', { name: 'Listeneintrag' }).closest('section')!;
    expect(right.textContent).toContain('Z. Quelle');
    expect(right.textContent).toContain('12.12.1965');
    expect(right.textContent).toContain('Erfundener Eintrag');
    expect(screen.getByText('● ROT – Treffer')).toBeTruthy();
    expect(screen.getByText(/Warum rot:/)).toBeTruthy();
  });

  it('"Kein Treffer" needs the name, the reason from the proposals and the free text', async () => {
    const s = await openDetail(/Treffer klären: Zorin Quelle gegen/);
    const button = screen.getByRole('button', { name: 'Kein Treffer' });
    fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Namen der entscheidenden Person',
    );
    fireEvent.change(screen.getByLabelText(/Name der entscheidenden Person/), {
      target: { value: 'A. Prüferin' },
    });
    fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain('Ausschlussgrund');
    const options = within(screen.getByLabelText(/Ausschlussgrund/))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual([
      '— bitte wählen —',
      'Anderes Geburtsjahr',
      'Andere Staatsangehörigkeit',
      'Anderer Geburtsort',
      'Namensgleichheit ohne Bezug',
      'Sonstiger Grund',
    ]);
    fireEvent.change(screen.getByLabelText(/Ausschlussgrund/), {
      target: { value: 'Anderer Geburtsort' },
    });
    fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'begründen Sie den Ausschluss',
    );
    expect((await stored(s.store)).screeningDecisions).toEqual([]);
    fireEvent.change(screen.getByLabelText(/Begründung in einem Satz/), {
      target: { value: 'Geboren in Testhausen, nicht in Beispielstadt.' },
    });
    fireEvent.click(button);
    await screen.findByText(/Entscheidung gespeichert: kein Treffer/);
    const d = (await stored(s.store)).screeningDecisions;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({
      subjectKind: 'person',
      subjectId: 'p1',
      entryId: '100',
      decision: 'kein-treffer',
      reason: 'Anderer Geburtsort: Geboren in Testhausen, nicht in Beispielstadt.',
      decidedBy: 'A. Prüferin',
      decidedOn: '2026-11-27',
      listFetchedOn: '2026-11-26',
      actionNote: '',
    });
    // back to the screen: the hit is gone from the open list, and listed as cleared
    fireEvent.click(screen.getByRole('button', { name: 'Zurück zum Abgleich' }));
    const summary = screen.getByRole('heading', { name: /Ergebnis vom/ }).nextElementSibling!;
    expect(summary.textContent).toContain('Offen, rot: 0');
    expect(summary.textContent).toContain('Als „kein Treffer“ geklärt: 1');
  });

  it('"Treffer bestätigt" needs the reason, shows the leadership note and takes the measure note', async () => {
    const s = await openDetail(/Treffer klären: Zorin Quelle gegen/);
    fireEvent.change(screen.getByLabelText(/Name der entscheidenden Person/), {
      target: { value: 'L. Leitung' },
    });
    const button = screen.getByRole('button', { name: 'Treffer bestätigt' });
    fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain('Begründung');
    expect((await stored(s.store)).screeningDecisions).toEqual([]);
    fireEvent.change(screen.getByLabelText('Begründung (Pflicht)'), {
      target: { value: 'Name, Geburtsdatum und Funktion stimmen überein.' },
    });
    fireEvent.click(button);
    await screen.findByText('Entscheidung gespeichert: Treffer bestätigt.');
    expect(
      screen.getAllByText(
        /Bereitstellungsverbot und Meldeweg: Entscheidung der Leitung; das Programm meldet nichts selbst\./,
      ).length,
    ).toBeGreaterThan(0);
    expect((await stored(s.store)).screeningDecisions[0]).toMatchObject({
      decision: 'treffer-bestaetigt',
      decidedBy: 'L. Leitung',
    });
    // the decision cannot be overwritten: no decision buttons any more, only "zurücknehmen"
    expect(screen.queryByRole('button', { name: 'Kein Treffer' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Maßnahme dokumentiert'), {
      target: { value: 'Leitung am 27.11. informiert, Konto gesperrt.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Maßnahme speichern' }));
    await screen.findByText('Maßnahme dokumentiert.');
    expect((await stored(s.store)).screeningDecisions[0]?.actionNote).toBe(
      'Leitung am 27.11. informiert, Konto gesperrt.',
    );
  });

  it('lists confirmed hits in their own section with the field "Maßnahme dokumentiert"', async () => {
    const s = await openDetail(/Treffer klären: Zorin Quelle gegen/);
    fireEvent.change(screen.getByLabelText(/Name der entscheidenden Person/), {
      target: { value: 'L. Leitung' },
    });
    fireEvent.change(screen.getByLabelText('Begründung (Pflicht)'), {
      target: { value: 'Stimmt überein.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Treffer bestätigt' }));
    await screen.findByText('Entscheidung gespeichert: Treffer bestätigt.');
    fireEvent.click(screen.getByRole('button', { name: 'Zurück zum Abgleich' }));
    const h = screen.getByRole('heading', { name: 'Bestätigte Treffer (1)' });
    const section = h.closest('section')!;
    expect(section.textContent).toContain('L. Leitung');
    fireEvent.change(within(section).getByLabelText(/Maßnahme dokumentiert/), {
      target: { value: 'Gemeldet an die Leitung.' },
    });
    fireEvent.click(within(section).getByRole('button', { name: 'Maßnahme speichern' }));
    await screen.findByText('Maßnahme dokumentiert.');
    expect((await stored(s.store)).screeningDecisions[0]?.actionNote).toBe(
      'Gemeldet an die Leitung.',
    );
  });

  it('withdraws a decision only after a confirmation; the hit is open again', async () => {
    const s = await openDetail(/Treffer klären: Zorin Quelle gegen/);
    fireEvent.change(screen.getByLabelText(/Name der entscheidenden Person/), {
      target: { value: 'A. Prüferin' },
    });
    fireEvent.change(screen.getByLabelText(/Ausschlussgrund/), {
      target: { value: 'Sonstiger Grund' },
    });
    fireEvent.change(screen.getByLabelText(/Begründung in einem Satz/), {
      target: { value: 'Andere Person laut Ausweis.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kein Treffer' }));
    await screen.findByText(/Entscheidung gespeichert: kein Treffer/);
    fireEvent.click(screen.getByRole('button', { name: 'Entscheidung zurücknehmen' }));
    const dialog = screen.getByRole('alertdialog');
    // cancelling changes nothing
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect((await stored(s.store)).screeningDecisions).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Entscheidung zurücknehmen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zurücknahme bestätigen' }));
    await screen.findByText(/Die Entscheidung wurde zurückgenommen/);
    expect((await stored(s.store)).screeningDecisions).toEqual([]);
    // the decision form is back
    expect(screen.getByRole('button', { name: 'Kein Treffer' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zurück zum Abgleich' }));
    expect(screen.getByRole('heading', { name: 'Offene Treffer (2)' })).toBeTruthy();
  });
});
