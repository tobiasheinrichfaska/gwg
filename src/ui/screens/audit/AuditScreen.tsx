import { useId, useMemo } from 'react';
import { auditFileName, downloadText } from '../../../io/index.ts';
import { auditExceptions, auditIsClean } from '../../../logic/index.ts';
import { useApp } from '../../app/context.ts';
import { OpenClient } from '../../components/OpenClient.tsx';
import { formatDate } from '../../format.ts';
import { AUDIT_LISTS, auditText, countFindings } from './export.ts';

export function AuditScreen() {
  const { backup, today } = useApp();
  const uid = useId();
  const exceptions = useMemo(
    () => auditExceptions(backup.mandates, today, backup.rules),
    [backup, today],
  );
  const clean = auditIsClean(exceptions);
  const count = countFindings(exceptions);

  return (
    <section aria-labelledby={`${uid}-h`}>
      <h1 id={`${uid}-h`}>Audit</h1>
      <p>
        Stichtag: <strong>{formatDate(today)}</strong> (heutiges Datum). Das Jahresaudit ist für den
        Zeitraum 1. bis 30. November vorgesehen; der Zeitraum wird hier nur angezeigt, nicht
        geprüft.
      </p>
      {clean ? (
        <p role="status">Audit abschließbar: keine Auffälligkeiten.</p>
      ) : (
        <p role="status">
          Noch {count} {count === 1 ? 'Auffälligkeit' : 'Auffälligkeiten'}. Das Audit ist erst
          abschließbar, wenn alle Listen leer sind.
        </p>
      )}
      <p className="hint">
        Der Abschluss wird in dieser Stufe nicht gespeichert; die Anzeige gilt nur für den aktuellen
        Stand der Mandate.
      </p>
      <p>
        <button
          type="button"
          onClick={() => downloadText(auditText(exceptions, today), auditFileName(today))}
        >
          Stichtagsliste herunterladen
        </button>
      </p>
      {AUDIT_LISTS.map(({ key, title, text }) => {
        const list = exceptions[key];
        return (
          <section key={key} aria-labelledby={`${uid}-${key}`}>
            <h2 id={`${uid}-${key}`}>
              {title} ({list.length})
            </h2>
            <p>{text}</p>
            {list.length === 0 ? (
              <p>Keine Auffälligkeiten.</p>
            ) : (
              <ul>
                {list.map((m) => (
                  <li key={m.id}>
                    {m.id} {m.name} <OpenClient id={m.id} name={m.name} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}
