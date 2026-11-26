import { LEGAL_FORMS } from '../config.ts';
import type { CheckType } from './model.ts';

export function checkTypeOf(legalForm: string): CheckType | null {
  return LEGAL_FORMS.find((f) => f.key === legalForm)?.checkType ?? null;
}

export function needsRegisterLookup(legalForm: string): boolean {
  return LEGAL_FORMS.find((f) => f.key === legalForm)?.registerLookup ?? false;
}
