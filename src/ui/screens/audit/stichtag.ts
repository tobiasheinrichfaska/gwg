import type { DateKey } from '../../../logic/index.ts';

/**
 * Default cut-off date of the yearly audit: 30 November of the current year, or of the previous year
 * while today is before 1 November (the last audit is then still the current one). `today` must be a
 * valid date key.
 */
export function defaultStichtag(today: DateKey): DateKey {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return `${month < 11 ? year - 1 : year}-11-30`;
}
