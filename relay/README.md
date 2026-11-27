# Referenz-Relay für eine öffentliche Sanktionsliste

Ein kleiner, anbieterneutraler Abruf-Relay (Web-Standard: `Request`/`Response`/`fetch`, kein Node-API) für
**genau eine** öffentliche Datei. Gedacht, weil die EU-Liste (ca. 26 MB) keinen CORS-Header sendet. Der Ordner
ist ohne Änderung in ein eigenes Repo verschiebbar (kein Import aus `src/`).

## Was es tut

- `GET /liste` liefert die Datei der festen `upstreamUrl`; `OPTIONS /liste` beantwortet den Preflight.
- Gecacht wird nur ein vollständiger Export (mindestens ein `sanctionEntity`, schließendes `</export>`; kein Größenvergleich mit der letzten Kopie: der Schwundschutz liegt in der App, die bei starkem Schwund um Bestätigung fragt); sonst Rückfall auf die letzte Kopie mit `X-Stale`.
- Cache mit Mindestabstand `minRefetchSeconds` zum Upstream; bei Upstream-Fehler die letzte gute Kopie mit
  `X-Stale: 1` und `Age`. Header `X-Fetched-At` (UTC, Abrufzeit des Relays, nicht der Stand der Liste) und `Last-Modified` des Upstreams werden weitergereicht.
- CORS nur für `allowedOrigin` (`Vary: Origin`); `Cache-Control: public, max-age=3600`, `nosniff`, keine Cookies.
- Grenzen je Aufrufer und gesamt pro Stunde (429 mit `Retry-After`); Obergrenze `maxBytes` (sonst 502).

## Was es nicht tut

- Kein offener Proxy: keine andere Adresse, kein Pfad außer `/liste`, keine Abfragezeichenfolge.
- Keine Weiterleitungen (3xx = Fehler), nur https, nichts vom Aufrufer geht zum Upstream.
- Kein Protokoll von Anfragen; gespeichert werden nur Zähler (Schlüssel = SHA-256 des `callerKey`) und die Kopie.

## Konfiguration (`RelayEnv`)

| Feld                | Bedeutung                                                                     |
| ------------------- | ----------------------------------------------------------------------------- |
| `upstreamUrl`       | Adresse aus der Allowlist, nur https (feste Konfiguration)                    |
| `allowedOrigin`     | exakte Herkunft der App; `'null'` für `file://` nur als bewusste Entscheidung |
| `maxBytes`          | Obergrenze der Antwort (EU-Liste ca. 26 MB: z. B. 40 MB)                      |
| `minRefetchSeconds` | Mindestabstand zum Upstream, Standard 3600                                    |
| `perCallerPerHour`  | Aufrufe je Aufrufer und Stunde                                                |
| `globalPerHour`     | Aufrufe insgesamt pro Stunde                                                  |

`handle(request, env, { fetch, now, cache, callerKey })`: der dünne Adapter des Hosters liefert `callerKey`
(z. B. die IP) und ein `RelayCache` (Datei/KV/Cache-API für die Kopie, `counters.increment` für Zähler mit Ablauf).

## Bereitstellung

- **Worker-Plattform** (Cloudflare Workers, Deno Deploy, Bunny Edge Scripting): `handler.ts` bündeln, einen
  Adapter mit `export default { fetch }` schreiben, `RelayCache` auf KV/Cache-API des Anbieters abbilden.
  `env` aus festen Werten oder Umgebungsvariablen bauen. Adresse der Funktion in der App eintragen.
- **Weg B, CDN-Pull-Zone ohne Code:** Pull Zone mit der EU-Adresse als Ursprung, nur GET, Cache mindestens
  1 Stunde, Abfragezeichenfolge ignorieren. Die Pull Zone muss `Access-Control-Allow-Origin: <App-Herkunft>`,
  `Vary: Origin` und `Access-Control-Expose-Headers: Last-Modified, Age` setzen (Preflight `GET, OPTIONS`).
- Ohne Code gibt es kein Limit je Aufrufer und keinen Stale-Fallback; dann die Kostenobergrenze besonders prüfen.

## Kosten

Jeder Abruf überträgt die ganze Datei: 26 MB x Abrufe, z. B. 1000 Abrufe = ca. 26 GB Ausgang. Die Grenzen
je Stunde und die Ausgangsgebühr des Hosters daraus rechnen. Der Upstream wird höchstens einmal je Stunde belastet.

## Datenschutz

Die Antwort ist öffentlich; es gehen nie Mandantendaten durch das Relay (die App sendet nur `GET /liste`).
Der Server des Hosters sieht die IP-Adressen der Kanzleien; das Relay speichert sie nicht roh, der Hoster
kann sie in seinen eigenen Protokollen führen (dort abschalten oder kürzen, wenn möglich).

## Betriebscheckliste

- [ ] Kostenobergrenze (Budget-Alarm/Limit) beim Hoster eingestellt
- [ ] `upstreamUrl` gegen die Allowlist geprüft (https, genau die amtliche Adresse)
- [ ] `allowedOrigin` exakt die App-Herkunft; `'null'` nur bewusst
- [ ] Limits und `maxBytes` gesetzt; Anfrageprotokolle des Hosters geprüft
- [ ] Test: fremde Herkunft, Pfad `/x`, `?a=1` werden abgelehnt
