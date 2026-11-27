import { fail, isObj, ok, type Result } from '../core/index.ts';
import type { Reason } from '../mandate/index.ts';
import { parseBackup, type Backup } from './format.ts';

/** Deletes a person and, in the same step, every screening decision about that person. */
export function removePerson(b: Backup, personId: string): Backup {
  return {
    ...b,
    persons: b.persons.filter((p) => p.id !== personId),
    screeningDecisions: b.screeningDecisions.filter(
      (d) => !(d.subjectKind === 'person' && d.subjectId === personId),
    ),
  };
}

/** Deletes a mandate with its persons and the decisions about the mandate and about those persons. */
export function removeMandate(b: Backup, mandateId: string): Backup {
  const gone = new Set(b.persons.filter((p) => p.mandateId === mandateId).map((p) => p.id));
  return {
    ...b,
    mandates: b.mandates.filter((m) => m.id !== mandateId),
    persons: b.persons.filter((p) => p.mandateId !== mandateId),
    screeningDecisions: b.screeningDecisions.filter((d) =>
      d.subjectKind === 'person' ? !gone.has(d.subjectId) : d.subjectId !== mandateId,
    ),
  };
}

export interface OrphanRepair {
  backup: Backup;
  /** Number of screening decisions that were removed. */
  removed: number;
}

/**
 * For a stored text that `parseBackup` refuses: drops the screening decisions whose person or mandate does
 * not exist and parses again. Succeeds only when that was the ONLY problem (and something was removed);
 * every other defect, or a text without orphans, fails with the reason of the plain parse.
 */
export function repairOrphanDecisions(text: string): Result<OrphanRepair, Reason> {
  const plain = parseBackup(text);
  if (plain.ok) return fail('bad-backup', 'no-orphans');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return plain;
  }
  if (!isObj(raw) || !Array.isArray(raw.screeningDecisions)) return plain;
  const ids = (key: string): Set<string> =>
    new Set(
      (Array.isArray(raw[key]) ? (raw[key] as unknown[]) : []).flatMap((x) =>
        isObj(x) && typeof x.id === 'string' ? [x.id] : [],
      ),
    );
  const persons = ids('persons');
  const mandates = ids('mandates');
  const kept = raw.screeningDecisions.filter((d: unknown) => {
    if (!isObj(d) || typeof d.subjectId !== 'string') return true;
    if (d.subjectKind === 'person') return persons.has(d.subjectId);
    if (d.subjectKind === 'mandate') return mandates.has(d.subjectId);
    return true;
  });
  const removed = raw.screeningDecisions.length - kept.length;
  if (removed === 0) return plain;
  const again = parseBackup(JSON.stringify({ ...raw, screeningDecisions: kept }));
  return again.ok ? ok({ backup: again.value, removed }) : plain;
}
