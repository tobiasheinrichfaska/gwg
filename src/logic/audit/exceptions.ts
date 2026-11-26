import type { RulesConfig } from '../config.ts';
import { daysBetween, isDateKey } from '../core/time.ts';
import { nextReviewDate, type DateKey, type Mandate } from '../mandate/index.ts';

export interface AuditExceptions {
  /** Active, no risk group. */
  unclassified: Mandate[];
  /** Active, identification empty. */
  unidentified: Mandate[];
  /** Active, identification incomplete. */
  stalled: Mandate[];
  /** Active, identified, periodic review overdue `today` (or no valid date of the last review). */
  overdue: Mandate[];
}

/**
 * The four exception lists of the yearly audit; all must be empty before it can be closed.
 * Fails toward a finding, never toward silence: an unknown risk group counts as unclassified, and a
 * "complete" identification with no (valid) date of the last review counts as overdue.
 * `today` must be a valid date key (a programming error otherwise, it throws).
 */
export function auditExceptions(
  mandates: readonly Mandate[],
  today: DateKey,
  rules: RulesConfig,
): AuditExceptions {
  if (!isDateKey(today)) throw new Error(`bad date key: ${today}`);
  const active = mandates.filter((m) => m.active);
  return {
    unclassified: active.filter(
      (m) => m.riskGroupId === null || !rules.riskGroups.some((g) => g.id === m.riskGroupId),
    ),
    unidentified: active.filter((m) => m.idStatus === 'leer'),
    stalled: active.filter((m) => m.idStatus === 'unvollstaendig' || m.idStatus === 'eskalation'),
    overdue: active.filter((m) => {
      if (m.idStatus !== 'vollstaendig') return false;
      if (m.lastCheckOn === null || !isDateKey(m.lastCheckOn)) return true;
      const due = nextReviewDate(m, rules);
      // No class (unknown group) is already listed as unclassified; do not list it twice.
      return due !== null && daysBetween(due, today) > 0;
    }),
  };
}

export function auditIsClean(e: AuditExceptions): boolean {
  return Object.values(e).every((list) => list.length === 0);
}
