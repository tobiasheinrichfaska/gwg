import { isDateKey, type IdStatus, type RiskClass } from '../logic/index.ts';

/** Shown where a value is missing. */
export const NONE = '—';

/** Display form of a stored date (YYYY-MM-DD → DD.MM.YYYY). The stored form never changes. */
export function formatDate(key: string | null | undefined): string {
  if (key === null || key === undefined || key === '') return NONE;
  if (!isDateKey(key)) return key;
  return `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}`;
}

export const ID_STATUS_LABELS: Record<IdStatus, string> = {
  leer: 'leer',
  unvollstaendig: 'unvollständig',
  vollstaendig: 'vollständig',
  eskalation: 'Eskalation',
  gekuendigt: 'gekündigt',
};

export const RISK_CLASS_LABELS: Record<RiskClass, string> = {
  niedrig: 'niedrig',
  normal: 'normal',
  hoch: 'hoch',
};
