import type { RulesConfig } from '../config.ts';
import { PEP_ROLES, type Mandate, type Person, type RiskClass } from './model.ts';

/**
 * PEP-affected: the manual mark, or a person in a relevant role who answered 'ja' (PEP) or whose
 * `nahestehend` is 'ja'. 'unbekannt' and 'nein' do not count.
 */
export function isPepAffected(m: Mandate, persons: readonly Person[]): boolean {
  if (m.isPep) return true;
  return persons.some(
    (p) =>
      p.mandateId === m.id &&
      PEP_ROLES.includes(p.role) &&
      (p.pep.answer === 'ja' || p.pep.nahestehend === 'ja'),
  );
}

/** A PEP-affected mandate is always high risk, whatever the group says. */
export function effectiveRiskClass(
  m: Mandate,
  persons: readonly Person[],
  rules: RulesConfig,
): RiskClass | null {
  if (isPepAffected(m, persons)) return 'hoch';
  return rules.riskGroups.find((g) => g.id === m.riskGroupId)?.riskClass ?? null;
}
