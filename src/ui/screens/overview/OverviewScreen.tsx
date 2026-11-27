import { useId, useMemo } from 'react';
import { auditExceptions, buildTasks } from '../../../logic/index.ts';
import { useApp } from '../../app/context.ts';
import { formatDate } from '../../format.ts';
import { countFindings } from '../audit/export.ts';
import { defaultStichtag } from '../audit/stichtag.ts';
import { TASK_GROUPS } from '../tasks/groups.ts';

/** Numbers only, no chart. The wheel is the navigation: each line names the area to open. */
export function OverviewScreen() {
  const { backup, today } = useApp();
  const uid = useId();
  const stichtag = defaultStichtag(today);
  const closing = backup.auditClosings.find((c) => c.stichtag === stichtag) ?? null;
  const { active, tasks, invalid, findings } = useMemo(() => {
    const t = buildTasks(backup.mandates, today, backup.rules);
    return {
      active: backup.mandates.filter((m) => m.active).length,
      tasks: t.tasks,
      invalid: t.invalid.length,
      findings: countFindings(auditExceptions(backup.mandates, today, backup.rules)),
    };
  }, [backup, today]);

  return (
    <section aria-labelledby={`${uid}-h`}>
      <h1 id={`${uid}-h`}>Übersicht</h1>
      <p>Stand {formatDate(today)}.</p>
      <h2>Mandate</h2>
      <p>
        Aktive Mandate: <strong>{active}</strong> (von {backup.mandates.length}). Details im Bereich
        „Mandanten“.
      </p>
      <h2>Aufgaben</h2>
      {tasks.length === 0 && invalid === 0 ? (
        <p>Keine offenen Aufgaben.</p>
      ) : (
        <ul>
          {TASK_GROUPS.map(({ kind, title }) => {
            const n = tasks.filter((t) => t.kind === kind).length;
            return n === 0 ? null : (
              <li key={kind}>
                {title}: <strong>{n}</strong>
              </li>
            );
          })}
          {invalid > 0 && (
            <li>
              Nicht prüfbare Mandate: <strong>{invalid}</strong>
            </li>
          )}
        </ul>
      )}
      <p>Die Aufgaben stehen im Bereich „Aufgaben“.</p>
      <h2>Audit</h2>
      <p>
        Auffälligkeiten zum Stichtag: <strong>{findings}</strong>. Die Listen stehen im Bereich
        „Audit“.
      </p>
      <p>
        Audit zum Stichtag {formatDate(stichtag)}:{' '}
        <strong>
          {closing === null ? 'offen' : `abgeschlossen am ${formatDate(closing.closedOn)}`}
        </strong>
        .
      </p>
    </section>
  );
}
