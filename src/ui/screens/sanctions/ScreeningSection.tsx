import { useId, useMemo, useState } from 'react';
import { openHits, MAX_DECISION_REASON } from '../../../logic/index.ts';
import { describeFailure } from '../../app/messages.ts';
import { useApp } from '../../app/context.ts';
import { StatusBanner } from '../../components/StatusBanner.tsx';
import { formatDate } from '../../format.ts';
import { checkDecision } from '../../../logic/index.ts';
import { decidedCases, hitKey } from './cases.ts';
import { describeSubject, entryMap, percent } from './subjects.ts';
import { LIGHT_LABELS } from './texts.ts';
import { LEADERSHIP_NOTE } from './HitDetail.tsx';

const SCREENING_NOT_POSSIBLE_PERSON = {
  'bad-person': 'Nachname leer oder ohne Buchstaben',
  'unknown-mandate': 'Das Mandat der Person gibt es nicht',
} as const;

/** "Abgleich": start button, progress, summary and the list of open hits. */
export function ScreeningSection({ onOpen }: { onOpen(key: string): void }) {
  const { backup, list, screening, liveHits, progress, runScreening, replace } = useApp();
  const uid = useId();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const running = progress !== null;

  const open = useMemo(
    () => openHits(liveHits, backup.screeningDecisions, backup.persons, backup.mandates),
    [liveHits, backup],
  );
  const decided = useMemo(() => decidedCases(liveHits, backup, list), [liveHits, backup, list]);
  const confirmed = decided.filter((c) => c.decision?.decision === 'treffer-bestaetigt');
  const cleared = decided.filter((c) => c.decision?.decision === 'kein-treffer');
  const entries = useMemo(() => entryMap(list?.entries ?? []), [list]);
  const last = backup.lastScreening.sanktion;
  const red = open.filter((h) => h.klasse === 'rot').length;
  const yellow = open.length - red;

  async function start() {
    setError(null);
    setNotice(null);
    const r = await runScreening();
    if (!r.ok) {
      setError(
        `Der Abgleich ist gelaufen, aber nicht vermerkt. ${describeFailure(r.reason, r.where)}`,
      );
      return;
    }
    setNotice('Abgleich abgeschlossen.');
  }

  async function saveNote(key: string) {
    const c = confirmed.find((x) => x.key === key);
    const d = c?.decision;
    const text = notes[key];
    if (d === undefined || d === null || text === undefined) return;
    const checked = checkDecision(
      { ...d, actionNote: text.trim() },
      backup.persons,
      backup.mandates,
    );
    if (!checked.ok)
      return setError(`Nicht gespeichert. ${describeFailure(checked.reason, checked.where)}`);
    const r = await replace({
      ...backup,
      screeningDecisions: backup.screeningDecisions.map((x) => (x === d ? checked.value : x)),
    });
    if (!r.ok) return setError(`Nicht gespeichert. ${describeFailure(r.reason, r.where)}`);
    setError(null);
    setNotes((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)));
    setNotice('Maßnahme dokumentiert.');
  }

  return (
    <section aria-labelledby={`${uid}-ab`}>
      <h2 id={`${uid}-ab`}>Abgleich</h2>
      <StatusBanner />
      <p>
        <button
          type="button"
          disabled={list === null || running}
          aria-describedby={list === null ? `${uid}-nolist` : undefined}
          onClick={() => void start()}
        >
          {running ? 'Abgleich läuft …' : 'Abgleich starten'}
        </button>
      </p>
      {list === null && (
        <p className="hint" id={`${uid}-nolist`}>
          Der Abgleich braucht eine Sanktionsliste. Lesen Sie oben eine Datei ein oder rufen Sie die
          Liste ab; ohne Liste gilt niemand als „unauffällig“.
        </p>
      )}
      {progress !== null && (
        <p role="status" aria-live="polite">
          <progress max={Math.max(progress.total, 1)} value={progress.done} /> {progress.done} von{' '}
          {progress.total} geprüft
        </p>
      )}
      {error !== null && <p role="alert">{error}</p>}
      {notice !== null && <p role="status">{notice}</p>}
      <p className="hint">
        Der Abgleich läuft nur auf Knopfdruck. Sein Ergebnis steht nur im Arbeitsspeicher;
        gespeichert werden Ihre Entscheidungen und der Vermerk „zuletzt geprüft“.
        {last !== null &&
          ` Zuletzt geprüft am ${formatDate(last.ranOn)} (Liste Stand ${formatDate(last.listFetchedOn)}, ${last.hitCount} Treffer).`}
      </p>

      {screening !== null && (
        <>
          <h3>Ergebnis vom {formatDate(screening.ranOn)}</h3>
          <ul>
            <li>
              Offen, rot: <strong>{red}</strong>
            </li>
            <li>
              Offen, gelb: <strong>{yellow}</strong>
            </li>
            <li>
              Bestätigt: <strong>{confirmed.length}</strong>
            </li>
            <li>
              Als „kein Treffer“ geklärt: <strong>{cleared.length}</strong>
            </li>
            <li>
              Nicht prüfbar:{' '}
              <strong>
                {screening.unscreenable.length + screening.unscreenableMandates.length}
              </strong>
            </li>
          </ul>
          {screening.unscreenable.length + screening.unscreenableMandates.length > 0 && (
            <div>
              <p>
                Diese Einträge konnten nicht verglichen werden; sie gelten nicht als unauffällig.
                Bitte korrigieren und neu abgleichen.
              </p>
              <ul>
                {screening.unscreenable.map((u) => {
                  const p = backup.persons.find((x) => x.id === u.personId);
                  return (
                    <li key={`p-${u.personId}`}>
                      Person {u.personId}
                      {p ? ` (${p.firstName} ${p.lastName}, Mandat ${p.mandateId})` : ''}:{' '}
                      {SCREENING_NOT_POSSIBLE_PERSON[u.reason]}
                    </li>
                  );
                })}
                {screening.unscreenableMandates.map((u) => {
                  const m = backup.mandates.find((x) => x.id === u.mandateId);
                  return (
                    <li key={`m-${u.mandateId}`}>
                      Mandat {u.mandateId}
                      {m ? ` ${m.name}` : ''}: Name ohne Buchstaben
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}

      <section aria-labelledby={`${uid}-open`}>
        <h3 id={`${uid}-open`}>Offene Treffer ({open.length})</h3>
        {screening === null ? (
          <p>
            Noch kein Abgleich in dieser Sitzung; hier stehen nach dem Abgleich die offenen Treffer.
          </p>
        ) : open.length === 0 ? (
          <p>
            Keine offenen Treffer. Das gilt nur für den Stand von Liste und Bestand beim Abgleich.
          </p>
        ) : (
          <div className="table-wrap" role="region" aria-label="Offene Treffer" tabIndex={0}>
            <table>
              <caption className="sr-only">Offene Treffer</caption>
              <thead>
                <tr>
                  <th scope="col">Ampel</th>
                  <th scope="col">Person/Mandat</th>
                  <th scope="col">Mandat</th>
                  <th scope="col">Bester Name</th>
                  <th scope="col">Ähnlichkeit</th>
                  <th scope="col">Listeneintrag</th>
                  <th scope="col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {open.map((h) => {
                  const s = describeSubject(h, backup);
                  const e = entries.get(h.entryId);
                  const key = hitKey(h);
                  return (
                    <tr key={key}>
                      <td>
                        <strong>{LIGHT_LABELS[h.klasse]}</strong>
                      </td>
                      <td>
                        {s?.kind}: {s?.name}
                      </td>
                      <td>
                        {s?.mandateId} {s?.mandateName}
                      </td>
                      <td>{h.besterName}</td>
                      <td>{percent(h.aehnlichkeit)}</td>
                      <td>
                        {h.entryId}
                        {e ? `: ${e.names[0]}` : ''}
                      </td>
                      <td>
                        <button
                          type="button"
                          aria-label={`Treffer klären: ${s?.name ?? h.subjectId} gegen ${h.besterName}`}
                          onClick={() => onOpen(key)}
                        >
                          Treffer klären
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby={`${uid}-conf`}>
        <h3 id={`${uid}-conf`}>Bestätigte Treffer ({confirmed.length})</h3>
        {confirmed.length === 0 ? (
          <p>Keine bestätigten Treffer.</p>
        ) : (
          <>
            <p className="warning">{LEADERSHIP_NOTE}</p>
            <ul>
              {confirmed.map((c) => {
                const d = c.decision;
                if (d === null) return null;
                const s = describeSubject(
                  {
                    subjectKind: c.subjectKind,
                    subjectId: c.subjectId,
                    mandateId: c.mandateId ?? '',
                  },
                  backup,
                );
                const text = notes[c.key] ?? d.actionNote;
                return (
                  <li key={c.key}>
                    <p>
                      <strong>
                        {s?.kind}: {s?.name}
                      </strong>{' '}
                      (Mandat {s?.mandateId}) gegen Eintrag {c.entryId}; bestätigt von {d.decidedBy}{' '}
                      am {formatDate(d.decidedOn)}: {d.reason}{' '}
                      <button type="button" onClick={() => onOpen(c.key)}>
                        Entscheidung ansehen
                      </button>
                    </p>
                    <p className="field">
                      <label htmlFor={`${uid}-n-${c.key}`}>
                        Maßnahme dokumentiert ({s?.name ?? c.subjectId})
                      </label>
                      <textarea
                        id={`${uid}-n-${c.key}`}
                        value={text}
                        maxLength={MAX_DECISION_REASON}
                        onChange={(e) => setNotes({ ...notes, [c.key]: e.target.value })}
                      />
                    </p>
                    <button
                      type="button"
                      disabled={notes[c.key] === undefined}
                      onClick={() => void saveNote(c.key)}
                    >
                      Maßnahme speichern
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {cleared.length > 0 && (
        <section aria-labelledby={`${uid}-clr`}>
          <h3 id={`${uid}-clr`}>Als „kein Treffer“ geklärt ({cleared.length})</h3>
          <ul>
            {cleared.map((c) => {
              const s = describeSubject(
                {
                  subjectKind: c.subjectKind,
                  subjectId: c.subjectId,
                  mandateId: c.mandateId ?? '',
                },
                backup,
              );
              return (
                <li key={c.key}>
                  {s?.kind}: {s?.name}, Eintrag {c.entryId}: {c.decision?.reason} (
                  {c.decision?.decidedBy}, {formatDate(c.decision?.decidedOn)}){' '}
                  <button type="button" onClick={() => onOpen(c.key)}>
                    Entscheidung ansehen
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </section>
  );
}
