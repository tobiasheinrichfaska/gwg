# 02 Sicherung

Alle Daten hier sind erfunden. Die Sicherungsdatei enthält Mandantendaten im Klartext: nach dem Test löschen.

## MT-02: Sicherung speichern, ansehen, einspielen

**Vorbedingungen:** `dist/index.html` ist gebaut und im Browser geöffnet (MT-01 bestanden). Der Bestand ist neu
(0 Mandate). Mandate lassen sich noch nicht in der Anwendung anlegen; für den Einspiel-Test wird die Datei
daher von Hand erzeugt (Schritt 4).

**Schritte:**

1. Im unteren Rad den Bereich „Sicherung“ wählen (oder per Tastatur dorthin gehen).
2. Den gelben Hinweis lesen. Auf „Sicherung speichern“ klicken.
3. Die heruntergeladene Datei `gwg-sicherung-<heutiges Datum>.gwg.json` mit einem Texteditor öffnen.
4. Im Editor unter `"mandates": []` einen Eintrag einsetzen (Beispiel, erfunden):
   `{"id":"90001","name":"Beispiel GmbH","legalForm":"gmbh","active":true,"idStatus":"vollstaendig","riskGroupId":"M-01","riskReason":"","isPep":false,"firstRequestOn":null,"lastCheckOn":"2026-01-15","endedOn":null}`
   Als `…-test.gwg.json` speichern.
5. In der Anwendung bei „Sicherung einspielen“ die Datei `…-test.gwg.json` wählen.
6. Im Dialog „Bestand ersetzen?“ zuerst „Abbrechen“, dann die Datei erneut wählen und „Ersetzen“ klicken.
7. Seite neu laden (F5), wieder zu „Sicherung“ gehen.
8. Eine zweite Datei `kaputt.gwg.json` mit dem Inhalt `{"format":` anlegen und einspielen.

**Erwartet:**

- Schritt 2: Der Hinweis „Achtung: Die Sicherungsdatei ist nicht verschlüsselt …“ steht dauerhaft da. Nach dem Klick lädt der Browser die Datei herunter; darunter steht „Sicherung … wurde an den Browser übergeben (0 Mandate)“.
- Schritt 3: Lesbarer Text mit `"format": "gwg-backup"`, `"version": 1`, `"rules"` und `"mandates"`.
- Schritt 6: Der Dialog nennt „1 Mandate“. Nach „Abbrechen“ steht weiter „Bestand: 0 Mandate.“. Nach „Ersetzen“ steht „Bestand: 1 Mandate.“.
- Schritt 7: Der Bestand „1 Mandate“ ist nach dem Neuladen noch da (er liegt verschlüsselt im Browser des Geräts).
- Schritt 8: Eine rote Meldung nennt einen Code (z. B. `bad-backup`) und, wenn bekannt, die Stelle. Der Bestand bleibt bei „1 Mandate“; es erscheint kein Bestätigungsdialog.
- Nicht offensichtlich: Der Bereich „App-Sperre“ weist darauf hin, dass die Anwendung ohne Sperre ohne Passwort öffnet.
- Es erscheint keine Konsolenfehlermeldung. Es werden keine Daten ins Netz gesendet.
