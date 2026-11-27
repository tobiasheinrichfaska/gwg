import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import {
  checkPerson,
  isDateKey,
  PEP_ANSWERS,
  type Mandate,
  type PepAnswer,
  type Person,
} from '../../logic/index.ts';
import { useApp } from '../app/context.ts';
import { describeFailure } from '../app/messages.ts';
import { formatDate } from '../format.ts';
import { reasonText } from '../messages.ts';
import { needsApproval, PEP_ANSWER_LABELS, pepConsequences } from '../pep.ts';

interface Props {
  person: Person;
  mandate: Mandate | undefined;
  /** Called after saving (message) or cancelling (null). */
  onClose(message: string | null): void;
}

const STEP_TITLES = [
  'PEP-Selbstauskunft',
  'Funktion',
  'Familie und Nähe',
  'Zusammenfassung',
] as const;

function AnswerRadios({
  legend,
  name,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  value: PepAnswer | '';
  onChange(v: PepAnswer): void;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      {PEP_ANSWERS.map((a) => (
        <p key={a} className="field">
          <input
            id={`${name}-${a}`}
            type="radio"
            name={name}
            checked={value === a}
            onChange={() => onChange(a)}
          />{' '}
          <label htmlFor={`${name}-${a}`}>{PEP_ANSWER_LABELS[a]}</label>
        </p>
      ))}
    </fieldset>
  );
}

/**
 * Guided step "PEP-Selbstauskunft" for one person: one question per step, saved only on the last step
 * (through `checkPerson`). Cancelling discards; nothing is saved before.
 */
