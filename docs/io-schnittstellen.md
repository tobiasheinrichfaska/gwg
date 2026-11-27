# IO-Schnittstellen: local-vault und rad-navi (Stand 2026-11-27)

Gelesen: README, `package.json`, `src/index.ts`, `src/io/vault.ts`, `config.ts`, `props.ts`, `tree.ts` der Tags `local-vault` v0.1.0 und `rad-navi` v0.1.1. Beide: AGPL-3.0,
"nicht auf npm", nur Web, Peer-Abhängigkeit React ^19.2.6. Installation per `github:…#<Tag>`; das Paket baut
sich beim Install selbst (`prepare`: tsc nach `dist/`). Das Lockfile verweist auf `git+https`.

## local-vault 0.1.0

**Zweck:** verschlüsselter lokaler Speicher, ohne App-Daten. **Erzeugen:** `createVault(config: VaultConfig, env?: VaultEnvironment): Vault`.
`VaultConfig`: `prefix` (Kleinbuchstaben/Ziffern/Bindestrich, z. B. `gwg`), `slots: string[]` (darf leer sein),
`mode?: 'device' | 'users'`, `minRounds?`, `blobChunkSize?` (Standard 2 MiB), `texts?`. Ungültige Namen: `Error`.
Testumgebung: `memoryEnvironment()`.

**Start/Sperre (`Vault`):**

- `startVault(): Promise<StartResult>`; `StartResult` = `open | locked | setup | error{error}`.
- Gerätemodus: `unlock(pw)`, `setLock(pw, current?)`, `removeLock(current)` (Rückgabe: Grund oder `undefined`).
- Nutzermodus: `setupFirstUser`, `loginUser` (`false` bei falscher Phrase), `addUser`, `removeUser`,
  `changeUserPassphrase`, `users()`, `currentUser()`, `userEntry`, `joinWithEntry`.
- `close()`, `lockNow()` (schließt, lädt neu), `startAnew()` (gibt die Gerätedaten auf), `isVaultOpen()`, `isLockOn()`.

**Daten:**

- Slots: `readSlot(slot): string | null` (wirft bei geschlossenem/unlesbarem Tresor), `writeSlot(slot, value):
string | undefined` (sofort im Speicher, Verschlüsselung asynchron; Rückgabe = Ablehnungsgrund).
  Ein Slot ist ein Text in localStorage, im Speicher gehalten.
- Blobs (IndexedDB, Namen `[a-z0-9][a-z0-9._:/-]{0,199}`): `putBytes(name, Uint8Array): Promise<void>`,
  `getBytes(name): Promise<Uint8Array | undefined>`, `getBytesChunks(name): AsyncIterable<Uint8Array>`,
  `listBytes(prefix?)`, `listBytesInfo(prefix?)`, `removeBytes(name)`, `sweepBlobs(): Promise<{removed}>`.
- `saved(): Promise<void>` wartet auf alles Ausstehende; `onError(fn)` meldet Speicherfehler nachträglich;
  `onExternalChange(fn)` meldet `startAnew`/`keys` aus einem anderen Tab (BroadcastChannel).

**Verschlüsselung/Passwort:** AES-GCM unter zufälligem Datenschlüssel. Gerätemodus: Datenschlüssel durch einen
nicht exportierbaren Geräteschlüssel (IndexedDB) umhüllt; optional zusätzlich App-Sperre per Passwort
(PBKDF2, `ROUNDS` 600 000; Mindestlänge `MIN_PASSWORD` 6 Zeichen; Auto-Sperre `LOCK_AFTER_MINUTES` im
Hintergrund). Nutzermodus: nur per Passphrase je Nutzer umhüllt, Geräteschlüssel unbeteiligt.
Ohne App-Sperre öffnet der Gerätemodus ohne Passwortfrage.

