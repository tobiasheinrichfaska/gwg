// @vitest-environment jsdom
import { useRef, useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryStore } from '../../src/io/index.ts';
import {
  DEFAULT_RULES,
  emptyPep,
  serializeBackup,
  type Backup,
  type ListIndex,
  type Person,
} from '../../src/logic/index.ts';
import { AppProvider } from '../../src/ui/app/AppProvider.tsx';
import { useApp } from '../../src/ui/app/context.ts';
import { Modal } from '../../src/ui/components/Modal.tsx';
import { PepApproval, PepFlow } from '../../src/ui/components/PepFlow.tsx';
import { ClosingDialog } from '../../src/ui/screens/audit/ClosingDialog.tsx';
import { OrphanRepairSection } from '../../src/ui/screens/backup/OrphanRepairSection.tsx';
import { RestoreBackup } from '../../src/ui/screens/backup/RestoreBackup.tsx';
import { DeleteDialog } from '../../src/ui/screens/clients/DeleteDialog.tsx';
import { PersonsSection } from '../../src/ui/screens/clients/PersonsSection.tsx';
import { ListImportDialog } from '../../src/ui/screens/sanctions/ListImportDialog.tsx';
import { CheckDialog } from '../../src/ui/screens/tasks/CheckDialog.tsx';
import { mandate } from '../helpers.ts';
import { expectModalKeyboard } from './modal-helper.tsx';

afterEach(cleanup);

const clock = () => new Date(2026, 10, 27, 12, 0, 0);

/** A page with an opener button, an unrelated paragraph, and the dialog while `open`. */
function Host({ children }: { children(close: () => void): ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <p>Seiteninhalt</p>
      <button type="button" onClick={() => setOpen(true)}>
        Öffnen
      </button>
      {open && children(() => setOpen(false))}
    </main>
  );
}
const openerOf = () => screen.getByRole('button', { name: 'Öffnen' });
const clickOpener = () => fireEvent.click(openerOf());

describe('Modal', () => {
  it('starts on the given element and traps the focus', async () => {
    function Probe() {
      const ref = useRef<HTMLInputElement>(null);
      return (
        <Host>
          {(close) => (
            <Modal labelledBy="t" initialFocus={ref} onClose={close}>
              <h3 id="t">Titel</h3>
              <button type="button">Eins</button>
              <input ref={ref} aria-label="Zwei" />
            </Modal>
          )}
        </Host>
      );
    }
    render(<Probe />);
    await expectModalKeyboard({
      opener: openerOf(),
      open: clickOpener,
      role: 'dialog',
      name: /Titel/,
      startFocus: /Zwei/,
    });
  });

  it('ignores Escape for a compulsory step and says why', async () => {
    render(
      <Host>
        {(close) => (
          <Modal labelledBy="t" onClose={close} dismissible={false} lockedReason="Pflichtschritt.">
            <h3 id="t">Pflicht</h3>
            <button type="button">Weiter</button>
          </Modal>
        )}
      </Host>,
    );
    clickOpener();
    await screen.findByRole('dialog', { name: 'Pflicht' });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Pflicht' })).toBeTruthy();
    expect(screen.getByText('Pflichtschritt.')).toBeTruthy();
  });
});

