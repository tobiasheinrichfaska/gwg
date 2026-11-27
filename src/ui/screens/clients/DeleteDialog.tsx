import { useLayoutEffect, useId, useRef, useState } from 'react';
import {
  retentionDueFrom,
  type DateKey,
  type Mandate,
  type RulesConfig,
} from '../../../logic/index.ts';
import { formatDate } from '../../format.ts';
import { retentionSentence } from '../../messages.ts';

interface Props {
  mandate: Mandate;
  /** Persons of the mandate; they are deleted with it. */
  personCount: number;
  rules: RulesConfig;
  today: DateKey;
  onConfirm(): void;
  onCancel(): void;
}

const MIN_EARLY_REASON = 10;
const MAX_EARLY_REASON = 200;
const isControl = (c: string): boolean => {
  const n = c.charCodeAt(0);
  return n < 0x20 || (n >= 0x7f && n <= 0x9f) || n === 0x2028 || n === 0x2029;
};

/** Early deletion: reason of one line, 10 to 200 characters. It is only asked for, never stored. */
function earlyReasonOk(reason: string): boolean {
  const t = reason.trim();
  return (
    t.length >= MIN_EARLY_REASON &&
    reason.length <= MAX_EARLY_REASON &&
    ![...reason].some(isControl)
  );
}

/**
 * After the retention period (ended mandate, `today >= retentionDueFrom`) one confirmation is enough.
 * Otherwise (period still running, mandate active, no end date) a second step asks for a reason.
 */
export function DeleteDialog({ mandate, personCount, rules, today, onConfirm, onCancel }: Props) {
  const uid = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState('');
  const due = mandate.active ? null : retentionDueFrom(mandate.endedOn, rules);
  const early = due === null || today < due;
  useLayoutEffect(() => {
    (step === 1 ? cancelRef : reasonRef).current?.focus();
  }, [step]);
  const why =
    due !== null
      ? `Die Aufbewahrungsfrist läuft noch bis ${formatDate(due)}.`
      : mandate.active
        ? 'Das Mandat ist aktiv.'
        : 'Es ist kein Ende des Mandats eingetragen.';
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
        Mandant {mandate.id} {mandate.name} {step === 1 ? 'löschen?' : 'vorzeitig löschen?'}
      </h3>
      {step === 1 ? (
        <>
          <p id={`${uid}-d`}>
            {retentionSentence(mandate, rules, today)}{' '}
            {personCount === 0
              ? 'Es sind keine Personen erfasst.'
              : personCount === 1
                ? '1 erfasste Person wird mitgelöscht.'
                : `${personCount} erfasste Personen werden mitgelöscht.`}{' '}
            Das Löschen kann nicht rückgängig gemacht werden.
          </p>
          <button type="button" ref={cancelRef} onClick={onCancel}>
            Abbrechen
          </button>{' '}
          {early ? (
            <button type="button" onClick={() => setStep(2)}>
              Weiter
            </button>
          ) : (
            <button type="button" onClick={onConfirm}>
              Endgültig löschen
            </button>
          )}
        </>
      ) : (
        <>
          <p id={`${uid}-d`}>
            {why} Löschen vor Ablauf der Frist ist rechtlich zu klären. Das Löschen kann nicht
            rückgängig gemacht werden.
          </p>
          <p>
            <label htmlFor={`${uid}-r`}>Grund für die vorzeitige Löschung</label>
            <br />
            <input
              id={`${uid}-r`}
              ref={reasonRef}
              value={reason}
              maxLength={MAX_EARLY_REASON}
              required
              aria-describedby={`${uid}-h`}
              onChange={(e) => setReason(e.target.value)}
            />
          </p>
          <p id={`${uid}-h`} className="hint">
            Mindestens {MIN_EARLY_REASON} Zeichen, eine Zeile. Der Grund wird nicht gespeichert;
            halten Sie ihn selbst fest.
          </p>
          <button type="button" onClick={onCancel}>
            Abbrechen
          </button>{' '}
          <button type="button" disabled={!earlyReasonOk(reason)} onClick={onConfirm}>
            Trotzdem löschen
          </button>
        </>
      )}
    </div>
  );
}
