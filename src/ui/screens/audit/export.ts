import type { AuditClosing, AuditExceptions, DateKey } from '../../../logic/index.ts';
import { formatDate } from '../../format.ts';

export type AuditListKey = keyof AuditExceptions;

/** Title and explanation per exception list; the order is the one of the audit. */
export const AUDIT_LISTS: readonly { key: AuditListKey; title: string; text: string }[] = [
  {
    key: 'unclassified',
    title: 'Ohne Risikogruppe',
    text: 'Aktive Mandate, denen keine (oder keine bekannte) Risikogruppe zugeordnet ist.',
  },
  {
    key: 'unidentified',
    title: 'Nicht identifiziert',
    text: 'Aktive Mandate, deren Identifizierung noch leer ist.',
  },
  {
    key: 'stalled',
    title: 'Identifizierung stockt',
    text: 'Aktive Mandate mit unvollständiger Identifizierung oder in der Eskalation.',
  },
  {
    key: 'overdue',
    title: 'Prüfung überfällig',
    text: 'Aktive, identifizierte Mandate, deren turnusmäßige Prüfung zum Stichtag überfällig ist (oder ohne gültiges Datum der letzten Prüfung).',
  },
];

export function countFindings(e: AuditExceptions): number {
  return AUDIT_LISTS.reduce((n, l) => n + e[l.key].length, 0);
}

/** The cut-off-date list as plain text, one block per exception list. */
export function auditText(
  e: AuditExceptions,
  stichtag: DateKey,
  closing: AuditClosing | null = null,
): string {
  const lines = [
    `GwG-Audit, Stichtag ${formatDate(stichtag)}`,
    `Auffälligkeiten insgesamt: ${countFindings(e)}`,
    'Hinweis: Die Liste enthält Mandantennamen im Klartext. Nur auf einem geschützten Gerät aufbewahren.',
    closing === null
      ? 'Abschluss: nicht abgeschlossen'
      : `Abschluss: abgeschlossen am ${formatDate(closing.closedOn)} durch ${closing.by}${closing.note === '' ? '' : `, Notiz: ${closing.note}`}`,
  ];
  for (const l of AUDIT_LISTS) {
    lines.push('', `${l.title} (${e[l.key].length})`, l.text);
    for (const m of e[l.key]) lines.push(`${m.id};${m.name}`);
  }
  return `${lines.join('\n')}\n`;
}
