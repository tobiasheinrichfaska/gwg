import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  checkPerson,
  emptyPep,
  PERSON_ROLES,
  type Person,
  type PersonRole,
} from '../../../logic/index.ts';
import { useApp } from '../../app/context.ts';
import { formatBirth, NONE, PERSON_ROLE_LABELS } from '../../format.ts';
import { reasonText } from '../../messages.ts';
import { nextPersonId } from '../../persons.ts';
import { hasPepDuty, needsApproval, pepSummary } from '../../pep.ts';
import { PepApproval, PepFlow } from '../../components/PepFlow.tsx';

type Edit = { kind: 'none' } | { kind: 'form'; person: Person | null };
type PepOpen = { personId: string; kind: 'ask' | 'approval' } | null;

/** The persons of one mandate (edit form only). Each change is saved at once, apart from the mandate. */
export function PersonsSection({ mandateId }: { mandateId: string }) {
  const { backup, replace } = useApp();
  const uid = useId();
  const [pepOpen, setPepOpen] = useState<PepOpen>(null);
  const [edit, setEdit] = useState<Edit>({ kind: 'none' });
  const [toDelete, setToDelete] = useState<Person | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mine = backup.persons.filter((p) => p.mandateId === mandateId);

  async function persist(persons: Person[]): Promise<string | null> {
    const r = await replace({ ...backup, persons });
    return r.ok ? null : `${reasonText(r.reason)} (Code: ${r.reason})`;
  }

  async function save(p: Person, isNew: boolean): Promise<string | null> {
    const next = isNew
      ? [...backup.persons, p]
      : backup.persons.map((x) => (x.id === p.id ? p : x));
    const problem = await persist(next);
    if (problem === null) {
      setEdit({ kind: 'none' });
      setNotice(`Person ${p.lastName} gespeichert.`);
    }
    return problem;
  }

  async function remove(p: Person) {
    const problem = await persist(backup.persons.filter((x) => x.id !== p.id));
    setToDelete(null);
    setNotice(problem ?? `Person ${p.lastName} gelöscht.`);
  }

  return (
    <section aria-labelledby={`${uid}-h`} className="persons">
      <h3 id={`${uid}-h`}>Personen</h3>
      {notice !== null && <p role="status">{notice}</p>}
      {mine.length === 0 ? (
        <p>Keine Personen erfasst.</p>
      ) : (
        <div className="table-wrap" role="region" aria-label="Personenliste" tabIndex={0}>
          <table>
            <caption className="sr-only">Personen dieses Mandats</caption>
            <thead>
              <tr>
                <th scope="col">Rolle</th>
                <th scope="col">Name</th>
                <th scope="col">Vorname</th>
                <th scope="col">Geburtsdatum</th>
                <th scope="col">PEP-Auskunft</th>
                <th scope="col">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((p) => (
                <tr key={p.id}>
                  <td>{PERSON_ROLE_LABELS[p.role]}</td>
                  <th scope="row">{p.lastName}</th>
                  <td>{p.firstName === '' ? NONE : p.firstName}</td>
                  <td>{formatBirth(p.birth)}</td>
                  <td>{pepSummary(p)}</td>
                  <td>
                    {hasPepDuty(p) && (
                      <>
                        <button
                          type="button"
                          aria-label={`PEP-Auskunft erfassen: ${p.firstName} ${p.lastName}`}
                          onClick={() => setPepOpen({ personId: p.id, kind: 'ask' })}
                        >
                          {p.pep.answer === null ? 'Auskunft erfassen' : 'Auskunft ändern'}
                        </button>{' '}
                        {needsApproval(p.pep) && p.pep.approvedOn === null && (
                          <>
                            <button
                              type="button"
                              aria-label={`Freigabe erfassen: ${p.firstName} ${p.lastName}`}
                              onClick={() => setPepOpen({ personId: p.id, kind: 'approval' })}
                            >
                              Freigabe erfassen
                            </button>{' '}
                          </>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      aria-label={`Person bearbeiten: ${p.firstName} ${p.lastName}`}
                      onClick={() => setEdit({ kind: 'form', person: p })}
                    >
                      Bearbeiten
                    </button>{' '}
                    <button
                      type="button"
                      aria-label={`Person löschen: ${p.firstName} ${p.lastName}`}
                      onClick={() => setToDelete(p)}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pepOpen !== null &&
        (() => {
          const person = backup.persons.find((x) => x.id === pepOpen.personId);
          if (person === undefined) return null;
          const Dialog = pepOpen.kind === 'ask' ? PepFlow : PepApproval;
          return (
            <Dialog
              person={person}
              mandate={backup.mandates.find((m) => m.id === mandateId)}
              onClose={(message) => {
                setPepOpen(null);
                if (message !== null) setNotice(message);
              }}
            />
          );
        })()}
      {toDelete !== null && (
        <div role="alertdialog" aria-modal="true" aria-label="Person löschen" className="dialog">
          <p>
            Person {toDelete.firstName} {toDelete.lastName} löschen? Das kann nicht rückgängig
            gemacht werden.
          </p>
          <button type="button" autoFocus onClick={() => setToDelete(null)}>
            Abbrechen
          </button>{' '}
          <button type="button" onClick={() => void remove(toDelete)}>
            Person endgültig löschen
          </button>
        </div>
      )}
      {edit.kind === 'form' ? (
        <PersonForm
          key={edit.person?.id ?? 'new'}
          initial={edit.person}
          onSave={(p) => save(p, edit.person === null)}
          onCancel={() => setEdit({ kind: 'none' })}
          build={(f) => ({
            id: edit.person?.id ?? nextPersonId(backup.persons, mandateId),
            mandateId,
            pep: edit.person?.pep ?? emptyPep(),
            ...f,
          })}
        />
      ) : (
        <p>
          <button type="button" onClick={() => setEdit({ kind: 'form', person: null })}>
            Person anlegen
          </button>
        </p>
      )}
    </section>
  );
}

interface Fields {
  role: PersonRole;
  lastName: string;
  firstName: string;
  birth: string | null;
}

function PersonForm({
  initial,
  build,
  onSave,
  onCancel,
}: {
  initial: Person | null;
  build(f: Fields): Person;
  onSave(p: Person): Promise<string | null>;
  onCancel(): void;
}) {
  const { backup } = useApp();
  const uid = useId();
  const [role, setRole] = useState<PersonRole>(initial?.role ?? 'geschaeftsfuehrer');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [birth, setBirth] = useState(initial?.birth ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const fid = (n: string) => `${uid}-${n}`;

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const p = build({
      role,
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      birth: birth.trim() === '' ? null : birth.trim(),
    });
    const checked = checkPerson(p, backup.mandates);
    if (!checked.ok) {
      setError(reasonText(checked.reason));
      return;
    }
    setBusy(true);
    const problem = await onSave(p);
    setBusy(false);
    if (problem !== null) setError(problem);
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate aria-label="Person">
      <h4>{initial === null ? 'Person anlegen' : 'Person bearbeiten'}</h4>
      {error !== null && (
        <p role="alert" tabIndex={-1} ref={errorRef}>
          Nicht gespeichert. {error}
        </p>
      )}
      <p className="field">
        <label htmlFor={fid('role')}>Rolle</label>
        <select
          id={fid('role')}
          value={role}
          onChange={(e) => setRole(e.target.value as PersonRole)}
        >
          {PERSON_ROLES.map((r) => (
            <option key={r} value={r}>
              {PERSON_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </p>
      <p className="field">
        <label htmlFor={fid('last')}>Nachname (Pflicht)</label>
        <input
          id={fid('last')}
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </p>
      <p className="field">
        <label htmlFor={fid('first')}>Vorname</label>
        <input
          id={fid('first')}
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </p>
      <p className="field">
        <label htmlFor={fid('birth')}>Geburtsdatum (JJJJ, JJJJ-MM oder JJJJ-MM-TT)</label>
        <input
          id={fid('birth')}
          type="text"
          value={birth}
          aria-describedby={fid('birth-hint')}
          onChange={(e) => setBirth(e.target.value)}
        />
        <span className="hint" id={fid('birth-hint')}>
          Auch nur Jahr möglich; fehlt es, wird bei Namensähnlichkeit immer ein Mensch gefragt.
        </span>
      </p>
      <p>
        <button type="submit" disabled={busy}>
          Person speichern
        </button>{' '}
        <button type="button" onClick={onCancel}>
          Person abbrechen
        </button>
      </p>
    </form>
  );
}
