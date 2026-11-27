import type { Reason } from '../../logic/index.ts';

/** German texts for the error codes the UI can meet. The code itself is always shown next to it. */
const TEXTS: Record<Reason, string> = {
  'bad-date': 'Ungültiges Datum.',
  'bad-id': 'Ungültige Mandatsnummer.',
  'unknown-legal-form': 'Unbekannte Rechtsform.',
  'unknown-risk-group': 'Unbekannte Risikogruppe.',
  'bad-risk-reason': 'Ungültige Begründung der Risikoklasse.',
  'bad-status': 'Ungültiger Status.',
  'bad-end': 'Ungültiges Beendigungsdatum.',
  'bad-config': 'Ungültige Einstellungen (Fristen, Mahnstufen).',
  'bad-backup': 'Die Datei ist keine gültige Sicherung.',
  'unsupported-version': 'Diese Sicherung hat ein unbekanntes Format oder eine unbekannte Version.',
  'duplicate-id': 'Eine Mandatsnummer kommt doppelt vor.',
  'file-too-large': 'Die Datei ist zu groß.',
  'store-failed': 'Der Speicher des Geräts ist nicht lesbar oder nicht beschreibbar.',
};

/** "<Text> (Code: bad-backup, Stelle: mandates[3].id)" */
export function describeFailure(reason: Reason, where?: string): string {
  const place = where === undefined ? '' : `, Stelle: ${where}`;
  return `${TEXTS[reason]} (Code: ${reason}${place})`;
}
