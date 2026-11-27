import { useEffect, useId, useRef } from 'react';
import type { Mandate } from '../../../logic/index.ts';

interface Props {
  mandate: Mandate;
  onConfirm(): void;
  onCancel(): void;
}

/** The program decides nothing legally: a person confirms that the review took place. */
export function CheckDialog({ mandate, onConfirm, onCancel }: Props) {
  const uid = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${uid}-t`}
      aria-describedby={`${uid}-d`}
      className="dialog"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <h3 id={`${uid}-t`}>
        Prüfung für {mandate.id} {mandate.name} abschließen?
      </h3>
      <p id={`${uid}-d`}>
        Sie bestätigen, dass die Prüfung durchgeführt wurde. Das Programm entscheidet nichts
        rechtlich; es vermerkt das heutige Datum als letzte Prüfung und setzt den Status auf
        „vollständig“.
      </p>
      <button type="button" ref={cancelRef} onClick={onCancel}>
        Abbrechen
      </button>{' '}
      <button type="button" onClick={onConfirm}>
        Prüfung bestätigen
      </button>
    </div>
  );
}
