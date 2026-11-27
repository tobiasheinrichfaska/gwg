import { useLayoutEffect, useId, useRef } from 'react';
import type { Mandate } from '../../../logic/index.ts';
import { Modal } from '../../components/Modal.tsx';

interface Props {
  mandate: Mandate;
  onConfirm(): void;
  onCancel(): void;
}

/** The program decides nothing legally: a person confirms that the review took place. */
export function CheckDialog({ mandate, onConfirm, onCancel }: Props) {
  const uid = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <Modal role="alertdialog" labelledBy={`${uid}-t`} describedBy={`${uid}-d`} onClose={onCancel}>
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
    </Modal>
  );
}
