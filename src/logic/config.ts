import type { LegalForm, RiskClass, RiskGroup } from './model.ts';

/**
 * Every number and table the rules read. Adding a case = adding data here.
 *
 * SOURCE STATUS: the structure (three risk classes, risk-based review) follows the GwG. The concrete
 * numbers below are a starting proposal, NOT law: the statute names no month counts, dunning days or
 * similarity thresholds. Each firm fixes them in its own risk analysis; see docs/data-model.html.
 */

/** Months until the next periodic review, per risk class. */
export const REVIEW_INTERVAL_MONTHS: Record<RiskClass, number> = {
  niedrig: 36,
  normal: 24,
  hoch: 12,
};

/** Dunning ladder for an incomplete identification: days after the first request. */
export const DUNNING_STEPS = [
  { day: 14, stage: 'erinnerung' },
  { day: 28, stage: 'androhung' },
  { day: 42, stage: 'eskalation' },
] as const;

export type DunningStage = 'keine' | (typeof DUNNING_STEPS)[number]['stage'];

/** Years kept after the end of the calendar year in which the mandate ended. */
export const RETENTION_YEARS = 5;

/** Days until the re-check after a discrepancy report to the transparency register. */
export const DISCREPANCY_RECHECK_DAYS = 60;

/** Name similarity thresholds of the sanctions screening (0..1). */
export const SANCTION_THRESHOLDS = { possible: 0.85, strong: 0.9 } as const;

/** Legal forms and the review type each one gets. A plain GbR is treated like a company (open question). */
export const LEGAL_FORMS: readonly LegalForm[] = [
  { key: 'natuerliche-person', label: 'Natürliche Person', checkType: 'A' },
  { key: 'einzelunternehmen', label: 'Einzelunternehmen (nicht eingetragen)', checkType: 'A' },
  { key: 'ek', label: 'Eingetragener Kaufmann (e. K.)', checkType: 'B' },
  { key: 'gmbh', label: 'GmbH', checkType: 'C' },
  { key: 'ug', label: 'UG (haftungsbeschränkt)', checkType: 'C' },
  { key: 'ag', label: 'AG', checkType: 'C' },
  { key: 'kg', label: 'KG', checkType: 'C' },
  { key: 'ohg', label: 'OHG', checkType: 'C' },
  { key: 'partg', label: 'Partnerschaftsgesellschaft', checkType: 'C' },
  { key: 'egbr', label: 'Eingetragene GbR (eGbR)', checkType: 'C' },
  { key: 'gbr', label: 'GbR (nicht eingetragen)', checkType: 'C' },
  { key: 'verein', label: 'Verein', checkType: 'C' },
  { key: 'stiftung', label: 'Stiftung', checkType: 'C' },
];

/** Starting risk groups (a firm edits these). */
export const DEFAULT_RISK_GROUPS: readonly RiskGroup[] = [
  { id: 'N-01', name: 'Arbeitnehmer und Rentner ohne weitere Einkünfte', riskClass: 'niedrig' },
  { id: 'N-02', name: 'Private Vermietung und Verpachtung im Inland', riskClass: 'niedrig' },
  {
    id: 'N-03',
    name: 'Langjährige örtliche Bestandsmandate ohne Bargeld/Ausland',
    riskClass: 'niedrig',
  },
  {
    id: 'M-01',
    name: 'Handwerk, Dienstleistung, Handel (Inland, einfache Struktur)',
    riskClass: 'normal',
  },
  { id: 'M-02', name: 'Freiberufler und Heilberufe', riskClass: 'normal' },
  { id: 'H-01', name: 'Bargeldintensive Betriebe', riskClass: 'hoch' },
  { id: 'H-02', name: 'Komplexe oder verschachtelte Beteiligungsstruktur', riskClass: 'hoch' },
  { id: 'H-03', name: 'Bezug zu Hochrisikoländern', riskClass: 'hoch' },
  { id: 'H-04', name: 'Politisch exponierte Person (PEP)', riskClass: 'hoch' },
  { id: 'H-05', name: 'Bau- und Immobilienbranche', riskClass: 'hoch' },
];
