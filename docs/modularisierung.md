# Modularisierung — Plan (Stand 2026-11-26)

Ausgangslage: ~400 Zeilen Logik in fünf flachen Dateien (`model`, `config`, `time`, `rules`, `sanctions`),
ein Barrel `index.ts` mit `export *`, UI-Platzhalter. Alles, was noch kommt (Import, Sicherungsdatei, Tresor,
Sanktionsindex, Relay, Bildschirme), würde `rules.ts` und `index.ts` zu einem Sammelbecken machen. Der Plan
legt die Schnitte **vor** dem Wachstum fest. Nichts davon ist umgesetzt; jeder Schritt ist ein eigener,
grüner Commit.

## Befund, der die Schnitte bestimmt

1. `rules.ts` mischt fünf Themen (Rechtsform, Risiko/Prüftermin, Mahnung, Aufbewahrung, Validierung, Audit).
2. Konfiguration ist modulglobal, und jede Regel hat `groups = DEFAULT_RISK_GROUPS` als **stillen Default**. Sobald
   eine Kanzlei eigene Gruppen pflegt, rechnet jeder Aufruf ohne `groups` mit den Werkseinstellungen weiter.
3. `export *` macht jede Hilfsfunktion (`levenshtein`, `MAX_REASON_LENGTH`) zur öffentlichen API.
4. `eslint.config.js` kennt `io/`, das es noch nicht gibt; die Schichtregel greift nur an der UI-Grenze, nicht
   zwischen Logikmodulen.
5. `.gitignore` sperrt `*.csv`/`*.xml`: Testdaten für Import und Sanktionsliste dürfen nie als Datei im Repo liegen.

## Zielstruktur

```
src/
  logic/                      UI-frei, IO-frei, "heute" ist Parameter, Fehler sind Codes
    core/                     time.ts · result.ts (Result, ok, fail) · types.ts (DateKey)
    config/                   defaults.ts (Zahlen und Tabellen als Daten) · RulesConfig (Typ + Prüfung)
    mandate/                  model.ts · legal-form.ts · risk.ts · review.ts · dunning.ts · retention.ts · validate.ts
    audit/                    exceptions.ts (4 Listen) · stichtag.ts (später: Export des Jahresaudits)
    sanctions/                normalize.ts · similarity.ts · classify.ts · index-format.ts (später: kompakter Listenindex)
    importer/                 csv.ts (strenger Leser) · mandates.ts · persons.ts   (später; Text rein, Result raus)
    backup/                   format.ts (Schema-Version, Migration) · validate.ts   (später; reine Logik)
  io/                         einzige Schicht mit Seiteneffekten: vault.ts (local-vault) · files.ts · relay.ts
  ui/
    app/                      App.tsx · Navigation (rad-navi) · Provider
    screens/                  clients/ · tasks/ · audit/ · sanctions/ · backup/
    components/               geteilte, dumme Bausteine
  main.tsx
```

Jedes Modul hat eine `index.ts` mit der **bewussten** öffentlichen API; das Barrel `logic/index.ts` führt nur
diese auf.

## Regeln (ESLint erzwingt sie, nicht Disziplin)

- Richtung: `core` ← `mandate/model` (die Typen sind die Basis) ← `config` ← `mandate` (Regeln) ← `audit`.
  `config` importiert aus `mandate/model` nur Typen (`import type`). `sanctions` hängt an `core`, `config` und dem
  Typ `SanctionClass` aus `mandate/model`; `importer` und `backup` hängen an `mandate`. Nie umgekehrt, keine Zyklen.
- Kein Tiefimport in ein anderes Modul (`logic/mandate/risk.ts`), nur `logic/mandate`. Regel: `no-restricted-imports`
  mit Mustern je Modul.
- `io/` importiert `logic`, `logic` nie `io/` oder `ui/` (besteht schon); `ui` greift auf `io` nur über
  einen Provider zu, damit Bildschirme mit Attrappen testbar bleiben.
- **Konfiguration wird übergeben, nicht gelesen:** ein Wert `RulesConfig` (Intervalle, Mahnstufen, Aufbewahrung,
  Schwellen, Rechtsformen, Risikogruppen) ist ein **Pflichtparameter** der Regeln. `DEFAULT_RULES` bleibt als
  Werkseinstellung, wird aber nur an einer Stelle (Laden der Kanzleikonfiguration) eingesetzt. Das beendet den
  stillen Default (Befund 2) und macht die Zahlen je Kanzlei einstellbar, wie `docs/data-model.html` es verspricht.
- Daten über die Grenze (Import, Sicherungsdatei, Tresor) sind `unknown` und werden von einem Validierer in
  einen Typ verwandelt; `checkMandate` prüft nur, was die Typen nicht ausdrücken.
- „Heute“: eine einzige Funktion `todayKey(now: Date)` in `core/time` mit **lokalen** Feldern (nicht
  `toISOString()`, das zwischen 0 und 1 Uhr MEZ den Vortag liefert). Nur `io`/`ui` rufen `new Date()`.
- Testdaten für Import/Sanktionen stehen als Zeichenketten in `tests/fixtures/*.ts`, nie als `.csv`/`.xml`.
- Die Tests spiegeln die Module (`tests/mandate/…`); `tests/docs.test.ts` bleibt das Band zwischen Code und
  `docs/data-model.html` und wird um `RulesConfig` erweitert.

## Reihenfolge (jeder Schritt: typecheck, lint, format, test, build grün)

| Nr  | Schritt                                                                                                                        | Risiko                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| M0  | Audit-Behebung (erledigt, siehe `audit-2026-11-26.md`) — Grundlage, damit der Umbau nichts Falsches einfriert                  | —                      |
| M1  | Dateien verschieben ohne Verhaltensänderung: `core/`, `mandate/` (rules.ts zerlegen), `audit/`, `sanctions/`; Barrel pro Modul | gering, Tests als Netz |
| M2  | ESLint-Schichtregeln und Tiefimport-Verbot; Prüfung, dass die Regel greift (absichtlicher Verstoß im Test)                     | gering                 |
| M3  | `RulesConfig` als Pflichtparameter, `DEFAULT_RULES`; Default-Parameter entfernen; Docs-Test erweitern                          | mittel (Signaturen)    |
| M4  | `todayKey` + Tests um Mitternacht (23:30/00:30 MEZ und Sommerzeitwechsel)                                                      | gering                 |
| M5  | `backup/`: Schema-Version, strenger Leser, Migrationsgerüst — vor dem Tresor, weil es das Format festlegt                      | mittel                 |
| M6  | `importer/` sobald der Spaltenkopf des Exports vorliegt (Übergabe, Punkt 3)                                                    | hängt an Tobias        |
| M7  | `io/vault`, `io/files`; `ui/app` mit `rad-navi`; erster Bildschirm Mandantenliste                                              | mittel                 |
| M8  | `sanctions/index-format` und Relay-Entscheidung (Übergabe, Punkte 1–2)                                                         | hängt an Tobias        |

## Bewusst nicht modularisiert

- Kein eigenes Paket/Workspace je Modul: ein Build, eine Datei, ein Repo reichen; Ordnergrenzen mit Lint genügen.
- Keine Abstraktion für „Regeln als Plugins“: Zusätze sind Daten in `config`, nicht Code-Verzweigungen.
