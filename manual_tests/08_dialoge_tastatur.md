# MT-08 Dialoge mit Tastatur

**Ziel:** Alle Dialoge verhalten sich gleich: Fokus, Tab, Esc, Rückkehr, gesperrter Hintergrund.

**Vorbereitung:** `dist/index.html` öffnen. Alle Daten sind erfunden. Mandat `96001` mit einer Person anlegen (siehe MT-05). Nur die Tastatur benutzen (Tab, Umschalt+Tab, Esc, Eingabe).

**Schritte:**

1. Bildschirm „Mandanten“: mit Tab zu „Löschen“ des Mandats gehen, Eingabe drücken.
2. Im Dialog mehrfach Tab, dann mehrfach Umschalt+Tab drücken.
3. Esc drücken.
4. Dasselbe für „Person löschen“ (Mandat bearbeiten), „Auskunft erfassen“ (PEP), „Audit abschließen“, „Abschluss zurücknehmen“ (Audit), „Entscheidung zurücknehmen“ (Treffer), „Sicherung einspielen“ (Datei wählen, Rückfrage) und „Liste einlesen“.
5. Bei offenem Dialog versuchen, die Seite dahinter mit Tab oder per Klick zu bedienen.

**Erwartet:**

- Schritt 1: Der Fokus steht sofort im Dialog (bei Löschfragen auf „Abbrechen“, bei Formularen im ersten Feld).
- Schritt 2: Der Fokus verlässt den Dialog nie; nach dem letzten Knopf kommt der erste, mit Umschalt+Tab umgekehrt.
- Schritt 3: Der Dialog schließt ohne Änderung; der Fokus steht wieder auf dem Knopf, der ihn geöffnet hat.
- Schritt 4: Gleiches Verhalten bei jedem Dialog; ein Screenreader nennt „Dialog“ oder „Warnungsdialog“ mit dem Titel.
- Schritt 5: Die Seite dahinter lässt sich nicht bedienen.
- Es erscheint keine Konsolenfehlermeldung. Es werden keine Daten ins Netz gesendet.
