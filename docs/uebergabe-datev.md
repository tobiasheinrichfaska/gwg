# Übergabe an gwg: DATEV-Daten und Abruf über den Worker

Stand: 2026-11-27. Für die nächste Sitzung an gwg. Was abrufbar ist, steht mit allen Feldnamen und Füllgraden in
[`datev-stammdaten.md`](datev-stammdaten.md); hier steht, was gwg damit baut und wie es abruft.

## 1. Was heute aus DATEV kommt (Kurzfassung)

| Tabelle in gwg         | aus DATEV                                                                                                                                                                                                                                                                       | gwg pflegt selbst                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Mandanten**          | Nummer, Name/Firma, Status aktiv/inaktiv, Mandatsbeginn, **Mandatsende**, Rechtsform, Branche (WZ 2008), Sitz, Handelsregister, USt-IdNr.                                                                                                                                       | Identifizierung als Vorgang (Datum, durch wen, Verfahren, Status), Rundschreibenschlüssel, Risikogruppe, PEP, Sanktionsprüfung, Mahnstand |
| **Personen je Mandat** | Rolle (Katalog inkl. „Wirtschaftlich Berechtigter“, Gesellschafter, gesetzlicher Vertreter, Betriebsinhaber), Name, Vorname, Geburtsname, Geburtsdatum, Geburtsort, Geburtsland, Staatsangehörigkeit, **Ausweisdaten** (Art, Nummer, Behörde, Ausstellung, Ablauf), Sterbedatum | Geburtsdaten mit nur Jahr oder Monat/Jahr, eigene Rollen außerhalb des DATEV-Katalogs                                                     |

Damit ändert sich Entscheidung 1 der Übergabe (bisher: CSV-Export): **die Daten kommen über den Worker**, der
CSV-Weg bleibt Rückfall. Die Felder aus DATEV sind in gwg **nur lesend** (Quelle DATEV, Stand = Abrufzeit); was gwg
selbst pflegt, liegt daneben und wird von einem neuen Abruf nie überschrieben.

## 2. Der Worker

`datev-worker` ist ein eigenes öffentliches Projekt (in Vorbereitung): ein kleiner Windows-Dienst, der auf einem
Rechner in der DATEV-Umgebung läuft, sich mit der Windows-Anmeldung bei DATEVconnect anmeldet und Anfragen
weitergibt. Er kennt zwei Betriebsarten; **gwg nutzt die direkte**:

- **direkt:** der Worker lauscht nur auf `127.0.0.1` desselben Rechners; gwg ruft ihn aus dem Browser auf. Das
  umgeht zugleich CORS (der Browser darf DATEVconnect nicht direkt aufrufen) und die Windows-Anmeldung im Browser.
- **indirekt:** der Worker holt Aufträge bei einer Gegenstelle ab (für Server-Anwendungen, nicht für gwg).

**Die direkte Betriebsart ist noch nicht gebaut.** Die Schnittstelle unten ist der vereinbarte Entwurf (Version
`v1`); gwg baut dagegen mit einem Testdouble aus **erfundenen** Daten in genau diesen Formen. Ändert sich der Entwurf
beim Bau des Workers, wird dieses Dokument angepasst.

## 3. Schnittstelle des Workers (Entwurf v1)

- **Adresse:** `http://127.0.0.1:<port>`; der Port ist im Worker einstellbar und wird in gwg einmal eingetragen.
- **Schlüssel:** jede Anwendung hat einen eigenen Schlüssel, im Worker angelegt. gwg sendet ihn als Kopfzeile
  `X-Datev-Worker-Key`. Der Mensch trägt ihn einmal in gwg ein; gwg hält ihn im Tresor (`local-vault`), nie in der
  Sicherungsdatei und nie im Klartext in einer Datei. Der Worker zeigt einen neuen Schlüssel nur in seinem eigenen
  Fenster an.
- **Herkunft (CORS):** der Worker antwortet nur Herkünften aus seiner Liste (für die Datei-Fassung von gwg
  `Origin: null`, für eine gehostete Fassung deren Adresse) und beantwortet die `OPTIONS`-Vorabfrage.
- **Positivliste je Schlüssel:** gwg darf nur lesen, und nur diese Pfade:
  `master-data/v1/clients`, `master-data/v1/addressees/{id}`, `master-data/v1/relationships`,
  `master-data/v1/relationship-types`, `master-data/v1/legal-forms`, `master-data/v1/country-codes`.
  Alles andere (Dokumentenablage, Schreiben) lehnt der Worker mit `403` ab.

