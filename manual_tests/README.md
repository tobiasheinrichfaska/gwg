# Manuelle Tests — GwG-Pflege

Für Menschen am Bildschirm, ohne Programmierkenntnisse. Sie ergänzen die automatischen Tests und prüfen
nur, was eine Person sehen muss.

## Vorbereitung

1. Die Datei `dist/index.html` ist die ganze Anwendung (Entwicklung: `npm run build`).
2. Doppelklick öffnet sie im Browser. Es werden keine Daten ins Netz gesendet.
3. Alle Testdaten sind erfunden. Echte Mandantendaten gehören nicht in diese Tests.

## Stand

Gebaut sind der Rahmen mit Navigation und die Bildschirme „Sicherung“ und „Mandanten“ (MT-01 bis MT-03).
Übersicht, Aufgaben und Audit sind noch Platzhalter; ihre Fälle kommen mit den Bildschirmen.

## Dateien

| Datei             | Inhalt                                                  |
| ----------------- | ------------------------------------------------------- |
| `01_start.md`     | Start der Anwendung                                     |
| `02_sicherung.md` | Sicherung speichern, ansehen, einspielen, kaputte Datei |
| `03_mandanten.md` | Mandanten anlegen, suchen, bearbeiten, löschen          |
