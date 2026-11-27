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
