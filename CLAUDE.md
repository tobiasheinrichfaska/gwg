# CLAUDE.md — gwg

> Workspace-wide conventions (language, git, build, architecture, testing, collaboration):
> [`c:\skripte\private\general stuff\CLAUDE.md`](../../private/general%20stuff/CLAUDE.md)

---

## Project overview

Maintenance tool for the money-laundering act (GwG) duties of a tax advisory firm: risk classes and
groups, identification status per client, rolling review deadlines, dunning ladder for missing documents,
sanctions-list screening with a traffic light, the yearly audit (exception lists) and retention/deletion
deadlines. One offline HTML file (React/Vite singlefile), data only on the device. Client data never leaves the device. Optional (off by default) the app downloads the public sanctions list through a relay; the request contains no data. Created 2026-11-23.

**Scope decision (Tobias, 2026-11-23):** purely local. **No `device-sync`.** Storage is `local-vault`
(encrypted) with export/import of a backup file; navigation is `rad-navi`. Stage 1: lists and deadlines
only (no letters/PDF). Data comes in as CSV exports (mandates + persons; columns to be fixed with the real
export header). The tool decides nothing legally: it tracks, reminds and
documents; a human signs off.

**Platform:** web (single HTML file) · **Language:** TypeScript + React 19
**Architecture:** UI-free logic layer `src/logic/` (model, config as data, rules, sanctions, calendar
maths; "today" is always a parameter, errors are codes) and a thin UI `src/ui/`. Private companion repo:
`gwg-privat` (data only: the original requirements text and the legal review notes).

## Key rules

- **Public repo (AGPLv3 + commercial):** no real client data, no private project names, in files and in
  git history. `.gitignore` blocks `*.gwg.json`, `*.pdf`, `*.xml`, `*.csv`, `*.xlsx`.
- The numbers in `src/logic/config.ts` (36/24/12 months, 14/28/42 days, similarity 0.85/0.9) are a
  **starting proposal, not law**. The statute names none of them; each firm fixes them in its risk
  analysis. Never present them as legal requirements.
- Requirements source: `docs/privat/vorgaben.md` (companion repo). It is an AI chat transcript with
  unverified legal claims — verify before building each rule (see Known Limitations).

---

## Project Directory

