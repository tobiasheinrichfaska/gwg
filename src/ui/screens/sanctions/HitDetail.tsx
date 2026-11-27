import { useLayoutEffect, useId, useMemo, useRef, useState } from 'react';
import {
  checkDecision,
  currentSnapshot,
  entrySnapshot,
  MAX_DECIDER_LENGTH,
  MAX_DECISION_REASON,
  type DecisionKind,
  type ScreeningDecision,
} from '../../../logic/index.ts';
import { describeFailure } from '../../app/messages.ts';
import { useApp } from '../../app/context.ts';
import { OpenClient } from '../../components/OpenClient.tsx';
import { formatDate, NONE } from '../../format.ts';
import { findCase, type HitCase } from './cases.ts';
import { describeSubject, formatListBirth, percent } from './subjects.ts';
import { EXCLUSION_REASONS, LIGHT_EXPLANATIONS, LIGHT_LABELS } from './texts.ts';

export const LEADERSHIP_NOTE =
  'Bereitstellungsverbot und Meldeweg: Entscheidung der Leitung; das Programm meldet nichts selbst.';

const NAME_MISSING = 'Bitte tragen Sie den Namen der entscheidenden Person ein.';

/** Room left for the free text after "Grund: ". */
const EXCLUSION_TEXT_MAX = MAX_DECISION_REASON - 50;

interface Props {
  caseKey: string;
  onBack(): void;
}

