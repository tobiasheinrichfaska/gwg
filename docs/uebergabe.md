# Übergabe (Stand 2026-11-27)

Für einen neuen Chat: zuerst `CLAUDE.md`, dann diese Datei. Die Originalvorgaben (KI-Chatverlauf) und die
rechtliche Prüfliste liegen im privaten Begleitrepo `gwg-privat` unter `docs/privat/`.

## Was es ist

Hilfsmittel für die GwG-Pflichten einer Steuerberatungskanzlei: eine HTML-Datei (React/Vite singlefile), rein
lokal, **kein `device-sync`**. Mandantendaten verlassen das Gerät nie. Optional (standardmäßig aus) lädt die App
die öffentliche Sanktionsliste über ein Relay; die Anfrage enthält keine Daten. Stufe 1: nur Listen und Fristen,
keine Schreiben/PDF. Das Werkzeug entscheidet nichts rechtlich; ein Mensch zeichnet ab.

## Was steht (`npm test`: 567 Tests in 36 Dateien grün)

- **Logik** `src/logic/` (UI-frei, „heute“ ist Parameter, Fehler sind Codes): `core`, `mandate` (`model.ts` nur
  Typen, `values.ts` Werte; Rechtsform, Risiko, Prüftermin, Mahnleiter, Löschfrist, Person, PEP), `audit`
  (vier Ausnahmelisten, Abschluss), `sanctions` (Namensabgleich, Ampel, Listenindex, Treffer, Entscheidungen),
  `backup` (Format 2, liest Format 1), `tasks` (Aufgabenliste), `config.ts` (alle Zahlen als Daten).
- **io** `src/io/`: Tresor (`local-vault`, Slot `bestand`), Einstellungen, Sicherungsdatei, EU-Listen-XML,
  Listenspeicher (IndexedDB), Abruf über das Relay.
- **Relay** `relay/`: anbieterneutrales Referenz-Relay (Weg A), getestet; Hoster nicht gewählt.
- **Bildschirme** (`rad-navi`): Mandanten (mit Personen und PEP-Selbstauskunft), Aufgaben, Jahresaudit mit
  Abschluss und Stichtags-Export, Übersicht, Sanktionsabgleich (Liste einspielen oder abrufen, Treffer klären),
  Sicherung (mit App-Sperre).
- **Doku:** `docs/data-model.html` (Test bindet Codes, Zahlen und jede öffentliche Funktion daran),
  `docs/modularisierung.md`, `docs/audit-2026-11-26.md`, `docs/io-schnittstellen.md`, `docs/ui-konzept.md`,
  `FEATURES_REQUIRED.md`, `manual_tests/`.
- Schichtregeln: ESLint (Tiefimporte verboten) und `tests/model-types-only.test.ts` (außerhalb von `mandate/`
  nur `import type` aus `mandate/model`). Die Restschuld aus `modularisierung.md` ist damit erledigt.

T9c (erledigt): verlorene Aktualisierung beim Abgleich behoben (`update(fn)` + Speicher-Warteschlange im Provider), gemeinsames `Modal`
für alle Dialoge (N4), CSP per Meta im Build mit Skript-Hashes (N5, `tools/csp-plugin.ts`; Dev-Meta lockerer).

## Entscheidungen von Tobias

1. **Speicher:** `local-vault` im Gerätemodus mit optionaler App-Sperre; ohne Sperre öffnet die App ohne Passwort.
2. **Sicherungsdatei unverschlüsselt** (Klartext mit Mandantennamen); die Oberfläche zeigt `BACKUP_WARNING`.
3. **PEP per Selbstauskunft:** je Person erfragt und dokumentiert, nicht gegen eine Liste geprüft; eine
   Jahresfrist nach Amtsende ist nicht eingebaut (rechtlich unbestätigt).
4. **Relay anbieterneutral:** Referenz in `relay/`, feste Allowlist, nur Lesen, kein Protokoll von Anfragen.
5. **rad-navi:** die fehlenden Funktionen (Aufruf von außen, Pfeiltasten, Esc, Schutz vor Verlassen, Zähler)
   gehen als Issue #7 ins rad-navi-Repo; bis dahin Umweg über `jumpTarget` für „Mandant öffnen“.
6. **Datenquelle:** CSV-Export aus DATEV, Spalten erst mit dem echten Spaltenkopf (ohne Daten).
7. **Nicht eingetragene GbR:** Typ C ohne Registerabruf; bei der Kammer bestätigen lassen.

## Offen, in dieser Reihenfolge

1. **DATEV-Export:** Spaltenkopf von Tobias holen (Trennzeichen, Kodierung, Datumsformat); das DATEV-Worker-Repo
   vom KI-Chat wartet darauf. Dann `importer/` bauen (strenger Leser, nicht erkannte Zeilen mit Grund zeigen).
2. **Relay-Hoster wählen** und Weg B (CDN-Pull-Zone mit CORS, ca. 30 Minuten) gegen die echte EU-Adresse testen;
   Kostenobergrenze beim Hoster setzen.
3. **EU-XML-Schema an einer echten Datei bestätigen** (heute eine Annahme; Schwellen 0,85/0,9 mit echten Listen
   messen).
4. **rad-navi-Änderungen (Issue #7)**, danach die **UI-Tickets U1–U10** aus `docs/ui-konzept.md` Abschnitt 8
   (U1 Ablaufrahmen zuerst; U10 rad-navi-Ergänzungen kann parallel starten; U6 braucht Format 3).
5. **Rechtliche Prüfliste** (`gwg-privat`, `rechtspruefung.md`, Punkte 1–20) vor dem Scharfschalten jeder Regel.
6. **Offene Entscheidungen:**
   - aktiv + `gekuendigt` erscheint in keiner Audit-Liste: fünfte Liste oder zulässiger Übergang?
   - Audit-Abschluss ist erst ab dem Stichtag möglich: gewollt?
   - Einzelwort-Regel im Firmenabgleich bestätigen (T9a, Audit M2).
   - Das Ergebnis eines Abgleichs lebt nur im Speicher (nach dem Neuladen „Abgleich veraltet“): so lassen?
   - Der Git-Verlauf enthält in Commit `5250e2a` den Namen eines privaten Repos; Umschreiben des Verlaufs oder
     bewusst belassen.

## Arbeitsregeln

- Kleine Tickets, jedes ein eigener grüner Commit; Pushen nur auf den eigenen Branch, nie auf `main` ohne OK.
- **Gates-Satz:** vor jedem Weitermachen und vor jedem Commit alles laufen lassen und das Ergebnis lesen (nie
  Zahlen übernehmen): `npx prettier --write src tests docs *.md`, dann `npm run typecheck && npm run lint &&
npm run format:check && npm test && npm run build`.
- Öffentliches Repo: keine echten Mandantendaten, keine Namen privater Projekte (auch nicht in Commit-Texten);
  `.gitignore` sperrt `*.gwg.json`, `*.pdf`, `*.xml`, `*.csv`, `*.xlsx`, Testdaten stehen als Zeichenketten in
  `tests/`.
- Rechtsbehauptungen aus den Vorgaben sind ungeprüft; Zahlen nie als gesetzliche Pflicht darstellen.
- Verdachtsmeldungen: ein lokales Programm kann keinen Geheimbereich erzwingen; höchstens ein Verweis, Inhalte
  außerhalb des Programms.
- Ändert sich das Modell, in derselben Sitzung `docs/data-model.html` und `CLAUDE.md` angleichen.
