# UI-Konzept: Bedienung nach Vorgängen (Stand 2026-11-27)

Nur Konzept, kein Code. Grundlage: `CLAUDE.md`, `docs/io-schnittstellen.md`, `src/ui/`, `src/logic/tasks`, `FEATURES_REQUIRED.md`, rad-navi 0.1.1 (Quellen gelesen). **Annahme** = nicht belegt, Tobias bestätigt.
Die Tickets T2–T8 sind im Repo nicht beschrieben (nur T1 im Git-Verlauf: Personen, Audit-Abschluss, Format 2); Abhängigkeiten in Abschnitt 8 sind deshalb nach Inhalt benannt.

## 1. Leitprinzipien

1. Eine Frage pro Schritt: jeder Schritt verlangt genau eine Eingabe oder eine Bestätigung.
2. Der nächste Schritt ist immer sichtbar: ein Hauptknopf „Nächster Schritt“, nie mehrere gleichrangige.
3. Nichts geht still verloren: jede Änderung zeigt Bestätigung oder Fehler mit Ursache und nächstem Schritt.
4. Das Programm entscheidet nichts, der Mensch bestätigt: Vorschläge sind als Vorschlag markiert, Abweichung braucht Begründung.
5. Abbrechen ist immer möglich und verwirft ohne Speichern; Zurück ändert nichts an Daten.
6. Zustand steht im Text: Farbe, Symbol und Wort gehören zusammen.
7. Die Fristen sind Startvorschläge der Kanzlei, nie Gesetz (siehe `config.ts`); die Oberfläche nennt sie nie „gesetzlich“.

## 2. Informationsarchitektur

**Rad (Bereiche, heute belegt):** Übersicht, Mandanten, Aufgaben, Audit, Sicherung. Das Rad bleibt bei fünf Bereichen; es zeigt, wo man ist, und führt nicht durch Abläufe.
**Detailseiten und Abläufe** liegen unter dem jeweiligen Bereich als Inhalt der Seite (Annahme: als Zustand der Bildschirmkomponente, nicht als weitere Radknoten; so bleibt das Rad klein und der Ablauf läuft ohne Radbewegung).

| Ort                 | Inhalt                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| Übersicht           | Zahlen, Ampel Sanktionsliste, Stand der Sicherung, Einstieg „Heute zu tun“    |
| Mandanten           | Liste; Detailseite je Mandant; Abläufe (a), (b), (d)                          |
| Aufgaben            | Liste nach `buildTasks`; je Zeile Einstieg in (b) oder (c)                    |
| Audit               | Ablauf (e), Archiv der Abschlüsse                                             |
| Sicherung           | Ablauf (f), App-Sperre, Warnung                                               |
| Detailseite Mandant | Kopf, „Nächster Schritt“, „Was fehlt“, Personen, Verlauf (Muster Abschnitt 4) |

**Zustände der Identifizierung (`IdStatus`) und Übergänge:**

- `leer` → Erste Anforderung gesendet (Mahnuhr startet) → `unvollstaendig`
- `unvollstaendig` → Tag 14 erinnern, Tag 28 androhen, Tag 42 eskalieren (Startvorschlag) → `eskalation`
- `unvollstaendig` / `eskalation` → Identifizierung abgeschlossen (Mensch bestätigt) → `vollstaendig`
- `eskalation` → Entscheidung der Leitung → `vollstaendig` oder `gekuendigt`
- `vollstaendig` → rollierende Frist (36/24/12 Monate nach Klasse, Startvorschlag) fällig → Prüfung → `vollstaendig` mit neuem `lastCheckOn`
- `gekuendigt` / inaktiv → Löschfrist erreicht → Löschhinweis (`retention-due`), der Mensch löscht
- Sanktions-Treffer: grün → nichts; gelb → Mensch klärt; rot → Sperre und Meldung an die Leitung (Annahme; die Meldepflicht ist rechtlich offen, `rechtspruefung.md`)