describe('every dialog: start focus, Escape, focus trap, focus back', () => {
  it('DeleteDialog (step 1, starts on "Abbrechen")', async () => {
    render(
      <Host>
        {(close) => (
          <DeleteDialog
            mandate={mandate({ active: true })}
            personCount={0}
            rules={DEFAULT_RULES}
            today="2026-11-27"
            onConfirm={close}
            onCancel={close}
          />
        )}
      </Host>,
    );
    await expectModalKeyboard({
      opener: openerOf(),
      open: clickOpener,
      role: 'alertdialog',
      name: /löschen\?/,
      startFocus: /Abbrechen/,
    });
  });

  it('ClosingDialog (starts on the name field)', async () => {
    render(
      <Host>
        {(close) => <ClosingDialog error={null} warnings={[]} onConfirm={close} onCancel={close} />}
      </Host>,
    );
    await expectModalKeyboard({
      opener: openerOf(),
      open: clickOpener,
      role: 'dialog',
      name: /Audit abschließen/,
    });
  });

  it('CheckDialog (review confirmation)', async () => {
    render(
      <Host>
        {(close) => <CheckDialog mandate={mandate()} onConfirm={close} onCancel={close} />}
      </Host>,
    );
    await expectModalKeyboard({
      opener: openerOf(),
      open: clickOpener,
      role: 'alertdialog',
      name: /Prüfung für/,
      startFocus: /Abbrechen/,
    });
  });

  it('ListImportDialog', async () => {
    const index: ListIndex = {
      source: 'Test',
      kind: 'sanktion',
      fetchedOn: '2026-11-20',
      entries: [],
    };
    render(
      <Host>
        {(close) => (
          <ListImportDialog
            file={{
              index,
              skipped: [],
              adjusted: [],
              suggestedOn: '2026-11-20',
              suggestedFrom: 'generationDate',
            }}
            today="2026-11-27"
            currentOn={null}
            currentCount={null}
            error={null}
            onConfirm={close}
            onCancel={close}
          />
        )}
      </Host>,
    );
    await expectModalKeyboard({
      opener: openerOf(),
      open: clickOpener,
      role: 'alertdialog',
      name: /Liste einlesen/,
    });
  });

  it('OrphanRepairSection (repair dialog)', async () => {
    const data = backupOf([mandate()], []);
    render(
      <OrphanRepairSection
        repair={{ backup: data, removed: 2 }}
        onRepair={() => Promise.resolve({ ok: true, value: undefined })}
      />,
    );
    await expectModalKeyboard({
      opener: screen.getByRole('button', { name: /Verwaiste Einträge entfernen und fortfahren/ }),
      open: () =>
        fireEvent.click(
          screen.getByRole('button', { name: /Verwaiste Einträge entfernen und fortfahren/ }),
        ),
      role: 'alertdialog',
      name: /Entscheidungen entfernen/,
      startFocus: /Abbrechen/,
    });
  });

  it('RestoreBackup confirmation', async () => {
    render(
      <RestoreBackup
        currentCount={1}
        onRestore={() => Promise.resolve({ ok: true, value: undefined })}
      />,
    );
    const input = screen.getByLabelText(/Sicherung einspielen/);
    await expectModalKeyboard({
      opener: input,
      open: () =>
        fireEvent.change(input, {
          target: { files: [new File([serializeBackup(backupOf([mandate()], []))], 'x.gwg.json')] },
        }),
      role: 'alertdialog',
      name: /Bestand ersetzen/,
      startFocus: /Ersetzen/,
    });
  });
});

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
function backupOf(mandates: Backup['mandates'], persons: Person[]): Backup {
  return {
    format: 'gwg-backup',
    version: 3,
    createdOn: '2026-11-27',
    rules: DEFAULT_RULES,
    mandates,
    persons,
    auditClosings: [],
    screeningDecisions: [],
    lastScreening: { sanktion: null, pep: null },
  };
}
const inApp = (ui: ReactNode) =>
  render(
    <AppProvider
      store={createMemoryStore(serializeBackup(backupOf([mandate()], [person()])))}
      now={clock}
    >
      {ui}
    </AppProvider>,
  );

describe('dialogs that need the data set', () => {
  it('PersonsSection: delete a person', async () => {
    inApp(<PersonsSection mandateId="10001" />);
    const opener = await screen.findByRole('button', { name: /Person löschen: Erika Beispiel/ });
    await expectModalKeyboard({
      opener,
      open: () => fireEvent.click(opener),
      role: 'alertdialog',
      name: /Person Erika Beispiel löschen/,
      startFocus: /Abbrechen/,
    });
  });

  it('PepFlow (self-disclosure) and PepApproval', async () => {
    function Pep({ approval }: { approval: boolean }) {
      const { backup } = useApp();
      const Dialog = approval ? PepApproval : PepFlow;
      const p = backup.persons[0];
      if (p === undefined) return null;
      return (
        <Host>{(close) => <Dialog person={p} mandate={backup.mandates[0]} onClose={close} />}</Host>
      );
    }
    inApp(<Pep approval={false} />);
    await waitFor(() => screen.getByRole('button', { name: 'Öffnen' }));
    await expectModalKeyboard({
      opener: openerOf(),
      open: clickOpener,
      role: 'dialog',
      name: /PEP-Selbstauskunft/,
    });
    cleanup();
    inApp(<Pep approval />);
    await waitFor(() => screen.getByRole('button', { name: 'Öffnen' }));
    await expectModalKeyboard({
      opener: openerOf(),
      open: clickOpener,
      role: 'dialog',
      name: /Freigabe der Führungsebene/,
    });
  });
});
