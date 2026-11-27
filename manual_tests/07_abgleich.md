# 07 Abgleich (Sanktionsliste)

Alle Namen sind erfunden. Eine Beispieldatei der EU-Liste (XML) muss selbst angelegt werden: ein
`<export generationDate="2026-11-20T10:00:00+01:00">` mit einem `sanctionEntity` „Zorin Quelle“ (Geburtsdatum
1965-12-12), einem „Muster Handels AG“ und einem Eintrag ohne Namen. Die Datei gehört nicht ins Repo.

## MT-07a: Liste aus Datei einlesen

**Schritte:** Bereich „Abgleich“ öffnen. „Liste aus Datei einlesen“, die Beispieldatei wählen.

**Erwartet:**

- Ohne Liste steht oben „⚠ Keine Sanktionsliste geladen“, „Abgleich starten“ ist gesperrt und erklärt warum.
- Ein Dialog nennt die Zahl der Einträge, „Übersprungene Einträge: 1“ mit Grund und den Stand-Vorschlag (änderbar).
- Erst „Liste speichern“ speichert; „Abbrechen“ ändert nichts. Danach zeigt der Kopf Quelle, Stand (TT.MM.JJJJ), Alter und Zahl der Einträge.
- Ist die Liste älter als das Höchstalter: Banner „⚠ Liste veraltet“ (Text und Symbol).

## MT-07b: Einstellungen

**Schritte:** Relay-Adresse `http://relay.example` eintragen, „Einstellungen speichern“. Dann Höchstalter 0.

**Erwartet:** Jeweils „Nicht gespeichert“ mit Code `bad-settings`. Mit leerer Adresse oder `https://…` und 1 bis 365 Tage: „Einstellungen gespeichert“. Der Hinweis „Beim Abruf wird nur die öffentliche Liste geladen; es werden keine Mandantendaten gesendet.“ steht immer da.

## MT-07c: Abgleich und Treffer klären

**Vorbedingungen:** Mandat „Muster Handels AG“ mit Person Zorin Quelle (Geburtsdatum 1965-12-12), Liste geladen.

**Schritte:** „Abgleich starten“. In der Trefferliste bei der Person „Treffer klären“ wählen. Zuerst ohne Namen „Kein Treffer“ drücken, dann Name, Ausschlussgrund und Begründung eintragen und speichern. Bei dem anderen Treffer „Treffer bestätigt“ mit Begründung. „Entscheidung zurücknehmen“ mit Abbrechen und mit Bestätigung.

**Erwartet:**

- Fortschrittsanzeige „n von m geprüft“; Zusammenfassung (rot/gelb offen, bestätigt, nicht prüfbar); Zeilen „● ROT – Treffer“ vor „◐ GELB – prüfen“, mit Mandat, Name, Ähnlichkeit in Prozent, Listeneintrag.
- Die Detailseite zeigt links Person/Mandat, rechts den Listeneintrag und erklärt die Ampel.
- Fehlende Pflichtfelder: Meldung, nichts gespeichert. Nach „Treffer bestätigt“ der Hinweis zu Bereitstellungsverbot und Meldeweg (Entscheidung der Leitung; das Programm meldet nichts); im Abschnitt „Bestätigte Treffer“ das Feld „Maßnahme dokumentiert“.
- Eine Entscheidung lässt sich nicht überschreiben, nur über „Entscheidung zurücknehmen“ mit Bestätigung.
- Nach dem Neuladen bleiben Entscheidungen und Liste; der Abgleich zeigt „⚠ Abgleich veraltet“, bis er neu gestartet wird. Dasselbe Banner erscheint in Aufgaben und Übersicht, wenn Personen oder Mandate nach dem Abgleich geändert wurden. Die Aufgabenliste zeigt die Treffer mit „Treffer öffnen“.

## MT-07d: Abruf eingeschaltet (lokaler Testserver)

**Vorbereitung:** Ein kleiner lokaler Server auf `127.0.0.1` (z. B. mit Node, `http.createServer`), der `GET /liste` mit der Beispieldatei, `Content-Type: application/xml` und `Access-Control-Allow-Origin: *` beantwortet und jede Anfrage in eine Datei schreibt.

**Schritte:** Relay-Adresse `http://127.0.0.1:<Port>` eintragen und speichern. Netzwerk-Reiter leeren, „Jetzt abrufen“. Danach „Beim Start abrufen“ einschalten, Höchstalter 1, Anwendung neu laden (Liste muss älter sein).

**Erwartet:** Genau `GET /liste` ohne Abfragezeichen und ohne Körper (Serverprotokoll). Meldung „Liste abgerufen“. Server aus: verständlicher Fehler mit Code `fetch-failed`, die Liste bleibt, die Anwendung läuft weiter. Im Standardzustand (Adresse leer) keine Netzanfrage.
