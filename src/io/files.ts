import { fail, ok, type DateKey, type Result } from '../logic/index.ts';

export const DEFAULT_MAX_BACKUP_BYTES = 10_000_000;

/** Shown wherever a backup file is created or opened. */
export const BACKUP_WARNING =
  'Achtung: Die Sicherungsdatei ist nicht verschlüsselt. Sie enthält die Namen und Daten Ihrer Mandanten im Klartext. ' +
  'Bewahren Sie sie nur auf einem geschützten Gerät auf und versenden Sie sie nicht per E-Mail.';

export function backupFileName(today: DateKey): string {
  return `gwg-sicherung-${today}.gwg.json`;
}

/** Hands the text to the browser as a download. Pure browser API, kept in this one function. */
export function downloadBackup(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Reads a chosen file as text; the content is checked later by `parseBackup`. */
export async function readBackupFile(
  file: File,
  maxBytes: number = DEFAULT_MAX_BACKUP_BYTES,
): Promise<Result<string>> {
  if (file.size > maxBytes) return fail('file-too-large');
  try {
    return ok(await file.text());
  } catch {
    return fail('bad-backup');
  }
}

/** Hands a plain text to the browser as a download (a list for people, not a backup). */
export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function auditFileName(today: DateKey): string {
  return `gwg-audit-${today}.txt`;
}
