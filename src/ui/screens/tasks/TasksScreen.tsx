import { useId, useMemo, useState } from 'react';
import { buildTasks, checkMandate, type Mandate, type Task } from '../../../logic/index.ts';
import { describeFailure } from '../../app/messages.ts';
import { useApp } from '../../app/context.ts';
import { OpenClient } from '../../components/OpenClient.tsx';
import { formatDate, NONE } from '../../format.ts';
import { reasonText } from '../../messages.ts';
import { CheckDialog } from './CheckDialog.tsx';
import { TASK_GROUPS } from './groups.ts';

export function TasksScreen() {
  const { backup, today, replace, saveError } = useApp();
  const uid = useId();
  const { tasks, invalid } = useMemo(
    () => buildTasks(backup.mandates, today, backup.rules),
    [backup, today],
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Mandate | null>(null);

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

  function actions(t: Task, m: Mandate) {
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
          Letzte Speicherung im Gerät fehlgeschlagen (Code: {saveError}). Die Änderung ist nicht
          gespeichert; speichern Sie eine Sicherungsdatei.
        </p>
      )}
      {problem !== null && <p role="alert">{problem}</p>}
      {notice !== null && <p role="status">{notice}</p>}
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
                      <tr key={`${kind}-${t.mandateId}`}>
                        <th scope="row">{m.id}</th>
                        <td>{m.name}</td>
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
