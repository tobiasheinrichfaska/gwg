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
import { ClientsScreen } from '../../src/ui/screens/clients/ClientsScreen.tsx';
import { TasksScreen } from '../../src/ui/screens/tasks/TasksScreen.tsx';
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

function setup(ui: 'clients' | 'tasks', persons: Person[], mandates: Mandate[] = [mandate()]) {
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
      {ui === 'clients' ? <ClientsScreen /> : <TasksScreen />}
    </AppProvider>,
  );
  return store;
}
async function stored(s: AppStore): Promise<Person[]> {
  const r = await s.load();
  if (!r.ok || r.value === null) throw new Error('nothing stored');
  return r.value.persons;
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const radio = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));
const openFlowFromClients = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Bearbeiten: 10001/ }));
  click(/PEP-Auskunft erfassen: Erika/);
};

describe('PEP-Selbstauskunft (Schrittfolge)', () => {
  it('führt bei "ja" durch vier Schritte und speichert erst am Ende', async () => {
    const store = setup('clients', [person()]);
    await openFlowFromClients();
    expect(screen.getByText('Schritt 1 von 3: PEP-Selbstauskunft')).toBeTruthy();
    expect(screen.getByText(/C\/2023\/724/)).toBeTruthy();
    expect(screen.getByText(/rechtlich zu bestätigen/)).toBeTruthy();

    click('Weiter');
    expect(screen.getByRole('alert').textContent).toMatch(/Antwort wählen/);
    radio('Ja');
    expect(screen.getByText('Schritt 1 von 4: PEP-Selbstauskunft')).toBeTruthy();
    click('Weiter');

    expect(screen.getByText('Schritt 2 von 4: Funktion')).toBeTruthy();
    click('Weiter');
    expect(screen.getByRole('alert').textContent).toMatch(/Funktion/);
    fireEvent.change(screen.getByLabelText(/Funktion \(Pflicht\)/), {
      target: { value: 'Staatssekretärin' },
    });
    click('Weiter');

    expect(screen.getByText('Schritt 3 von 4: Familie und Nähe')).toBeTruthy();
    radio('Nein');
    click('Weiter');

    expect(screen.getByText('Schritt 4 von 4: Zusammenfassung')).toBeTruthy();
    expect(screen.getByText('Das Mandat wird als Risikoklasse hoch geführt.')).toBeTruthy();
    expect(screen.getByText('Freigabe durch die Führungsebene erforderlich.')).toBeTruthy();
    expect((await stored(store))[0]!.pep.answer).toBeNull();

    click('Auskunft speichern');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const p = (await stored(store))[0]!;
    expect(p.pep).toMatchObject({
      answer: 'ja',
      askedOn: '2026-11-27',
      funktion: 'Staatssekretärin',
      nahestehend: 'nein',
      approvedOn: null,
    });
  });

  it('Zurück ändert nichts, Eingaben bleiben', async () => {
    setup('clients', [person()]);
    await openFlowFromClients();
    radio('Nein');
    click('Weiter');
    expect(screen.getByText('Schritt 2 von 3: Familie und Nähe')).toBeTruthy();
    click('Zurück');
    expect((screen.getByRole('radio', { name: 'Nein' }) as HTMLInputElement).checked).toBe(true);
  });

  it('Abbruch speichert nichts; mit Eingaben fragt er nach', async () => {
    const store = setup('clients', [person()]);
    await openFlowFromClients();
    radio('Ja');
    const cancel = () =>
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Abbrechen' }),
      );
    cancel();
    expect(screen.getByRole('alert').textContent).toMatch(/Eingaben verwerfen/);
    click('Weiter bearbeiten');
    expect(screen.getByRole('dialog')).toBeTruthy();
    cancel();
    click('Eingaben verwerfen');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await stored(store))[0]!.pep).toEqual(emptyPep());
  });

  it.each([
    ['Nein', 'Nein', 'Keine PEP-Folgen'],
    ['Unbekannt', 'Nein', 'Auskunft unbekannt: Aufgabe bleibt offen.'],
    ['Nein', 'Ja', 'Freigabe durch die Führungsebene erforderlich.'],
    ['Nein', 'Unbekannt', 'Nähe zu einer PEP unbekannt'],
  ])('Folgen-Text für Antwort %s / nahestehend %s', async (a, n, text) => {
    setup('clients', [person()]);
    await openFlowFromClients();
    radio(a!);
    click('Weiter');
    radio(n!);
    click('Weiter');
    expect(screen.getByText(new RegExp(text!))).toBeTruthy();
  });

  it('Freigabe der Führungsebene: Name Pflicht, speichert Datum heute und Name', async () => {
    const store = setup('clients', [
      person({ pep: { ...emptyPep(), answer: 'ja', askedOn: '2026-11-20', funktion: 'Minister' } }),
    ]);
    fireEvent.click(await screen.findByRole('button', { name: /Bearbeiten: 10001/ }));
    click(/Freigabe erfassen: Erika/);
    expect(
      screen.getByText('Das Programm entscheidet nichts; die Freigabe bestätigt ein Mensch.'),
    ).toBeTruthy();
    click('Freigabe speichern');
    expect(screen.getByRole('alert').textContent).toMatch(/Name/);
    fireEvent.change(screen.getByLabelText(/Name der freigebenden Person/), {
      target: { value: 'Dr. Leitung' },
    });
    click('Freigabe speichern');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const p = (await stored(store))[0]!;
    expect(p.pep.approvedOn).toBe('2026-11-27');
    expect(p.pep.approvedBy).toBe('Dr. Leitung');
    expect(screen.queryByRole('button', { name: /Freigabe erfassen/ })).toBeNull();
    expect(screen.getByText(/Freigabe 27\.11\.2026 \(Dr\. Leitung\)/)).toBeTruthy();
  });
});

