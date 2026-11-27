import { useLayoutEffect, useId, useRef, useState } from 'react';
import type { EuListFile } from '../../../io/index.ts';
import { isDateKey, type DateKey, type ListIndex } from '../../../logic/index.ts';
import { formatDate } from '../../format.ts';
import { NotesReport } from './NotesReport.tsx';

interface Props {
  file: EuListFile;
  /** State date of the list now stored, if any. */
  currentOn: DateKey | null;
  error: string | null;
  onConfirm(index: ListIndex): void;
  onCancel(): void;
}

/** The date read from the file is only a proposal: a person confirms or corrects it before saving. */
export function ListImportDialog({ file, currentOn, error, onConfirm, onCancel }: Props) {
  const uid = useId();
  const [on, setOn] = useState<string>(file.suggestedOn);
  const dateRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    dateRef.current?.focus();
  }, []);
  const valid = isDateKey(on);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${uid}-t`}
      className="dialog"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <h3 id={`${uid}-t`}>Liste einlesen?</h3>
      <p>
        Die Datei enthält <strong>{file.index.entries.length}</strong> Einträge.
        {currentOn !== null
          ? ` Die gespeicherte Liste (Stand ${formatDate(currentOn)}) wird ersetzt.`
          : ' Es ist noch keine Liste gespeichert.'}
      </p>
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
          if (isDateKey(on)) onConfirm({ ...file.index, fetchedOn: on });
        }}
      >
        Liste speichern
      </button>
    </div>
  );
}