**UI:** `<VaultGate vault texts?>children</VaultGate>` (öffnet vor der App, sperrt nach Hintergrund),
`<LockSettings vault />` (Karte für App-Sperre; im Nutzermodus leer).

**Speicherort:** Browser des Geräts: localStorage `<prefix>-<slot>`, IndexedDB `<prefix>-vault`.

**Fehlerfälle (belegt):** Lesen/Schreiben im geschlossenen Zustand wirft; unlesbarer Slot wird nie überschrieben;
`putBytes` lehnt bei vollem Speicher ab (`isQuotaError(error)`, alter Inhalt bleibt); `getBytes` wirft bei
fehlendem/verändertem Block; unterbrochener Schreibvorgang hinterlässt Reste (`sweepBlobs`);

## rad-navi 0.1.1

**Zweck:** Radnavigation (zwei gekoppelte Reibräder: Bereiche unten, Seiten oben). **Baum:** `distributor(id, name, children): NavNode`, `areaNode(pages: PageTable, id, name, pageIds[])`;
`NavNode {id, name, children?, page?, planned?}`; `PageTable = Record<string, {name, planned?}>`.
Hilfen: `pagesIn`, `pathTo`, `areaOf`.

**Komponente:** `<WheelNav tree pages? pageFor?(page) => ReactNode fullHeight? startArea? startNode?
jumpTarget? onOpenChange?(node|null) onStep? onPage? status? extraAction? ownGestureSelector? shortcuts?
onShortcutsChange? shortcutsStorageKey? rememberKey? rememberStorage? texts? />`. Alle Texte überschreibbar
(`WheelTexts`, Standard Englisch, `DEFAULT_TEXTS`).

**Speicher:** nur optional und nur im localStorage: `rememberKey` (zuletzt offener Knoten, nur dessen ID),
`shortcutsStorageKey` (Hub-Kürzel). Ohne Schlüssel wird nichts gespeichert. Blockierter Speicher wird still
toleriert. Ohne UI: `loadLastNode`/`saveLastNode`, `loadShortcuts`/`saveShortcuts`.
Keine Verschlüsselung, keine Passwortfrage; als Fehlerfall ist nur der stille Speicherverzicht belegt.

## Offene Fragen für die gwg-Anbindung

1. **Slot oder Blob für den Gesamtbestand?** Ein Slot liegt als Text in localStorage und im Speicher (Quote unklar). Ein Blob eignet sich für große Bestände; die Sicherungsdatei
   (Format 1) ist ein Text, die Wahl und die Größenordnung der Daten sind offen.
2. **Gerätemodus oder Nutzermodus?** Gerätemodus ohne App-Sperre öffnet ohne Passwort: für Mandantendaten
   vermutlich zu schwach (Entscheidung Tobias). Nutzermodus erzwingt Phrase, aber Phrase vergessen = Daten weg
   (nur `startAnew`); Wiederherstellung nur über die Sicherungsdatei.
3. **Schutz der Sicherungsdatei:** local-vault verschlüsselt nur den Browserspeicher; Export/Import mit eigenem
   Passwort bietet das Paket nicht (kein solcher Export belegt). Unklar, ob gwg selbst verschlüsseln muss.
4. **Mehrere Tabs / Geräte:** `onExternalChange` nur für Schlüssel/Neustart, nicht für Datenänderungen. Zwei Tabs
   können sich gegenseitig überschreiben; Umgang offen. Gerätewechsel nur über Sicherungsdatei.
5. **Singlefile-Build:** läuft `crypto.subtle`/IndexedDB aus einer lokal geöffneten `file://`-Seite? In den
   Quellen nicht belegt; auf echtem Gerät prüfen (Browser, iOS).
6. **rad-navi Persistenz:** `rememberKey` schreibt unverschlüsselt in localStorage (nur Knoten-ID, kein
   Mandantenbezug). Ob das genügt, ist zu bestätigen; sonst `rememberStorage` auf Tresor-Slot umbiegen.