| Aufruf                                        | Antwort                                                                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/status`                              | `{"version": "…", "datev": "erreichbar" \| "nicht erreichbar", "pfade": [...]}` (die erlaubten Pfade)                                                                              |
| `GET /v1/datev/<DATEVconnect-Pfad>?<Abfrage>` | Statuscode und Rumpf von DATEVconnect unverändert, z. B. `GET /v1/datev/master-data/v1/addressees/{id}?expand=*`                                                                   |
| Fehler des Workers selbst                     | JSON `{"fehler": "<code>", "text": "<deutsch>"}` mit `401` (Schlüssel fehlt/falsch), `403` (Pfad nicht erlaubt), `502` (DATEVconnect nicht erreichbar), `504` (Zeitüberschreitung) |

## 4. Abruf, Schritt für Schritt

1. `GET /v1/status`; ist DATEV nicht erreichbar → Meldung, nichts ändern.
2. Kataloge: `relationship-types`, `legal-forms`, `country-codes`.
3. `GET clients` (ohne `expand`, mit `expand=*` antwortet DATEV 406) → alle Mandanten, auch beendete.
4. Je Mandant der Adressat über `natural_person_id` bzw. `legal_person_id`: `addressees/{id}?expand=*`.
5. Je Adressat beider Seiten die Beziehungen: `relationships?filter=has_addressee_id eq {id}` und
   `…?filter=is_addressee_id eq {id}`; Rolle aus `name`/`abbreviation`, die Gegenseite aus
   `has_…`/`is_addressee_id`. Welche Seite die Person ist, steht in `has_addressee_type`/`is_addressee_type`.
6. Je verbundene natürliche Person deren Adressat `addressees/{id}?expand=*` (dort stehen Ausweis,
   Staatsangehörigkeit, Geburtsort); jeden Adressaten nur einmal holen.

Regeln für den Abruf:

- **Höchstens 4 Anfragen gleichzeitig.** Der Worker reiht ohnehin ein; mehr bringt nichts und belastet DATEV.
- **406 auf `expand=*`** bis zu 3-mal wiederholen (2 s, 5 s, 15 s). Bleibt es, den Adressaten **mit Grund melden**
  und ohne Ausweisdaten führen, sichtbar als „unvollständig abgerufen“. Nie still übernehmen.
- **400 auf einen Beziehungsfilter** melden, nicht als „keine Beziehungen“ werten.
- Jeder Fehler erreicht den Menschen: am Ende eine Liste „nicht abgerufen“ mit Grund.
- Ein Abruf ist eine **Vorschau**, bis der Mensch übernimmt: neu, geändert, in DATEV nicht mehr vorhanden. Ein in
  DATEV verschwundener Mandant wird markiert, nie gelöscht (Aufbewahrungsfristen).
- Der Umfang kann groß sein (in einer Kanzlei schnell tausende Adressaten). Einen Fortschritt anzeigen. Ein
  Teilabruf je Mandant (Knopf „Aus DATEV aktualisieren“) ist die häufigere Nutzung.
- Das Feld `timestamp` jedes DATEV-Objekts zeigt seine letzte Änderung: damit nur Geändertes übernehmen.

## 5. Für den Bau in gwg

- **Logikschicht** (`src/logic/`, UI-frei, getestet): Zuordnung DATEV-JSON → `Mandate`/Personen (`mapDatev…`),
  Rollen-Zuordnung als Daten (DATEV-Rollenname → gwg-Rolle), Abgleich alter Stand ↔ neuer Abruf (neu, geändert,
  verschwunden), Fehlerliste. Fehler als Codes, wie im übrigen Modell.
- **Abrufschicht** (`src/io/`): ein kleiner Client für die Worker-Schnittstelle mit Begrenzung auf 4 gleichzeitige
  Anfragen und den Wiederholungen oben; im Test durch das Testdouble ersetzt.
- **Testdaten:** nur erfundene Personen und Firmen, im Repo erlaubt; echte DATEV-Antworten nie (auch nicht gekürzt).
- **Schutz:** Ausweisnummer und Steuer-ID nur im Tresor; in Listen und Exporten abgekürzt zeigen. Nur übernehmen,
  was die Aufzeichnungspflicht verlangt (Steuer-ID, Bankverbindungen, Konfession, Familienstand, Sozialversicherungs-
  nummer **nicht** übernehmen, obwohl DATEV sie liefert).
- **Rückfall:** CSV-Import mit denselben Feldern bleibt möglich, falls der Worker fehlt.

## 6. Offen

- Bau der direkten Betriebsart im Worker (Projekt `datev-worker`), danach Abgleich dieses Entwurfs.
- Offizielle API-Beschreibung: DATEVconnect hat unter `datev/swagger` einen Dienst, der abgeschaltet ist (503).
  Freigeschaltet liefert er die OpenAPI-Beschreibung; damit die Feldliste bestätigen.
- Ob DATEV die Identifizierung als Vorgang an anderer Stelle führt (DATEV fragen).
- DATEV zieht ab 2026 in die Cloud; der Worker kapselt den Zugang, gwg merkt den Wechsel nicht.
