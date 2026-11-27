import { useLayoutEffect, useId, useRef, useState } from 'react';
import type { EuListFile } from '../../../io/index.ts';
import { isDateKey, shrankTooMuch, type DateKey, type ListIndex } from '../../../logic/index.ts';
import { formatDate } from '../../format.ts';
import { NotesReport } from './NotesReport.tsx';
import { Modal } from '../../components/Modal.tsx';

interface Props {
  file: EuListFile;
  /** State date of the list now stored, if any. */
  currentOn: DateKey | null;
  /** Entries of the list now stored, if any. */
  currentCount: number | null;
  error: string | null;
  onConfirm(index: ListIndex): void;
  onCancel(): void;
}

/** The date read from the file is only a proposal: a person confirms or corrects it before saving. */
export function ListImportDialog({
  file,
  currentOn,
  currentCount,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const uid = useId();
  const [on, setOn] = useState<string>(file.suggestedOn);
  const dateRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    dateRef.current?.focus();
  }, []);
  const [confirmed, setConfirmed] = useState(false);
  const got = file.index.entries.length;
  const shrunk = currentCount !== null && shrankTooMuch(currentCount, got);
  const valid = isDateKey(on) && (!shrunk || confirmed);
  return (
    <Modal role="alertdialog" labelledBy={`${uid}-t`} onClose={onCancel}>
      <h3 id={`${uid}-t`}>Liste einlesen?</h3>
      <p>
        Die Datei enthält <strong>{file.index.entries.length}</strong> Einträge.
        {currentOn !== null
          ? ` Die gespeicherte Liste (Stand ${formatDate(currentOn)}) wird ersetzt.`
          : ' Es ist noch keine Liste gespeichert.'}
      </p>
      {shrunk && (
        <div className="warning" role="note">
          <p>
            ⚠ Starker Schwund: Die neue Liste hat {got} Einträge, die gespeicherte {currentCount}{' '}
            Einträge (weniger als die Hälfte). Das deutet auf eine abgeschnittene oder falsche Datei
            hin.
          </p>
          <p>
            <input
              id={`${uid}-shrunk`}
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            <label htmlFor={`${uid}-shrunk`}>
              Ich habe geprüft, dass die Datei vollständig ist, und ersetze die {currentCount}{' '}
              Einträge durch {got} Einträge.
            </label>
          </p>
        </div>
      )}
      <NotesReport
        title="Übersprungene Einträge"
        notes={file.skipped}
        what="Diese Einträge sind nicht in der Liste und werden nicht abgeglichen."
      />
      <NotesReport
        title="Geänderte Einträge"
        notes={file.adjusted}
        what="Diese Einträge sind in der Liste, aber mit Einschränkung."
      />
      <p className="field">
        <label htmlFor={`${uid}-on`}>
          Stand der Liste (Vorschlag ändern, wenn er nicht stimmt)
        </label>
        <input
          id={`${uid}-on`}
          ref={dateRef}
          type="date"
          value={on}
          onChange={(e) => setOn(e.target.value)}
        />
        <span className="hint">
          {file.suggestedFrom === 'generationDate'
            ? 'Vorschlag: Erstellungsdatum aus der Datei.'
            : 'Vorschlag: Änderungsdatum der Datei (die Datei nennt kein Erstellungsdatum).'}{' '}
          Angezeigt: {isDateKey(on) ? formatDate(on) : 'ungültiges Datum'}.
        </span>
      </p>
      {error !== null && <p role="alert">{error}</p>}
      <button type="button" onClick={onCancel}>
        Abbrechen
      </button>{' '}
      <button
        type="button"
        disabled={!valid}
        onClick={() => {
          if (valid && isDateKey(on)) onConfirm({ ...file.index, fetchedOn: on });
        }}
      >
        Liste speichern
      </button>
    </Modal>
  );
}
