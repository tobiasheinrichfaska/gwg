import { useLayoutEffect, useId, useRef, useState } from 'react';
import {
  MAX_CLOSING_BY_LENGTH,
  MAX_CLOSING_NOTE_LENGTH,
  type ClosingWarning,
} from '../../../logic/index.ts';
import { ClosingWarnings } from './ClosingBlockers.tsx';
import { Modal } from '../../components/Modal.tsx';

interface Props {
  error: string | null;
  warnings: readonly ClosingWarning[];
  onConfirm(by: string, note: string): void;
  onCancel(): void;
}

/** The program decides nothing legally: a named person confirms that the exception lists were checked. */
export function ClosingDialog({ error, warnings, onConfirm, onCancel }: Props) {
  const uid = useId();
  const byRef = useRef<HTMLInputElement>(null);
  const [by, setBy] = useState('');
  const [note, setNote] = useState('');
  useLayoutEffect(() => {
    byRef.current?.focus();
  }, []);
  return (
    <Modal labelledBy={`${uid}-t`} describedBy={`${uid}-d`} onClose={onCancel}>
      <h3 id={`${uid}-t`}>Audit abschließen</h3>
      <p id={`${uid}-d`}>
        Sie bestätigen, dass die Ausnahmelisten geprüft wurden; das Programm entscheidet nichts
        rechtlich.
      </p>
      <ClosingWarnings warnings={warnings} />
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
    </Modal>
  );
}
