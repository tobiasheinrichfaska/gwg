import { useState } from 'react';
import { BACKUP_WARNING, backupFileName, downloadBackup } from '../../../io/index.ts';
import { checkBackup, serializeBackup } from '../../../logic/index.ts';
import { describeFailure } from '../../app/messages.ts';
import { useApp } from '../../app/context.ts';
import { RestoreBackup } from './RestoreBackup.tsx';

export function BackupScreen() {
  const { backup, today, replace, saveError, saveErrorWhere, lockSettings } = useApp();
  const [saved, setSaved] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  function save() {
    const name = backupFileName(today);
    // A data set that would not load again is never handed out as a backup.
    const checked = checkBackup({ ...backup, createdOn: today });
    if (!checked.ok) {
      setSaved(null);
      setDownloadError(
        `Sicherung nicht erstellt. ${describeFailure(checked.reason, checked.where)} Es wurde keine Datei erzeugt.`,
      );
      return;
    }
    setDownloadError(null);
    downloadBackup(serializeBackup(checked.value), name);
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
          Letzte Speicherung im Gerät fehlgeschlagen (Code: {saveError}
          {saveErrorWhere === undefined ? '' : `, Stelle: ${saveErrorWhere}`}). Speichern Sie eine
          Sicherungsdatei.
        </p>
      )}
      <p>Bestand: {backup.mandates.length} Mandate.</p>
      <button type="button" onClick={save}>
        Sicherung speichern
      </button>
      {downloadError !== null && <p role="alert">{downloadError}</p>}
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
