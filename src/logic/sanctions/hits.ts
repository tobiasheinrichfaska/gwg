import type { Mandate, Person } from '../mandate/model.ts';
import { decisionKey, type ScreeningDecision } from './decision.ts';
import { currentSnapshot, type Hit } from './screening.ts';

/** The decision that still holds for a hit: same subject, entry and list kind, subject and entry unchanged. */
function validDecision(
  h: Hit,
  byKey: ReadonlyMap<string, ScreeningDecision>,
  persons: readonly Person[],
  mandates: readonly Mandate[],
): ScreeningDecision | null {
  const d = byKey.get(decisionKey({ ...h, listKind: h.kind }));
  if (d === undefined) return null;
  if (d.entrySnapshot !== h.entrySnapshot) return null;
  if (d.subjectSnapshot !== currentSnapshot(h.subjectKind, h.subjectId, persons, mandates)) {
    return null;
  }
  return d;
}

function index(decisions: readonly ScreeningDecision[]): Map<string, ScreeningDecision> {
  return new Map(decisions.map((d) => [decisionKey(d), d]));
}

/**
 * Hits without a valid decision. A decision voids when the person's/mandate's name or birth changed or
 * the list entry changed; a new list state with the same, unchanged entry keeps it. A confirmed hit is
 * not open here: see `confirmedHits`.
 */
export function openHits(
  hits: readonly Hit[],
  decisions: readonly ScreeningDecision[],
  persons: readonly Person[],
  mandates: readonly Mandate[],
): Hit[] {
  const byKey = index(decisions);
  return hits.filter((h) => validDecision(h, byKey, persons, mandates) === null);
}

/** Hits with a valid 'treffer-bestaetigt' decision (for the report/block), with that decision. */
export function confirmedHits(
  hits: readonly Hit[],
  decisions: readonly ScreeningDecision[],
  persons: readonly Person[],
  mandates: readonly Mandate[],
): { hit: Hit; decision: ScreeningDecision }[] {
  const byKey = index(decisions);
  const out: { hit: Hit; decision: ScreeningDecision }[] = [];
  for (const h of hits) {
    const d = validDecision(h, byKey, persons, mandates);
    if (d !== null && d.decision === 'treffer-bestaetigt') out.push({ hit: h, decision: d });
  }
  return out;
}
