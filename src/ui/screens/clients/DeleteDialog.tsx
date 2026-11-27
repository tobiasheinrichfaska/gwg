import { useEffect, useId, useRef } from 'react';
import { type DateKey, type Mandate, type RulesConfig } from '../../../logic/index.ts';
import { retentionSentence } from '../../messages.ts';

interface Props {
  mandate: Mandate;
  rules: RulesConfig;
  today: DateKey;
  onConfirm(): void;
  onCancel(): void;
}

export function DeleteDialog({ mandate, rules, today, onConfirm, onCancel }: Props) {
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
        Mandant {mandate.id} {mandate.name} löschen?
      </h3>
      <p id={`${uid}-d`}>
        {retentionSentence(mandate, rules, today)} Das Löschen kann nicht rückgängig gemacht werden.
      </p>
      <button type="button" ref={cancelRef} onClick={onCancel}>
        Abbrechen
      </button>{' '}
      <button type="button" onClick={onConfirm}>
        Endgültig löschen
      </button>
    </div>
  );
}
