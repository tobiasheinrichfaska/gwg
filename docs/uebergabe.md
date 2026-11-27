# Übergabe (Stand 2026-11-23)

Für einen neuen Chat: zuerst `CLAUDE.md` lesen, dann diese Datei. Die Originalvorgaben (KI-Chatverlauf) und die
rechtliche Prüfliste liegen im privaten Begleitrepo `gwg-privat` unter `docs/privat/` (lokal auch in diesem
Checkout als ignorierte Kopie `docs/privat/vorgaben.md`).

## Was es ist

Hilfsmittel für die GwG-Pflichten einer Steuerberatungskanzlei, eine offline HTML-Datei (React/Vite singlefile).
Stufe 1: **nur Listen und Fristen**, keine Schreiben/PDF. Rein lokal: **kein `device-sync`**; Speicher
`local-vault` mit Export/Import der Sicherungsdatei; Navigation `rad-navi`.

## Was steht (Commits `b361cbb`, `a237438`)

- Logikschicht `src/logic/` (UI-frei, 37 Tests grün, Typecheck/Lint/Format ohne Befund):
  Rechtsform → Prüftyp A/B/C und `registerLookup`, Risikoklasse (PEP immer hoch), rollierender Prüftermin
  (`addMonths` begrenzt Monatsenden), Mahnleiter 14/28/42 Tage, Löschfälligkeit (1. Januar des
  Beendigungsjahres + 6), vier Ausnahmelisten des Jahresaudits, Sanktions-Ampel.
- Alle Zahlen und Tabellen als Daten in `src/logic/config.ts`. **Startvorschlag, kein Gesetz.**
- `docs/data-model.html` (Test `tests/docs.test.ts` bindet Fehlercodes und Zahlen an den Code),
  `FEATURES_REQUIRED.md`, `manual_tests/`, `CLAUDE.md`, Workspace-Eintrag in beiden `CLAUDE.md`.
- UI ist nur ein Platzhalter; `rad-navi` und `local-vault` sind **noch nicht eingebunden** (`rad-navi` steht
  in `package.json`; `local-vault` fehlt noch dort).
- Beide Repos nur lokal, **kein GitHub-Remote**; anlegen/pushen nur auf Tobias' ausdrückliches OK.

## Entscheidungen (Tobias, 2026-11-23)

1. **Datenquelle:** _Seit 2026-11-27 abgelöst: die Daten kommen über den Worker aus DATEVconnect, CSV bleibt
   Rückfall — siehe [`uebergabe-datev.md`](uebergabe-datev.md) und [`datev-stammdaten.md`](datev-stammdaten.md)._
   Bisher: CSV-Export aus DATEV; die Spalten werden mit dem echten Spaltenkopf (ohne Daten) festgelegt.
   Vorschlag: Tabelle _Mandanten_ (Mandantennummer, Name/Firma, Rechtsform, aktiv, Identifizierungsstatus, Datum
   letzte Identifizierung, Mandatsende, optional Rundschreibenschlüssel) und Tabelle _Personen_ (Mandantennummer,
   Rolle, Name, Vorname, Geburtsdatum auch teilweise, optional Geburtsort/Staatsangehörigkeit). Risikogruppe und
   PEP führt das Programm selbst. Trennzeichen, Kodierung und Datumsformat des Exports sind noch offen.
2. **Speicher:** `local-vault` mit Export/Import. Schutz der Sicherungsdatei (Passwort/Verschlüsselung) noch offen.
3. **Stufe 1:** nur Listen und Fristen.
4. **Sanktionsliste:** tagesaktuell, möglichst direkt durch das Programm. Die EU-Datei (26 MB, Stand im Dateinamen
   und `Last-Modified`) hat **keinen CORS-Header**; ein direkter Abruf aus dem Browser scheitert. Geplant: ein
   **Relay**. Fallback ohne Relay: Datei laden und einlesen, Alter anzeigen und bei veraltetem Stand warnen.
