import {
  decisionKey,
  type Backup,
  type Hit,
  type ListEntry,
  type Person,
  type ScreeningDecision,
} from '../../../logic/index.ts';
import { PERSON_ROLE_LABELS, formatBirth } from '../../format.ts';

export interface SubjectInfo {
  kind: 'Person' | 'Mandat';
  name: string;
  birth: string;
  role: string;
  mandateId: string;
  mandateName: string;
  person: Person | null;
}

/** The person or mandate a hit is about, as shown next to the list entry; null = no longer there. */
export function describeSubject(
  h: Pick<Hit, 'subjectKind' | 'subjectId' | 'mandateId'>,
  backup: Pick<Backup, 'persons' | 'mandates'>,
): SubjectInfo | null {
  const m = backup.mandates.find((x) => x.id === h.mandateId);
  if (h.subjectKind === 'mandate') {
    const own = backup.mandates.find((x) => x.id === h.subjectId);
    return own === undefined
      ? null
      : {
          kind: 'Mandat',
          name: own.name,
          birth: 'keine Angabe (Mandate haben kein Geburtsdatum)',
          role: 'Mandat selbst',
          mandateId: own.id,
          mandateName: own.name,
          person: null,
        };
  }
  const p = backup.persons.find((x) => x.id === h.subjectId);
  if (p === undefined || m === undefined) return null;
  return {
    kind: 'Person',
    name: `${p.firstName} ${p.lastName}`.trim(),
    birth: formatBirth(p.birth),
    role: PERSON_ROLE_LABELS[p.role],
    mandateId: m.id,
    mandateName: m.name,
    person: p,
  };
}

export const entryMap = (entries: readonly ListEntry[]): Map<string, ListEntry> =>
  new Map(entries.map((e) => [e.id, e]));

/** 0.9123 -> "91 %" */
export const percent = (x: number): string => `${Math.round(x * 100)} %`;

/** "1970/1975" -> "1970 bis 1975"; others like a person's date. */
export function formatListBirth(b: string): string {
  const span = /^(\d{4})\/(\d{4})$/.exec(b);
  return span ? `${span[1]} bis ${span[2]}` : formatBirth(b);
}

/** The same decision (same subject, entry and list) in the newest data set, not the same object. */
export const sameDecision = (a: ScreeningDecision, b: ScreeningDecision): boolean =>
  decisionKey(a) === decisionKey(b);
