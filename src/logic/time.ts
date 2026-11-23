import type { DateKey } from './model.ts';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isDateKey(s: unknown): s is DateKey {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return y >= 1900 && y <= 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

function parts(key: DateKey): [number, number, number] {
  const m = DATE_RE.exec(key);
  if (!m) throw new Error(`bad date key: ${key}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fmt(y: number, m: number, d: number): DateKey {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: DateKey, to: DateKey): number {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

export function addDays(key: DateKey, days: number): DateKey {
  const [y, m, d] = parts(key);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Adds calendar months; a day that does not exist in the target month becomes its last day. */
export function addMonths(key: DateKey, months: number): DateKey {
  const [y, m, d] = parts(key);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return fmt(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}
