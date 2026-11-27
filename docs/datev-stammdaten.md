# DATEV-Stammdaten für gwg — was DATEVconnect liefert

Stand: 2026-11-27. Gemessen an der lokalen DATEVconnect-Schnittstelle „Stammdaten“ (`/datev/api/master-data/v1/`)
einer Kanzlei-Installation: alle Mandanten der Liste, 105 natürliche Personen mit vollem `detail` (die Hälfte davon
Personen in GwG-Rollen), 26 juristische Personen. Gemessen wurden nur Feldnamen und Füllgrad, keine Werte. Auf einem
Rechner in der DATEV-Umgebung erreichbar unter `https://localhost:58452` mit Windows-Anmeldung (Negotiate/SSO); nur
lesende `GET`-Aufrufe.

## Abrufwege

| Zweck                                      | Aufruf                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| alle Mandanten (eine Liste, auch beendete) | `GET clients` (kein `expand`: mit `expand=*` antwortet DATEV 406)                          |
| Adressat mit allen Unterdaten              | `GET addressees/{id}?expand=*`                                                             |
| Beziehungen eines Adressaten               | `GET relationships?filter=has_addressee_id eq {id}` und `…?filter=is_addressee_id eq {id}` |
| Rollenkatalog                              | `GET relationship-types`                                                                   |
| Rechtsformen (Katalog)                     | `GET legal-forms`                                                                          |

Ein Mandant zeigt über `natural_person_id` oder `legal_person_id` auf seinen Adressaten.

## Mandanten — eine Zeile pro Mandat

| gwg-Feld                        | DATEV-Feld                                                                                                                                  | Füllgrad                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Mandantennummer                 | `clients.number`                                                                                                                            | immer                                                                        |
| Name/Firma                      | `clients.name`                                                                                                                              | immer                                                                        |
| aktiv/inaktiv                   | `clients.status` (`active`/`inactive`)                                                                                                      | immer; wenige Fälle widersprechen `client_to`, beide lesen                   |
| Mandatsbeginn                   | `clients.client_since`                                                                                                                      | etwa zwei Drittel                                                            |
| Mandatsende                     | `clients.client_to`                                                                                                                         | echtes Datum; leer = laufend                                                 |
| Rechtsform                      | Adressat `current_legal_form_id` (Verlauf `legal_form_ids[]`) → `legal-forms`                                                               | juristische Personen fast immer                                              |
| Branche                         | `detail.current_code_of_classification_of_economic_activities_2008` + `…description…_2008` (WZ 2008, auch 2003 und „MAD“-Codes)             | juristische Personen fast immer; natürliche Personen haben kein Branchenfeld |
| Sitz                            | `detail.current_country_of_head_office`, `…location_of_head_office`, `…federal_state_of_legal_person`                                       |                                                                              |
| Handelsregister                 | `detail.current_name_of_register_court`, `…kind_of_register_court`, `…registration_number`, `registration_date`, `…registered_company_name` | etwa ein Drittel                                                             |
| Gründung / Gesellschaftsvertrag | `date_of_foundation`, `detail.date_of_memorandum_of_association`                                                                            | selten                                                                       |
| Unternehmensgegenstand          | `detail.current_enterprise_purpose`                                                                                                         | meist                                                                        |
| USt-IdNr.                       | `eu_vat_id_country_code` + `eu_vat_id_number`                                                                                               |                                                                              |

## Personen je Mandat

