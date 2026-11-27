import { daysInMonth, isDateKey } from '../core/index.ts';
import { fail, ok, PERSON_ROLES, type Mandate, type Person, type Result } from './model.ts';

export const MAX_NAME_LENGTH = 200;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

const goodLine = (s: unknown, max: number, allowEmpty: boolean): boolean =>
  typeof s === 'string' && s.length <= max && (allowEmpty || s.trim() !== '') && !CONTROL.test(s);

/** 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD' with a real calendar; month/day only with year/month. */
export function isPartialDate(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  if (y < 1900 || y > 2200) return false;
  if (m[2] === undefined) return true;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return false;
  if (m[3] === undefined) return true;
  return isDateKey(s) && Number(m[3]) <= daysInMonth(y, mo);
}

export function checkPerson(p: Person, mandates: readonly Mandate[]): Result<Person> {
  if (!goodLine(p.id, MAX_NAME_LENGTH, false)) return fail('bad-person');
  if (!goodLine(p.lastName, MAX_NAME_LENGTH, false)) return fail('bad-person');
  if (!goodLine(p.firstName, MAX_NAME_LENGTH, true)) return fail('bad-person');
  if (!PERSON_ROLES.includes(p.role)) return fail('bad-person');
  if (p.birth !== null && !isPartialDate(p.birth)) return fail('bad-person');
  if (!mandates.some((m) => m.id === p.mandateId)) return fail('unknown-mandate');
  return ok(p);
}
