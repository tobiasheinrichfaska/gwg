# 03 Mandanten

Alle Daten hier sind erfunden. Echte Mandantendaten gehören nicht in diesen Test.

## MT-03: Mandanten anlegen, suchen, bearbeiten, löschen

**Vorbedingungen:** `dist/index.html` ist gebaut und im Browser geöffnet (MT-01 bestanden). Der Bestand ist neu
(0 Mandate); sonst vorher unter „Sicherung“ eine leere Sicherung einspielen.

**Schritte:**

1. Im Rad den Bereich „Mandanten“ wählen. Den erklärenden Satz lesen.
2. „Mandant anlegen“ wählen. Mandatsnummer `90001`, Name `Beispiel GmbH`, Rechtsform „GmbH“, Risikogruppe
   „M-01 …“, Status „vollständig“, Letzte Prüfung `15.01.2026`. „Speichern“.
3. Noch einmal „Mandant anlegen“: Mandatsnummer `90002`, Name `Erika Beispiel`, Rechtsform „Natürliche Person“,
   Risikogruppe „N-01 …“, Kontrollkästchen „Politisch exponierte Person (PEP)“ ankreuzen (den Hinweis daneben
   lesen), Status „unvollständig“. „Speichern“.
4. Ungültige Eingabe: „Mandant anlegen“, Mandatsnummer `90003`, Name `Fehler GmbH`, Status „vollständig“, das
   Datum „Letzte Prüfung“ leer lassen. „Speichern“.
5. Im selben Formular die Nummer auf `90001` ändern, „Speichern“. Danach „Abbrechen“.
6. In der Liste das Suchfeld benutzen: `erika`, dann `9000`. Das Kontrollkästchen „Nur aktive Mandate“
   aus- und wieder einschalten.
7. Bei „Beispiel GmbH“ „Bearbeiten“ wählen, den Namen in `Beispiel Holding GmbH` ändern, „Speichern“.
8. Bei „Erika Beispiel“ „Löschen“ wählen, den Dialog lesen, „Abbrechen“.
9. Noch einmal „Löschen“, diesmal „Endgültig löschen“.
10. Seite neu laden (F5), wieder „Mandanten“ öffnen.
11. Nur mit der Tastatur: mit Tab zu „Mandant anlegen“ gehen, Enter, ein Feld nach dem anderen mit Tab
    erreichen, mit Esc im Löschdialog abbrechen.

**Erwartet:**

- Schritt 1: Ein Satz erklärt, dass noch keine Mandate im Bestand sind; keine Tabelle.
- Schritt 2: Rückkehr zur Liste mit „Mandant 90001 Beispiel GmbH gespeichert.“. Die Zeile zeigt: Rechtsform
  „GmbH“, Risikoklasse „normal“, Status „vollständig“, nächste Prüfung `15.01.2028`, Aktiv „Ja“. Daten stehen
  als TT.MM.JJJJ.
- Schritt 3: Die Zeile „Erika Beispiel“ zeigt Risikoklasse „hoch“ (PEP bedeutet immer Risikoklasse hoch), nächste
  Prüfung „—“, weil noch nie geprüft wurde.
- Schritt 4: Eine rote Meldung „Nicht gespeichert. …“ nennt, dass der Status „vollständig“ ein Datum der
  letzten Prüfung braucht. Das Formular bleibt offen; die Meldung ist per Tastatur fokussiert und wird vorgelesen.
  Es erscheint kein neuer Eintrag.
- Schritt 5: Meldung „Diese Mandatsnummer gibt es schon.“ Nach „Abbrechen“ ist nichts verändert.
- Schritt 6: Die Suche filtert nach Nummer und Name; die Anzeige „x von y Mandaten angezeigt.“ passt dazu.
  Standard ist „Nur aktive Mandate“ eingeschaltet.
- Schritt 7: Die Nummer lässt sich nicht ändern (Hinweis am Feld). Der neue Name steht in der Liste.
- Schritt 8: Der Dialog nennt, dass das Mandat nicht beendet ist und Löschen vor Ablauf der Aufbewahrungsfrist
  rechtlich zu klären ist. Der Fokus steht auf „Abbrechen“. Nach „Abbrechen“ ist die Zeile noch da.
- Schritt 9: „Mandant 90002 Erika Beispiel gelöscht.“; die Zeile ist weg.
- Schritt 10: Nur „Beispiel Holding GmbH“ ist noch da (der Bestand liegt verschlüsselt im Browser des Geräts).
- Schritt 11: Jedes Feld hat eine sichtbare Beschriftung, der Fokus ist immer sichtbar, Esc schließt den Dialog.
- Nicht offensichtlich: Wird ein beendetes Mandat (Aktiv aus, „Mandat beendet am“ gesetzt) gelöscht, nennt der
  Dialog das Datum der Löschfälligkeit. Ein inaktives Mandat ohne Beendigungsdatum wird nicht gespeichert.
- Es erscheint keine Konsolenfehlermeldung. Es werden keine Daten ins Netz gesendet.
