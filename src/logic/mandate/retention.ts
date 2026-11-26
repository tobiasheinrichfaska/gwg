import type { RulesConfig } from '../config.ts';
import { isDateKey } from '../core/index.ts';
import type { DateKey } from './model.ts';

/** First day the records may (must) be deleted: 5 years after the END OF THE CALENDAR YEAR of the end. */
export function retentionDueFrom(endedOn: DateKey | null, rules: RulesConfig): DateKey | null {
  if (!endedOn || !isDateKey(endedOn)) return null;
  return `${Number(endedOn.slice(0, 4)) + rules.retentionYears + 1}-01-01`;
}
