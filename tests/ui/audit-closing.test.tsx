// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryStore, type AppStore } from '../../src/io/index.ts';
import {
  auditExceptions,
  DEFAULT_RULES,
  serializeBackup,
  type AuditClosing,
  type Backup,
  type Mandate,
} from '../../src/logic/index.ts';
import { AppProvider } from '../../src/ui/app/AppProvider.tsx';
import { AuditScreen } from '../../src/ui/screens/audit/AuditScreen.tsx';
import { auditText } from '../../src/ui/screens/audit/export.ts';
import { OverviewScreen } from '../../src/ui/screens/overview/OverviewScreen.tsx';
import { defaultStichtag } from '../../src/ui/screens/audit/stichtag.ts';
import { mandate } from '../helpers.ts';

afterEach(cleanup);

// 2026-12-05: after the default cut-off date (30.11.2026), so closing is possible.
const clock = () => new Date(2026, 11, 5, 12, 0, 0);
const backupOf = (mandates: Mandate[], auditClosings: AuditClosing[] = []): Backup => ({
  format: 'gwg-backup',
  version: 2,
  createdOn: '2026-12-05',
  rules: DEFAULT_RULES,
  mandates,
  persons: [],
  auditClosings,
  screeningDecisions: [],
  lastScreening: { sanktion: null, pep: null },
});
function setup(ui: React.ReactNode, b: Backup) {
  const store = createMemoryStore(serializeBackup(b));
  render(
    <AppProvider store={store} now={clock}>
      {ui}
    </AppProvider>,
  );
  return store;
}
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
