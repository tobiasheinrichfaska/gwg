import type { Reason } from '../../logic/index.ts';
import { REASON_TEXTS } from '../messages.ts';

/** "<Text> (Code: bad-backup, Stelle: mandates[3].id)" */
export function describeFailure(reason: Reason, where?: string): string {
  const place = where === undefined ? '' : `, Stelle: ${where}`;
  return `${REASON_TEXTS[reason]} (Code: ${reason}${place})`;
}
