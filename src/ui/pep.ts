import { PEP_ROLES, type PepAnswer, type PepDisclosure, type Person } from '../logic/index.ts';
import { formatDate, NONE } from './format.ts';

export const PEP_ANSWER_LABELS: Record<PepAnswer, string> = {
  ja: 'Ja',
  nein: 'Nein',
  unbekannt: 'Unbekannt',
};

/** Roles for which the self-disclosure counts for the mandate. */
export const hasPepDuty = (p: Person): boolean => PEP_ROLES.includes(p.role);

/** Whether an answer needs sign-off by the management level. */
export const needsApproval = (pep: Pick<PepDisclosure, 'answer' | 'nahestehend'>): boolean =>
  pep.answer === 'ja' || pep.nahestehend === 'ja';

/** The consequences of an answer in plain sentences (what the program does and what stays open). */
export function pepConsequences(
  pep: Pick<PepDisclosure, 'answer' | 'nahestehend' | 'approvedOn' | 'approvedBy'>,
): string[] {
  const out: string[] = [];
  if (needsApproval(pep)) {
    out.push('Das Mandat wird als Risikoklasse hoch geführt.');
    out.push(
      pep.approvedOn !== null
        ? `Freigabe durch die Führungsebene liegt vor (${formatDate(pep.approvedOn)}, ${pep.approvedBy}).`
        : 'Freigabe durch die Führungsebene erforderlich.',
    );
  }
  if (pep.answer === 'unbekannt') out.push('Auskunft unbekannt: Aufgabe bleibt offen.');
  if (pep.nahestehend === 'unbekannt') {
    out.push('Nähe zu einer PEP unbekannt: Sie zählt nicht als PEP, bitte später klären.');
  }
  if (out.length === 0) {
    out.push('Keine PEP-Folgen: Die Risikoklasse richtet sich nach der Risikogruppe.');
  }
  return out;
}

/** One line for the person list. */
export function pepSummary(p: Person): string {
  if (!hasPepDuty(p)) return 'nicht erforderlich (Rolle)';
  const { answer, askedOn, nahestehend, approvedOn, approvedBy } = p.pep;
  if (answer === null) return 'nicht erfragt';
  const parts = [`PEP: ${PEP_ANSWER_LABELS[answer]} (${formatDate(askedOn)})`];
  if (nahestehend !== null) parts.push(`nahestehend: ${PEP_ANSWER_LABELS[nahestehend]}`);
  if (needsApproval(p.pep)) {
    parts.push(
      approvedOn === null
        ? 'Freigabe offen'
        : `Freigabe ${formatDate(approvedOn)} (${approvedBy || NONE})`,
    );
  }
  return parts.join('; ');
}
