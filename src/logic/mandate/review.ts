import type { RulesConfig } from '../config.ts';
import { addMonths, isDateKey } from '../core/index.ts';
import type { DateKey, Mandate, Person } from './model.ts';
import { effectiveRiskClass } from './risk.ts';

/** Next periodic review; null when the mandate was never reviewed or has no risk class. */
export function nextReviewDate(
  m: Mandate,
  persons: readonly Person[],
  rules: RulesConfig,
): DateKey | null {
  const cls = effectiveRiskClass(m, persons, rules);
  if (!cls || !m.lastCheckOn || !isDateKey(m.lastCheckOn)) return null;
  return addMonths(m.lastCheckOn, rules.reviewIntervalMonths[cls]);
}
