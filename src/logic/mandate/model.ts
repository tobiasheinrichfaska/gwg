import type { DateKey } from '../core/index.ts';
import type { Result as CoreResult } from '../core/index.ts';
import { ok as coreOk, fail as coreFail } from '../core/index.ts';

export type { DateKey };

export type RiskClass = 'niedrig' | 'normal' | 'hoch';

/** Identification status as kept in the DATEV master data, plus the two states only this tool sets. */
export const ID_STATUSES = [
  'leer',
  'unvollstaendig',
  'vollstaendig',
  'eskalation',
  'gekuendigt',
] as const;
export type IdStatus = (typeof ID_STATUSES)[number];

/** Kind of review a client needs: A natural person / sole trader, B registered sole trader, C company. */
export type CheckType = 'A' | 'B' | 'C';

export interface LegalForm {
  key: string;
  label: string;
  checkType: CheckType;
  /** The register lookup (commercial/transparency register) belongs to the review. */
  registerLookup: boolean;
}

export interface RiskGroup {
  /** e.g. 'N-01'. */
  id: string;
  name: string;
  riskClass: RiskClass;
}

export interface Mandate {
  /** DATEV client number. */
  id: string;
  name: string;
  /** Key of a `LegalForm`. */
  legalForm: string;
  /** Active in DATEV. */
  active: boolean;
  idStatus: IdStatus;
  /** Key of a `RiskGroup`; null = not classified yet (an exception in the yearly audit). */
  riskGroupId: string | null;
  /** Mandatory when the group was chosen against the suggestion. */
  riskReason: string;
  /** Manual PEP mark (e.g. from DATEV); persons' self-disclosures add to it (`isPepAffected`). */
  isPep: boolean;
  /** First request for documents was sent; starts the dunning clock. */
  firstRequestOn: DateKey | null;
  /** Last completed review (identification or periodic). */
  lastCheckOn: DateKey | null;
  /** Mandate ended (DATEV inactive); starts the retention clock. */
  endedOn: DateKey | null;
}

export const PERSON_ROLES = [
  'inhaber',
  'geschaeftsfuehrer',
  'gesellschafter',
  'wirtschaftlich-berechtigter',
  'vertreter',
  'sonstige',
] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export const PEP_ANSWERS = ['ja', 'nein', 'unbekannt'] as const;
export type PepAnswer = (typeof PEP_ANSWERS)[number];

/** Roles whose PEP self-disclosure counts for the mandate (not 'sonstige'). */
export const PEP_ROLES: readonly PersonRole[] = [
  'inhaber',
  'geschaeftsfuehrer',
  'gesellschafter',
  'wirtschaftlich-berechtigter',
  'vertreter',
];

/**
 * PEP self-disclosure of one person (asked and documented, not checked against a list).
 * `amtEndedOn` is only stored and shown; no one-year rule is built in (legally unconfirmed).
 */
export interface PepDisclosure {
  /** null = not asked yet. */
  answer: PepAnswer | null;
  askedOn: DateKey | null;
  /** Office or function, one line, may be empty. */
  funktion: string;
  amtEndedOn: DateKey | null;
  /** Family member or close associate of a PEP; null = not asked. */
  nahestehend: PepAnswer | null;
  /** Sign-off for the business relationship with a PEP. */
  approvedOn: DateKey | null;
  /** Who signed off; not empty when `approvedOn` is set. */
  approvedBy: string;
}

export const emptyPep = (): PepDisclosure => ({
  answer: null,
  askedOn: null,
  funktion: '',
  amtEndedOn: null,
  nahestehend: null,
  approvedOn: null,
  approvedBy: '',
});

/** A natural person connected to a mandate (owner, managing director, beneficial owner ...). */
export interface Person {
  id: string;
  /** Client number of the `Mandate` the person belongs to (n : 1). */
  mandateId: string;
  role: PersonRole;
  lastName: string;
  /** May be empty. */
  firstName: string;
  /** 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'; null = unknown (same shape as the sanctions logic's partial date). */
  birth: string | null;
  pep: PepDisclosure;
}

export type SanctionClass = 'gruen' | 'gelb' | 'rot';

/** Error codes; the data-model page lists every one (checked by a test). */
export type Reason =
  | 'bad-date'
  | 'bad-id'
  | 'unknown-legal-form'
  | 'unknown-risk-group'
  | 'bad-risk-reason'
  | 'bad-status'
  | 'bad-end'
  | 'bad-config'
  | 'bad-person'
  | 'bad-pep'
  | 'unknown-mandate'
  | 'bad-closing'
  | 'bad-backup'
  | 'bad-list'
  | 'unsupported-version'
  | 'duplicate-id'
  | 'file-too-large'
  | 'store-failed';

export type Result<T> = CoreResult<T, Reason>;

export const ok = <T>(value: T): Result<T> => coreOk(value);
export const fail = (reason: Reason): Result<never> => coreFail(reason);
