import type { RulesConfig } from '../config.ts';
import { isDateKey } from '../core/index.ts';
import { checkTypeOf } from './legal-form.ts';
import { goodLine, MAX_NAME_LENGTH } from './person.ts';
import type { Mandate, Result } from './model.ts';
import { fail, ID_STATUSES, ok } from './values.ts';

export const MAX_REASON_LENGTH = 500;
export const MAX_MANDATE_ID_LENGTH = 50;

export function checkMandate(m: Mandate, rules: RulesConfig): Result<Mandate> {
  // One line each (no control characters, no U+2028/2029/0085), not empty, bounded in length.
  if (!goodLine(m.id, MAX_MANDATE_ID_LENGTH, false) || !goodLine(m.name, MAX_NAME_LENGTH, false)) {
    return fail('bad-id');
  }
  if (checkTypeOf(m.legalForm, rules) === null) return fail('unknown-legal-form');
  if (m.riskGroupId !== null && !rules.riskGroups.some((g) => g.id === m.riskGroupId)) {
    return fail('unknown-risk-group');
  }
  for (const d of [m.firstRequestOn, m.lastCheckOn, m.endedOn]) {
    if (d !== null && !isDateKey(d)) return fail('bad-date');
  }
  if (
    m.riskReason.length > MAX_REASON_LENGTH ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(m.riskReason)
  ) {
    return fail('bad-risk-reason');
  }
  if (!ID_STATUSES.includes(m.idStatus)) return fail('bad-status');
  if (m.idStatus === 'vollstaendig' && m.lastCheckOn === null) return fail('bad-status');
  // Both directions: an end date on an active mandate, and an inactive mandate without an end date
  // (its retention clock would never start and the record would never come up for deletion).
  if (m.endedOn !== null && m.active) return fail('bad-end');
  if (m.endedOn === null && !m.active) return fail('bad-end');
  return ok(m);
}
