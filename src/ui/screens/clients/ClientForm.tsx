import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import {
  checkMandate,
  isPepAffected,
  ID_STATUSES,
  type DateKey,
  type Mandate,
  type RulesConfig,
} from '../../../logic/index.ts';
import { useApp } from '../../app/context.ts';
import { ID_STATUS_LABELS } from '../../format.ts';
import { reasonText } from '../../messages.ts';
import { PersonsSection } from './PersonsSection.tsx';

interface Props {
  rules: RulesConfig;
  /** The mandate being edited; null = create a new one. */
  initial: Mandate | null;
  /** Numbers already taken (only checked when creating). */
  takenIds: readonly string[];
  /** Saves; returns a German error sentence, or null when saved. */
  onSave(m: Mandate): Promise<string | null>;
  onCancel(): void;
}

const emptyMandate = (rules: RulesConfig): Mandate => ({
  id: '',
  name: '',
  legalForm: rules.legalForms[0]?.key ?? '',
  active: true,
  idStatus: 'leer',
  riskGroupId: null,
  riskReason: '',
  isPep: false,
  firstRequestOn: null,
  lastCheckOn: null,
  endedOn: null,
});

const asDate = (s: string): DateKey | null => (s === '' ? null : s);

export function ClientForm({ rules, initial, takenIds, onSave, onCancel }: Props) {
  const uid = useId();
  const { backup } = useApp();
  const start = initial ?? emptyMandate(rules);
  const [id, setId] = useState(start.id);
  const [name, setName] = useState(start.name);
  const [legalForm, setLegalForm] = useState(start.legalForm);
  const [active, setActive] = useState(start.active);
  const [idStatus, setIdStatus] = useState<string>(start.idStatus);
  const [riskGroupId, setRiskGroupId] = useState(start.riskGroupId ?? '');
  const [riskReason, setRiskReason] = useState(start.riskReason);
  const [isPep, setIsPep] = useState(start.isPep);
  const [firstRequestOn, setFirstRequestOn] = useState(start.firstRequestOn ?? '');
  const [lastCheckOn, setLastCheckOn] = useState(start.lastCheckOn ?? '');
  const [endedOn, setEndedOn] = useState(start.endedOn ?? '');
  const [error, setError] = useState<{ text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const editing = initial !== null;
  const fid = (n: string) => `${uid}-${n}`;

  useLayoutEffect(() => {
    headingRef.current?.focus();
  }, []);
  useLayoutEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const m: Mandate = {
      id: id.trim(),
      name: name.trim(),
      legalForm,
      active,
      idStatus: idStatus as Mandate['idStatus'],
      riskGroupId: riskGroupId === '' ? null : riskGroupId,
      riskReason,
      isPep,
      firstRequestOn: asDate(firstRequestOn),
      lastCheckOn: asDate(lastCheckOn),
      endedOn: asDate(endedOn),
    };
    const checked = checkMandate(m, rules);
    if (!checked.ok) {
      setError({ text: reasonText(checked.reason) });
      return;
    }
    if (!editing && takenIds.includes(m.id)) {
      setError({ text: reasonText('duplicate-id') });
      return;
    }
    setBusy(true);
    const problem = await onSave(m);
    setBusy(false);
    if (problem !== null) setError({ text: problem });
  }

  const dateField = (key: string, label: string, value: string, set: (v: string) => void) => (
    <p className="field">
      <label htmlFor={fid(key)}>{label}</label>
      <input id={fid(key)} type="date" value={value} onChange={(e) => set(e.target.value)} />
      <span className="hint">Leer lassen, wenn es kein Datum gibt.</span>
    </p>
  );

  return (
    <section aria-labelledby={fid('h')}>
      <h2 id={fid('h')} tabIndex={-1} ref={headingRef}>
        {editing ? 'Mandant bearbeiten' : 'Mandant anlegen'}
      </h2>
      {initial !== null && isPepAffected({ ...initial, isPep }, backup.persons) && (
        <p className="flag" role="status">
          <span aria-hidden="true">⚠</span> PEP-betroffen: Das Mandat wird als Risikoklasse hoch
          geführt.
        </p>
      )}
      <form onSubmit={(e) => void submit(e)} noValidate>
        {error !== null && (
          <p role="alert" tabIndex={-1} ref={errorRef}>
            Nicht gespeichert. {error.text}
          </p>
        )}
        <p className="field">
          <label htmlFor={fid('id')}>Mandatsnummer (Pflicht)</label>
          <input
            id={fid('id')}
            type="text"
            value={id}
            readOnly={editing}
            aria-describedby={editing ? fid('id-hint') : undefined}
            onChange={(e) => setId(e.target.value)}
          />
          {editing && (
            <span className="hint" id={fid('id-hint')}>
              Die Nummer lässt sich nicht ändern.
            </span>
          )}
        </p>
        <p className="field">
          <label htmlFor={fid('name')}>Name (Pflicht)</label>
          <input
            id={fid('name')}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </p>
        <p className="field">
          <label htmlFor={fid('form')}>Rechtsform</label>
          <select id={fid('form')} value={legalForm} onChange={(e) => setLegalForm(e.target.value)}>
            {!rules.legalForms.some((f) => f.key === legalForm) && (
              <option value={legalForm}>— bitte wählen —</option>
            )}
            {rules.legalForms.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </p>
        <p className="field">
          <input
            id={fid('active')}
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />{' '}
          <label htmlFor={fid('active')}>Aktiv (in DATEV nicht beendet)</label>
        </p>
        <p className="field">
          <label htmlFor={fid('status')}>Status der Identifizierung</label>
          <select id={fid('status')} value={idStatus} onChange={(e) => setIdStatus(e.target.value)}>
            {ID_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ID_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </p>
        <p className="field">
          <label htmlFor={fid('group')}>Risikogruppe</label>
          <select
            id={fid('group')}
            value={riskGroupId}
            onChange={(e) => setRiskGroupId(e.target.value)}
          >
            <option value="">— nicht eingestuft —</option>
            {riskGroupId !== '' && !rules.riskGroups.some((g) => g.id === riskGroupId) && (
              <option value={riskGroupId}>{riskGroupId} (unbekannt)</option>
            )}
            {rules.riskGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.id} {g.name} ({g.riskClass})
              </option>
            ))}
          </select>
        </p>
        <p className="field">
          <label htmlFor={fid('reason')}>Begründung der Risikoklasse</label>
          <input
            id={fid('reason')}
            type="text"
            value={riskReason}
            maxLength={500}
            aria-describedby={fid('reason-hint')}
            onChange={(e) => setRiskReason(e.target.value)}
          />
          <span className="hint" id={fid('reason-hint')}>
            Pflicht im Sinne der Dokumentation, wenn die Gruppe gegen den Vorschlag gewählt wurde.
          </span>
        </p>
        <p className="field">
          <input
            id={fid('pep')}
            type="checkbox"
            checked={isPep}
            aria-describedby={fid('pep-hint')}
            onChange={(e) => setIsPep(e.target.checked)}
          />{' '}
          <label htmlFor={fid('pep')}>Politisch exponierte Person (PEP)</label>
          <span className="hint" id={fid('pep-hint')}>
            PEP bedeutet immer Risikoklasse hoch, unabhängig von der Risikogruppe.
          </span>
        </p>
        {dateField(
          'first',
          'Erste Anforderung der Unterlagen am',
          firstRequestOn,
          setFirstRequestOn,
        )}
        {dateField('check', 'Letzte Prüfung am', lastCheckOn, setLastCheckOn)}
        {dateField('end', 'Mandat beendet am', endedOn, setEndedOn)}
        <p>
          <button type="submit" disabled={busy}>
            Speichern
          </button>{' '}
          <button type="button" onClick={onCancel}>
            Abbrechen
          </button>
        </p>
      </form>
      {editing && <PersonsSection mandateId={start.id} />}
    </section>
  );
}