Offen: welche dieser Statuswechsel das Programm setzt und welche DATEV (siehe Kommentar an `ID_STATUSES`); Tobias bestätigt.

## 3. Geführte Abläufe

Gemeinsam: Fortschritt als „Schritt 2 von 5“ plus Liste der Schrittnamen (Text, kein reiner Balken). Esc oder „Abbrechen“ fragt nur, wenn schon etwas eingegeben ist. Der Entwurf liegt im Arbeitsspeicher; gespeichert wird erst im letzten Schritt (ein `replace` nach `checkMandate`, wie heute in `TasksScreen`).

### (a) Neuer Mandant

Einstieg: Mandanten → „Neuer Mandant“. Schritte:

1. Stammdaten: Nummer und Name (Pflicht). Doppelte Nummer wird sofort gemeldet.
2. Rechtsform (Pflicht). Danach sofort Anzeige „Prüftyp B, Registerabruf nötig“ (aus `LEGAL_FORMS`).
3. Personen: Typ C braucht mindestens eine Person (Hinweis wie heute, keine Sperre); Rolle, Name, Geburtsdatum JJJJ / JJJJ-MM / JJJJ-MM-TT.
4. Risikogruppe: Vorschlag aus der Rechtsform (Annahme: Vorschlagslogik wird ergänzt, heute nur die Gruppenliste). Abweichung vom Vorschlag: Begründung Pflicht (`riskReason`). PEP-Frage getrennt; PEP bedeutet immer hoch.
5. Zusammenfassung, „Mandant speichern“, dann Angebot „Erste Anforderung jetzt vermerken“ (`firstRequestOn`).

Zurück: jeder Schritt, Eingaben bleiben. Abbruch: verwirft, nichts gespeichert. Ausgang: Detailseite des Mandanten.

### (b) Identifizierung abschließen

Einstieg: „Nächster Schritt“ auf der Detailseite; Aufgabenliste. Schritte:

1. Prüfliste je Prüftyp. **Der Inhalt der Listen steht nicht im Repo.** Annahme zur Orientierung: A = Ausweis der Person, B = Ausweis und Registerauszug, C = Gesellschaft, Register, wirtschaftlich Berechtigte. Der Wortlaut kommt aus der Rechtsprüfung und liegt später als Daten in `config.ts`. Je Punkt: Ja / Nein / nicht nötig; bei Nein Notiz Pflicht.
2. Registerabruf: Schritt erscheint nur, wenn `registerLookup` der Rechtsform wahr ist (sonst fehlt er ganz, auch in der Fortschrittsanzeige). Pflicht: Datum des Abrufs.
3. Sanktionsprüfung der Personen (Ablauf (d)); weiter erst bei grün oder geklärtem Treffer.
4. Bestätigung durch den Menschen: Name, Datum, Satz „Ich habe die Angaben geprüft“. Ergebnis: `vollstaendig`, `lastCheckOn` = heute.

Rücksprung zu jedem Schritt. Abbruch: Status und Daten bleiben unverändert; es wird nur der Abschluss gespeichert.

### (c) Mahnleiter

Einstieg: Aufgabenliste (Gruppen erinnern, androhen, eskalieren). Jede Stufe hat eine Seite „Wo stehen wir“ mit Tagen seit der ersten Anforderung, Stufe und nächstem Datum.

1. Erinnern: Knopf „Erinnerung gesendet, heute“ (Annahme: dafür braucht das Modell ein Feld „Mahnung gesendet am“; heute fehlt es).
2. Androhen: wie 1, mit Hinweis auf die Folge.
3. Eskalieren: Mandat geht an die Leitung. Pflicht: „Entscheidung der Leitung“ als Auswahl (weiter mit neuer Frist / Mandat beenden / Anzeige prüfen lassen; Annahme, Rechtliches klärt der Mensch), dazu Name und Datum.

