# Critical User Paths — gwg

**Purpose:** Core workflows that must not break. Audit validates these end-to-end.

## Logik (Fundament)

- [x] **Rechtsform → Prüftyp A/B/C** — `checkTypeOf` (`tests/rules.test.ts`)
- [x] **Risikoklasse je Gruppe, PEP-betroffen immer hoch** (manuelle Markierung oder Selbstauskunft je Person) — `effectiveRiskClass`, `isPepAffected` (`tests/pep.test.ts`)
- [x] **PEP-Selbstauskunft je Person, Aufgaben `pep-ask`/`pep-approval`, Sicherung Format 2 mit und ohne `pep`** — `checkPerson`, `buildTasks` (`tests/pep.test.ts`); geführter Schritt „PEP-Selbstauskunft“ und Freigabe-Dialog, Aufgabenliste mit beiden Arten, Kennzeichen „PEP-betroffen“ (`tests/ui/pep.test.tsx`, `manual_tests/06_pep.md`)
- [x] **Nächster Prüftermin rollierend nach Klasse** — `nextReviewDate`
- [x] **Mahnleiter 14/28/42 Tage** — `dunningStage`
- [x] **Löschfälligkeit 5 Jahre nach Ende des Beendigungsjahres** — `retentionDueFrom`
- [x] **Aufgabenlisten-Logik** (fällig, mahnen, eskalieren, Löschung; ungültige Mandate gemeldet) — `buildTasks` (`tests/tasks.test.ts`), UI weiter offen
- [x] **Ausnahmelisten des Jahresaudits** — `auditExceptions`
- [x] **Sanktions-Ampel, nur anderes Geburtsjahr entlastet automatisch** — `classifyMatch`
- [x] **Abgleich-Logik Personen gegen Sanktions-/PEP-Liste** (Aliase, mehrere Geburtsdaten, Spanne, nicht prüfbare Personen gemeldet, 1 000 × 20 000 in ca. 7 s) und Listenformat `gwg-liste` — `classifyEntry`, `screenPerson`, `screenAll`, `parseIndex` (`tests/list.test.ts`, `tests/screening.test.ts`); offen: Quelle der Liste (Import/Download), Bildschirm
- [x] **Entscheidungen zu Treffern (Logik, ohne Bildschirm):** `ScreeningDecision` mit Pflichtbegründung, Verfall bei geänderter Person, geändertem Mandatsnamen oder geändertem Listeneintrag, `openHits`/`confirmedHits`, Mandatsabgleich `screenMandates`, Aufgaben `sanction-clear`/`sanction-confirmed`, Sicherung mit `screeningDecisions` und `lastScreening` (`tests/decision.test.ts`); Bildschirme folgen mit T6b

- [x] **Bildschirm „Abgleich“:** Liste einlesen (Stand-Bestätigung, übersprungene Einträge gezeigt) und über das Relay abrufen (`X-Stale`, Fehlercodes, Abruf beim Start nur auf Wunsch), Einstellungen mit `checkListSettings`, Abgleich in Stücken mit Fortschritt, offene Treffer rot vor gelb, Detailseite „Treffer klären“ (Pflichtfelder, bestätigt mit „Maßnahme dokumentiert“, Rücknahme nur mit Bestätigung), Banner „Abgleich veraltet“ in Abgleich, Aufgaben und Übersicht (`tests/ui/sanctions.test.tsx`, `manual_tests/07_abgleich.md`)

## Bedienung

- [x] **Mandantenliste (Bildschirm „Mandanten“):** Liste mit Filter und Suche, Mandant von Hand anlegen, bearbeiten, löschen mit Bestätigung (`tests/ui/clients.test.tsx`, `manual_tests/03_mandanten.md`)
- [x] **Personen je Mandat (Bildschirm „Mandanten“):** anlegen, bearbeiten, löschen mit Bestätigung, Geburtsdatum JJJJ / JJJJ-MM / JJJJ-MM-TT, Spalte „Personen“, Hinweis bei Typ C ohne Person, Personen werden mit dem Mandat gelöscht (`tests/ui/persons.test.tsx`, `manual_tests/05_personen.md`)
- [x] **EU-Sanktionsliste von Hand einlesen (io, ohne Bildschirm):** XML 1.1 in einen Index, Einträge ohne Namen gemeldet, Entity-Deklarationen abgelehnt, Stand nur als Vorschlag, Speichern/Laden im Tresor-Slot (`tests/io-eu-list.test.ts`); Bildschirm und Größe der echten Liste offen
- [x] **Listenspeicher, Einstellungen und Abruf über das Relay (io, ohne Bildschirm):** Liste in IndexedDB `gwg-listen` ohne Tresor, Einstellungen (`checkListSettings`) im Tresor-Slot `einstellungen`, `listAgeDays`/`isListStale`, `fetchSanctionsList` sendet nur `GET <relay>/liste` ohne Daten, Größe beim Streamen begrenzt, Zeitüberschreitung, Weiterleitung und `X-Stale` behandelt (`tests/io-list-store.test.ts`, `tests/settings.test.ts`, `tests/io-fetch.test.ts`); Bildschirm: siehe nächste Zeile
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
