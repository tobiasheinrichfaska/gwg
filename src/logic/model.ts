/** Dates are calendar days as 'YYYY-MM-DD' (no time zone); "today" is always a parameter. */
export type DateKey = string;

export type RiskClass = 'niedrig' | 'normal' | 'hoch';

/** Identification status as kept in the DATEV master data, plus the two states only this tool sets. */
export type IdStatus = 'leer' | 'unvollstaendig' | 'vollstaendig' | 'eskalation' | 'gekuendigt';

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

export type SanctionClass = 'gruen' | 'gelb' | 'rot';

/** Error codes; the data-model page lists every one (checked by a test). */
export type Reason =
  | 'bad-date'
  | 'bad-id'
  | 'unknown-legal-form'
  | 'unknown-risk-group'
  | 'bad-risk-reason'
  | 'bad-status'
  | 'bad-end';

export type Result<T> = { ok: true; value: T } | { ok: false; reason: Reason };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (reason: Reason): Result<never> => ({ ok: false, reason });
