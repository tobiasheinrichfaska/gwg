import { useLayoutEffect, useId, useRef, useState } from 'react';
import { BACKUP_WARNING, readBackupFile } from '../../../io/index.ts';
import {
  parseBackupWithNotes,
  type Backup,
  type BackupNote,
  type Result,
} from '../../../logic/index.ts';
import { describeFailure } from '../../app/messages.ts';
import { describeNotes } from '../../messages.ts';
import { Modal } from '../../components/Modal.tsx';

interface Props {
  /** Mandates now in the app; null while the app is locked (nothing to replace that can be read). */
  currentCount: number | null;
  onRestore(b: Backup): Promise<Result<void>>;
  /** Called after a successful restore with what reading an older file left out (the screen may be gone by then). */
  onNotes?(notes: BackupNote[]): void;
}

/** File input, strict parse, confirmation, then replace. A bad file changes nothing. */
export function RestoreBackup({ currentCount, onRestore, onNotes }: Props) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<BackupNote[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState<{ backup: Backup; notes: BackupNote[] } | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (pending) confirmRef.current?.focus();
  }, [pending]);

  async function choose(file: File | undefined) {
    setError(null);
    setDone(null);
    setNotes([]);
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
    const parsed = parseBackupWithNotes(text.value);
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
    const n = pending.backup.mandates.length;
    const notes = pending.notes;
    const r = await onRestore(pending.backup);
    setPending(null);
    if (r.ok) {
      setDone(`Sicherung eingespielt: ${n} Mandate.`);
      setNotes(notes);
      if (notes.length > 0) onNotes?.(notes);
    } else
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
      {describeNotes(notes).map((t) => (
        <p key={t} role="status">
          {t}
        </p>
      ))}
      {pending !== null && (
        <Modal role="alertdialog" labelledBy={`${inputId}-t`} onClose={() => setPending(null)}>
          <h3 id={`${inputId}-t`}>Bestand ersetzen?</h3>
          <p>
            Die Sicherung enthält {pending.backup.mandates.length} Mandate (erstellt am{' '}
            {pending.backup.createdOn}
            ).
            {currentCount === null
              ? ' Die beschädigten Daten werden ersetzt.'
              : ` Der aktuelle Bestand mit ${currentCount} Mandaten wird ersetzt.`}
          </p>
          {describeNotes(pending.notes).map((t) => (
            <p key={t}>{t}</p>
          ))}
          <button type="button" ref={confirmRef} onClick={() => void confirm()}>
            Ersetzen
          </button>{' '}
          <button type="button" onClick={() => setPending(null)}>
            Abbrechen
          </button>
        </Modal>
      )}
    </section>
  );
}