describe('Aufgabenliste und Kennzeichen', () => {
  const asked = person({
    pep: { ...emptyPep(), answer: 'ja', askedOn: '2026-11-20', funktion: 'Minister' },
  });

  it('zeigt beide Arten; der Knopf öffnet den Schritt', async () => {
    const store = setup('tasks', [
      asked,
      person({ id: '10001-P2', lastName: 'Muster', firstName: 'Max' }),
    ]);
    expect(
      await screen.findByRole('heading', { name: /PEP-Selbstauskunft einholen \(1\)/ }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Freigabe der Führungsebene \(1\)/ })).toBeTruthy();

    click(/^Freigabe erfassen: 10001 Erika/);
    fireEvent.change(screen.getByLabelText(/Name der freigebenden Person/), {
      target: { value: 'Leitung' },
    });
    click('Freigabe speichern');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored(store))[0]!.pep.approvedBy).toBe('Leitung');
    expect(screen.queryByRole('heading', { name: /Freigabe der Führungsebene/ })).toBeNull();

    click(/^Auskunft erfassen: 10001 Max/);
    expect(screen.getByText('Schritt 1 von 3: PEP-Selbstauskunft')).toBeTruthy();
  });

  it('Mandantenliste zeigt PEP-betroffen mit Symbol und Risikoklasse hoch', async () => {
    setup('clients', [asked]);
    const row = (await screen.findByText('Muster GmbH')).closest('tr')!;
    expect(within(row).getByText(/PEP-betroffen/).textContent).toContain('⚠');
    expect(within(row).getByText(/hoch/)).toBeTruthy();
  });

  it('kein Kennzeichen ohne PEP', async () => {
    setup('clients', [person()]);
    await screen.findByText('Muster GmbH');
    expect(screen.queryByText(/PEP-betroffen/)).toBeNull();
  });

  it('Personenliste zeigt Antwort und Datum', async () => {
    setup('clients', [asked]);
    fireEvent.click(await screen.findByRole('button', { name: /Bearbeiten: 10001/ }));
    expect(screen.getByText(/PEP: Ja \(20\.11\.2026\)/)).toBeTruthy();
    expect(screen.getByText(/Freigabe offen/)).toBeTruthy();
  });
});
