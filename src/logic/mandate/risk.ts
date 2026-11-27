import type { RulesConfig } from '../config.ts';
import type { Mandate, RiskClass } from './model.ts';

/** A politically exposed person is always high risk, whatever the group says. */
export function effectiveRiskClass(m: Mandate, rules: RulesConfig): RiskClass | null {
  if (m.isPep) return 'hoch';
  return rules.riskGroups.find((g) => g.id === m.riskGroupId)?.riskClass ?? null;
}
