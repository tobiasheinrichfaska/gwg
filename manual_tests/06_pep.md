# MT-06 PEP-Selbstauskunft und Freigabe

**Ziel:** Je Person die PEP-Selbstauskunft in Schritten erfassen, die Freigabe der Führungsebene festhalten und die Folgen sehen.

**Vorbereitung:** `dist/index.html` öffnen. Alle Daten sind erfunden. Mandat `96001` „Beispiel Handel GmbH“ (GmbH, Risikogruppe wählen) mit der Person Geschäftsführer `Beispiel`, `Erika` anlegen (siehe MT-05).

**Schritte:**

1. Bildschirm „Aufgaben“ öffnen und die Gruppe „PEP-Selbstauskunft einholen“ ansehen.
2. „Auskunft erfassen“ wählen. Ohne Antwort „Weiter“ wählen.
3. „Ja“ wählen, Datum der Auskunft so lassen (heute), „Weiter“.
4. Ohne Funktion „Weiter“; dann Funktion `Staatssekretärin` eintragen, „Weiter“.
5. Bei der Frage zu Familie und Nähe „Nein“ wählen, „Weiter“. In der Zusammenfassung die Folgen lesen.
6. „Zurück“ bis zum ersten Schritt, dann „Abbrechen“ und „Eingaben verwerfen“.
7. Schritt 2 bis 5 wiederholen und „Auskunft speichern“ wählen.
8. In „Aufgaben“ die Gruppe „Freigabe der Führungsebene“ ansehen, „Freigabe erfassen“ wählen, ohne Namen speichern, dann den Namen `Dr. Leitung` eintragen und „Freigabe speichern“.
9. Bildschirm „Mandanten“: Zeile und Mandat ansehen. Beim Mandat „Bearbeiten“ wählen und die Personenliste ansehen.
10. Seite neu laden und Schritt 9 wiederholen.
11. Bei einer zweiten Person die Antwort „Unbekannt“ erfassen und die Zusammenfassung lesen.

**Erwartet:**

- Schritt 1: Die Person steht unter „PEP-Selbstauskunft einholen“ mit Mandat und Namen.
- Schritt 2: Rote Meldung „Bitte eine Antwort wählen …“; es geht nicht weiter.
- Schritt 3: Oben steht „Schritt 1 von 4“ (ohne Antwort „Ja“ nur „von 3“); darunter steht der Hinweis auf die amtliche Funktionenliste der EU (C/2023/724) und „rechtlich zu bestätigen“.
- Schritt 4: Erst die Meldung zur Funktion, dann „Schritt 3 von 4: Familie und Nähe“.
- Schritt 5: „Das Mandat wird als Risikoklasse hoch geführt.“ und „Freigabe durch die Führungsebene erforderlich.“
- Schritt 6: Beim Abbrechen kommt die Rückfrage „Eingaben verwerfen?“; danach ist nichts gespeichert (Aufgabe steht weiter da).
- Schritt 7: Meldung „PEP-Selbstauskunft von Erika Beispiel gespeichert …“; die Aufgabe „PEP-Selbstauskunft einholen“ ist weg.
- Schritt 8: Der Dialog sagt „Das Programm entscheidet nichts; die Freigabe bestätigt ein Mensch.“ Ohne Namen: rote Meldung. Danach ist die Aufgabe weg; Datum der Freigabe ist heute.
- Schritt 9: In der Liste steht bei der Risikoklasse „hoch“ und „⚠ PEP-betroffen“ (Text und Symbol); beim Bearbeiten steht der Hinweis ebenfalls. Die Personenliste zeigt „PEP: Ja (Datum); nahestehend: Nein; Freigabe Datum (Dr. Leitung)“.
- Schritt 10: Alles ist unverändert.
- Schritt 11: „Auskunft unbekannt: Aufgabe bleibt offen.“; die Aufgabe „PEP-Selbstauskunft einholen“ bleibt in der Liste.
- Beim Löschen eines Mandats verschwinden seine Personen (neues Mandat mit derselben Nummer zeigt „Keine Personen erfasst.“).
- Es erscheint keine Konsolenfehlermeldung. Es werden keine Daten ins Netz gesendet.