7. **Gerät mit blockiertem IndexedDB** (Privatmodus): nur über `StartResult.error` angedeutet; unklar.

## EU-Liste (T5a, Stand 2026-11-27)

Konsolidierte Liste der EU-Finanzsanktionen, XML „xmlFullSanctionsList“ Version 1.1, von Hand als Datei eingelesen
(`src/io/eu-list.ts`: `parseEuSanctionsXml`, `readEuListFile`). Kein Netzzugriff.

**Belegtes Schema.** Eine amtliche XSD oder Feldbeschreibung der Version 1.1 war nicht abrufbar (die Hilfeseiten der
Kommission beschreiben nur die ältere Struktur). Belegt ist die Struktur durch zwei öffentliche Quellen: eine
Beispieldatei im Repo `perl-Data-Validate-Sanctions` (Muster mit Namensraum, Stand 2020) und den Leser der
OpenSanctions-Pipeline (`zavod/shed/fsf.py`). Daraus:

- Wurzel `export` (Namensraum `http://eu.europa.ec/fpi/fsd/export`), Attribute `generationDate`
  (`2020-04-15T15:29:22.497+02:00`) und `globalFileId`; Kinder `sanctionEntity`.
- `sanctionEntity`: Attribute `logicalId`, `euReferenceNumber`, `designationDate`, `unitedNationId`; Kinder
  `regulation` (Attribut `programme`), `subjectType` (`code` `person` oder `enterprise`, `classificationCode`),
  `nameAlias`, `citizenship`, `birthdate`, `address`, `identification`, optional `remark` (Text).
- `nameAlias`: Attribute `wholeName`, `firstName`, `middleName`, `lastName`, `function`, `strong`, `logicalId`;
  Kind `remark` möglich. `wholeName` ist teils leer, dann stehen die Teile in den anderen Attributen.
- `birthdate`: Attribute `birthdate` (`1965-12-12`, nur bei vollem Datum), `year`, `monthOfYear`, `dayOfMonth`,
  `circa`, `city`, `place`, `countryIso2Code`.
- Dieselbe `logicalId` kann in der Datei zweimal vorkommen (im Muster belegt).

**Was das Programm daraus macht.** Je `sanctionEntity` ein `ListEntry` (`kind` „sanktion“, Quelle „EU konsolidierte
Finanzsanktionsliste“): `id` = `logicalId`; Namen = alle `nameAlias` (`wholeName`, sonst Vor-, Zwischen-, Nachname),
ohne Doppelte; Geburtsdaten = `birthdate`-Attribut, sonst `year`[-`monthOfYear`[-`dayOfMonth`]]; Bemerkung = Text des
`remark` der Entität, sonst das `programme` der `regulation`, auf 500 Zeichen gekürzt. Stand = `generationDate`
(Datumsteil), sonst das lokale Änderungsdatum der Datei; beides ist nur ein **Vorschlag** (`suggestedOn`,
`suggestedFrom`), die Oberfläche lässt ihn bestätigen. Der Dateiname wird nie ausgewertet.

**Nichts wird still verworfen.** `skipped` = Einträge ohne `logicalId` (`no-id`) oder ohne verwertbaren Namen
(`no-name`), nicht im Index. `adjusted` = Eintrag behalten, aber geändert: unbrauchbarer Name, unbrauchbares
Geburtsdatum (der Eintrag bleibt, ohne Datum wird strenger, nie lockerer geprüft), zu viele Namen/Daten, gekürzte
Bemerkung, zusammengeführte doppelte `logicalId`. Kaputtes XML, falsches Wurzelelement (nicht `export`), mehr als
200 000 Einträge: `bad-list`. Übergröße (Standard 100 MB): `file-too-large`.

