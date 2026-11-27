# GwG-Pflege

Hilfsmittel für die Pflichten nach dem Geldwäschegesetz in einer Steuerberatungskanzlei: Risikoklassen und
-gruppen, Stand der Identifizierung je Mandant, rollierende Prüftermine, Mahnleiter für fehlende
Unterlagen, Abgleich mit Sanktionslisten, Jahresaudit und Löschfristen. Eine einzige HTML-Datei, die auf dem
eigenen Gerät läuft. Mandantendaten verlassen das Gerät nie. Optional (standardmäßig aus) lädt die App die
öffentliche Sanktionsliste über ein Relay; die Anfrage enthält keine Daten.

> **Nicht von einem Menschen sicherheitsgeprüft, nur Fundament – nicht für echte Mandantendaten
> verwenden.** Das Werkzeug entscheidet nichts rechtlich; die Zahlen sind Startvorschläge, kein Gesetz.
> Meldungen: [SECURITY.md](SECURITY.md).

**Stand:** Die Logik (Rechtsform-Typen, Risikoklasse, Prüftermin, Mahnleiter, Löschfrist, Ausnahmelisten,
Sanktions-Ampel, PEP-Selbstauskunft) ist getestet. Es gibt Bildschirme für Mandanten mit Personen, Aufgaben,
Jahresaudit mit Abschluss, Übersicht, Sanktionsabgleich und Sicherung; die Daten liegen verschlüsselt im
Gerätespeicher. Die Sicherungsdatei ist **unverschlüsselt**. Es fehlen der Import der DATEV-Stammdaten (der
Export ist noch nicht festgelegt), PDF-Schreiben und geführte Abläufe; die Bedienung ist noch nicht an echten
Anwendern erprobt.

**Kein Rechtsrat.** Die Zahlen (Prüfintervalle, Mahntage, Ähnlichkeitsschwellen) sind ein Startvorschlag,
keine gesetzlichen Vorgaben; jede Kanzlei legt sie in ihrer eigenen Risikoanalyse fest. Das Programm
verwaltet und erinnert, entschieden wird von Menschen.

## Entwickeln

```bash
npm install
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build      # dist/index.html, eine einzelne Datei
```

Die Datenstruktur: [`docs/data-model.html`](docs/data-model.html) (im Browser öffnen).

## License

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

This project is licensed under the **GNU Affero General Public License v3.0** (AGPLv3).
You are free to use, modify, and distribute this software under the terms of the AGPLv3.
If you use this software to provide a network service, you must make the full source code
of your modifications available to users of that service.

**Commercial License:** If you wish to use this software in a closed-source or proprietary
product, a commercial license is available. Contact: tobias.a.w.heinrich@gmail.com

See [LICENSE](LICENSE) for the full AGPLv3 text.
See [LICENSE_COMMERCIAL.md](LICENSE_COMMERCIAL.md) for commercial licensing terms.