/** Detail page "Treffer klären": the two sides next to each other, then one clear decision. */
export function HitDetail({ caseKey, onBack }: Props) {
  const { backup, list, today, replace, liveHits } = useApp();
  const uid = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [by, setBy] = useState('');
  const [exclusion, setExclusion] = useState('');
  const [exclusionText, setExclusionText] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);

  useLayoutEffect(() => {
    headingRef.current?.focus();
  }, []);

  const c = useMemo(
    () => findCase(caseKey, liveHits, backup, list),
    [caseKey, liveHits, backup, list],
  );
  if (c === null) {
    return (
      <section aria-labelledby={`${uid}-h`}>
        <h2 id={`${uid}-h`} ref={headingRef} tabIndex={-1}>
          Treffer klären
        </h2>
        <p role="alert">Dieser Treffer ist nicht mehr vorhanden.</p>
        <button type="button" onClick={onBack}>
          Zurück zum Abgleich
        </button>
      </section>
    );
  }

  const hc: HitCase = c;
  const subject = describeSubject(
    { subjectKind: c.subjectKind, subjectId: c.subjectId, mandateId: c.mandateId ?? '' },
    backup,
  );
  const entry = list?.entries.find((e) => e.id === c.entryId) ?? null;
  const d = c.decision;
  const decided = d !== null && c.valid;

  /** Builds, checks and stores one decision; a voided earlier one of the same hit is replaced. */
  async function decide(kind: DecisionKind, reason: string) {
    setNotice(null);
    if (by.trim() === '')
      return setProblem('Bitte tragen Sie den Namen der entscheidenden Person ein.');
    if (entry === null || list === null) {
      return setProblem(
        'Der Listeneintrag ist nicht mehr in der geladenen Liste. Entscheidung nicht gespeichert.',
      );
    }
    const subjectSnap = currentSnapshot(
      hc.subjectKind,
      hc.subjectId,
      backup.persons,
      backup.mandates,
    );
    if (subjectSnap === null) return setProblem('Die Person oder das Mandat gibt es nicht mehr.');
    const decision: ScreeningDecision = {
      subjectKind: hc.subjectKind,
      subjectId: hc.subjectId,
      entryId: entry.id,
      listKind: 'sanktion',
      listFetchedOn: list.fetchedOn,
      decision: kind,
      reason,
      decidedOn: today,
      decidedBy: by.trim(),
      subjectSnapshot: subjectSnap,
      entrySnapshot: entrySnapshot(entry),
      actionNote: '',
    };
    const checked = checkDecision(decision, backup.persons, backup.mandates);
    if (!checked.ok)
      return setProblem(`Nicht gespeichert. ${describeFailure(checked.reason, checked.where)}`);
    const others = backup.screeningDecisions.filter(
      (x) =>
        !(
          x.listKind === 'sanktion' &&
          x.subjectKind === decision.subjectKind &&
          x.subjectId === decision.subjectId &&
          x.entryId === decision.entryId
        ),
    );
    const r = await replace({ ...backup, screeningDecisions: [...others, checked.value] });
    if (!r.ok) return setProblem(`Nicht gespeichert. ${describeFailure(r.reason, r.where)}`);
    setProblem(null);
    setNotice(
      kind === 'kein-treffer'
        ? 'Entscheidung gespeichert: kein Treffer. Der Treffer ist aus der offenen Liste.'
        : 'Entscheidung gespeichert: Treffer bestätigt.',
    );
  }

  function noHit() {
    if (by.trim() === '') return setProblem(NAME_MISSING);
    if (exclusion === '') return setProblem('Bitte wählen Sie einen Ausschlussgrund.');
    if (exclusionText.trim() === '')
      return setProblem('Bitte begründen Sie den Ausschluss in einem Satz.');
    void decide('kein-treffer', `${exclusion}: ${exclusionText.trim()}`);
  }
  function confirmed() {
    if (by.trim() === '') return setProblem(NAME_MISSING);
    if (confirmText.trim() === '') return setProblem('Bitte tragen Sie die Begründung ein.');
    void decide('treffer-bestaetigt', confirmText.trim());
  }

  async function saveActionNote() {
    if (d === null || actionNote === null) return;
    const checked = checkDecision(
      { ...d, actionNote: actionNote.trim() },
      backup.persons,
      backup.mandates,
    );
    if (!checked.ok)
      return setProblem(`Nicht gespeichert. ${describeFailure(checked.reason, checked.where)}`);
    const r = await replace({
      ...backup,
      screeningDecisions: backup.screeningDecisions.map((x) => (x === d ? checked.value : x)),
    });
    if (!r.ok) return setProblem(`Nicht gespeichert. ${describeFailure(r.reason, r.where)}`);
    setProblem(null);
    setNotice('Maßnahme dokumentiert.');
    setActionNote(null);
  }

  async function withdraw() {
    if (d === null) return;
    const r = await replace({
      ...backup,
      screeningDecisions: backup.screeningDecisions.filter((x) => x !== d),
    });
    setWithdrawing(false);
    if (!r.ok) return setProblem(`Nicht zurückgenommen. ${describeFailure(r.reason, r.where)}`);
    setProblem(null);
    setNotice('Die Entscheidung wurde zurückgenommen. Der Treffer ist wieder offen.');
  }

  const light = c.hit?.klasse ?? null;

  return (
    <section aria-labelledby={`${uid}-h`}>
      <p>
        <button type="button" onClick={onBack}>
          Zurück zum Abgleich
        </button>
      </p>
      <h2 id={`${uid}-h`} ref={headingRef} tabIndex={-1}>
        Treffer klären
      </h2>
      {problem !== null && <p role="alert">{problem}</p>}
      {notice !== null && <p role="status">{notice}</p>}

      <div className="cols">
        <section aria-labelledby={`${uid}-l`} className="col">
          <h3 id={`${uid}-l`}>{subject?.kind ?? 'Person'} im Bestand</h3>
          {subject === null ? (
            <p role="alert">Die Person oder das Mandat gibt es nicht mehr.</p>
          ) : (
            <dl>
              <dt>Name</dt>
              <dd>{subject.name}</dd>
              <dt>Geburtsangabe</dt>
              <dd>{subject.birth}</dd>
              <dt>Rolle</dt>
              <dd>{subject.role}</dd>
              <dt>Mandat</dt>
              <dd>
                {subject.mandateId} {subject.mandateName}
              </dd>
            </dl>
          )}
        </section>
        <section aria-labelledby={`${uid}-r`} className="col">
          <h3 id={`${uid}-r`}>Listeneintrag</h3>
          {entry === null ? (
            <p role="alert">
              Der Eintrag {c.entryId} steht nicht in der geladenen Liste (Liste gewechselt oder
              Eintrag entfallen).
            </p>
          ) : (
            <dl>
              <dt>Kennung</dt>
              <dd>{entry.id}</dd>
              <dt>Namen und Aliase</dt>
              <dd>
                <ul>
                  {entry.names.map((n) => (
                    <li key={n}>
                      {n}
                      {c.hit?.besterName === n ? ' (ähnlichster Name)' : ''}
                    </li>
                  ))}
                </ul>
              </dd>
              <dt>Geburtsangaben</dt>
              <dd>
                {entry.births.length === 0 ? (
                  'keine Angabe'
                ) : (
                  <ul>
                    {entry.births.map((b) => (
                      <li key={b}>{formatListBirth(b)}</li>
                    ))}
                  </ul>
                )}
              </dd>
              <dt>Bemerkung</dt>
              <dd>{entry.remark === '' ? NONE : entry.remark}</dd>
            </dl>
          )}
        </section>
      </div>

      <h3>Was die Ampel bedeutet</h3>
      {light === null ? (
        <p>Die Ampel wird neu berechnet, sobald der Abgleich in dieser Sitzung gelaufen ist.</p>
      ) : (
        <>
          <p>
            <strong>{LIGHT_LABELS[light]}</strong>, Namensähnlichkeit{' '}
            <strong>{percent(c.hit?.aehnlichkeit ?? 0)}</strong> mit „{c.hit?.besterName}“.
          </p>
          <p>{LIGHT_EXPLANATIONS[light]}</p>
        </>
      )}
      {subject !== null && subject.kind === 'Person' && entry !== null && (
        <p>
          Geburtsangabe: Person {subject.birth}; Liste{' '}
          {entry.births.length === 0
            ? 'keine Angabe'
            : entry.births.map(formatListBirth).join(', ')}
          .
        </p>
      )}
      {c.mandateId !== null && (
        <p>
          <OpenClient id={c.mandateId} name={subject?.mandateName ?? ''} />
        </p>
      )}

      {d !== null && !c.valid && (
        <p className="warning">
          ⚠ Eine frühere Entscheidung vom {formatDate(d.decidedOn)} ({d.decidedBy}: „{d.reason}“)
          gilt nicht mehr, weil sich die Person, das Mandat oder der Listeneintrag geändert hat.
          Eine neue Entscheidung ersetzt sie.
        </p>
      )}

      {decided ? (
        <section aria-labelledby={`${uid}-d`}>
          <h3 id={`${uid}-d`}>Entscheidung</h3>
          <dl>
            <dt>Entscheidung</dt>
            <dd>{d.decision === 'kein-treffer' ? 'Kein Treffer' : 'Treffer bestätigt'}</dd>
            <dt>Begründung</dt>
            <dd>{d.reason}</dd>
            <dt>Entschieden von</dt>
            <dd>
              {d.decidedBy} am {formatDate(d.decidedOn)} (Liste Stand {formatDate(d.listFetchedOn)})
            </dd>
          </dl>
          {d.decision === 'treffer-bestaetigt' && (
            <>
              <p className="warning">{LEADERSHIP_NOTE}</p>
              <p className="field">
                <label htmlFor={`${uid}-act`}>Maßnahme dokumentiert</label>
                <textarea
                  id={`${uid}-act`}
                  value={actionNote ?? d.actionNote}
                  maxLength={MAX_DECISION_REASON}
                  onChange={(e) => setActionNote(e.target.value)}
                />
              </p>
              <p>
                <button
                  type="button"
                  disabled={actionNote === null}
                  onClick={() => void saveActionNote()}
                >
                  Maßnahme speichern
                </button>
              </p>
            </>
          )}
          <p>
            <button type="button" onClick={() => setWithdrawing(true)}>
              Entscheidung zurücknehmen
            </button>
          </p>
          {withdrawing && (
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={`${uid}-wt`}
              className="dialog"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setWithdrawing(false);
              }}
            >
              <h3 id={`${uid}-wt`}>Entscheidung zurücknehmen?</h3>
              <p>
                Die gespeicherte Entscheidung („
                {d.decision === 'kein-treffer' ? 'Kein Treffer' : 'Treffer bestätigt'}“ von{' '}
                {d.decidedBy}) wird gelöscht; der Treffer ist danach wieder offen. Eine neue
                Entscheidung tragen Sie danach neu ein.
              </p>
              <button type="button" autoFocus onClick={() => setWithdrawing(false)}>
                Abbrechen
              </button>{' '}
              <button type="button" onClick={() => void withdraw()}>
                Zurücknahme bestätigen
              </button>
            </div>
          )}
        </section>
      ) : (
        <section aria-labelledby={`${uid}-d`}>
          <h3 id={`${uid}-d`}>Entscheidung</h3>
          <p>
            Das Programm entscheidet nichts; Sie entscheiden und tragen Ihren Namen ein. Gespeichert
            wird erst mit einem der beiden Knöpfe.
          </p>
          <p className="field">
            <label htmlFor={`${uid}-by`}>Name der entscheidenden Person (Pflicht)</label>
            <input
              id={`${uid}-by`}
              type="text"
              value={by}
              maxLength={MAX_DECIDER_LENGTH}
              onChange={(e) => setBy(e.target.value)}
            />
          </p>
          <div className="cols">
            <fieldset className="col">
              <legend>Kein Treffer</legend>
              <p className="field">
                <label htmlFor={`${uid}-ex`}>Ausschlussgrund (Pflicht)</label>
                <select
                  id={`${uid}-ex`}
                  value={exclusion}
                  onChange={(e) => setExclusion(e.target.value)}
                >
                  <option value="">— bitte wählen —</option>
                  {EXCLUSION_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </p>
              <p className="field">
                <label htmlFor={`${uid}-ext`}>Begründung in einem Satz (Pflicht)</label>
                <textarea
                  id={`${uid}-ext`}
                  value={exclusionText}
                  maxLength={EXCLUSION_TEXT_MAX}
                  onChange={(e) => setExclusionText(e.target.value)}
                />
              </p>
              <button type="button" onClick={noHit}>
                Kein Treffer
              </button>
            </fieldset>
            <fieldset className="col">
              <legend>Treffer bestätigt</legend>
              <p className="field">
                <label htmlFor={`${uid}-ct`}>Begründung (Pflicht)</label>
                <textarea
                  id={`${uid}-ct`}
                  value={confirmText}
                  maxLength={MAX_DECISION_REASON}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              </p>
              <button type="button" onClick={confirmed}>
                Treffer bestätigt
              </button>
              <p className="hint">{LEADERSHIP_NOTE}</p>
            </fieldset>
          </div>
        </section>
      )}
    </section>
  );
}
