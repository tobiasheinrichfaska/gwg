// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryStore } from '../../src/io/index.ts';
import { DEFAULT_RULES, serializeBackup, type Backup } from '../../src/logic/index.ts';
import { AppProvider } from '../../src/ui/app/AppProvider.tsx';
import { useApp } from '../../src/ui/app/context.ts';
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

  it('reports text that is not JSON', async () => {
    setup(backup(1));
    await choose('das ist keine Sicherung');
    expect((await screen.findByRole('alert')).textContent).toContain('Code: bad-backup');
  });
});
