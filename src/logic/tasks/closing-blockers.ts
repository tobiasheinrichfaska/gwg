import type { DateKey } from '../core/index.ts';
import type { Mandate, Person } from '../mandate/model.ts';
import { openHits, type Hit, type ScreeningDecision } from '../sanctions/index.ts';
import type { Task } from './tasks.ts';

/** Why the yearly audit cannot be closed right now (decision Tobias, T9b / U1). */
export type ClosingBlocker =
  | { kind: 'red-hits'; count: number }
  | { kind: 'pep-approvals'; count: number }
  /** Persons/mandates whose name cannot be compared (never silently green). */
  | { kind: 'unscreenable'; count: number }
  | {
      kind: 'screening-missing';
      /** No list loaded, the run is outdated, or no run in this session (hits live in memory only). */
      why: 'no-list' | 'stale' | 'never-run';
    };

/** Does not block, but the closing person should see it. */
export interface ClosingWarning {
  kind: 'yellow-hits';
  count: number;
}

export interface ClosingCheck {
  blockers: ClosingBlocker[];
  warnings: ClosingWarning[];
}

export interface ClosingBlockersInput {
  /** Task list of today (only the `pep-approval` and `sanction-unscreenable` kinds are read). */
  tasks: readonly Task[];
  /** Hits of the last run (live ones), with the saved decisions, persons and mandates. */
  hits: readonly Hit[];
  decisions: readonly ScreeningDecision[];
  persons: readonly Person[];
  mandates: readonly Mandate[];
  screening: { hasList: boolean; stale: boolean; ranOn: DateKey | null };
}

/**
 * What stops the closing of the audit: open red hits, open PEP approvals, and a screening that cannot
 * be trusted (no list, outdated, or not run: without that, hits would be missing unnoticed). Open
 * yellow hits are only a warning. Pure; `checkAuditClosing` is unchanged and checks the closing itself.
 */
export function closingBlockers(input: ClosingBlockersInput): ClosingCheck {
  const blockers: ClosingBlocker[] = [];
  const warnings: ClosingWarning[] = [];
  const open = openHits(input.hits, input.decisions, input.persons, input.mandates);
  const red = open.filter((h) => h.klasse === 'rot').length;
  const yellow = open.length - red;
  if (red > 0) blockers.push({ kind: 'red-hits', count: red });
  const pep = input.tasks.filter((t) => t.kind === 'pep-approval').length;
  if (pep > 0) blockers.push({ kind: 'pep-approvals', count: pep });
  const unscreenable = input.tasks.filter((t) => t.kind === 'sanction-unscreenable').length;
  if (unscreenable > 0) blockers.push({ kind: 'unscreenable', count: unscreenable });
  const s = input.screening;
  if (!s.hasList) blockers.push({ kind: 'screening-missing', why: 'no-list' });
  else if (s.ranOn === null) blockers.push({ kind: 'screening-missing', why: 'never-run' });
  else if (s.stale) blockers.push({ kind: 'screening-missing', why: 'stale' });
  if (yellow > 0) warnings.push({ kind: 'yellow-hits', count: yellow });
  return { blockers, warnings };
}
