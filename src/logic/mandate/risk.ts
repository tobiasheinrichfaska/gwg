import { DEFAULT_RISK_GROUPS } from '../config.ts';
import type { Mandate, RiskClass, RiskGroup } from './model.ts';

/** A politically exposed person is always high risk, whatever the group says. */
export function effectiveRiskClass(
  m: Mandate,
  groups: readonly RiskGroup[] = DEFAULT_RISK_GROUPS,
): RiskClass | null {
  if (m.isPep) return 'hoch';
  return groups.find((g) => g.id === m.riskGroupId)?.riskClass ?? null;
}
