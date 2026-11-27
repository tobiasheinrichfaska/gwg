import { useId, useMemo, useState } from 'react';
import { auditFileName, downloadText } from '../../../io/index.ts';
import {
  auditExceptions,
  auditIsClean,
  checkAuditClosing,
  type DateKey,
  isDateKey,
} from '../../../logic/index.ts';
import { describeFailure } from '../../app/messages.ts';
import { useApp } from '../../app/context.ts';
import { OpenClient } from '../../components/OpenClient.tsx';
import { formatDate } from '../../format.ts';
import { ClosingBlockerList } from './ClosingBlockers.tsx';
import { ClosingDialog } from './ClosingDialog.tsx';
import { defaultStichtag } from './stichtag.ts';
import { AUDIT_LISTS, auditText, countFindings } from './export.ts';
import { Modal } from '../../components/Modal.tsx';

export function AuditScreen() {
  const { backup, today, update, closing: closingCheck } = useApp();
  const uid = useId();
  const [stichtag, setStichtag] = useState<DateKey>(() => defaultStichtag(today));
  const [dialog, setDialog] = useState<'close' | 'reopen' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exceptions = useMemo(
    () => auditExceptions(backup.mandates, backup.persons, stichtag, backup.rules),
    [backup, stichtag],
  );
  const clean = auditIsClean(exceptions);
  const count = countFindings(exceptions);
  const closing = backup.auditClosings.find((c) => c.stichtag === stichtag) ?? null;
  // Does the closed audit still hold? Same lists, calculated with today.
  const reopened = useMemo(
    () =>
      closing !== null &&
      !auditIsClean(
        auditExceptions(
          backup.mandates,
          backup.persons,
          today > stichtag ? today : stichtag,
          backup.rules,
        ),
      ),
    [closing, backup, today, stichtag],
  );

  async function close(by: string, note: string) {
    const c = checkAuditClosing({ stichtag, closedOn: today, by: by.trim(), note });
    if (!c.ok) return setError(describeFailure(c.reason, c.where));
    const r = await update((b) => ({ ...b, auditClosings: [...b.auditClosings, c.value] }));
    if (!r.ok) return setError(describeFailure(r.reason, r.where));
    setError(null);
    setDialog(null);
  }
  async function reopen() {
    const r = await update((b) => ({
      ...b,
      auditClosings: b.auditClosings.filter((c) => c.stichtag !== stichtag),
    }));
    if (!r.ok) return setError(describeFailure(r.reason, r.where));
    setError(null);
    setDialog(null);
  }

  return (
    <section aria-labelledby={`${uid}-h`}>
      <h1 id={`${uid}-h`}>Audit</h1>
      <p>
        <label htmlFor={`${uid}-st`}>Stichtag</label>{' '}
        <input
          id={`${uid}-st`}
          type="date"
          value={stichtag}
          onChange={(e) => {
            if (isDateKey(e.target.value)) setStichtag(e.target.value);
          }}
        />{' '}
        (angezeigt: <strong>{formatDate(stichtag)}</strong>). Das Jahresaudit ist für den Zeitraum
        1. bis 30. November vorgesehen; der Zeitraum wird hier nur angezeigt, nicht geprüft.
      </p>
      {clean ? (
        <p role="status">
          {closingCheck.blockers.length === 0
            ? 'Audit abschließbar: keine Auffälligkeiten.'
            : 'Die Ausnahmelisten sind leer, der Abschluss ist aber noch gesperrt (Gründe unten).'}
        </p>
      ) : (
        <p role="status">
          Noch {count} {count === 1 ? 'Auffälligkeit' : 'Auffälligkeiten'}. Das Audit ist erst
          abschließbar, wenn alle Listen leer sind.
        </p>
      )}
      {closing !== null ? (
        <div>
          <p>
            Abgeschlossen am <strong>{formatDate(closing.closedOn)}</strong> durch{' '}
            <strong>{closing.by}</strong>
            {closing.note !== '' && <> ({closing.note})</>}.
          </p>
          {reopened && (
            <p role="alert">
              Seit dem Abschluss sind Auffälligkeiten entstanden. Prüfen Sie die Listen unten; der
              Abschluss bleibt unverändert bestehen.
            </p>
          )}
          <p>
            <button type="button" onClick={() => setDialog('reopen')}>
              Abschluss zurücknehmen
            </button>
          </p>
        </div>
      ) : clean ? (
        today < stichtag ? (
          <p className="hint">
            Der Stichtag liegt in der Zukunft; abgeschlossen werden kann ab dem{' '}
            {formatDate(stichtag)}.
          </p>
        ) : (
          <div>
            <p>
              <button
                type="button"
                disabled={closingCheck.blockers.length > 0}
                onClick={() => setDialog('close')}
              >
                Audit abschließen
              </button>
            </p>
            <ClosingBlockerList blockers={closingCheck.blockers} />
          </div>
        )
      ) : null}
      {dialog === 'close' && (
        <ClosingDialog
          error={error}
          warnings={closingCheck.warnings}
          onConfirm={(by, note) => void close(by, note)}
          onCancel={() => {
            setError(null);
            setDialog(null);
          }}
        />
      )}
      {dialog === 'reopen' && (
        <Modal role="alertdialog" labelledBy={`${uid}-rt`} onClose={() => setDialog(null)}>
          <h3 id={`${uid}-rt`}>Abschluss vom {formatDate(stichtag)} zurücknehmen?</h3>
          <p>Der gespeicherte Abschluss wird gelöscht; das Audit gilt danach wieder als offen.</p>
          {error !== null && <p role="alert">{error}</p>}
          <button type="button" onClick={() => setDialog(null)}>
            Abbrechen
          </button>{' '}
          <button type="button" onClick={() => void reopen()}>
            Abschluss zurücknehmen bestätigen
          </button>
        </Modal>
      )}
      <p>
        <button
          type="button"
          onClick={() =>
            downloadText(auditText(exceptions, stichtag, closing), auditFileName(today))
          }
        >
          Stichtagsliste herunterladen
        </button>
      </p>
      {AUDIT_LISTS.map(({ key, title, text }) => {
        const list = exceptions[key];
        return (
          <section key={key} aria-labelledby={`${uid}-${key}`}>
            <h2 id={`${uid}-${key}`}>
              {title} ({list.length})
            </h2>
            <p>{text}</p>
            {list.length === 0 ? (
              <p>Keine Auffälligkeiten.</p>
            ) : (
              <ul>
                {list.map((m) => (
                  <li key={m.id}>
                    {m.id} {m.name} <OpenClient id={m.id} name={m.name} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}
