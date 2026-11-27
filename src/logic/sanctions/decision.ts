import { fail, isDateKey, ok, type DateKey, type Result } from '../core/index.ts';
import type { Mandate, Person, Reason } from '../mandate/model.ts';
import type { ListEntry, ListKind } from './list.ts';
import { normalizeName } from './normalize.ts';

export const MAX_DECISION_REASON = 500;
export const MAX_DECIDER_LENGTH = 100;
const MAX_ID = 200;
/** A snapshot is a 64-bit hash as hex (16 characters); the limit leaves room, but refuses old long texts. */
const MAX_SNAPSHOT = 64;

export const DECISIONS = ['kein-treffer', 'treffer-bestaetigt'] as const;
export type DecisionKind = (typeof DECISIONS)[number];
export type SubjectKind = 'person' | 'mandate';

/** A human's ruling on one hit (person or mandate against a list entry). Stored in the backup. */
export interface ScreeningDecision {
  subjectKind: SubjectKind;
  subjectId: string;
  entryId: string;
  listKind: ListKind;
  /** State date of the list the hit was seen on (information only). */
  listFetchedOn: DateKey;
  decision: DecisionKind;
  /** Mandatory, also for 'kein-treffer' (the reason for the exclusion); 1 to 500 characters, line breaks allowed. */
  reason: string;
  decidedOn: DateKey;
  /** Who decided; one line, at most 100 characters. */
  decidedBy: string;
  /** Normalized name and birth of the subject at decision time (`subjectSnapshot`); a change voids the decision. */
  subjectSnapshot: string;
  /** Fingerprint of the list entry at decision time (`entrySnapshot`); a change voids the decision. */
  entrySnapshot: string;
  /** Note that the measure (report/block) was documented; empty = still open. Only for 'treffer-bestaetigt'. */
  actionNote: string;
}

/** Last screening run per list kind, for the display "zuletzt geprüft". */
export interface ScreeningRun {
  ranOn: DateKey;
  listKind: ListKind;
  listFetchedOn: DateKey;
  hitCount: number;
}
export type LastScreening = { sanktion: ScreeningRun | null; pep: ScreeningRun | null };
export const emptyLastScreening = (): LastScreening => ({ sanktion: null, pep: null });

// eslint-disable-next-line no-control-regex
const CONTROL_NO_NL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

const goodText = (s: unknown, max: number, allowEmpty: boolean): boolean =>
  typeof s === 'string' &&
  s.length <= max &&
  (allowEmpty || s.trim() !== '') &&
  !CONTROL_NO_NL.test(s);
const goodLine = (s: unknown, max: number): boolean =>
  typeof s === 'string' && s.length <= max && s.trim() !== '' && !CONTROL.test(s);

/** Fingerprint (64-bit hash, hex) of the normalized name and birth of a person, as stored in a decision. */
export const personSnapshot = (p: Person): string =>
  hash64(`${normalizeName(`${p.firstName} ${p.lastName}`)}|${p.birth ?? ''}`);
/** Fingerprint (64-bit hash, hex) of the normalized name of a mandate. */
export const mandateSnapshot = (m: Mandate): string => hash64(normalizeName(m.name));

/**
 * Synchronous deterministic 64-bit string hash (two cyrb53-style 32-bit lanes with different seeds), as
 * 16 hex characters. No security purpose, only change detection; long names stay short in the backup.
 */
function hash64(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/** Fingerprint of an entry: normalized names and birth dates, order-independent. */
export function entrySnapshot(e: Pick<ListEntry, 'names' | 'births'>): string {
  const names = e.names.map(normalizeName).sort().join('\u0001');
  const births = [...e.births].sort().join('\u0001');
  return hash64(`${names}\u0002${births}`);
}

const SUBJECT_KINDS: readonly string[] = ['person', 'mandate'];
const LIST_KINDS: readonly string[] = ['sanktion', 'pep'];

/** Validates a decision: dates, mandatory fields, and that the subject exists. */
export function checkDecision(
  d: ScreeningDecision,
  persons: readonly Person[],
  mandates: readonly Mandate[],
): Result<ScreeningDecision, Reason> {
  if (typeof d !== 'object' || d === null) return fail('bad-decision');
  if (!isDateKey(d.listFetchedOn) || !isDateKey(d.decidedOn)) return fail('bad-date');
  if (!SUBJECT_KINDS.includes(d.subjectKind) || !LIST_KINDS.includes(d.listKind)) {
    return fail('bad-decision');
  }
  if (!(DECISIONS as readonly string[]).includes(d.decision)) return fail('bad-decision');
  if (!goodLine(d.subjectId, MAX_ID) || !goodLine(d.entryId, MAX_ID)) return fail('bad-decision');
  if (!goodText(d.reason, MAX_DECISION_REASON, false)) return fail('bad-decision');
  if (!goodLine(d.decidedBy, MAX_DECIDER_LENGTH)) return fail('bad-decision');
  if (!goodLine(d.subjectSnapshot, MAX_SNAPSHOT)) return fail('bad-decision');
  if (!goodLine(d.entrySnapshot, MAX_SNAPSHOT)) return fail('bad-decision');
  if (!goodText(d.actionNote, MAX_DECISION_REASON, true)) return fail('bad-decision');
  if (d.decision === 'kein-treffer' && d.actionNote !== '') return fail('bad-decision');
  const exists =
    d.subjectKind === 'person'
      ? persons.some((p) => p.id === d.subjectId)
      : mandates.some((m) => m.id === d.subjectId);
  if (!exists) return fail('unknown-mandate');
  return ok(d);
}

/** Validates the "last screening" note of one list kind. */
export function checkScreeningRun(r: ScreeningRun, kind: ListKind): Result<ScreeningRun, Reason> {
  if (typeof r !== 'object' || r === null) return fail('bad-decision');
  if (!isDateKey(r.ranOn) || !isDateKey(r.listFetchedOn)) return fail('bad-date');
  if (r.listKind !== kind) return fail('bad-decision');
  if (!Number.isInteger(r.hitCount) || r.hitCount < 0) return fail('bad-decision');
  return ok(r);
}

export const decisionKey = (d: {
  subjectKind: string;
  subjectId: string;
  entryId: string;
  listKind: string;
}): string => JSON.stringify([d.subjectKind, d.subjectId, d.entryId, d.listKind]);
