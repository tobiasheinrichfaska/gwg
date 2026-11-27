import { useState } from 'react';
import { BACKUP_WARNING, backupFileName, downloadBackup } from '../../../io/index.ts';
import { serializeBackup } from '../../../logic/index.ts';
import { useApp } from '../../app/context.ts';
import { RestoreBackup } from './RestoreBackup.tsx';

export function BackupScreen() {
  const { backup, today, replace, saveError, lockSettings } = useApp();
  const [saved, setSaved] = useState<string | null>(null);

  function save() {
    const name = backupFileName(today);
    downloadBackup(serializeBackup({ ...backup, createdOn: today }), name);
    setSaved(
      `Sicherung „${name}“ wurde an den Browser übergeben (${backup.mandates.length} Mandate).`,
    );
  }

  return (
    <section aria-labelledby="backup-h">
      <h1 id="backup-h">Sicherung</h1>
      <p className="warning" role="note">
        {BACKUP_WARNING}
      </p>
      {saveError !== null && (
        <p role="alert">
          Letzte Speicherung im Gerät fehlgeschlagen (Code: {saveError}). Speichern Sie eine
          Sicherungsdatei.
        </p>
      )}
      <p>Bestand: {backup.mandates.length} Mandate.</p>
      <button type="button" onClick={save}>
        Sicherung speichern
      </button>
      {saved !== null && <p role="status">{saved}</p>}
      <RestoreBackup currentCount={backup.mandates.length} onRestore={replace} />
      <section aria-labelledby="lock-h">
        <h2 id="lock-h">App-Sperre</h2>
        <p>
          Die Daten liegen verschlüsselt im Browser dieses Geräts. Ohne App-Sperre öffnet die
          Anwendung ohne Passwortfrage: Jeder, der den Browser dieses Geräts benutzen kann, sieht
          die Mandantendaten. Für Mandantendaten wird die App-Sperre mit Passwort empfohlen.
        </p>
        {lockSettings}
      </section>
    </section>
  );
}