| gwg-Feld            | DATEV-Feld                                                                                                        | Füllgrad                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Rolle               | `relationships.name` / `abbreviation` / `type_id`                                                                 | Katalog unten                                                              |
| Name, Vorname       | `current_surname` (Verlauf `surnames[]`), `firstname`, `detail.birth_name`, `detail.degree`                       | immer                                                                      |
| Geburtsdatum        | `date_of_birth`                                                                                                   | fast immer; ein einzelnes Datumsfeld, Teilangaben (nur Jahr) gibt es nicht |
| Geburtsort          | `detail.place_of_birth`                                                                                           | gut die Hälfte                                                             |
| Geburtsland         | `detail.country_of_birth`                                                                                         | etwa ein Viertel                                                           |
| Staatsangehörigkeit | `detail.nationality`                                                                                              | etwa drei Viertel                                                          |
| Ausweis             | `detail.paper_of_identity` (Art), `identification_number`, `issuing_authority`, `date_of_issue`, `date_of_expiry` | etwa zwei Drittel, die fünf Felder gemeinsam                               |
| Steuer-ID           | `tax_identification_number`                                                                                       | fast immer                                                                 |
| Sterbedatum         | `detail.date_of_death`                                                                                            |                                                                            |
| Ansprechpartner     | `contact_persons[]` (Verweis auf Adressaten)                                                                      | selten                                                                     |

Rollenkatalog (`relationship-types`): Betriebsinhaber (BTI), Gesellschafter (GES), Gesetzlicher Vertreter des
Unternehmens / der Person (GV), **Wirtschaftlich Berechtigter (WB)**, Ehefrau/Lebenspartner, Eheähnlicher
Lebenspartner, Kind, Betriebsstätte, Empfangs-, Vertretungs-, Mitwirkungsbevollmächtigter, Vermögensverwalter,
Rechtsanwalt, Partei kraft Amtes, Ansprechpartner. Geschäftsführer stehen als „Gesetzlicher Vertreter des Unternehmens“.
Bei einer natürlichen Person als Mandant ist sie selbst Inhaber.

## Nicht über DATEVconnect zu bekommen — gwg pflegt selbst

Die Feldliste oben ist vollständig für alle 131 Antworten mit `detail`; es gibt darüber hinaus kein Feld.

- **Identifizierung als Vorgang**: wann, durch wen, wie (persönlich, Video, Kopie), Status. Die Ausweisfelder belegen
  nur das Dokument; `date_of_issue` ist sein Ausstellungsdatum. Ob DATEV die Identifizierung an anderer Stelle führt
  (z. B. in der Dokumentenablage oder einem anderen Produkt), ist offen.
- **Rundschreibenschlüssel**, Mandantengruppen/-kategorien: `client-categories` / `client-groups` antworten, sind in
  der gemessenen Kanzlei aber leer.
- PEP-Kennzeichen, Risikogruppe, Sanktionslistenprüfung, Mahnstand (wie geplant).
- Geburtsdaten mit nur Jahr oder Monat und Jahr (z. B. von ausländischen Ausweisen oder Sanktionslisten).

## Offen

- **Offizielle API-Beschreibung:** DATEVconnect hat unter `datev/swagger` einen Dienst angemeldet, der aber mit
  „503 Service Unavailable“ antwortet, er ist also abgeschaltet. Wird er auf dem DATEV-Server freigeschaltet, liefert
  er die OpenAPI-Beschreibung. Das DATEV-Entwicklerportal (developer.datev.de, „Client Master Data“) ist eine
  JavaScript-Seite und für automatischen Abruf leer.
- **406 auf `expand`:** In einem Lauf antworteten 49 von 180 Adressaten mit 406, ohne `expand` alle mit 200. Ein
  zweiter Lauf mit 80 Adressaten lief ohne Fehler. Die Ursache liegt bei DATEV, sie ist nicht an den Datensatz
  gebunden. Der Import muss eine 406 wiederholen und, wenn sie bleibt, den Adressaten mit Grund melden, nie still
  ohne Ausweisdaten übernehmen.
- **Browser-Zugriff:** Ob eine HTML-Seite DATEVconnect direkt aufrufen darf (CORS, Negotiate), ist nicht geprüft.
  Geplant ist ein lokaler Dienst auf `127.0.0.1`, über den gwg abruft.
- Die Ausweisnummer ist besonders schutzbedürftig: nur speichern, was die Aufzeichnungspflicht verlangt.
- **Cloud:** DATEV zieht ab 2026 in die Cloud, ohne Enddatum für die lokalen Installationen. Die Online-APIs
  verlangen OAuth im Namen eines Nutzers und eine Freigabe durch DATEV. Ob die Stammdaten mit diesen Feldern dort
  bereitstehen, ist offen.
