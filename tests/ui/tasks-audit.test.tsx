// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryStore, type AppStore } from '../../src/io/index.ts';
import {
  DEFAULT_RULES,
  serializeBackup,
  type Backup,
  type Mandate,
} from '../../src/logic/index.ts';
import { AppProvider } from '../../src/ui/app/AppProvider.tsx';
import { AuditScreen } from '../../src/ui/screens/audit/AuditScreen.tsx';
import { auditText } from '../../src/ui/screens/audit/export.ts';
import { ClientsScreen } from '../../src/ui/screens/clients/ClientsScreen.tsx';
import { OverviewScreen } from '../../src/ui/screens/overview/OverviewScreen.tsx';
import { TasksScreen } from '../../src/ui/screens/tasks/TasksScreen.tsx';
import { auditExceptions } from '../../src/logic/index.ts';
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
  screeningDecisions: [],
  lastScreening: { sanktion: null, pep: null },
});

function setup(ui: React.ReactNode, mandates: Mandate[]) {
  const store = createMemoryStore(serializeBackup(backupOf(mandates)));
  render(
    <AppProvider store={store} now={clock}>
      {ui}
    </AppProvider>,
  );
  return store;
}
async function stored(s: AppStore): Promise<Mandate[]> {
  const r = await s.load();
  if (!r.ok || r.value === null) throw new Error('nothing stored');
  return r.value.mandates;
}

const noRequest = mandate({
  id: '20001',
  name: 'Ohne Anforderung GmbH',
  idStatus: 'leer',
  lastCheckOn: null,
});
// Requested 30 days before 2026-11-27: past the 28-day threat step.
const requested = mandate({
  id: '20002',
  name: 'Angefordert AG',
  idStatus: 'unvollstaendig',
  lastCheckOn: null,
  firstRequestOn: '2026-10-28',
});
const dueReview = mandate({ id: '20003', name: 'Alt KG', lastCheckOn: '2023-11-01' });

describe('tasks screen', () => {
  it('groups the tasks by kind in the order of the logic, with days overdue', async () => {
    setup(<TasksScreen />, [noRequest, requested, dueReview]);
    const headings = (await screen.findAllByRole('heading', { level: 2 })).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual([
      'Androhung senden (1)',
      'Prüfung fällig (1)',
      'Unterlagen anfordern (1)',
    ]);
    const row = screen.getByText('Angefordert AG').closest('tr')!;
    expect(within(row).getByText(/^2 Tage \(seit 25\.11\.2026\)/)).toBeTruthy();
    expect(within(row).getByRole('rowheader').textContent).toBe('20002');
    const none = screen.getByText('Ohne Anforderung GmbH').closest('tr')!;
    expect(within(none).getAllByRole('cell')[1]?.textContent).toBe('—');
  });

  it('says so when nothing is open', async () => {
    setup(<TasksScreen />, [mandate({ lastCheckOn: '2026-11-01' })]);
    expect(await screen.findByText('Keine offenen Aufgaben.')).toBeTruthy();
  });

  it('shows invalid mandates in their own section with the message text', async () => {
    // The strict backup reader refuses such a mandate, so the store hands it over directly.
    const data = backupOf([
      mandate({ id: '30001', name: 'Kaputt GmbH', legalForm: 'gibtsnicht' }),
      noRequest,
    ]);
    const store: AppStore = {
      load: () => Promise.resolve({ ok: true, value: data }),
      save: () => Promise.resolve({ ok: true, value: undefined }),
    };
    render(
      <AppProvider store={store} now={clock}>
        <TasksScreen />
      </AppProvider>,
    );
    const h = await screen.findByRole('heading', { name: 'Nicht prüfbare Mandate (1)' });
    const section = h.closest('section')!;
    expect(section.textContent).toContain('30001 Kaputt GmbH');
    expect(section.textContent).toContain('Bitte eine Rechtsform aus der Liste wählen.');
    expect(section.textContent).toContain('Code: unknown-legal-form');
  });

  it('records the first request as today', async () => {
    const store = setup(<TasksScreen />, [noRequest]);
    fireEvent.click(
      await screen.findByRole('button', { name: /Erste Anforderung heute gesendet: 20001/ }),
    );
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('27.11.2026'));
    expect((await stored(store))[0]?.firstRequestOn).toBe('2026-11-27');
    // The task is gone: the dunning clock starts today.
    expect(screen.queryByText('Unterlagen anfordern (1)')).toBeNull();
  });

  it('cancelling the review dialog changes nothing', async () => {
    const store = setup(<TasksScreen />, [dueReview]);
    fireEvent.click(await screen.findByRole('button', { name: /Prüfung heute abgeschlossen/ }));
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'Sie bestätigen, dass die Prüfung durchgeführt wurde',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((await stored(store))[0]?.lastCheckOn).toBe('2023-11-01');
    expect(screen.getByText('Prüfung fällig (1)')).toBeTruthy();
  });

  it('confirming sets the review date to today and the status to complete', async () => {
    const store = setup(<TasksScreen />, [dueReview]);
    fireEvent.click(await screen.findByRole('button', { name: /Prüfung heute abgeschlossen/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Prüfung bestätigen' }));
    await waitFor(() => expect(screen.queryByText('Prüfung fällig (1)')).toBeNull());
    const m = (await stored(store))[0]!;
    expect(m.lastCheckOn).toBe('2026-11-27');
    expect(m.idStatus).toBe('vollstaendig');
  });

  it('"Mandant öffnen" leaves a request that opens the edit form of the clients screen', async () => {
    const store = createMemoryStore(serializeBackup(backupOf([noRequest])));
    function Both() {
      const [show, setShow] = useState(false);
      return show ? (
        <ClientsScreen />
      ) : (
        <>
          <TasksScreen />
          <button onClick={() => setShow(true)}>weiter</button>
        </>
      );
    }
    render(
      <AppProvider store={store} now={clock}>
        <Both />
      </AppProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Mandant öffnen: 20001/ }));
    expect(screen.getByText(/ist vorgemerkt/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'weiter' }));
    expect(await screen.findByRole('heading', { name: 'Mandant bearbeiten' })).toBeTruthy();
  });
});

