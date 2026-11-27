# 01 Start

## MT-01: Anwendung startet

**Vorbedingungen:** `dist/index.html` wurde mit `npm run build` erzeugt.

**Schritte:**

1. Doppelklick auf `dist/index.html`.
2. Auf die Seite schauen.

**Erwartet:**

- Die Anwendung öffnet ohne Passwortfrage (solange keine App-Sperre eingeschaltet ist) und zeigt die Radnavigation mit den Bereichen Übersicht, Mandanten, Aufgaben, Audit, Sicherung.
- Nicht offensichtlich: Die Seiten Übersicht, Mandanten, Aufgaben und Audit zeigen nur „Noch nicht gebaut.“; es fehlt nichts durch einen Fehler.
- Es erscheint keine Fehlermeldung. Im Standardzustand (Listenabruf aus) werden keine Netzanfragen gesendet: in den Entwicklerwerkzeugen des Browsers, Reiter „Netzwerk“, bleibt die Liste beim Start und beim Wechsel der Bereiche leer.

## MT-01b: Abruf eingeschaltet

**Vorbedingungen:** Ein Relay ist erreichbar (siehe `relay/README.md`); die Einstellung „Relay-Adresse“ ist eingetragen und der Abruf eingeschaltet. Der Bildschirm dafür folgt mit T6; bis dahin ist dieser Fall nicht von Hand prüfbar.

**Schritte:**

1. Entwicklerwerkzeuge öffnen, Reiter „Netzwerk“ leeren.
2. Die Liste abrufen (oder die Anwendung neu starten, wenn der automatische Abruf an ist und die Liste älter als das Höchstalter ist).

**Erwartet:**

- Genau eine Anfrage, Methode GET, Adresse `<Relay-Adresse>/liste`, ohne Cookies, ohne Referer, ohne eigene Kopfzeilen und ohne Anfragekörper.
- In der Adresse und in der Anfrage kommt kein Mandanten- oder Personenname vor.
- Bei Fehler (Relay aus): eine verständliche Meldung, die bisher gespeicherte Liste bleibt unverändert.
