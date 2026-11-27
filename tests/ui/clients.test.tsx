// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryStore, type AppStore } from '../../src/io/index.ts';
import {
  DEFAULT_RULES,
  serializeBackup,
  type Backup,
  type Mandate,
} from '../../src/logic/index.ts';
import { AppProvider } from '../../src/ui/app/AppProvider.tsx';
import { ClientsScreen } from '../../src/ui/screens/clients/ClientsScreen.tsx';
import { mandate } from '../helpers.ts';

afterEach(cleanup);

const clock = () => new Date(2026, 10, 27, 12, 0, 0);
const backupOf = (mandates: Mandate[]): Backup => ({
  format: 'gwg-backup',
  version: 2,
  createdOn: '2026-11-27',
  rules: DEFAULT_RULES,
  mandates,
  persons: [],
  auditClosings: [],
});

function setup(mandates: Mandate[] = [], store?: AppStore) {
  const s = store ?? createMemoryStore(serializeBackup(backupOf(mandates)));
  render(
    <AppProvider store={s} now={clock}>
      <ClientsScreen />
    </AppProvider>,
  );
  return s;
}
async function stored(s: AppStore): Promise<Mandate[]> {
  const r = await s.load();
  if (!r.ok || r.value === null) throw new Error('nothing stored');
  return r.value.mandates;
}
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const openCreate = async () =>
  fireEvent.click(await screen.findByRole('button', { name: 'Mandant anlegen' }));