Zurück ja; Abbruch ändert nichts. Ohne erste Anforderung führt die Seite zu (a) Schritt 5.

### (d) Sanktions-Treffer klären

Einstieg: Ampel auf Übersicht oder Detailseite (gelb/rot). Heute gibt es die Logik (`classifyNames`), aber weder Bildschirm noch Listeneinspielung (offen). Schritte:

1. Nebeneinander: links Mandant/Person (Name, Geburtsdatum), rechts Listeneintrag; Unterschiede mit Text („Geburtsjahr gleich“, „Monat fehlt“).
2. Ausschlussgründe zum Ankreuzen (Annahme: z. B. anderes Geburtsdatum, andere Staatsangehörigkeit) **oder** „Treffer bestätigt“.
3. Pflichtbegründung (Freitext, nicht leer). Bei rot kein Ausschluss durch eine einzelne Person: Hinweis „Leitung entscheidet“ (Annahme).
4. Bestätigung mit Name und Datum; die Entscheidung wird beim Mandat gespeichert (Datenmodell nötig).

Rücksprung ja; Abbruch: Treffer bleibt offen und steht weiter unter „Was fehlt“.

### (e) Jahresaudit 1.–30. November

Einstieg: Bereich Audit; ab 1.11. Hinweis auf der Übersicht. Außerhalb des Zeitraums nur Lesen (Annahme; heute wird der Zeitraum nicht erzwungen). Je Ausnahmeliste ein Schritt, Reihenfolge `unclassified`, `unidentified`, `stalled`, `overdue`: Zahl, Mandate, je Zeile „Mandant öffnen“ (Detailseite mit Hauptknopf), Stand „abgearbeitet“, sobald die Liste leer ist.
Letzter Schritt: Abschluss nur bei `auditIsClean`. Eingabe: Name (Pflicht) und Notiz (frei); Speicherung als `AuditClosing` (Stichtag, Datum, Name, Notiz, bereits in Format 2). Fortschritt: „Liste 2 von 4, noch 3 offen“. Abbruch: Listen bleiben, kein Abschluss. Der Textexport der Stichtagsliste bleibt.

### (f) Sicherung und Einspielen

Einstieg: Bereich Sicherung; Hinweis auf der Übersicht, wenn die letzte Sicherung alt ist (Annahme: Schwelle noch festlegen). Sichern: 1. `BACKUP_WARNING` lesen, 2. Datei erstellen, 3. Hinweis auf Speicherort. Einspielen: 1. Datei wählen, 2. strenge Prüfung (`parseBackup`) mit Ergebnisseite (Zahl Mandate/Personen, Format), Fehler mit Zeile und Ursache, 3. Bestätigung „Aktuelle Daten ersetzen“, vorher Angebot „zuerst sichern“. Abbruch an jeder Stelle, die Daten bleiben.

## 4. Detailseiten-Muster

Von oben nach unten: (1) Kopf: Nummer, Name, Rechtsform, Prüftyp, Risikoklasse, Status als Text mit Symbol, PEP-Kennzeichen. (2) **Nächster Schritt** als einziger Hauptknopf, abgeleitet aus Status und `buildTasks` (z. B. „Erste Anforderung vermerken“). (3) „Was fehlt“: offene Punkte mit je einem Knopf (Risikogruppe, Personen, Registerabruf, Sanktionsklärung). (4) Daten zum Ansehen und Ändern (Personen, Begründung). (5) Verlauf: Datum, Ereignis, Name (Annahme: neues Feld nötig; heute nur `lastCheckOn`, `firstRequestOn`, Audit-Abschlüsse). Schmal: „Was fehlt“ als Abschnitt unter dem Kopf; breit: rechts daneben.
**Warnungen:** `BACKUP_WARNING` dort, wo die Datei entsteht oder gelesen wird (Sicherung), dazu eine Zeile auf der Übersicht. Veraltete Sanktionsliste: Banner im Kopf der Mandanten-Detailseite und an der Ampel („Liste vom …, älter als N Tage“, N Annahme); ohne Listenstand zeigt die Ampel nie „grün“. Speicherfehler (`saveError`) als `role="alert"` oben, bis zur nächsten erfolgreichen Speicherung.

