# Critical User Paths — gwg

**Purpose:** Core workflows that must not break. Audit validates these end-to-end.

## Logik (Fundament)

- [x] **Rechtsform → Prüftyp A/B/C** — `checkTypeOf` (`tests/rules.test.ts`)
- [x] **Risikoklasse je Gruppe, PEP immer hoch** — `effectiveRiskClass`
- [x] **Nächster Prüftermin rollierend nach Klasse** — `nextReviewDate`
- [x] **Mahnleiter 14/28/42 Tage** — `dunningStage`
- [x] **Löschfälligkeit 5 Jahre nach Ende des Beendigungsjahres** — `retentionDueFrom`
- [x] **Aufgabenlisten-Logik** (fällig, mahnen, eskalieren, Löschung; ungültige Mandate gemeldet) — `buildTasks` (`tests/tasks.test.ts`), UI weiter offen
- [x] **Ausnahmelisten des Jahresaudits** — `auditExceptions`
- [x] **Sanktions-Ampel, nur anderes Geburtsjahr entlastet automatisch** — `classifyMatch`

## Bedienung (noch nicht gebaut)

- [ ] **Mandantenliste einlesen** (Export der Kanzleisoftware) und prüfen
- [ ] **Aufgabenliste (Bildschirm):** wer ist fällig, wer mahnt, wer eskaliert (Logik: `buildTasks`)
- [x] **Navigation** mit `rad-navi` (Rahmen und Bereiche; Seiten außer Sicherung noch Platzhalter)
- [ ] **Jahresaudit-Assistent** 1.–30. November mit Stichtags-Export
- [x] **Sicherungsdatei (Logik):** Format 1, `serializeBackup`/`parseBackup` (streng, `tests/backup.test.ts`)
- [x] **Sicherungsdatei schreiben und streng wieder einlesen** (Bildschirm „Sicherung“, `tests/ui/`); die Datei selbst ist unverschlüsselt (Warnung im Bildschirm)

| Path                                         | Impact                              | Audit Check                        |
| -------------------------------------------- | ----------------------------------- | ---------------------------------- |
| Fälligkeit falsch berechnet                  | Prüfung zu spät, Kammerbefund       | `tests/rules.test.ts`              |
| Ähnlicher Name wird als „grün“ durchgelassen | Verstoß gegen Bereitstellungsverbot | `tests/sanctions.test.ts`          |
| Keine Konsolenfehler beim Laden              | App instabil                        | Browser, manuell (`manual_tests/`) |
