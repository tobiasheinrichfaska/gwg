import type { TaskKind } from '../../../logic/index.ts';

/** Order and German names of the groups; the order is the one of `buildTasks`. */
export const TASK_GROUPS: readonly { kind: TaskKind; title: string }[] = [
  { kind: 'dunning-escalate', title: 'Eskalieren' },
  { kind: 'retention-due', title: 'Löschen fällig' },
  { kind: 'dunning-threat', title: 'Androhung senden' },
  { kind: 'review-due', title: 'Prüfung fällig' },
  { kind: 'dunning-reminder', title: 'Erinnerung senden' },
  { kind: 'request-missing', title: 'Unterlagen anfordern' },
  { kind: 'unclassified', title: 'Risikogruppe fehlt' },
];
