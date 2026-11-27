import {
  currentSnapshot,
  decisionKey,
  entrySnapshot,
  type Backup,
  type Hit,
  type ListIndex,
  type ScreeningDecision,
} from '../../../logic/index.ts';

/** One hit as the screen handles it: the current hit (if the run saw it) and the stored decision (if any). */
export interface HitCase {
  key: string;
  subjectKind: 'person' | 'mandate';
  subjectId: string;
  mandateId: string | null;
  entryId: string;
  hit: Hit | null;
  decision: ScreeningDecision | null;
  /** The decision still holds: subject and list entry unchanged since. */
  valid: boolean;
}

export const hitKey = (h: Pick<Hit, 'subjectKind' | 'subjectId' | 'entryId' | 'kind'>): string =>
  decisionKey({
    subjectKind: h.subjectKind,
    subjectId: h.subjectId,
    entryId: h.entryId,
    listKind: h.kind,
  });

function mandateOf(
  kind: 'person' | 'mandate',
  id: string,
  backup: Pick<Backup, 'persons' | 'mandates'>,
): string | null {
  if (kind === 'mandate') return backup.mandates.some((m) => m.id === id) ? id : null;
  return backup.persons.find((p) => p.id === id)?.mandateId ?? null;
}

function validity(
  d: ScreeningDecision,
  backup: Pick<Backup, 'persons' | 'mandates'>,
  list: ListIndex | null,
): boolean {
  const now = currentSnapshot(d.subjectKind, d.subjectId, backup.persons, backup.mandates);
  if (now === null || now !== d.subjectSnapshot) return false;
  const entry = list?.entries.find((e) => e.id === d.entryId);
  return entry !== undefined && entrySnapshot(entry) === d.entrySnapshot;
}

export function caseOf(
  hit: Hit | null,
  decision: ScreeningDecision | null,
  key: string,
  backup: Pick<Backup, 'persons' | 'mandates'>,
  list: ListIndex | null,
): HitCase | null {
  const src = hit ?? decision;
  if (src === null) return null;
  return {
    key,
    subjectKind: src.subjectKind,
    subjectId: src.subjectId,
    mandateId: hit?.mandateId ?? mandateOf(src.subjectKind, src.subjectId, backup),
    entryId: src.entryId,
    hit,
    decision,
    valid: decision !== null && validity(decision, backup, list),
  };
}

/** The case behind a key: from the last run and/or the stored decisions. */
export function findCase(
  key: string,
  liveHits: readonly Hit[],
  backup: Backup,
  list: ListIndex | null,
): HitCase | null {
  const hit = liveHits.find((h) => hitKey(h) === key) ?? null;
  const decision =
    backup.screeningDecisions.find((d) => d.listKind === 'sanktion' && decisionKey(d) === key) ??
    null;
  return caseOf(hit, decision, key, backup, list);
}

/** Stored decisions that still hold, with the matching current hit if the last run has it. */
export function decidedCases(
  liveHits: readonly Hit[],
  backup: Backup,
  list: ListIndex | null,
): HitCase[] {
  const out: HitCase[] = [];
  for (const d of backup.screeningDecisions) {
    if (d.listKind !== 'sanktion') continue;
    const key = decisionKey(d);
    const c = caseOf(liveHits.find((h) => hitKey(h) === key) ?? null, d, key, backup, list);
    if (c !== null && c.valid) out.push(c);
  }
  return out;
}
