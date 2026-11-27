import { useLayoutEffect, useId, useRef, useState } from 'react';
import { BACKUP_WARNING, readBackupFile } from '../../../io/index.ts';
import { parseBackup, type Backup, type Result } from '../../../logic/index.ts';
import { describeFailure } from '../../app/messages.ts';

interface Props {
  /** Mandates now in the app; null while the app is locked (nothing to replace that can be read). */
  currentCount: number | null;
  onRestore(b: Backup): Promise<Result<void>>;
}

/** File input, strict parse, confirmation, then replace. A bad file changes nothing. */
export function RestoreBackup({ currentCount, onRestore }: Props) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (pending) confirmRef.current?.focus();
  }, [pending]);

  async function choose(file: File | undefined) {
    setError(null);
    setDone(null);
    setPending(null);
    if (!file) return;
    try {
      await read(file);
    } catch {
      // Whatever went wrong in reading or checking: a message, never a crashed screen.
      setError(
        'Datei konnte nicht gelesen werden. (Code: bad-backup) Es wurde nichts überschrieben.',
      );
    }
  }

  async function read(file: File) {
    const text = await readBackupFile(file);
    if (!text.ok) {
      setError(
        `Datei nicht eingespielt. ${describeFailure(text.reason, text.where)} Es wurde nichts überschrieben.`,
      );
      return;
    }
    const parsed = parseBackup(text.value);
    if (!parsed.ok) {
      setError(
        `Datei nicht eingespielt. ${describeFailure(parsed.reason, parsed.where)} Es wurde nichts überschrieben.`,
      );
      return;
    }
    setPending(parsed.value);
  }

  async function confirm() {
    if (!pending) return;
    const n = pending.mandates.length;
    const r = await onRestore(pending);
    setPending(null);
    if (r.ok) setDone(`Sicherung eingespielt: ${n} Mandate.`);
    else
      setError(
        `Nicht gespeichert. ${describeFailure(r.reason, r.where)} Der bisherige Bestand bleibt.`,
      );
  }

  return (
    <section>
      <h2>Sicherung einspielen</h2>
      <p>{BACKUP_WARNING}</p>
      <label htmlFor={inputId}>Sicherung einspielen (Datei wählen)</label>{' '}
      <input
        id={inputId}
        type="file"
        accept=".json,application/json"
        onChange={(e) => {
          const input = e.currentTarget;
          void choose(input.files?.[0]).finally(() => {
            input.value = '';
          });
        }}
      />
      {error !== null && <p role="alert">{error}</p>}
      {done !== null && <p role="status">{done}</p>}
      {pending !== null && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`${inputId}-t`}
          className="dialog"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPending(null);
          }}
        >
          <h3 id={`${inputId}-t`}>Bestand ersetzen?</h3>
          <p>
            Die Sicherung enthält {pending.mandates.length} Mandate (erstellt am {pending.createdOn}
            ).
            {currentCount === null
              ? ' Die beschädigten Daten werden ersetzt.'
              : ` Der aktuelle Bestand mit ${currentCount} Mandaten wird ersetzt.`}
          </p>
          <button type="button" ref={confirmRef} onClick={() => void confirm()}>
            Ersetzen
          </button>{' '}
          <button type="button" onClick={() => setPending(null)}>
            Abbrechen
          </button>
        </div>
      )}
    </section>
  );
}
