import { ok as coreOk, fail as coreFail } from '../core/index.ts';
import type { PepDisclosure, PersonRole, Reason, Result } from './model.ts';

// Runtime values of the mandate model. model.ts holds types only; outside mandate/ import values from the module root.

/** Identification status as kept in the DATEV master data, plus the two states only this tool sets. */
export const ID_STATUSES = [
  'leer',
  'unvollstaendig',
  'vollstaendig',
  'eskalation',
  'gekuendigt',
] as const;

export const PERSON_ROLES = [
  'inhaber',
  'geschaeftsfuehrer',
  'gesellschafter',
  'wirtschaftlich-berechtigter',
  'vertreter',
  'sonstige',
] as const;

export const PEP_ANSWERS = ['ja', 'nein', 'unbekannt'] as const;

/** Roles whose PEP self-disclosure counts for the mandate (not 'sonstige'). */
export const PEP_ROLES: readonly PersonRole[] = [
  'inhaber',
  'geschaeftsfuehrer',
  'gesellschafter',
  'wirtschaftlich-berechtigter',
  'vertreter',
];

export const emptyPep = (): PepDisclosure => ({
  answer: null,
  askedOn: null,
  funktion: '',
  amtEndedOn: null,
  nahestehend: null,
  approvedOn: null,
  approvedBy: '',
});

export const ok = <T>(value: T): Result<T> => coreOk(value);
export const fail = (reason: Reason): Result<never> => coreFail(reason);