export function PepFlow({ person, mandate, onClose }: Props) {
  const { backup, today, replace } = useApp();
  const uid = useId();
  const start = person.pep;
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState<PepAnswer | ''>(start.answer ?? '');
  const [askedOn, setAskedOn] = useState(start.askedOn ?? today);
  const [funktion, setFunktion] = useState(start.funktion);
  const [amtEndedOn, setAmtEndedOn] = useState(start.amtEndedOn ?? '');
  const [nahestehend, setNahestehend] = useState<PepAnswer | ''>(start.nahestehend ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const dirty =
    answer !== (start.answer ?? '') ||
    askedOn !== (start.askedOn ?? today) ||
    funktion !== start.funktion ||
    amtEndedOn !== (start.amtEndedOn ?? '') ||
    nahestehend !== (start.nahestehend ?? '');

  const steps = answer === 'ja' ? [0, 1, 2, 3] : [0, 2, 3];
  const pos = steps.indexOf(step);
  const total = steps.length;
  const title = STEP_TITLES[step];

  function cancel() {
    if (dirty && !confirmDiscard) setConfirmDiscard(true);
    else onClose(null);
  }

  function validate(s: number): string | null {
    if (s === 0) {
      if (answer === '') return 'Bitte eine Antwort wählen: Ja, Nein oder Unbekannt.';
      if (!isDateKey(askedOn)) return 'Bitte das Datum der Auskunft angeben.';
    }
    if (s === 1) {
      if (funktion.trim() === '')
        return 'Bitte die Funktion angeben (Text, höchstens 200 Zeichen).';
      if (amtEndedOn !== '' && !isDateKey(amtEndedOn)) return 'Das Ende des Amtes ist kein Datum.';
    }
    if (s === 2 && nahestehend === '') {
      return 'Bitte eine Antwort wählen: Ja, Nein oder Unbekannt.';
    }
    return null;
  }

  function next() {
    const problem = validate(step);
    setError(problem);
    if (problem === null) setStep(steps[pos + 1] ?? step);
  }
  function back() {
    setError(null);
    setStep(steps[pos - 1] ?? step);
  }

  const draft = {
    answer: answer === '' ? null : answer,
    nahestehend: nahestehend === '' ? null : nahestehend,
  };
  const keepsApproval = needsApproval(draft);
  const consequences = pepConsequences({
    ...draft,
    approvedOn: keepsApproval ? start.approvedOn : null,
    approvedBy: start.approvedBy,
  });

  async function save() {
    if (busy || answer === '' || nahestehend === '') return;
    const isJa = answer === 'ja';
    const p: Person = {
      ...person,
      pep: {
        answer,
        askedOn,
        funktion: isJa ? funktion.trim() : '',
        amtEndedOn: isJa && amtEndedOn !== '' ? amtEndedOn : null,
        nahestehend,
        approvedOn: keepsApproval ? start.approvedOn : null,
        approvedBy: keepsApproval ? start.approvedBy : '',
      },
    };
    const checked = checkPerson(p, backup.mandates);
    if (!checked.ok) {
      setError(`Nicht gespeichert. ${reasonText(checked.reason)}`);
      return;
    }
    setBusy(true);
    const r = await replace({
      ...backup,
      persons: backup.persons.map((x) => (x.id === p.id ? p : x)),
    });
    setBusy(false);
    if (!r.ok) {
      setError(`Nicht gespeichert. ${describeFailure(r.reason)}`);
      return;
    }
    onClose(
      `PEP-Selbstauskunft von ${person.firstName} ${person.lastName} gespeichert. ${consequences.join(' ')}`,
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${uid}-t`}
      className="dialog"
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancel();
      }}
    >
      <h3 id={`${uid}-t`} tabIndex={-1} ref={headingRef}>
        PEP-Selbstauskunft: {person.firstName} {person.lastName}
        {mandate ? ` (Mandat ${mandate.id} ${mandate.name})` : ''}
      </h3>
      <p role="status" aria-live="polite">
        Schritt {pos + 1} von {total}: {title}
      </p>
      <ol className="hint">
        {steps.map((s) => (
          <li key={s} aria-current={s === step ? 'step' : undefined}>
            {STEP_TITLES[s]}
            {s === step ? ' (jetzt)' : ''}
          </li>
        ))}
      </ol>
      {error !== null && <p role="alert">{error}</p>}

      {step === 0 && (
        <>
          <AnswerRadios
            legend="Übt die Person ein hochrangiges öffentliches Amt aus oder hat sie es ausgeübt?"
            name={`${uid}-a`}
            value={answer}
            onChange={setAnswer}
          />
          <p className="field">
            <label htmlFor={`${uid}-d`}>Datum der Auskunft</label>
            <input
              id={`${uid}-d`}
              type="date"
              value={askedOn}
              onChange={(e) => setAskedOn(e.target.value)}
            />
          </p>
          <p className="hint">
            Hilfe: Die amtliche Funktionenliste der EU im Amtsblatt (C/2023/724) hilft bei der
            Einordnung. Nach den Hinweisen der BStBK genügt im Regelfall die Selbstauskunft der
            Person (rechtlich zu bestätigen). Das Programm entscheidet nichts.
          </p>
        </>
      )}
      {step === 1 && (
        <>
          <p className="field">
            <label htmlFor={`${uid}-f`}>Funktion (Pflicht)</label>
            <input
              id={`${uid}-f`}
              type="text"
              value={funktion}
              maxLength={200}
              onChange={(e) => setFunktion(e.target.value)}
            />
          </p>
          <p className="field">
            <label htmlFor={`${uid}-e`}>Ende des Amtes (optional)</label>
            <input
              id={`${uid}-e`}
              type="date"
              value={amtEndedOn}
              onChange={(e) => setAmtEndedOn(e.target.value)}
            />
            <span className="hint">Leer lassen, wenn das Amt noch ausgeübt wird.</span>
          </p>
        </>
      )}
      {step === 2 && (
        <AnswerRadios
          legend="Ist die Person Familienmitglied oder bekanntermaßen nahestehend zu einer PEP?"
          name={`${uid}-n`}
          value={nahestehend}
          onChange={setNahestehend}
        />
      )}
      {step === 3 && (
        <>
          <h4>Zusammenfassung</h4>
          <ul>
            <li>
              Hohes öffentliches Amt: {answer === '' ? '—' : PEP_ANSWER_LABELS[answer]}, Auskunft
              vom {formatDate(askedOn)}
            </li>
            {answer === 'ja' && (
              <li>
                Funktion: {funktion.trim()}
                {amtEndedOn !== '' ? `, Amt beendet am ${formatDate(amtEndedOn)}` : ''}
              </li>
            )}
            <li>
              Familie oder Nähe zu einer PEP:{' '}
              {nahestehend === '' ? '—' : PEP_ANSWER_LABELS[nahestehend]}
            </li>
          </ul>
          <h4>Folgen</h4>
          <ul>
            {consequences.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {!keepsApproval && start.approvedOn !== null && (
            <p className="hint">
              Die frühere Freigabe entfällt, weil keine PEP-Folge mehr besteht.
            </p>
          )}
        </>
      )}

      {confirmDiscard ? (
        <p role="alert">
          Eingaben verwerfen? Es wird nichts gespeichert.{' '}
          <button type="button" autoFocus onClick={() => setConfirmDiscard(false)}>
            Weiter bearbeiten
          </button>{' '}
          <button type="button" onClick={() => onClose(null)}>
            Eingaben verwerfen
          </button>
        </p>
      ) : (
        <p>
          <button type="button" onClick={cancel}>
            Abbrechen
          </button>{' '}
          {pos > 0 && (
            <>
              <button type="button" onClick={back}>
                Zurück
              </button>{' '}
            </>
          )}
          {step < 3 ? (
            <button type="button" onClick={next}>
              Weiter
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void save()}>
              Auskunft speichern
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** Second dialog: the management level signs off; a human confirms, the program decides nothing. */
export function PepApproval({ person, mandate, onClose }: Props) {
  const { backup, today, replace } = useApp();
  const uid = useId();
  const [by, setBy] = useState(person.pep.approvedBy);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  function cancel() {
    if (by !== person.pep.approvedBy && !confirmDiscard) setConfirmDiscard(true);
    else onClose(null);
  }

  async function save() {
    if (busy) return;
    if (by.trim() === '') {
      setError('Bitte den Namen der freigebenden Person eintragen.');
      return;
    }
    const p: Person = {
      ...person,
      pep: { ...person.pep, approvedOn: today, approvedBy: by.trim() },
    };
    const checked = checkPerson(p, backup.mandates);
    if (!checked.ok) {
      setError(`Nicht gespeichert. ${reasonText(checked.reason)}`);
      return;
    }
    setBusy(true);
    const r = await replace({
      ...backup,
      persons: backup.persons.map((x) => (x.id === p.id ? p : x)),
    });
    setBusy(false);
    if (!r.ok) {
      setError(`Nicht gespeichert. ${describeFailure(r.reason)}`);
      return;
    }
    onClose(
      `Freigabe der Führungsebene für ${person.firstName} ${person.lastName} am ${formatDate(today)} durch ${p.pep.approvedBy} gespeichert.`,
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${uid}-t`}
      className="dialog"
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancel();
      }}
    >
      <h3 id={`${uid}-t`} tabIndex={-1} ref={ref}>
        Freigabe der Führungsebene: {person.firstName} {person.lastName}
        {mandate ? ` (Mandat ${mandate.id} ${mandate.name})` : ''}
      </h3>
      <p>Das Programm entscheidet nichts; die Freigabe bestätigt ein Mensch.</p>
      {error !== null && <p role="alert">{error}</p>}
      <p className="field">
        <label htmlFor={`${uid}-n`}>Name der freigebenden Person (Pflicht)</label>
        <input
          id={`${uid}-n`}
          type="text"
          maxLength={100}
          value={by}
          onChange={(e) => setBy(e.target.value)}
        />
      </p>
      <p>Datum der Freigabe: {formatDate(today)}</p>
      {confirmDiscard ? (
        <p role="alert">
          Eingaben verwerfen? Es wird nichts gespeichert.{' '}
          <button type="button" autoFocus onClick={() => setConfirmDiscard(false)}>
            Weiter bearbeiten
          </button>{' '}
          <button type="button" onClick={() => onClose(null)}>
            Eingaben verwerfen
          </button>
        </p>
      ) : (
        <p>
          <button type="button" onClick={cancel}>
            Abbrechen
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => void save()}>
            Freigabe speichern
          </button>
        </p>
      )}
    </div>
  );
}
