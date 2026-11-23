# CLAUDE.md — gwg

> Workspace-wide conventions (language, git, build, architecture, testing, collaboration):
> [`c:\skripte\private\general stuff\CLAUDE.md`](../../private/general%20stuff/CLAUDE.md)

---

## Project overview

Maintenance tool for the money-laundering act (GwG) duties of a tax advisory firm: risk classes and
groups, identification status per client, rolling review deadlines, dunning ladder for missing documents,
sanctions-list screening with a traffic light, the yearly audit (exception lists) and retention/deletion
deadlines. One offline HTML file (React/Vite singlefile), data only on the device. Created 2026-11-23.

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

| File/Folder                                                             | Purpose                                                                                        |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                                                             | Project documentation and conventions                                                          |
| `README.md`                                                             | Short description (German), license section                                                    |
| `FEATURES_REQUIRED.md`                                                  | Critical user paths the audit validates                                                        |
| `docs/data-model.html`                                                  | Self-contained data-model reference (`tests/docs.test.ts` ties codes and numbers to it)        |
| `docs/uebergabe.md`                                                     | Handover for a new chat: state, decisions, open points in order                                |
| `manual_tests/`                                                         | Human-tester instructions (German)                                                             |
| `src/logic/model.ts`                                                    | Types (`Mandate`, `RiskGroup`, `LegalForm`, status unions), `Reason` codes, `Result`           |
| `src/logic/config.ts`                                                   | All numbers and tables as data: intervals, dunning steps, retention, thresholds, legal forms   |
| `src/logic/time.ts`                                                     | Calendar maths without time zone (`addMonths` clamps month ends)                               |
| `src/logic/rules.ts`                                                    | Check type, effective risk class, next review, dunning stage, retention, audit exception lists |
| `src/logic/sanctions.ts`                                                | Name normalization, similarity, traffic light (`classifyMatch`)                                |
| `src/logic/index.ts`                                                    | Public entry of the logic layer                                                                |
| `src/ui/App.tsx`, `src/main.tsx`                                        | UI shell (placeholder so far)                                                                  |
| `tests/`                                                                | Vitest: `time`, `rules`, `sanctions`, `docs`; `helpers.ts`                                     |
| `index.html`, `vite.config.ts`                                          | Single-file build (`vite-plugin-singlefile`), dev port 5178                                    |
| `package.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json` | Toolchain                                                                                      |
| `.github/workflows/tests.yml`                                           | Check "Tests": typecheck, lint, format, tests, build                                           |
| `.gitattributes`, `.gitignore`                                          | LF line endings; ignore rules                                                                  |
| `LICENSE`, `LICENSE_COMMERCIAL.md`, `CONTRIBUTING.md`                   | AGPLv3 + commercial                                                                            |

---

## Data Model

Authoritative reference: [`docs/data-model.html`](docs/data-model.html). Regenerate/align it in the same
session the model changes.

## Development Server Ports

| Server | Port |
| ------ | ---- |
| Vite   | 5178 |

## Known Limitations

- Only the logic foundation exists: no screens, no storage, no import of the DATEV master data, no PDF
  letters, no `local-vault` or `rad-navi` wiring yet. Dunning, audit, retention and sanctions are rules, not workflows.
- Storage uses `local-vault` (not wired yet); the backup file's protection (password/encryption) must be
  decided when it is built.
- **No roles or secret vault in a local single file.** The requirements ask for an officer-only area for
  suspicious-activity reports (tipping-off ban). A local file cannot enforce that; plan: keep report
  details outside the tool, store at most a reference.
- **Sanctions list:** matching rules are conservative (only a clearly different birth _year_ clears a name
  match). The download of the EU list needs a network call, which conflicts with "no network"; open
  (manual file import is the likely answer). Thresholds 0.85/0.9 are untested guesses against real lists.
- **Legal claims in the requirements are unverified** (identification-expiry handling, § 23a reporting
  cases, retention start, goAML dates, AMLR transition 2027, treatment of a plain GbR). Check against the
  BStBK interpretation notes before each rule goes live.
- The firm's data comes from DATEV by CSV/manual entry; the exact export is not specified yet.