## 5. Bedienung

- Tastatur: Tab durch alle Elemente. Radsektoren sind Schaltflächen (Enter/Leertaste, belegt in rad-navi `Ring.tsx`); Hubs: Enter, Umschalt+Enter belegt das Kürzel, Entf löscht. **Pfeiltasten für das Rad sind in rad-navi nicht belegt** (Abschnitt 7). In Abläufen: Enter = Nächster Schritt, Esc = Abbrechen (Rückfrage bei Eingaben), Alt+Links = Zurück (Annahme, frei wählbar).
- Touch: Wischen zur Nachbarseite und Rückgeste sind belegt (README rad-navi). Ziele mindestens 44 px (Annahme, übliche Richtlinie).
- Fokus: beim Seitenwechsel auf die Überschrift (`h1`, `tabindex=-1`), beim Schrittwechsel auf die Schrittüberschrift; nach einem Dialog zurück auf den auslösenden Knopf; Fokusrahmen immer sichtbar.
- Leseprogramme: Fortschritt in `aria-live="polite"` („Schritt 2 von 5: Rechtsform“), Fehler `role="alert"`, jedes Feld mit Label. Das Rad hat Labels (`aria-label`, belegt); echtes Verhalten mit Leseprogramm ist ungeprüft.
- Farbe nie allein: Ampel und Status = Wort + Symbol (OK / Achtung / Stopp) + Farbe.
- Hell/dunkel folgt `prefers-color-scheme`, Reduzierte Bewegung `prefers-reduced-motion` (beides im Rad belegt: `useDark`, `useReducedMotion`); eigene Übergänge entfallen dann.

## 6. Texte

Einfache Sprache, kurze Sätze, Sie-Form, gleiche Wörter für gleiche Dinge („Mandant“, „Identifizierung“). Abkürzungen beim ersten Auftreten erklärt (PEP: politisch exponierte Person). Knöpfe sind Verben („Mandant speichern“, nicht „OK“).
Fehlermeldung = Was ist passiert + was tun: „Nicht gespeichert. Die Rechtsform fehlt. Wählen Sie eine Rechtsform und speichern Sie erneut.“ Quelle bleibt `REASON_TEXTS` (ein Satz je `Reason`); der Test `messages.test.ts` kann um „nennt einen nächsten Schritt“ erweitert werden (Annahme).

## 7. Was rad-navi heute nicht kann (Tag v0.1.1) und Vorschläge für das rad-navi-Repo

- **Kein Navigationsaufruf von außen:** keine Methode, kein Ref; `startNode` gilt nur beim Start. Umweg `jumpTarget` (unterer Hub springt dorthin): der Wert wird nur **einmal pro Minute** neu gelesen (`setInterval` 60000 in `WheelNav.tsx`) und der Sprung braucht einen Tipp auf den Hub; so löst gwg heute „Mandant öffnen“. Vorschlag: Prop `navigateTo?: { node: string; nonce: number }` oder Ref mit `open(nodeId)`, wirkt sofort.
- **Pfeiltasten für das Rad fehlen** (nur Enter/Leertaste auf Sektoren). Vorschlag: Links/Rechts blättert, Auf/Ab wechselt die Ebene; Option `keyboardArrows`.
- **Keine Esc-Belegung gefunden** (Zurück nur per Geste oder Klein-Rad). Vorschlag: Esc = eine Ebene zurück, abschaltbar.
- **Kein Schutz vor Verlassen mit ungespeicherter Eingabe:** Wischen kann einen Ablauf wegwerfen. Vorschlag: `canLeave?: () => boolean | Promise<boolean>`.
- **Keine Zähler am Sektor** („3 offen“). Vorschlag: `badge?: (node) => string` (Text, nicht nur Farbe).
- **Persistenz** nur Knoten-ID im localStorage; genügt vermutlich (`io-schnittstellen.md`, Punkt 6).

