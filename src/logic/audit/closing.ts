import { isDateKey, type DateKey } from '../core/index.ts';
import { fail, ok, type Result } from '../mandate/index.ts';

export const MAX_CLOSING_BY_LENGTH = 100;
export const MAX_CLOSING_NOTE_LENGTH = 500;

/** The recorded close of one yearly audit; exactly one per cut-off date. A human signs off. */
export interface AuditClosing {
  stichtag: DateKey;
  closedOn: DateKey;
  /** Who closed it. */
  by: string;
  /** May be empty. */
  note: string;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

export function checkAuditClosing(c: AuditClosing): Result<AuditClosing> {
  if (!isDateKey(c.stichtag) || !isDateKey(c.closedOn)) return fail('bad-closing');
  if (c.closedOn < c.stichtag) return fail('bad-closing');
  if (typeof c.by !== 'string' || c.by.trim() === '' || c.by.length > MAX_CLOSING_BY_LENGTH) {
    return fail('bad-closing');
  }
  if (CONTROL.test(c.by)) return fail('bad-closing');
  if (
    typeof c.note !== 'string' ||
    c.note.length > MAX_CLOSING_NOTE_LENGTH ||
    CONTROL.test(c.note)
  ) {
    return fail('bad-closing');
  }
  return ok(c);
}