| File/Folder                                                                                             | Purpose                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`, `README.md`, `FEATURES_REQUIRED.md`                                                        | Conventions; short description (German); critical user paths the audit validates                                                                                                                                                                                                                                                                                           |
| `docs/`                                                                                                 | `data-model.html` (data-model reference; `tests/docs.test.ts` ties codes, numbers and every public logic function to it), `modularisierung.md` (module plan), `audit-2026-11-26.md` (audit with verdicts), `io-schnittstellen.md`, `ui-konzept.md` (UI concept, tickets U1–U10), `uebergabe.md` (handover: state, decisions, open points)                                  |
| `manual_tests/`                                                                                         | Human-tester instructions (German)                                                                                                                                                                                                                                                                                                                                         |
| `src/logic/core/`                                                                                       | `time.ts` (calendar maths, `todayKey`), `result.ts` (`Result`), `types.ts` (`DateKey`)                                                                                                                                                                                                                                                                                     |
| `src/logic/mandate/`                                                                                    | `model.ts` (types only: `Mandate`, `Person`, `Reason` ...), `values.ts` (runtime values: `ID_STATUSES`, `PERSON_ROLES`, `PEP_*`, `emptyPep`, `ok`, `fail`), `legal-form.ts`, `risk.ts`, `review.ts`, `dunning.ts`, `retention.ts`, `validate.ts`, `person.ts`                                                                                                              |
| `src/logic/audit/`                                                                                      | `exceptions.ts` (four exception lists), `closing.ts` (`AuditClosing`, `checkAuditClosing`)                                                                                                                                                                                                                                                                                 |
| `src/logic/sanctions/`                                                                                  | `normalize`, `similarity`, `classify` (traffic light), `list` (`ListIndex`, `parseIndex`), `list-settings`, `screening` (`screenAll`, `Hit`), `decision` (`ScreeningDecision`, snapshots), `hits` (`openHits`, `confirmedHits`)                                                                                                                                            |
| `src/logic/backup/`                                                                                     | `format.ts`: backup format 2 (reads format 1), `serializeBackup`, strict `parseBackup`, `checkBackup` (run before every save/download); `edit.ts`: `removePerson`, `removeMandate`, `repairOrphanDecisions`                                                                                                                                                                |
| `src/logic/tasks/`                                                                                      | `buildTasks`: task list from the rules (review, dunning, PEP, sanctions, retention)                                                                                                                                                                                                                                                                                        |
| `src/logic/config.ts`, `src/logic/index.ts`                                                             | All numbers and tables as data (`RulesConfig`, `DEFAULT_RULES`, `checkRules`); public entry of the logic layer                                                                                                                                                                                                                                                             |
| `src/io/`                                                                                               | Only layer with side effects: `store.ts` (vault store on slot `bestand`, settings store, memory variants), `files.ts` (backup download/read, `BACKUP_WARNING`), `eu-list.ts` (EU list XML to `ListIndex`), `list-store.ts` (IndexedDB `gwg-listen`), `sanctions-fetch.ts` (GET `<relay>/liste`, no data in the request; list state: `generationDate`, then `X-Fetched-At`) |
| `relay/`                                                                                                | Provider-neutral reference relay for the public sanctions list (`handler.ts`, tests, README)                                                                                                                                                                                                                                                                               |
| `src/ui/`, `src/main.tsx`                                                                               | `App.tsx`, `app/` (provider, rad-navi navigation, texts, CSS), `screens/` (backup, clients with persons, tasks, audit, overview, sanctions), `components/` (incl. PEP flow, `OpenClient`), `format.ts`, `messages.ts` (`REASON_TEXTS`), `pep.ts`, `persons.ts`; `main.tsx` wires `VaultGate`                                                                               |
| `tests/`                                                                                                | Vitest: logic, io, docs, `lint-boundaries`, `model-types-only`; `ui/*.test.tsx` (jsdom per file); `helpers.ts`                                                                                                                                                                                                                                                             |
| `index.html`, `vite.config.ts`, `package.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json` | Single-file build (`vite-plugin-singlefile`, dev port 5178) and toolchain                                                                                                                                                                                                                                                                                                  |
| `.github/workflows/tests.yml`                                                                           | Check "Tests": typecheck, lint, format, tests, build                                                                                                                                                                                                                                                                                                                       |
| `.gitattributes`, `.gitignore`, `LICENSE`, `LICENSE_COMMERCIAL.md`, `CONTRIBUTING.md`, `SECURITY.md`    | Line endings, ignore rules, AGPLv3 + commercial, security notes                                                                                                                                                                                                                                                                                                            |

---

## Data Model

Authoritative reference: [`docs/data-model.html`](docs/data-model.html). Regenerate/align it in the same
session the model changes.

## Development Server Ports

| Server | Port |
| ------ | ---- |
| Vite   | 5178 |

## Known Limitations

- Open work, in order: DATEV import (no export header yet), choice of the relay host, UI tickets U1–U10 (`docs/ui-konzept.md`), rad-navi changes (issue #7); details in `docs/uebergabe.md`. No PDF letters; dunning, audit, retention and sanctions are rules, not guided workflows yet.
- `local-vault` 0.1.0 has the device mode only; without the app lock the app opens without a password. Two tabs can overwrite each other (`docs/io-schnittstellen.md`, point 4).
- The backup file is unencrypted (decision Tobias, 2026-11-27) and holds client names; `BACKUP_WARNING` is shown. `file://` behaviour of IndexedDB/crypto was checked only in headless Chromium.
- No roles or secret vault in a local single file: suspicious-activity report details stay outside the tool, at most a reference.
- Sanctions list: the XML schema of the EU list is an assumption (not checked against the real file); thresholds 0.85/0.9 are untested guesses; the result of a screening run lives in memory only.
- Name matching is a heuristic: legal-form words are removed in the company screening (mandates; `LEGAL_FORM_WORDS`) and the single-word rule (one remaining word of 6+ letters found in the other name = at least yellow) creates more yellow hits; extra name parts count at most 0.89 (yellow), no transliteration between scripts, no homoglyph detection, a birth-year span on a list entry (`YYYY/YYYY`) is evaluated (only a client year outside it clears a name match); the EU file delivers spans only as an assumption (not seen in a real file).
- Legal claims in the requirements are unverified (identification expiry, § 23a cases, retention start, goAML dates, AMLR 2027, plain GbR); check `gwg-privat` `rechtspruefung.md` before each rule goes live.
- Open decisions (Tobias): `gekuendigt` while still active appears in no audit list (fifth list?); the audit closing is possible only from the cut-off date (intended?).
- The git history (commit 5250e2a) contains the name of a private repository.
