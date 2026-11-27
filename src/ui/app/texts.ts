import type { VaultTexts } from 'local-vault';

/** German texts for the vault gate and the app-lock card. */
export const VAULT_TEXTS: Partial<VaultTexts> = {
  title: 'GwG-Pflege',
  opening: 'Daten werden geöffnet …',
  lockedTitle: 'Gesperrt',
  passwordLabel: 'Passwort',
  unlockButton: 'Entsperren',
  unlocking: 'Wird geöffnet …',
  wrongPassword: 'Falsches Passwort.',
  forgottenHint:
    'Passwort vergessen? Ohne Passwort lassen sich die Daten auf diesem Gerät nicht öffnen. „Neu beginnen“ verwirft sie und richtet das Gerät neu ein. Wiederherstellung nur über eine Sicherungsdatei.',
  startAnewButton: 'Neu beginnen',
  startAnewConfirmLocked: 'Alle Daten auf diesem Gerät verwerfen und neu beginnen?',
  errorTitle: 'Daten nicht geöffnet',
  errorHint:
    'Die Daten bleiben unverändert. Nur wenn Sie sie aufgeben: „Neu beginnen“ verwirft sie, danach Sicherungsdatei einspielen.',
  startAnewConfirmError: 'Die Daten auf diesem Gerät endgültig verwerfen und neu beginnen?',
  dismissErrors: 'Gelesen',
  lockTitle: 'App-Sperre',
  lockOnInfo: (m) =>
    `Die Sperre ist an: Die Anwendung fragt beim Start und nach ${m} Minuten im Hintergrund nach dem Passwort.`,
  lockOffInfo:
    'Die Sperre ist aus: Die Daten sind verschlüsselt, die Anwendung öffnet aber ohne Passwort.',
  currentPassword: 'Aktuelles Passwort',
  newPassword: 'Neues Passwort',
  repeatPassword: 'Passwort wiederholen',
  turnOnButton: 'Sperre einschalten',
  changePasswordButton: 'Passwort ändern',
  turnOffButton: 'Sperre ausschalten',
  lockNowButton: 'Jetzt sperren',
  busy: 'Einen Moment …',
  lockTurnedOn: 'Die Sperre ist an.',
  passwordChanged: 'Das Passwort wurde geändert.',
  lockTurnedOff: 'Die Sperre ist aus.',
  wrongCurrentPassword: 'Das aktuelle Passwort ist falsch.',
  passwordTooShort: (min) => `Mindestens ${min} Zeichen.`,
  passwordsDiffer: 'Die beiden Eingaben stimmen nicht überein.',
  slotUnreadable: 'Die gespeicherten Daten konnten nicht geöffnet werden.',
  dataUnreadable:
    'Die gespeicherten Daten sind mit dem Schlüssel dieses Geräts nicht lesbar (Schlüssel fehlt oder Daten beschädigt). Es wurde nichts überschrieben.',
  notSaved: (reason) => `Nicht gespeichert: ${reason}`,
};