5. **Nicht eingetragene GbR:** Typ C (Vertreter und wirtschaftlich Berechtigte identifizieren), aber **ohne
   Registerabruf**. Bei der Kammer bestätigen lassen (Prüfliste Nr. 11).

## Offen, in dieser Reihenfolge

1. **Relay entscheiden** (Tobias): das Zeitserver-Relay im Repo `Zeitstempel` passt **nicht** (nur Hashes,
   512 Byte rein, 64 KB raus, bewusst „kein offener Proxy“, nicht ausgerollt); das vorhandene Nachrichten-Relay
   der Geräte ebenfalls nicht. Wege: **A** neues kleines Abruf-Relay nach dem Muster des Zeitserver-Relays;
   **B** bunny Pull Zone mit der EU-Adresse als Ursprung und CORS-Header (Test ca. 30 Minuten, kein Code);
   **C** zweite Route im Zeitserver-Relay (verwässert dessen Prinzip). Empfehlung: A, vorher B ausprobieren.
   Ort: neues öffentliches Repo oder Modul im Zeitstempel-Repo.
2. **Schutzmaßnahmen des Relays** (Missbrauch ist ein Kosten-/Überlastrisiko, kein Datenrisiko; Antwort ist
   öffentlich, Mandantendaten gehen nie hindurch): feste Allowlist als Daten, nur HTTPS, keine Weiterleitungen,
   keine Abfragezeichenfolge, Cache mit Mindestabstand 1 Stunde zur EU, Limit je Aufrufer und gesamt,
   Obergrenze der Antwortgröße, CORS nur für die App-Herkunft, kein Protokoll von Anfragen (nur Zähler),
   Kostenobergrenze beim Hoster. Die Zähler des Zeitserver-Relays sind nur global (bekannte Grenze).
3. **DATEV-Import über den Worker** nach [`uebergabe-datev.md`](uebergabe-datev.md) bauen (Logik + Testdouble mit
   erfundenen Daten; der Worker selbst entsteht im Projekt `datev-worker`). Rückfall: Spaltenkopf des DATEV-Exports
   von Tobias holen, dann den CSV-Import bauen (strenger Leser, nicht erkannte
   Zeilen mit Grund anzeigen, nichts still verwerfen).
4. **Bildschirme** mit `rad-navi`: Mandantenliste, Aufgaben (fällig, mahnen, eskalieren), später
   Jahresaudit-Assistent 1.–30. November mit Stichtags-Export. Tresor (`local-vault`) und Sicherungsdatei.
5. **Sanktionsabgleich im Programm:** 26-MB-XML in einen kompakten Index (Name, Alias, Geburtsdaten) umwandeln und
   im Tresor halten; Treffer-Klärungsmaske (nebeneinander, Ausschlussgründe, Pflichtbegründung).
6. **Rechtliche Prüfliste abarbeiten** (`gwg-privat/docs/privat/rechtspruefung.md`, 16 Punkte) vor dem
   Scharfschalten jeder Regel.

## Regeln für diese Arbeit

- Öffentliches Repo: keine echten Mandantendaten, keine Namen privater Projekte (auch nicht in Commit-Texten).
  `.gitignore` sperrt `*.gwg.json`, `*.pdf`, `*.xml`, `*.csv`, `*.xlsx`.
- Rechtsbehauptungen aus den Vorgaben sind ungeprüft; Zahlen nie als gesetzliche Pflicht darstellen.
- Verdachtsmeldungen: ein lokales Programm kann keinen Geheimbereich erzwingen; höchstens ein Verweis, Inhalte
  außerhalb des Programms.
- Vor jedem Weitermachen den ganzen Satz laufen lassen: `npm run typecheck`, `npm run lint`,
  `npm run format:check`, `npm test`, `npm run build`, und das Ergebnis lesen (nie Zahlen übernehmen).
