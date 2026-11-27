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