describe('list', () => {
  it('shows a mandate with all columns, German date and dashes for missing values', async () => {
    setup([
      mandate(),
      mandate({
        id: '10002',
        name: 'Neu GmbH',
        idStatus: 'leer',
        riskGroupId: null,
        lastCheckOn: null,
      }),
    ]);
    const row = (await screen.findByText('Muster GmbH')).closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(within(row).getByRole('rowheader').textContent).toBe('10001');
    expect(cells.map((c) => c.textContent).slice(0, 6)).toEqual([
      'Muster GmbH',
      'GmbH',
      'normal',
      'vollständig',
      '15.01.2028',
      'Ja',
    ]);
    const empty = screen.getByText('Neu GmbH').closest('tr')!;
    const dashes = within(empty).getAllByRole('cell');
    expect(dashes[2]?.textContent).toBe('—');
    expect(dashes[4]?.textContent).toBe('—');
  });

  it('sorts by number, numerically', async () => {
    setup([
      mandate({ id: '10010', name: 'B' }),
      mandate({ id: '9', name: 'A' }),
      mandate({ id: '10002', name: 'C' }),
    ]);
    await screen.findByText('A');
    const ids = screen.getAllByRole('rowheader').map((h) => h.textContent);
    expect(ids.filter((i) => ['9', '10002', '10010'].includes(i ?? ''))).toEqual([
      '9',
      '10002',
      '10010',
    ]);
  });

  it('explains an empty data set', async () => {
    setup([]);
    expect(await screen.findByText(/Noch keine Mandate im Bestand/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows only active mandates by default and all when the filter is off', async () => {
    setup([
      mandate(),
      mandate({ id: '10002', name: 'Alt AG', active: false, endedOn: '2020-05-01' }),
    ]);
    await screen.findByText('Muster GmbH');
    expect(screen.queryByText('Alt AG')).toBeNull();
    fireEvent.click(screen.getByLabelText('Nur aktive Mandate'));
    expect(screen.getByText('Alt AG')).toBeTruthy();
  });

  it('searches by number and by name', async () => {
    setup([mandate(), mandate({ id: '20002', name: 'Beispiel KG' })]);
    await screen.findByText('Muster GmbH');
    type('Suche nach Nummer oder Name', '2000');
    expect(screen.queryByText('Muster GmbH')).toBeNull();
    expect(screen.getByText('Beispiel KG')).toBeTruthy();
    type('Suche nach Nummer oder Name', 'muster');
    expect(screen.getByText('Muster GmbH')).toBeTruthy();
    type('Suche nach Nummer oder Name', 'zzz');
    expect(screen.getByText(/Kein Mandat passt/)).toBeTruthy();
  });
});

describe('create', () => {
  it('saves a valid mandate, shows it and stores it', async () => {
    const s = setup([]);
    await openCreate();
    // Focus moves to the form heading.
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Mandant anlegen' }));
    type(/Mandatsnummer/, '90001');
    type(/Name/, 'Beispiel GmbH');
    type('Rechtsform', 'gmbh');
    type('Risikogruppe', 'M-01');
    type('Status der Identifizierung', 'vollstaendig');
    type('Letzte Prüfung am', '2026-01-15');
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Mandant 90001 Beispiel GmbH gespeichert.')).toBeTruthy();
    expect(screen.getByText('Beispiel GmbH')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Mandanten' }));
    expect(await stored(s)).toEqual([
      mandate({ id: '90001', name: 'Beispiel GmbH', lastCheckOn: '2026-01-15' }),
    ]);
  });

  it('keeps the form, shows an alert with focus and stores nothing when invalid', async () => {
    const s = setup([]);
    await openCreate();
    type(/Mandatsnummer/, '90002');
    type(/Name/, 'Fehler GmbH');
    type('Status der Identifizierung', 'vollstaendig'); // needs a last-check date
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Nicht gespeichert');
    expect(alert.textContent).toContain('Datum der letzten Prüfung');
    expect(document.activeElement).toBe(alert);
    expect(screen.getByRole('heading', { name: 'Mandant anlegen' })).toBeTruthy();
    expect(await stored(s)).toEqual([]);
  });

  it('rejects a missing name', async () => {
    setup([]);
    await openCreate();
    type(/Mandatsnummer/, '90003');
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Mandatsnummer und Name müssen ausgefüllt sein',
    );
  });

  it('rejects a duplicate number and keeps the existing mandate', async () => {
    const s = setup([mandate()]);
    await openCreate();
    type(/Mandatsnummer/, '10001');
    type(/Name/, 'Doppelt GmbH');
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Diese Mandatsnummer gibt es schon',
    );
    expect(await stored(s)).toEqual([mandate()]);
  });

  it('shows the PEP hint and a private person with PEP gets risk class high', async () => {
    setup([]);
    await openCreate();
    const pep = screen.getByLabelText(/Politisch exponierte Person/);
    expect(pep.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText(/PEP bedeutet immer Risikoklasse hoch/)).toBeTruthy();
    type(/Mandatsnummer/, '90004');
    type(/Name/, 'Erika Beispiel');
    type('Rechtsform', 'natuerliche-person');
    fireEvent.click(pep);
    type('Risikogruppe', 'N-01');
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    const row = (await screen.findByText('Erika Beispiel')).closest('tr')!;
    expect(within(row).getAllByRole('cell')[2]?.textContent).toBe('hoch');
  });

  it('cancel returns to the list and stores nothing', async () => {
    const s = setup([]);
    await openCreate();
    type(/Name/, 'Abbruch');
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(await screen.findByRole('button', { name: 'Mandant anlegen' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Mandanten' }));
    expect(await stored(s)).toEqual([]);
  });

  it('shows a save error when the store refuses', async () => {
    const base = createMemoryStore();
    const failing: AppStore = {
      ...base,
      save: async () => ({ ok: false, reason: 'store-failed' }),
    };
    setup([], failing);
    await openCreate();
    type(/Mandatsnummer/, '90005');
    type(/Name/, 'Speicher GmbH');
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => {
      const texts = screen.getAllByRole('alert').map((a) => a.textContent);
      expect(texts.some((t) => t?.includes('store-failed'))).toBe(true);
    });
    expect(screen.getByRole('heading', { name: 'Mandant anlegen' })).toBeTruthy();
  });
});

describe('edit', () => {
  it('changes a mandate, keeps the number fixed and stores it', async () => {
    const s = setup([mandate(), mandate({ id: '10002', name: 'Zweite KG' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Bearbeiten: 10001 Muster GmbH' }));
    const id = screen.getByLabelText(/Mandatsnummer/) as HTMLInputElement;
    expect(id.value).toBe('10001');
    expect(id.readOnly).toBe(true);
    type(/Name/, 'Muster Holding GmbH');
    type('Risikogruppe', 'H-01');
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Mandant 10001 Muster Holding GmbH gespeichert.')).toBeTruthy();
    const list = await stored(s);
    expect(list).toHaveLength(2);
    expect(list.find((m) => m.id === '10001')).toEqual(
      mandate({ name: 'Muster Holding GmbH', riskGroupId: 'H-01' }),
    );
  });

  it('labels every field', async () => {
    setup([mandate()]);
    fireEvent.click(await screen.findByRole('button', { name: /Bearbeiten: 10001/ }));
    for (const label of [
      /Mandatsnummer/,
      /^Name/,
      'Rechtsform',
      /^Aktiv/,
      'Status der Identifizierung',
      'Risikogruppe',
      'Begründung der Risikoklasse',
      /Politisch exponierte Person/,
      'Erste Anforderung der Unterlagen am',
      'Letzte Prüfung am',
      'Mandat beendet am',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });
});

describe('delete', () => {
  const del = async (name: string) => fireEvent.click(await screen.findByRole('button', { name }));

  it('asks first, focuses Abbrechen, and cancel changes nothing', async () => {
    const s = setup([mandate()]);
    await del('Löschen: 10001 Muster GmbH');
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('nicht beendet');
    expect(dialog.textContent).toContain('rechtlich zu klären');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Löschen: 10001 Muster GmbH' }),
    );
    expect(screen.getByText('Muster GmbH')).toBeTruthy();
    expect(await stored(s)).toHaveLength(1);
  });

  it('closes on Escape without deleting', async () => {
    setup([mandate()]);
    await del('Löschen: 10001 Muster GmbH');
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Muster GmbH')).toBeTruthy();
  });

  it('mentions the retention due date for an ended mandate and deletes after confirmation', async () => {
    const s = setup([mandate({ active: false, endedOn: '2026-03-31' })]);
    fireEvent.click(await screen.findByLabelText('Nur aktive Mandate'));
    await del('Löschen: 10001 Muster GmbH');
    expect(screen.getByRole('alertdialog').textContent).toContain('01.01.2032');
    fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }));
    expect(await screen.findByText('Mandant 10001 Muster GmbH gelöscht.')).toBeTruthy();
    expect(await stored(s)).toEqual([]);
  });
});
