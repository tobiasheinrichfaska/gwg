import { useLayoutEffect, useId, useRef, useState } from 'react';
import { MAX_CLOSING_BY_LENGTH, MAX_CLOSING_NOTE_LENGTH } from '../../../logic/index.ts';

interface Props {
  error: string | null;
  onConfirm(by: string, note: string): void;
  onCancel(): void;
}

/** The program decides nothing legally: a named person confirms that the exception lists were checked. */
export function ClosingDialog({ error, onConfirm, onCancel }: Props) {
  const uid = useId();
  const byRef = useRef<HTMLInputElement>(null);
  const [by, setBy] = useState('');
  const [note, setNote] = useState('');
  useLayoutEffect(() => {
    byRef.current?.focus();
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${uid}-t`}
      aria-describedby={`${uid}-d`}
      className="dialog"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <h3 id={`${uid}-t`}>Audit abschließen</h3>
      <p id={`${uid}-d`}>
        Sie bestätigen, dass die Ausnahmelisten geprüft wurden; das Programm entscheidet nichts
        rechtlich.
      </p>
      <p>
        <label htmlFor={`${uid}-by`}>Name der abschließenden Person</label>
        <br />
        <input
          id={`${uid}-by`}
          ref={byRef}
          value={by}
          maxLength={MAX_CLOSING_BY_LENGTH}
          required
          onChange={(e) => setBy(e.target.value)}
        />
      </p>
      <p>
        <label htmlFor={`${uid}-note`}>Notiz (optional)</label>
        <br />
        <textarea
          id={`${uid}-note`}
          value={note}
          maxLength={MAX_CLOSING_NOTE_LENGTH}
          onChange={(e) => setNote(e.target.value)}
        />
      </p>
      {error !== null && <p role="alert">{error}</p>}
      <button type="button" onClick={onCancel}>
        Abbrechen
      </button>{' '}
      <button type="button" onClick={() => onConfirm(by, note)}>
        Audit abschließen bestätigen
      </button>
    </div>
  );
}
