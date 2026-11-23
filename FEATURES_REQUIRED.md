# Critical User Paths — gwg

**Purpose:** Core workflows that must not break. Audit validates these end-to-end.

## Logik (Fundament)

- [x] **Rechtsform → Prüftyp A/B/C** — `checkTypeOf` (`tests/rules.test.ts`)
- [x] **Risikoklasse je Gruppe, PEP immer hoch** — `effectiveRiskClass`
- [x] **Nächster Prüftermin rollierend nach Klasse** — `nextReviewDate`
- [x] **Mahnleiter 14/28/42 Tage** — `dunningStage`
- [x] **Löschfälligkeit 5 Jahre nach Ende des Beendigungsjahres** — `retentionDueFrom`
- [x] **Ausnahmelisten des Jahresaudits** — `auditExceptions`
- [x] **Sanktions-Ampel, nur anderes Geburtsjahr entlastet automatisch** — `classifyMatch`

## Bedienung (noch nicht gebaut)

- [ ] **Mandantenliste einlesen** (Export der Kanzleisoftware) und prüfen
- [ ] **Aufgabenliste:** wer ist fällig, wer mahnt, wer eskaliert
- [ ] **Navigation** mit `rad-navi`
- [ ] **Jahresaudit-Assistent** 1.–30. November mit Stichtags-Export
- [ ] **Sicherungsdatei** schreiben und streng wieder einlesen

| Path                                         | Impact                              | Audit Check                        |
| -------------------------------------------- | ----------------------------------- | ---------------------------------- |
| Fälligkeit falsch berechnet                  | Prüfung zu spät, Kammerbefund       | `tests/rules.test.ts`              |
| Ähnlicher Name wird als „grün“ durchgelassen | Verstoß gegen Bereitstellungsverbot | `tests/sanctions.test.ts`          |
| Keine Konsolenfehler beim Laden              | App instabil                        | Browser, manuell (`manual_tests/`) |
