import {
  DEFAULT_RISK_GROUPS,
  DUNNING_STEPS,
  LEGAL_FORMS,
  RETENTION_YEARS,
  REVIEW_INTERVAL_MONTHS,
  type DunningStage,
} from './config.ts';
import {
  fail,
  ok,
  type CheckType,
  type DateKey,
  type Mandate,
  type Result,
  type RiskClass,
  type RiskGroup,
} from './model.ts';
import { addMonths, daysBetween, isDateKey } from './time.ts';

export const MAX_REASON_LENGTH = 500;

export function checkTypeOf(legalForm: string): CheckType | null {
  return LEGAL_FORMS.find((f) => f.key === legalForm)?.checkType ?? null;
}

/** A politically exposed person is always high risk, whatever the group says. */
export function effectiveRiskClass(
  m: Mandate,
  groups: readonly RiskGroup[] = DEFAULT_RISK_GROUPS,
): RiskClass | null {
  if (m.isPep) return 'hoch';
  return groups.find((g) => g.id === m.riskGroupId)?.riskClass ?? null;
}

/** Next periodic review; null when the mandate was never reviewed or has no risk class. */
export function nextReviewDate(
  m: Mandate,
  groups: readonly RiskGroup[] = DEFAULT_RISK_GROUPS,
): DateKey | null {
  const cls = effectiveRiskClass(m, groups);
  if (!cls || !m.lastCheckOn) return null;
  return addMonths(m.lastCheckOn, REVIEW_INTERVAL_MONTHS[cls]);
}

/** Dunning stage reached `today`, counted from the first request; the highest reached step wins. */
export function dunningStage(firstRequestOn: DateKey | null, today: DateKey): DunningStage {
  if (!firstRequestOn) return 'keine';
  const elapsed = daysBetween(firstRequestOn, today);
  let stage: DunningStage = 'keine';
  for (const step of DUNNING_STEPS) if (elapsed >= step.day) stage = step.stage;
  return stage;
}

/** First day the records may (must) be deleted: 5 years after the END OF THE CALENDAR YEAR of the end. */
export function retentionDueFrom(endedOn: DateKey | null): DateKey | null {
  if (!endedOn) return null;
  return `${Number(endedOn.slice(0, 4)) + RETENTION_YEARS + 1}-01-01`;
}

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
  // eslint-disable-next-line no-control-regex
  if (m.riskReason.length > MAX_REASON_LENGTH || /[\u0000-\u001f]/.test(m.riskReason)) {
    return fail('bad-risk-reason');
  }
  if (m.idStatus === 'vollstaendig' && m.lastCheckOn === null) return fail('bad-status');
  if (m.endedOn !== null && m.active) return fail('bad-end');
  return ok(m);
}

export interface AuditExceptions {
  /** Active, no risk group. */
  unclassified: Mandate[];
  /** Active, identification empty. */
  unidentified: Mandate[];
  /** Active, identification incomplete. */
  stalled: Mandate[];
  /** Active, identified, periodic review overdue `today`. */
  overdue: Mandate[];
}

/** The four exception lists of the yearly audit; all must be empty before it can be closed. */
export function auditExceptions(
  mandates: readonly Mandate[],
  today: DateKey,
  groups: readonly RiskGroup[] = DEFAULT_RISK_GROUPS,
): AuditExceptions {
  const active = mandates.filter((m) => m.active);
  return {
    unclassified: active.filter((m) => m.riskGroupId === null),
    unidentified: active.filter((m) => m.idStatus === 'leer'),
    stalled: active.filter((m) => m.idStatus === 'unvollstaendig' || m.idStatus === 'eskalation'),
    overdue: active.filter((m) => {
      if (m.idStatus !== 'vollstaendig') return false;
      const due = nextReviewDate(m, groups);
      return due !== null && daysBetween(due, today) > 0;
    }),
  };
}

export function auditIsClean(e: AuditExceptions): boolean {
  return Object.values(e).every((list) => list.length === 0);
}
