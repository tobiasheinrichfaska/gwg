import { DEFAULT_RISK_GROUPS, REVIEW_INTERVAL_MONTHS } from '../config.ts';
import { addMonths, isDateKey } from '../core/time.ts';
import type { DateKey, Mandate, RiskGroup } from './model.ts';
import { effectiveRiskClass } from './risk.ts';

/** Next periodic review; null when the mandate was never reviewed or has no risk class. */
export function nextReviewDate(
  m: Mandate,
  groups: readonly RiskGroup[] = DEFAULT_RISK_GROUPS,
): DateKey | null {
  const cls = effectiveRiskClass(m, groups);
  if (!cls || !m.lastCheckOn || !isDateKey(m.lastCheckOn)) return null;
  return addMonths(m.lastCheckOn, REVIEW_INTERVAL_MONTHS[cls]);
}
