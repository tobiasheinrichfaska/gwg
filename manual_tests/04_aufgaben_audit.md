# 04 Aufgaben, Audit, Übersicht

Alle Daten hier sind erfunden. Echte Mandantendaten gehören nicht in diesen Test. „Heute“ ist das Datum des
Geräts; Datumsangaben unten sind deshalb relativ („heute minus 30 Tage“).

## MT-04: Aufgabenliste, Audit und Übersicht

**Vorbedingungen:** `dist/index.html` ist gebaut und im Browser geöffnet (MT-01 bis MT-03 bestanden). Der Bestand
ist neu (0 Mandate); sonst vorher unter „Sicherung“ eine leere Sicherung einspielen.

**Schritte:**

1. Bereich „Aufgaben“ öffnen, dann „Audit“, dann „Übersicht“. Die Hinweise bei leerem Bestand lesen.
2. Unter „Mandanten“ drei Mandate anlegen (Rechtsform „GmbH“, Risikogruppe „M-01 …“):
   - `91001` „Ohne Anforderung GmbH“, Status „leer“, keine Daten.
   - `91002` „Angefordert AG“, Status „unvollständig“, „Erste Anforderung am“ = heute minus 30 Tage.
   - `91003` „Alt KG“, Status „vollständig“, „Letzte Prüfung am“ = heute minus 3 Jahre.
3. Bereich „Aufgaben“ öffnen. Die Gruppen und Zeilen lesen.
4. Bei „Ohne Anforderung GmbH“ „Erste Anforderung heute gesendet“ wählen.
5. Bei „Alt KG“ „Prüfung heute abgeschlossen“ wählen, den Dialog lesen, „Abbrechen“.
6. Noch einmal „Prüfung heute abgeschlossen“, diesmal „Prüfung bestätigen“.
7. Bei „Angefordert AG“ „Mandant öffnen“ wählen, den Hinweis lesen, im Rad zurück zur Auswahl gehen, den Bereich
   „Mandanten“ öffnen.
8. Bereich „Audit“ öffnen. Die vier Listen, die Zahl und den Satz zum Abschluss lesen. „Stichtagsliste
   herunterladen“ wählen und die Datei `gwg-audit-<heute>.txt` im Texteditor öffnen.
9. Bei „Angefordert AG“ unter „Mandanten“ den Status auf „vollständig“ setzen, „Letzte Prüfung am“ = heute.
   „Ohne Anforderung GmbH“ ebenso. Danach „Audit“ erneut öffnen.
10. Bereich „Übersicht“ öffnen.
11. Bereich „Audit“ öffnen. Im Feld „Stichtag“ das heutige Datum wählen (der Standard, 30. November, kann in der
    Zukunft liegen und lässt sich dann nicht abschließen). „Audit abschließen“ wählen, den Dialog lesen. Ohne Namen
    „Audit abschließen bestätigen“ wählen, dann Namen und Notiz eintragen und bestätigen.
12. Seite neu laden (F5), Bereich „Audit“ und „Übersicht“ öffnen.
13. Unter „Mandanten“ „Ohne Anforderung GmbH“ auf Status „leer“ setzen. Bereich „Audit“ öffnen.
14. „Abschluss zurücknehmen“ wählen, „Abbrechen“, dann erneut wählen und bestätigen.

**Erwartet:**

- Schritt 1: Aufgaben und Audit melden keine Aufgaben beziehungsweise keine Auffälligkeiten („Audit
  abschließbar“); die Übersicht zeigt 0 aktive Mandate.
- Schritt 3: Drei Gruppen in dieser Reihenfolge: „Androhung senden (1)“ mit `91002` und „2 Tage“ Fälligkeit (die
  Androhung ist 28 Tage nach der Anforderung fällig), „Prüfung fällig (1)“ mit `91003`, „Unterlagen anfordern
  (1)“ mit `91001` und „—“ bei „Fällig seit“. Kein Abschnitt „Nicht prüfbare Mandate“.
- Schritt 4: Meldung „Erste Anforderung am <heute> vermerkt.“. Die Gruppe „Unterlagen anfordern“ verschwindet.
- Schritt 5: Der Dialog sagt „Sie bestätigen, dass die Prüfung durchgeführt wurde.“ und dass das Programm nichts
  rechtlich entscheidet. Nach „Abbrechen“ ändert sich nichts; „Alt KG“ bleibt in „Prüfung fällig“.
- Schritt 6: Meldung „Prüfung am <heute> vermerkt.“; „Alt KG“ verschwindet aus der Liste.
- Schritt 7: Ein Hinweis nennt, dass Mandat `91002` vorgemerkt ist. Der Bereich „Mandanten“ öffnet sich direkt im
  Formular „Mandant bearbeiten“ für `91002`. („Abbrechen“ führt zur Liste.)
- Schritt 8: Stichtag in der Form TT.MM.JJJJ (heute). „Noch 2 Auffälligkeiten.“: „Nicht identifiziert (1)“ mit
  `91001`, „Identifizierung stockt (1)“ mit `91002`. Der Satz „Audit abschließbar“ fehlt. Die Textdatei zeigt Stichtag, Gesamtzahl und je Liste Nummer;Name.
- Schritt 9: „Audit abschließbar: keine Auffälligkeiten.“ und alle vier Listen mit „Keine Auffälligkeiten.“.
- Schritt 10: „Aktive Mandate: 3 (von 3)“, keine Aufgaben („Keine offenen Aufgaben.“), „Auffälligkeiten zum Stichtag:
  0“.
- Schritt 11: Der Dialog sagt „Sie bestätigen, dass die Ausnahmelisten geprüft wurden; das Programm entscheidet
  nichts rechtlich.“. Ohne Namen erscheint eine Fehlermeldung (Code `bad-closing`), nichts wird gespeichert. Danach
  steht „Abgeschlossen am <heute> durch <Name>“ (mit Notiz); der Knopf „Audit abschließen“ ist weg. Die
  Stichtagsliste enthält die Zeile „Abschluss: …“.
- Schritt 12: Der Abschluss ist noch da. Die Übersicht zeigt „Audit zum Stichtag …: abgeschlossen am <heute>“.
- Schritt 13: Das Audit zeigt „Abgeschlossen am …“ und die Warnung „Seit dem Abschluss sind Auffälligkeiten
  entstanden“; der Abschluss bleibt bestehen.
- Schritt 14: Nach „Abbrechen“ bleibt der Abschluss; nach der Bestätigung ist er weg und die Übersicht zeigt „offen“.
- Nach F5 (Neuladen) bleiben die Änderungen erhalten.
