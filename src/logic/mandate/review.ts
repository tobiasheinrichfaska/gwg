import type { RulesConfig } from '../config.ts';
import { addMonths, isDateKey } from '../core/index.ts';
import type { DateKey, Mandate } from './model.ts';
import { effectiveRiskClass } from './risk.ts';

/** Next periodic review; null when the mandate was never reviewed or has no risk class. */
export function nextReviewDate(m: Mandate, rules: RulesConfig): DateKey | null {
  const cls = effectiveRiskClass(m, rules);
  if (!cls || !m.lastCheckOn || !isDateKey(m.lastCheckOn)) return null;
  return addMonths(m.lastCheckOn, rules.reviewIntervalMonths[cls]);
}