## 8. Umsetzungstickets (klein, in Reihenfolge)

T1 (Datenmodell Personen, Audit-Abschluss, Format 2) ist fertig; T2–T8 im Repo unbeschrieben, daher bitte zuordnen.

1. **U1 Rahmen für Abläufe:** Schrittfolge-Komponente (Titel, „Schritt n von m“, Zurück/Weiter/Abbrechen, Fokus, `aria-live`). Keine Abhängigkeit.
2. **U2 Detailseiten-Muster:** Kopf, „Nächster Schritt“, „Was fehlt“ aus Status und `buildTasks`. Nach U1.
3. **U3 Ablauf (a) Neuer Mandant:** nach T1, U1, U2.
4. **U4 Ablauf (e) Jahresaudit mit Abschluss:** nach T1, U1.
5. **U5 Ablauf (f) Sicherung/Einspielen:** nach U1; Sicherungsbildschirm umbauen.
6. **U6 Ablauf (c) Mahnleiter:** nach U1, U2; braucht Feld „Mahnung gesendet am“ (Datenmodell, Format 3).
7. **U7 Ablauf (b) Identifizierung:** nach U1, U2; Prüflisten je Typ aus der Rechtsprüfung als Daten in `config.ts`.
8. **U8 Ablauf (d) Sanktionsklärung:** nach Listeneinspielung (offen), Datenmodell, U1; zuletzt, größte Unklarheit.
9. **U9 Bedienbarkeit:** Esc/Enter/Alt+Links, Fokusführung, Ampel mit Symbol, Prüfung durch axe oder von Hand; nach U1–U3.
10. **U10 rad-navi-Ergänzungen** (`navigateTo`, Pfeiltasten) im rad-navi-Repo, dann Version anheben und „Mandant öffnen“ umstellen. Unabhängig, kann parallel starten.

## 9. Messbarer Test (manual_tests-Stil)

Ziel: eine fachkundige Person, die das Programm nicht kennt, ohne Anleitung. Testdaten ohne echte Mandanten; Beobachter schweigt und zählt; Aufgabe 1 einmal nur mit Tastatur.

| Nr  | Aufgabe                                                                                                                                                        | Zeitziel | Fehlerziel                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------- |
| 1   | Neuen Mandanten (GmbH, zwei Geschäftsführer) anlegen, Risikogruppe abweichend vom Vorschlag mit Begründung wählen, erste Anforderung vermerken                 | 4 Min    | 0 Hilfen, höchstens 1 Rückschritt             |
| 2   | In der Aufgabenliste den eskalierten Mandanten finden, die Entscheidung der Leitung festhalten, danach die Identifizierung eines anderen Mandanten abschließen | 5 Min    | höchstens 1 Fehlklick, 0 verlorene Eingaben   |
| 3   | Jahresaudit schließen (je Liste ein Mandant abarbeiten), Abschluss mit Namen und Notiz, danach Sicherungsdatei erstellen                                       | 8 Min    | höchstens 2 Fehlklicks, Abschluss gespeichert |

Gezählt: Zeit bis zum Ziel; Fehlklicks (Knopf, der nicht zum Schritt gehört); Hilfen; „Ich weiß nicht weiter“ (Ziel 0). Bestanden: Zeit- und Fehlziel in zwei von drei Aufgaben erreicht **und** auf die Frage „Was ist der nächste Schritt?“ in jeder Aufgabe eine richtige Antwort ohne Suchen. Protokoll später als `manual_tests/06_bedienbarkeit.md` (Annahme, Dateiname), ohne Namen der Probanden und ohne Mandantendaten.
