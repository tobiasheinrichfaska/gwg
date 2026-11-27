import {
  isDateKey,
  isPartialDate,
  type IdStatus,
  type PersonRole,
  type RiskClass,
} from '../logic/index.ts';

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

/** Display form of a partial birth date: YYYY-MM-DD → DD.MM.YYYY, YYYY-MM → MM.YYYY, YYYY → YYYY. */
export function formatBirth(birth: string | null | undefined): string {
  if (birth === null || birth === undefined || birth === '') return NONE;
  if (!isPartialDate(birth)) return birth;
  const [y, m, d] = birth.split('-');
  return [d, m, y].filter((x) => x !== undefined).join('.');
}

export const PERSON_ROLE_LABELS: Record<PersonRole, string> = {
  inhaber: 'Inhaber',
  geschaeftsfuehrer: 'Geschäftsführer',
  gesellschafter: 'Gesellschafter',
  'wirtschaftlich-berechtigter': 'Wirtschaftlich Berechtigter',
  vertreter: 'Vertreter',
  sonstige: 'Sonstige',
};
