# Critical User Paths — gwg

**Purpose:** Core workflows that must not break. Audit validates these end-to-end.

## Logik (Fundament)

- [x] **Rechtsform → Prüftyp A/B/C** — `checkTypeOf` (`tests/rules.test.ts`)
- [x] **Risikoklasse je Gruppe, PEP-betroffen immer hoch** (manuelle Markierung oder Selbstauskunft je Person) — `effectiveRiskClass`, `isPepAffected` (`tests/pep.test.ts`)
- [x] **PEP-Selbstauskunft je Person, Aufgaben `pep-ask`/`pep-approval`, Sicherung Format 2 mit und ohne `pep`** — `checkPerson`, `buildTasks` (`tests/pep.test.ts`), UI folgt (PEP-2)
- [x] **Nächster Prüftermin rollierend nach Klasse** — `nextReviewDate`
- [x] **Mahnleiter 14/28/42 Tage** — `dunningStage`
- [x] **Löschfälligkeit 5 Jahre nach Ende des Beendigungsjahres** — `retentionDueFrom`
- [x] **Aufgabenlisten-Logik** (fällig, mahnen, eskalieren, Löschung; ungültige Mandate gemeldet) — `buildTasks` (`tests/tasks.test.ts`), UI weiter offen
- [x] **Ausnahmelisten des Jahresaudits** — `auditExceptions`
- [x] **Sanktions-Ampel, nur anderes Geburtsjahr entlastet automatisch** — `classifyMatch`
- [x] **Abgleich-Logik Personen gegen Sanktions-/PEP-Liste** (Aliase, mehrere Geburtsdaten, Spanne, nicht prüfbare Personen gemeldet, 1 000 × 20 000 in ca. 7 s) und Listenformat `gwg-liste` — `classifyEntry`, `screenPerson`, `screenAll`, `parseIndex` (`tests/list.test.ts`, `tests/screening.test.ts`); offen: Quelle der Liste (Import/Download), Bildschirm

## Bedienung (noch nicht gebaut)

- [x] **Mandantenliste (Bildschirm „Mandanten“):** Liste mit Filter und Suche, Mandant von Hand anlegen, bearbeiten, löschen mit Bestätigung (`tests/ui/clients.test.tsx`, `manual_tests/03_mandanten.md`)
- [x] **Personen je Mandat (Bildschirm „Mandanten“):** anlegen, bearbeiten, löschen mit Bestätigung, Geburtsdatum JJJJ / JJJJ-MM / JJJJ-MM-TT, Spalte „Personen“, Hinweis bei Typ C ohne Person, Personen werden mit dem Mandat gelöscht (`tests/ui/persons.test.tsx`, `manual_tests/05_personen.md`)
- [ ] **Mandantenliste einlesen** (Export der Kanzleisoftware) und prüfen — offen, nur die Eingabe von Hand ist gebaut
- [x] **Aufgabenliste (Bildschirm):** wer ist fällig, wer mahnt, wer eskaliert; „Erste Anforderung heute gesendet“, „Prüfung heute abgeschlossen“ mit Bestätigung, nicht prüfbare Mandate gemeldet (`tests/ui/tasks-audit.test.tsx`, `manual_tests/04_aufgaben_audit.md`)
- [x] **Navigation** mit `rad-navi` (Rahmen und Bereiche; alle fünf Bereiche gebaut)
- [x] **Jahresaudit-Assistent:** vier Listen mit Zahl, wählbarer Stichtag (Standard 30. November), „abschließbar“ nur ohne Auffälligkeiten, Stichtagsliste als Textdatei; der Zeitraum 1.–30. November wird nur genannt, nicht erzwungen. Abschluss mit Name und Notiz wird gespeichert (`Backup.auditClosings`), Rücknahme nur mit Bestätigung, Warnung bei später entstandenen Auffälligkeiten, Abschlusszeile im Export (`tests/ui/audit-closing.test.tsx`)
- [x] **Sicherungsdatei (Logik):** Format 2 (Personen, Audit-Abschlüsse; Format 1 wird gelesen), `serializeBackup`/`parseBackup` (streng, `tests/backup.test.ts`)
- [x] **Sicherungsdatei schreiben und streng wieder einlesen** (Bildschirm „Sicherung“, `tests/ui/`); die Datei selbst ist unverschlüsselt (Warnung im Bildschirm)

| Path                                         | Impact                              | Audit Check                        |
| -------------------------------------------- | ----------------------------------- | ---------------------------------- |
| Fälligkeit falsch berechnet                  | Prüfung zu spät, Kammerbefund       | `tests/rules.test.ts`              |
| Ähnlicher Name wird als „grün“ durchgelassen | Verstoß gegen Bereitstellungsverbot | `tests/sanctions.test.ts`          |
| Keine Konsolenfehler beim Laden              | App instabil                        | Browser, manuell (`manual_tests/`) |