describe('audit screen', () => {
  it('lists the four lists with counts and says how many findings remain', async () => {
    setup(<AuditScreen />, [noRequest, requested, dueReview]);
    expect(await screen.findByLabelText('Stichtag')).toBeTruthy();
    // Default cut-off date: 30 November of the current year.
    expect(screen.getByText('30.11.2026', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('Noch 3 Auffälligkeiten.', { exact: false })).toBeTruthy();
    expect(screen.queryByText(/Audit abschließbar/)).toBeNull();
    for (const t of [
      'Ohne Risikogruppe (0)',
      'Nicht identifiziert (1)',
      'Identifizierung stockt (1)',
      'Prüfung überfällig (1)',
    ]) {
      expect(screen.getByRole('heading', { name: t })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: /Mandant öffnen: 20003/ })).toBeTruthy();
  });

  it('is closable only when all lists are empty', async () => {
    setup(<AuditScreen />, [mandate({ lastCheckOn: '2026-11-01' })]);
    expect(await screen.findByText(/Die Ausnahmelisten sind leer/)).toBeTruthy();
    expect(screen.queryByText(/Noch \d+ Auffälligkeit/)).toBeNull();
  });

  it('builds the cut-off list as plain text', () => {
    const e = auditExceptions([noRequest, dueReview], [], '2026-11-27', DEFAULT_RULES);
    const text = auditText(e, '2026-11-27');
    expect(text).toContain('Stichtag 27.11.2026');
    expect(text).toContain('Auffälligkeiten insgesamt: 2');
    expect(text).toContain('Nicht identifiziert (1)\n');
    expect(text).toContain('20001;Ohne Anforderung GmbH');
    expect(text).toContain('20003;Alt KG');
  });

  it('downloads under the date-stamped name', async () => {
    const create = vi.fn(() => 'blob:x');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    setup(<AuditScreen />, [noRequest]);
    fireEvent.click(await screen.findByRole('button', { name: 'Stichtagsliste herunterladen' }));
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });
});

describe('overview screen', () => {
  it('shows active mandates, tasks per kind and audit findings', async () => {
    setup(<OverviewScreen />, [
      noRequest,
      requested,
      dueReview,
      mandate({ id: '20004', name: 'Weg', active: false, endedOn: '2030-01-01' }),
    ]);
    expect(await screen.findByText(/Aktive Mandate:/)).toBeTruthy();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Aktive Mandate: 3 (von 4)');
    expect(text).toContain('Androhung senden: 1');
    expect(text).toContain('Prüfung fällig: 1');
    expect(text).toContain('Unterlagen anfordern: 1');
    expect(text).toContain('Auffälligkeiten zum Stichtag: 3');
  });
});