**Sicherheit.** `DOMParser` lädt keine externen Entitäten oder DTDs. Zusätzlich wird jedes Dokument mit
`<!ENTITY` oder einer DOCTYPE-Innenteil-Angabe (`<!DOCTYPE … [`) abgelehnt (`bad-list`); Test: eine einfache
DOCTYPE mit Fremd-Adresse löst keinen `fetch` aus.

**Speicher (geändert in T5b).** Die Liste ist öffentlich und braucht keine Verschlüsselung; sie liegt **nicht** im
Tresor und nicht in localStorage (der Index der echten Liste passt mit mehreren MB nicht sicher hinein). Stattdessen
`src/io/list-store.ts`: `ListStore` { `load(kind)`, `save(index)`, `clear(kind)` } auf IndexedDB, Datenbank
`gwg-listen`, ein Objektstore, Schlüssel = `kind`, Wert = Text von `serializeIndex`. Gelesen wird nur über
`parseIndex`; beschädigte Daten oder eine Liste unter dem falschen Schlüssel sind `bad-list`, eine nicht nutzbare
Datenbank `store-failed`, nie still „leer“. Gespeichert gilt erst nach abgeschlossener Transaktion. Die Slots
`liste-sanktion`/`liste-pep` und `AppStore.loadList/saveList` aus T5a entfallen (es gab noch keine Daten, keine
Migration). Test gegen die echte Implementierung mit `fake-indexeddb`.

**Einstellungen.** `ListSettings` { `relayUrl` ('' = aus), `autoFetch` (Standard false), `maxAgeDays` (Standard 7) },
Prüfung `checkListSettings` (`bad-settings`). Ort: eigener Tresor-Slot `einstellungen` (`SettingsStore`, Vault- und
Memory-Variante), **nicht in der Sicherungsdatei**: die Einstellung gehört zum Gerät, eine zurückgespielte Sicherung
darf den Abruf nicht einschalten oder die Adresse ändern.

**Abruf über das Relay (`src/io/sanctions-fetch.ts`).** `fetchSanctionsList` fragt **nur** `relayUrl + '/liste'` ab:
GET, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `redirect: 'error'`, `cache: 'no-store'`, kein Body,
keine eigenen Header. Mandantendaten oder Namen gelangen nie in die Anfrage (Test prüft URL, Methode, Optionen exakt).
Abbruch nach `timeoutMs` (120 s) über `AbortController`, auch beim Lesen des Bodys; Größenobergrenze `maxBytes`
(100 MB) wird beim Lesen des Stroms geprüft, nicht erst danach (und vorab am Header `Content-Length`). Stand der
Liste: übergebenes Datum, sonst Antwort-Header `X-Fetched-At`, sonst `generationDate` des XML, sonst heute. Fehler:
`fetch-failed` (Netz, Status außer 200, Weiterleitung, Zeitüberschreitung), `relay-bad-response` (Inhaltstyp nicht
XML, zu groß), `bad-list` (Inhalt kein gültiges XML der Liste). Ein Fehler lässt die gespeicherte Liste unberührt.
`X-Stale: 1` (Relay lieferte die letzte gute Kopie) wird als `stale` gemeldet. Schaltet der Nutzer den Abruf ein,
sieht der Server des Relay-Betreibers die IP-Adresse der Kanzlei (siehe `relay/README.md`, Datenschutz).

**Annahmen (nicht belegt):** Namen und Attribute der aktuellen Version 1.1 stimmen mit dem Muster von 2020 überein;
`month`/`day` als alte Attributnamen werden zusätzlich gelesen; eine Spanne als `year="1970-1975"` oder
`"1970/1975"` (JJJJ/JJJJ) ist **erfunden**, im Muster nicht belegt, aus der Vorgabe übernommen; ob `generationDate`
immer vorhanden ist; die Entitätsart (`person`/`enterprise`) wird nicht ausgewertet, beide kommen in den Index;
`circa` (ungefähr) wird nicht ausgewertet, ein ungefähres Jahr zählt als Jahr.
