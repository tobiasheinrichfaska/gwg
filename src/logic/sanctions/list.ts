import { daysInMonth, fail, isDateKey, ok, type DateKey, type Result } from '../core/index.ts';
import type { Reason } from '../mandate/model.ts';
import { normalizeName } from './normalize.ts';

export const LIST_FORMAT = 'gwg-liste';
export const LIST_VERSION = 1;
export const MAX_ENTRIES = 200_000;
export const MAX_NAMES = 50;
export const MAX_BIRTHS = 50;
export const MAX_REMARK_LENGTH = 500;
const MAX_LINE = 200;

export type ListKind = 'sanktion' | 'pep';

/** One person or organisation on a sanctions or PEP list. */
export interface ListEntry {
  id: string;
  kind: ListKind;
  /** Main name and aliases; at least one. */
  names: string[];
  /** 'YYYY', 'YYYY-MM', 'YYYY-MM-DD' or a span of years 'YYYY/YYYY'; empty = unknown. */
  births: string[];
  /** Reason for the listing or the function; short text, at most 500 characters. */
  remark: string;
}

/** A compact, searchable list: what the screening reads. Pure data. */
export interface ListIndex {
  source: string;
  kind: ListKind;
  /** Date of the list's state (not of the download). */
  fetchedOn: DateKey;
  entries: ListEntry[];
}

type Obj = Record<string, unknown>;
type R<T> = Result<T, Reason>;

const bad = (where: string): R<never> => fail('bad-list', where);
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const FORBIDDEN_KEYS = ['__proto__', 'constructor'];

const goodLine = (s: unknown, max: number, allowEmpty: boolean): s is string =>
  typeof s === 'string' && s.length <= max && (allowEmpty || s.trim() !== '') && !CONTROL.test(s);

/** 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD' with a real calendar (same rule as a person's birth date). */
function isPartial(s: string): boolean {
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

/** A list birth date: partial date or a span 'YYYY/YYYY' (first year not after the second). */
export function isListBirth(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})\/(\d{4})$/.exec(s);
  if (m) {
    const [from = '', to = ''] = [m[1], m[2]];
    return isPartial(from) && isPartial(to) && from <= to;
  }
  return isPartial(s);
}

/** One line of compact JSON with a fixed key order; entries sorted by id (equal data gives equal text). */
export function serializeIndex(index: ListIndex): string {
  const out = {
    format: LIST_FORMAT,
    version: LIST_VERSION,
    source: index.source,
    kind: index.kind,
    fetchedOn: index.fetchedOn,
    entries: [...index.entries]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((e) => ({ id: e.id, kind: e.kind, names: e.names, births: e.births, remark: e.remark })),
  };
  return JSON.stringify(out) + '\n';
}

function hasForbiddenKey(v: unknown): string | null {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const w = hasForbiddenKey(v[i]);
      if (w !== null) return `[${i}]${w}`;
    }
  } else if (isObj(v)) {
    for (const k of Object.keys(v)) {
      if (FORBIDDEN_KEYS.includes(k)) return `.${k}`;
      const w = hasForbiddenKey(v[k]);
      if (w !== null) return `.${k}${w}`;
    }
  }
  return null;
}

/** Exactly these keys. */
function onlyKeys(v: Obj, keys: string[], where: string): R<Obj> {
  for (const k of Object.keys(v)) if (!keys.includes(k)) return bad(`${where}.${k}`);
  for (const k of keys) if (!Object.hasOwn(v, k)) return bad(`${where}.${k}`);
  return ok(v);
}

function readEntry(v: unknown, kind: ListKind, where: string): R<ListEntry> {
  if (!isObj(v)) return bad(where);
  const keys = onlyKeys(v, ['id', 'kind', 'names', 'births', 'remark'], where);
  if (!keys.ok) return keys;
  if (!goodLine(v.id, MAX_LINE, false)) return bad(`${where}.id`);
  if (v.kind !== kind) return bad(`${where}.kind`);
  if (!Array.isArray(v.names) || v.names.length < 1 || v.names.length > MAX_NAMES) {
    return bad(`${where}.names`);
  }
  for (const [i, n] of v.names.entries()) {
    // a name without any letter or digit could never be compared; it must not slip in silently
    if (!goodLine(n, MAX_LINE, false) || normalizeName(n) === '')
      return bad(`${where}.names[${i}]`);
  }
  if (!Array.isArray(v.births) || v.births.length > MAX_BIRTHS) return bad(`${where}.births`);
  for (const [i, b] of v.births.entries()) {
    if (!isListBirth(b)) return bad(`${where}.births[${i}]`);
  }
  if (!goodLine(v.remark, MAX_REMARK_LENGTH, true)) return bad(`${where}.remark`);
  return ok({
    id: v.id,
    kind,
    names: [...(v.names as string[])],
    births: [...(v.births as string[])],
    remark: v.remark,
  });
}

/** Strict, all-or-nothing reader: the first problem fails the whole file, nothing is dropped. */
export function parseIndex(text: string): Result<ListIndex, Reason> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return bad('json');
  }
  if (!isObj(raw)) return bad('root');
  const pollution = hasForbiddenKey(raw);
  if (pollution !== null) return bad(pollution.replace(/^\./, ''));
  if (raw.format !== LIST_FORMAT) return bad('format');
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
    return bad('version');
  }
  if (raw.version > LIST_VERSION) return fail('unsupported-version', 'version');
  const top = onlyKeys(
    raw,
    ['format', 'version', 'source', 'kind', 'fetchedOn', 'entries'],
    'root',
  );
  if (!top.ok) return top;
  if (!goodLine(raw.source, MAX_LINE, false)) return bad('source');
  if (raw.kind !== 'sanktion' && raw.kind !== 'pep') return bad('kind');
  if (typeof raw.fetchedOn !== 'string' || !isDateKey(raw.fetchedOn)) return bad('fetchedOn');
  if (!Array.isArray(raw.entries) || raw.entries.length > MAX_ENTRIES) return bad('entries');
  const seen = new Set<string>();
  const entries: ListEntry[] = [];
  for (const [i, item] of raw.entries.entries()) {
    const where = `entries[${i}]`;
    const e = readEntry(item, raw.kind, where);
    if (!e.ok) return e;
    if (seen.has(e.value.id)) return fail('duplicate-id', `${where}.id`);
    seen.add(e.value.id);
    entries.push(e.value);
  }
  return ok({ source: raw.source, kind: raw.kind, fetchedOn: raw.fetchedOn, entries });
}
