import {
  retentionDueFrom,
  type DateKey,
  type Mandate,
  type Reason,
  type RulesConfig,
} from '../logic/index.ts';
import { formatDate } from './format.ts';

/**
 * One German sentence per error code. The record type makes a missing code a compile error; the
 * sentences read both in the client form and when a backup file is rejected.
 */
export const REASON_TEXTS: Record<Reason, string> = {
  'bad-date': 'Ein Datum ist ungültig.',
  'bad-id':
    'Mandatsnummer und Name müssen ausgefüllt sein (je eine Zeile; Nummer höchstens 50, Name höchstens 200 Zeichen).',
  'unknown-legal-form': 'Bitte eine Rechtsform aus der Liste wählen.',
  'unknown-risk-group': 'Die Risikogruppe gibt es in den Regeln nicht.',
  'bad-risk-reason':
    'Die Begründung ist zu lang (höchstens 500 Zeichen) oder enthält Steuerzeichen.',
  'bad-status':
    'Der Status ist ungültig. Der Status „vollständig“ braucht ein Datum der letzten Prüfung.',
  'bad-end':
    'Beendigungsdatum und „Aktiv“ passen nicht zusammen: Ein aktives Mandat hat kein Ende, ein inaktives braucht eines.',
  'bad-config': 'Die Einstellungen (Fristen, Mahnstufen) sind ungültig.',
  'bad-person':
    'Die Person ist ungültig: Nachname, Rolle und Geburtsdatum (JJJJ, JJJJ-MM oder JJJJ-MM-TT) prüfen.',
  'bad-pep':
    'Die PEP-Angaben sind ungültig: Bei einer Antwort braucht es das Datum der Frage; eine Freigabe nur bei „ja“, mit Datum und Name; Funktion höchstens 200 Zeichen.',
  'unknown-mandate': 'Das Mandat dieser Person gibt es nicht.',
  'bad-closing':
    'Der Abschluss des Jahresaudits ist ungültig: Datum, Name der abschließenden Person oder Notiz prüfen.',
  'bad-decision':
    'Die Entscheidung zum Treffer ist ungültig: Begründung (1 bis 500 Zeichen), Name der entscheidenden Person (höchstens 100 Zeichen) und Daten prüfen.',
  'bad-backup': 'Die Datei ist keine gültige Sicherung.',
  'bad-list': 'Die Datei ist keine gültige Sanktions- oder PEP-Liste.',
  'bad-settings':
    'Die Listen-Einstellungen sind ungültig: Relay-Adresse (https, ohne Abfragezeichen) und Höchstalter (1 bis 365 Tage) prüfen.',
  'fetch-failed':
    'Der Abruf der Sanktionsliste ist fehlgeschlagen (Netz, Fehlerstatus oder Zeitüberschreitung). Die gespeicherte Liste bleibt unverändert.',
  'relay-bad-response':
    'Das Relay hat keine brauchbare Liste geliefert (falscher Inhaltstyp oder zu groß). Die gespeicherte Liste bleibt unverändert.',
  'unsupported-version': 'Diese Sicherung hat ein unbekanntes Format oder eine unbekannte Version.',
  'duplicate-id': 'Diese Mandatsnummer gibt es schon.',
  'file-too-large': 'Die Datei ist zu groß.',
  'store-failed': 'Der Speicher des Geräts ist nicht lesbar oder nicht beschreibbar.',
};

export function reasonText(reason: Reason): string {
  return REASON_TEXTS[reason];
}

/** The sentence about the retention period, depending on whether the mandate has ended. */
export function retentionSentence(m: Mandate, rules: RulesConfig, today: DateKey): string {
  const due = retentionDueFrom(m.endedOn, rules);
  if (due === null) {
    return 'Das Mandat ist nicht beendet. Löschen vor Ablauf der Aufbewahrungsfrist ist rechtlich zu klären.';
  }
  const base = `Das Mandat endete am ${formatDate(m.endedOn)}; die Aufbewahrungsfrist (${rules.retentionYears} Jahre nach Ende des Beendigungsjahres) läuft bis zum ${formatDate(due)} (Löschfälligkeit ab diesem Tag).`;
  return today >= due
    ? `${base} Die Frist ist abgelaufen.`
    : `${base} Die Frist läuft noch: Löschen vorher ist rechtlich zu klären.`;
}
