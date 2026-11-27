import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  checkTypeOf,
  effectiveRiskClass,
  isPepAffected,
  nextReviewDate,
  type Mandate,
} from '../../../logic/index.ts';
import { useApp } from '../../app/context.ts';
import { formatDate, ID_STATUS_LABELS, NONE, RISK_CLASS_LABELS } from '../../format.ts';
import { reasonText } from '../../messages.ts';
import { ClientForm } from './ClientForm.tsx';
import { DeleteDialog } from './DeleteDialog.tsx';

type View = { kind: 'list' } | { kind: 'form'; editId: string | null };

export function ClientsScreen() {
  const { backup, today, replace, saveError, requestedClientId, requestClient } = useApp();
  const { rules, mandates } = backup;
  const uid = useId();
  // A mandate another screen asked for opens in the edit form (taken once, then cleared).
  const [view, setView] = useState<View>(() =>
    requestedClientId !== null && backup.mandates.some((m) => m.id === requestedClientId)
      ? { kind: 'form', editId: requestedClientId }
      : { kind: 'list' },
  );
  const [onlyActive, setOnlyActive] = useState(true);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Mandate | null>(null);
  const [returns, setReturns] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (requestedClientId !== null) requestClient(null);
  }, [requestedClientId, requestClient]);

  // Back from the form or the dialog: focus goes to the heading, never lost with the removed view.
  useEffect(() => {
    if (returns > 0) headingRef.current?.focus();
  }, [returns]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mandates
      .filter((m) => !onlyActive || m.active)
      .filter((m) => q === '' || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .sort((a, b) => a.id.localeCompare(b.id, 'de', { numeric: true }));
  }, [mandates, onlyActive, query]);

  function backToList(message: string | null) {
    setView({ kind: 'list' });
    setNotice(message);
    setReturns((n) => n + 1);
  }

  async function save(m: Mandate, isNew: boolean): Promise<string | null> {
    const next = isNew ? [...mandates, m] : mandates.map((x) => (x.id === m.id ? m : x));
    const r = await replace({ ...backup, mandates: next });
    if (!r.ok) return `${reasonText(r.reason)} (Code: ${r.reason})`;
    backToList(`Mandant ${m.id} ${m.name} gespeichert.`);
    return null;
  }

  async function remove(m: Mandate) {
    const r = await replace({
      ...backup,
      mandates: mandates.filter((x) => x.id !== m.id),
      persons: backup.persons.filter((p) => p.mandateId !== m.id),
    });
    setToDelete(null);
    if (r.ok) backToList(`Mandant ${m.id} ${m.name} gelöscht.`);
    else setNotice(null);
  }

  if (view.kind === 'form') {
    const initial =
      view.editId === null ? null : (mandates.find((m) => m.id === view.editId) ?? null);
    return (
      <section aria-labelledby={`${uid}-h`}>
        <h1 id={`${uid}-h`}>Mandanten</h1>
        {saveError !== null && <SaveError code={saveError} />}
        <ClientForm
          rules={rules}
          initial={initial}
          takenIds={mandates.map((m) => m.id)}
          onSave={(m) => save(m, initial === null)}
          onCancel={() => backToList(null)}
        />
      </section>
    );
  }

  return (
    <section aria-labelledby={`${uid}-h`}>
      <h1 id={`${uid}-h`} tabIndex={-1} ref={headingRef}>
        Mandanten
      </h1>
      {saveError !== null && <SaveError code={saveError} />}
      {notice !== null && <p role="status">{notice}</p>}
      <p>
        <button type="button" onClick={() => setView({ kind: 'form', editId: null })}>
          Mandant anlegen
        </button>
      </p>
      {mandates.length === 0 ? (
        <p>
          Noch keine Mandate im Bestand. Legen Sie mit „Mandant anlegen“ das erste Mandat an oder
          spielen Sie unter „Sicherung“ eine Sicherungsdatei ein.
        </p>
      ) : (
        <>
          <div className="filters">
            <p className="field">
              <label htmlFor={`${uid}-q`}>Suche nach Nummer oder Name</label>
              <input
                id={`${uid}-q`}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </p>
            <p className="field">
              <input
                id={`${uid}-a`}
                type="checkbox"
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
              />{' '}
              <label htmlFor={`${uid}-a`}>Nur aktive Mandate</label>
            </p>
          </div>
          <p role="status">
            {rows.length} von {mandates.length} Mandaten angezeigt.
          </p>
          {rows.length === 0 ? (
            <p>Kein Mandat passt zu Suche und Filter.</p>
          ) : (
            <div className="table-wrap" role="region" aria-label="Mandantenliste" tabIndex={0}>
              <table>
                <caption className="sr-only">Mandanten, sortiert nach Nummer</caption>
                <thead>
                  <tr>
                    <th scope="col">Nr.</th>
                    <th scope="col">Name</th>
                    <th scope="col">Rechtsform</th>
                    <th scope="col">Risikoklasse</th>
                    <th scope="col">Status</th>
                    <th scope="col">Nächste Prüfung</th>
                    <th scope="col">Personen</th>
                    <th scope="col">Aktiv</th>
                    <th scope="col">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => {
                    const cls = effectiveRiskClass(m, backup.persons, rules);
                    const personCount = backup.persons.filter((p) => p.mandateId === m.id).length;
                    return (
                      <tr key={m.id}>
                        <th scope="row">{m.id}</th>
                        <td>{m.name}</td>
                        <td>
                          {rules.legalForms.find((f) => f.key === m.legalForm)?.label ??
                            m.legalForm}
                        </td>
                        <td>
                          {cls === null ? NONE : RISK_CLASS_LABELS[cls]}
                          {isPepAffected(m, backup.persons) && (
                            <span className="flag">
                              {' '}
                              <span aria-hidden="true">⚠</span> PEP-betroffen
                            </span>
                          )}
                        </td>
                        <td>{ID_STATUS_LABELS[m.idStatus]}</td>
                        <td>{formatDate(nextReviewDate(m, backup.persons, rules))}</td>
                        <td>
                          {personCount}
                          {personCount === 0 && checkTypeOf(m.legalForm, rules) === 'C' && (
                            <span className="hint">
                              {' '}
                              Keine Vertreter/wirtschaftlich Berechtigten erfasst
                            </span>
                          )}
                        </td>
                        <td>{m.active ? 'Ja' : 'Nein'}</td>
                        <td>
                          <button
                            type="button"
                            aria-label={`Bearbeiten: ${m.id} ${m.name}`}
                            onClick={() => setView({ kind: 'form', editId: m.id })}
                          >
                            Bearbeiten
                          </button>{' '}
                          <button
                            type="button"
                            aria-label={`Löschen: ${m.id} ${m.name}`}
                            onClick={(e) => {
                              triggerRef.current = e.currentTarget;
                              setToDelete(m);
                            }}
                          >
                            Löschen
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {toDelete !== null && (
        <DeleteDialog
          mandate={toDelete}
          personCount={backup.persons.filter((p) => p.mandateId === toDelete.id).length}
          rules={rules}
          today={today}
          onConfirm={() => void remove(toDelete)}
          onCancel={() => {
            setToDelete(null);
            triggerRef.current?.focus();
          }}
        />
      )}
    </section>
  );
}

function SaveError({ code }: { code: string }) {
  return (
    <p role="alert">
      Letzte Speicherung im Gerät fehlgeschlagen (Code: {code}). Die Änderung ist nicht gespeichert;
      speichern Sie eine Sicherungsdatei.
    </p>
  );
}
