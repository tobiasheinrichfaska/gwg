import type { RulesConfig } from '../config.ts';
import type { CheckType } from './model.ts';

export function checkTypeOf(legalForm: string, rules: RulesConfig): CheckType | null {
  return rules.legalForms.find((f) => f.key === legalForm)?.checkType ?? null;
}

export function needsRegisterLookup(legalForm: string, rules: RulesConfig): boolean {
  return rules.legalForms.find((f) => f.key === legalForm)?.registerLookup ?? false;
}
