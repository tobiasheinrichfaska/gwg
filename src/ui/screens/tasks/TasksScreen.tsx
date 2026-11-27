import { useId, useMemo, useState } from 'react';
import { buildTasks, checkMandate, type Mandate, type Task } from '../../../logic/index.ts';
import { describeFailure } from '../../app/messages.ts';
import { useApp } from '../../app/context.ts';
import { OpenClient } from '../../components/OpenClient.tsx';
import { OpenHit } from '../../components/OpenHit.tsx';
import { StatusBanner } from '../../components/StatusBanner.tsx';
import { hitKey } from '../sanctions/cases.ts';
import { describeSubject } from '../sanctions/subjects.ts';
import { formatDate, NONE } from '../../format.ts';
import { reasonText } from '../../messages.ts';
import { PepApproval, PepFlow } from '../../components/PepFlow.tsx';
import { CheckDialog } from './CheckDialog.tsx';
import { TASK_GROUPS } from './groups.ts';

export function TasksScreen() {
  const { backup, today, replace, saveError, saveErrorWhere, liveHits } = useApp();
  const uid = useId();
  const { tasks, invalid } = useMemo(
    () =>
      buildTasks(
        backup.mandates,
        backup.persons,
        today,
        backup.rules,
        liveHits,
        backup.screeningDecisions,
      ),
    [backup, today, liveHits],
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Mandate | null>(null);
  const [pepOpen, setPepOpen] = useState<{
    personId: string;
    kind: 'pep-ask' | 'pep-approval';
  } | null>(null);

  const byId = (id: string) => backup.mandates.find((m) => m.id === id);

  /** Changes one mandate through `checkMandate` and the provider's save. */
  async function change(m: Mandate, patch: Partial<Mandate>, done: string) {
    const next = { ...m, ...patch };
    const checked = checkMandate(next, backup.rules);
    if (!checked.ok) {
      setNotice(null);
      setProblem(`Nicht gespeichert. ${reasonText(checked.reason)}`);
      return;
    }
    const r = await replace({
      ...backup,
      mandates: backup.mandates.map((x) => (x.id === m.id ? next : x)),
    });
    if (!r.ok) {
      setNotice(null);
      setProblem(`Nicht gespeichert. ${describeFailure(r.reason)}`);
      return;
    }
    setProblem(null);
    setNotice(done);
  }

  const personOf = (t: Task) => backup.persons.find((p) => p.id === t.personId);

  /** The hit behind a sanction task, if the last run still has it. */
  const hitOf = (t: Task) =>
    t.subjectKind === undefined
      ? undefined
      : liveHits.find(
          (h) =>
            h.subjectKind === t.subjectKind &&
            h.subjectId === t.subjectId &&
            h.entryId === t.entryId,
        );

  function sanctionLabel(t: Task): string {
    const hit = hitOf(t);
    if (hit === undefined) return '';
    const who = describeSubject(hit, backup)?.name ?? '';
    return ` – ${hit.klasse === 'rot' ? '● ROT' : '◐ GELB'}: ${who} gegen ${hit.besterName}`;
  }

  function actions(t: Task, m: Mandate) {
    const hit = hitOf(t);
    if ((t.kind === 'sanction-clear' || t.kind === 'sanction-confirmed') && hit !== undefined) {
      const who = describeSubject(hit, backup)?.name ?? hit.subjectId;
      return <OpenHit hitKey={hitKey(hit)} label={`${m.id} ${who} gegen ${hit.besterName}`} />;
    }
    if ((t.kind === 'pep-ask' || t.kind === 'pep-approval') && t.personId !== undefined) {
      const who = personOf(t);
      const label = t.kind === 'pep-ask' ? 'Auskunft erfassen' : 'Freigabe erfassen';
      const personId = t.personId;
      const kind = t.kind;
      return (
        <button
          type="button"
          aria-label={`${label}: ${m.id} ${who?.firstName ?? ''} ${who?.lastName ?? ''}`.trim()}
          onClick={() => setPepOpen({ personId, kind })}
        >
          {label}
        </button>
      );
    }
    if (t.kind === 'request-missing') {
      return (
        <button
          type="button"
          aria-label={`Erste Anforderung heute gesendet: ${m.id} ${m.name}`}
          onClick={() =>
            void change(
              m,
              { firstRequestOn: today },
              `Mandat ${m.id} ${m.name}: Erste Anforderung am ${formatDate(today)} vermerkt.`,
            )
          }
        >
          Erste Anforderung heute gesendet
        </button>
      );
    }
    if (t.kind === 'review-due') {
      return (
        <button
          type="button"
          aria-label={`Prüfung heute abgeschlossen: ${m.id} ${m.name}`}
          onClick={() => setConfirming(m)}
        >
          Prüfung heute abgeschlossen
        </button>
      );
    }
    return null;
  }

  return (
    <section aria-labelledby={`${uid}-h`}>
      <h1 id={`${uid}-h`}>Aufgaben</h1>
      <p>
        Stand {formatDate(today)}. Die Liste rechnet nach den Fristen der Einstellungen; sie
        erinnert und dokumentiert, sie entscheidet nichts rechtlich.
      </p>
      {saveError !== null && (
        <p role="alert">
          Letzte Speicherung im Gerät fehlgeschlagen (Code: {saveError}
          {saveErrorWhere === undefined ? '' : `, Stelle: ${saveErrorWhere}`}). Die Änderung ist
          nicht gespeichert; speichern Sie eine Sicherungsdatei.
        </p>
      )}
      {problem !== null && <p role="alert">{problem}</p>}
      {notice !== null && <p role="status">{notice}</p>}
      <StatusBanner />
      {tasks.length === 0 && invalid.length === 0 && <p>Keine offenen Aufgaben.</p>}

      {TASK_GROUPS.map(({ kind, title }) => {
        const rows = tasks.filter((t) => t.kind === kind);
        if (rows.length === 0) return null;
        return (
          <section key={kind} aria-labelledby={`${uid}-${kind}`}>
            <h2 id={`${uid}-${kind}`}>
              {title} ({rows.length})
            </h2>
            <div className="table-wrap" role="region" aria-label={title} tabIndex={0}>
              <table>
                <caption className="sr-only">{title}</caption>
                <thead>
                  <tr>
                    <th scope="col">Nr.</th>
                    <th scope="col">Name</th>
                    <th scope="col">Fällig seit</th>
                    <th scope="col">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const m = byId(t.mandateId);
                    if (m === undefined) return null;
                    return (
                      <tr
                        key={`${kind}-${t.mandateId}-${t.personId ?? ''}-${t.subjectId ?? ''}-${t.entryId ?? ''}`}
                      >
                        <th scope="row">{m.id}</th>
                        <td>
                          {m.name}
                          {t.personId !== undefined && personOf(t) !== undefined
                            ? ` – Person: ${personOf(t)?.firstName} ${personOf(t)?.lastName}`
                            : ''}
                          {sanctionLabel(t)}
                        </td>
                        <td>
                          {t.dueOn === null
                            ? NONE
                            : `${t.daysOverdue} ${t.daysOverdue === 1 ? 'Tag' : 'Tage'} (seit ${formatDate(t.dueOn)})`}
                        </td>
                        <td>
                          <OpenClient id={m.id} name={m.name} /> {actions(t, m)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {invalid.length > 0 && (
        <section aria-labelledby={`${uid}-invalid`}>
          <h2 id={`${uid}-invalid`}>Nicht prüfbare Mandate ({invalid.length})</h2>
          <p>
            Diese Mandate haben fehlerhafte Angaben und werden nicht berechnet. Bitte korrigieren,
            sonst fehlen sie in der Aufgabenliste und im Audit.
          </p>
          <ul>
            {invalid.map((i) => {
              const m = byId(i.mandateId);
              return (
                <li key={i.mandateId}>
                  <strong>
                    {i.mandateId}
                    {m ? ` ${m.name}` : ''}
                  </strong>
                  : {describeFailure(i.reason)} <OpenClient id={i.mandateId} name={m?.name ?? ''} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {pepOpen !== null &&
        (() => {
          const person = backup.persons.find((p) => p.id === pepOpen.personId);
          if (person === undefined) return null;
          const Dialog = pepOpen.kind === 'pep-ask' ? PepFlow : PepApproval;
          return (
            <Dialog
              person={person}
              mandate={byId(person.mandateId)}
              onClose={(message) => {
                setPepOpen(null);
                if (message !== null) {
                  setProblem(null);
                  setNotice(message);
                }
              }}
            />
          );
        })()}
      {confirming !== null && (
        <CheckDialog
          mandate={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const m = confirming;
            setConfirming(null);
            void change(
              m,
              { lastCheckOn: today, idStatus: 'vollstaendig' },
              `Mandat ${m.id} ${m.name}: Prüfung am ${formatDate(today)} vermerkt.`,
            );
          }}
        />
      )}
    </section>
  );
}
