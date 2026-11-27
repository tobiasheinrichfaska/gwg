# MT-05 Personen je Mandat

**Ziel:** Personen (Inhaber, Geschäftsführer, Gesellschafter, wirtschaftlich Berechtigte, Vertreter) je Mandat pflegen.

**Vorbereitung:** `dist/index.html` öffnen, Bildschirm „Mandanten“. Alle Daten sind erfunden.

**Schritte:**

1. „Mandant anlegen“: Nummer `95001`, Name `Beispiel Bau GmbH`, Rechtsform „GmbH“, Risikogruppe wählen, Status „leer“, speichern.
2. In der Liste die Spalte „Personen“ und die Zeile von `95001` ansehen.
3. Bei `95001` „Bearbeiten“ wählen. Unten den Abschnitt „Personen“ ansehen, „Person anlegen“ wählen.
4. Rolle „Geschäftsführer“, Name `Beispiel`, Vorname `Erika`, Geburtsdatum `1975-03-09`, „Person speichern“.
5. Noch eine Person: Rolle „Wirtschaftlich Berechtigter“, Name `Muster`, Vorname leer, Geburtsdatum `1980`, speichern.
6. Noch eine Person mit Geburtsdatum `1980-13`, speichern.
7. Die zweite Person mit „Bearbeiten“ öffnen, Geburtsdatum `1980-06`, speichern.
8. Die erste Person „Löschen“, im Dialog „Abbrechen“; dann noch einmal „Löschen“ und „Person endgültig löschen“.
9. „Abbrechen“ zurück zur Liste. Beim Mandat `95001` „Löschen“ wählen, den Dialog lesen, „Abbrechen“. Dann „Endgültig löschen“.

**Erwartet:**

- Schritt 2: Die Zeile zeigt „0“ und den Hinweis „Keine Vertreter/wirtschaftlich Berechtigten erfasst“ (nur eine Anzeige).
- Schritt 3: Der Abschnitt „Personen“ steht nur beim Bearbeiten (nicht beim Anlegen) und sagt „Keine Personen erfasst.“.
- Schritt 4: Meldung „Person Beispiel gespeichert.“; die Zeile zeigt Rolle, Name, Vorname und `09.03.1975`.
- Schritt 5: Die Zeile zeigt „—“ als Vorname und `1980`. Neben dem Geburtsdatum steht: „Auch nur Jahr möglich; fehlt es, wird bei Namensähnlichkeit immer ein Mensch gefragt.“
- Schritt 6: Rote Meldung „Nicht gespeichert. Die Person ist ungültig …“; nichts wird gespeichert, das Formular bleibt offen.
- Schritt 7: Die Zeile zeigt `06.1980`.
- Schritt 8: Nach „Abbrechen“ ist die Person noch da; danach ist sie weg („Person Beispiel gelöscht.“).
- Schritt 9: Der Dialog nennt, dass die erfasste Person (Anzahl) mitgelöscht wird. Nach „Endgültig löschen“ sind Mandat und Personen weg (nach „Sicherung“ speichern: keine Person der Nummer `95001` in der Datei).
- Jede Person wird sofort gespeichert, unabhängig vom Knopf „Speichern“ des Mandats.
- Es erscheint keine Konsolenfehlermeldung. Es werden keine Daten ins Netz gesendet.
