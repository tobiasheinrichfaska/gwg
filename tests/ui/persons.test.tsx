// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryStore, type AppStore } from '../../src/io/index.ts';
import {
  DEFAULT_RULES,
  emptyPep,
  serializeBackup,
  type Backup,
  type Mandate,
  type Person,
} from '../../src/logic/index.ts';
import { AppProvider } from '../../src/ui/app/AppProvider.tsx';
import { nextPersonId } from '../../src/ui/persons.ts';
import { ClientsScreen } from '../../src/ui/screens/clients/ClientsScreen.tsx';
import { mandate } from '../helpers.ts';

afterEach(cleanup);

const clock = () => new Date(2026, 10, 27, 12, 0, 0);
const person = (over: Partial<Person> = {}): Person => ({
  id: '10001-P1',
  mandateId: '10001',
  role: 'geschaeftsfuehrer',
  lastName: 'Beispiel',
  firstName: 'Erika',
  birth: '1975-03-09',
  pep: emptyPep(),
  ...over,
});

function setup(mandates: Mandate[], persons: Person[] = []) {
  const b: Backup = {
    format: 'gwg-backup',
    version: 2,
    createdOn: '2026-11-27',
    rules: DEFAULT_RULES,
    mandates,
    persons,
    auditClosings: [],
  };
  const store = createMemoryStore(serializeBackup(b));
  render(
    <AppProvider store={store} now={clock}>
      <ClientsScreen />
    </AppProvider>,
  );
  return store;
}
async function storedPersons(s: AppStore): Promise<Person[]> {
  const r = await s.load();
  if (!r.ok || r.value === null) throw new Error('nothing stored');
  return r.value.persons;
}
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const openEdit = async (name = /Bearbeiten: 10001/) =>
  fireEvent.click(await screen.findByRole('button', { name }));
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('nextPersonId', () => {
  it('counts up per mandate and never reuses a number in the data set', () => {
    expect(nextPersonId([], '10001')).toBe('10001-P1');
    const ps = [person({ id: '10001-P1' }), person({ id: '10001-P3' }), person({ id: '10002-P7' })];
    expect(nextPersonId(ps, '10001')).toBe('10001-P4');
    expect(nextPersonId(ps, '10002')).toBe('10002-P8');
  });
});

describe('persons in the clients screen', () => {
  it('creates a person with a year-only birth date', async () => {
    const store = setup([mandate()]);
    await openEdit();
    click('Person anlegen');
    type('Rolle', 'gesellschafter');
    type('Nachname (Pflicht)', 'Beispiel');
    type('Vorname', 'Erika');
    type(/^Geburtsdatum/, '1975');
    expect(screen.getByText(/bei Namensähnlichkeit immer ein Mensch gefragt/)).toBeTruthy();
    click('Person speichern');
    await screen.findByText('Person Beispiel gespeichert.');
    const row = screen.getByText('Beispiel', { selector: 'th' }).closest('tr')!;
    expect(within(row).getByText('Gesellschafter')).toBeTruthy();
    expect(within(row).getByText('1975')).toBeTruthy();
    const saved = await storedPersons(store);
    expect(saved).toEqual([
      expect.objectContaining({
        id: '10001-P1',
        mandateId: '10001',
        role: 'gesellschafter',
        birth: '1975',
      }),
    ]);
  });

  it('shows a message and saves nothing for an invalid person', async () => {
    const store = setup([mandate()]);
    await openEdit();
    click('Person anlegen');
    type('Nachname (Pflicht)', 'Beispiel');
    type(/^Geburtsdatum/, '1975-13');
    click('Person speichern');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Die Person ist ungültig');
    expect(await storedPersons(store)).toEqual([]);
    type('Nachname (Pflicht)', '');
    type(/^Geburtsdatum/, '');
    click('Person speichern');
    expect((await screen.findByRole('alert')).textContent).toContain('Die Person ist ungültig');
    expect(await storedPersons(store)).toEqual([]);
  });

  it('edits a person', async () => {
    const store = setup([mandate()], [person()]);
    await openEdit();
    click(/Person bearbeiten: Erika Beispiel/);
    type('Nachname (Pflicht)', 'Muster');
    type(/^Geburtsdatum/, '1975-03');
    click('Person speichern');
    await screen.findByText('Person Muster gespeichert.');
    const row = screen.getByText('Muster', { selector: 'th' }).closest('tr')!;
    expect(within(row).getByText('03.1975')).toBeTruthy();
    expect(await storedPersons(store)).toEqual([
      expect.objectContaining({ id: '10001-P1', lastName: 'Muster', birth: '1975-03' }),
    ]);
  });

  it('deletes a person only after confirmation; cancel keeps it', async () => {
    const store = setup([mandate()], [person()]);
    await openEdit();
    click(/Person löschen: Erika Beispiel/);
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Abbrechen' }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await storedPersons(store)).toHaveLength(1);
    click(/Person löschen: Erika Beispiel/);
    click('Person endgültig löschen');
    await screen.findByText('Person Beispiel gelöscht.');
    expect(await storedPersons(store)).toEqual([]);
  });

  it('removes the persons together with the mandate and names their number', async () => {
    const store = setup(
      [mandate(), mandate({ id: '10002', name: 'Zweit GmbH' })],
      [
        person(),
        person({ id: '10001-P2', lastName: 'Zwei' }),
        person({ id: '10002-P1', mandateId: '10002' }),
      ],
    );
    fireEvent.click(await screen.findByRole('button', { name: /Löschen: 10001/ }));
    expect(screen.getByRole('alertdialog').textContent).toContain(
      '2 erfasste Personen werden mitgelöscht',
    );
    click('Endgültig löschen');
    await waitFor(() =>
      expect(screen.getByText(/Mandant 10001 Muster GmbH gelöscht/)).toBeTruthy(),
    );
    expect((await storedPersons(store)).map((p) => p.id)).toEqual(['10002-P1']);
  });

  it('lists the number of persons and warns for type C without persons', async () => {
    setup(
      [mandate(), mandate({ id: '10002', name: 'Einzel', legalForm: 'einzelunternehmen' })],
      [person()],
    );
    const row1 = (await screen.findByText('Muster GmbH')).closest('tr')!;
    expect(row1.textContent).not.toContain('Keine Vertreter');
    expect(screen.getByRole('columnheader', { name: 'Personen' })).toBeTruthy();
    cleanup();
    setup([mandate()]);
    const row = (await screen.findByText('Muster GmbH')).closest('tr')!;
    expect(row.textContent).toContain('Keine Vertreter/wirtschaftlich Berechtigten erfasst');
  });
});
