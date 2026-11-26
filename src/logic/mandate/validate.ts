import { DEFAULT_RISK_GROUPS } from '../config.ts';
import { isDateKey } from '../core/time.ts';
import { checkTypeOf } from './legal-form.ts';
import { fail, ID_STATUSES, ok, type Mandate, type Result, type RiskGroup } from './model.ts';

export const MAX_REASON_LENGTH = 500;

export function checkMandate(
  m: Mandate,
  groups: readonly RiskGroup[] = DEFAULT_RISK_GROUPS,
): Result<Mandate> {
  if (m.id.trim() === '' || m.name.trim() === '') return fail('bad-id');
  if (checkTypeOf(m.legalForm) === null) return fail('unknown-legal-form');
  if (m.riskGroupId !== null && !groups.some((g) => g.id === m.riskGroupId)) {
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
