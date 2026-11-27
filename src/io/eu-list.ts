import {
  fail,
  isDateKey,
  isListBirth,
  MAX_BIRTHS,
  MAX_ENTRIES,
  MAX_NAMES,
  MAX_REMARK_LENGTH,
  normalizeName,
  ok,
  todayKey,
  type DateKey,
  type ListEntry,
  type ListIndex,
  type Result,
} from '../logic/index.ts';

export const EU_LIST_SOURCE = 'EU konsolidierte Finanzsanktionsliste';
export const DEFAULT_MAX_EU_LIST_BYTES = 100_000_000;
const MAX_LINE = 200;

/** An entry or a detail the reader could not use or had to change; reported, never dropped silently. */
export interface ListNote {
  id: string;
  why: string;
}

export interface EuListParse {
  index: ListIndex;
  /** Entries left out of the index (no usable name, no id). */
  skipped: ListNote[];
  /** Entries kept but changed (name or date left out, duplicate id merged, text cut). */
  adjusted: ListNote[];
}

/** DOMParser resolves no external entities, but a document that declares any is refused outright. */
const ENTITY_DECL = /<!ENTITY|<!DOCTYPE[^>]*\[/i;
// eslint-disable-next-line no-control-regex
const CONTROL_G = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

const clean = (s: string | null | undefined): string =>
  (s ?? '').replace(CONTROL_G, ' ').replace(/\s+/g, ' ').trim();

const kids = (el: Element, name: string): Element[] =>
  Array.from(el.children).filter((c) => c.localName === name);

const pad = (n: string, w: number): string => n.padStart(w, '0');

/** One `birthdate` element to 'YYYY', 'YYYY-MM', 'YYYY-MM-DD' or 'YYYY/YYYY'; null = unusable. */
function readBirth(el: Element): string | null {
  const full = clean(el.getAttribute('birthdate'));
  if (isListBirth(full) && full !== '') return full;
  const year = clean(el.getAttribute('year'));
  const span = /^(\d{4})\s*[-/]\s*(\d{4})$/.exec(year);
  if (span) {
    const v = `${span[1]}/${span[2]}`;
    return isListBirth(v) ? v : null;
  }
  if (!/^\d{4}$/.test(year)) return null;
  const month = clean(el.getAttribute('monthOfYear') ?? el.getAttribute('month'));
  const day = clean(el.getAttribute('dayOfMonth') ?? el.getAttribute('day'));
  let v = year;
  if (month !== '') {
    v += `-${pad(month, 2)}`;
    if (day !== '') v += `-${pad(day, 2)}`;
  }
  return isListBirth(v) ? v : null;
}

/** Date part of the root `generationDate` ('2020-04-15T15:29:22.497+02:00'), if there is one. */
export function readGenerationDate(xml: string): DateKey | null {
  const m = /<(?:[\w.-]+:)?export\b[^>]*?\sgenerationDate="(\d{4}-\d{2}-\d{2})/.exec(xml);
  return m && m[1] && isDateKey(m[1]) ? m[1] : null;
}

/**
 * Reads the XML of the consolidated EU list (xmlFullSanctionsList 1.1) into a compact index.
 * Browser API (DOMParser): lives in io, not in logic. Structure: docs/io-schnittstellen.md, "EU-Liste".
 */
export function parseEuSanctionsXml(xml: string, fetchedOn: DateKey): Result<EuListParse> {
  if (!isDateKey(fetchedOn)) return fail('bad-list');
  if (ENTITY_DECL.test(xml)) return fail('bad-list');
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch {
    return fail('bad-list');
  }
  if (doc.getElementsByTagName('parsererror').length > 0) return fail('bad-list');
  const root = doc.documentElement;
  if (root.localName !== 'export') return fail('bad-list');

  const skipped: ListNote[] = [];
  const adjusted: ListNote[] = [];
  const byId = new Map<string, ListEntry>();
  let n = 0;
  // Descendants by local name (not only direct children): a wrapper element must not hide the entries.
  const entities = Array.from(root.getElementsByTagNameNS('*', 'sanctionEntity'));
  // A file without a single entry is no list (an empty export must never replace a real one).
  if (entities.length === 0) return fail('bad-list');
  for (const ent of entities) {
    n++;
    const id = clean(ent.getAttribute('logicalId'));
    if (id === '' || id.length > MAX_LINE) {
      skipped.push({ id: `#${n}`, why: 'no-id' });
      continue;
    }
    const names: string[] = [];
    for (const a of kids(ent, 'nameAlias')) {
      let name = clean(a.getAttribute('wholeName'));
      if (name === '') {
        name = [
          a.getAttribute('firstName'),
          a.getAttribute('middleName'),
          a.getAttribute('lastName'),
        ]
          .map(clean)
          .filter((p) => p !== '')
          .join(' ');
      }
      if (name === '') continue;
      if (name.length > MAX_LINE || normalizeName(name) === '') {
        adjusted.push({ id, why: 'name-unusable' });
        continue;
      }
      if (!names.includes(name)) names.push(name);
    }
    if (names.length > MAX_NAMES) {
      adjusted.push({ id, why: `names-cut-${names.length}` });
      names.length = MAX_NAMES;
    }
    const births: string[] = [];
    for (const b of kids(ent, 'birthdate')) {
      const v = readBirth(b);
      if (v === null) {
        // a missing date makes screening stricter (more hits), never looser: keep the entry
        if (b.getAttribute('year') || b.getAttribute('birthdate')) {
          adjusted.push({ id, why: 'birthdate-unusable' });
        }
        continue;
      }
      if (!births.includes(v)) births.push(v);
    }
    if (births.length > MAX_BIRTHS) {
      adjusted.push({ id, why: `births-cut-${births.length}` });
      births.length = MAX_BIRTHS;
    }
    let remark = clean(ent.querySelector(':scope > remark')?.textContent);
    if (remark === '') remark = clean(kids(ent, 'regulation')[0]?.getAttribute('programme'));
    if (remark.length > MAX_REMARK_LENGTH) {
      adjusted.push({ id, why: 'remark-cut' });
      remark = remark.slice(0, MAX_REMARK_LENGTH);
    }
    const prev = byId.get(id);
    if (prev) {
      // the real file repeats an entity (seen in the sample): union of the data, noted
      adjusted.push({ id, why: 'duplicate-id-merged' });
      for (const x of names) if (!prev.names.includes(x)) prev.names.push(x);
      for (const x of births) if (!prev.births.includes(x)) prev.births.push(x);
      prev.names.length = Math.min(prev.names.length, MAX_NAMES);
      prev.births.length = Math.min(prev.births.length, MAX_BIRTHS);
      continue;
    }
    if (names.length === 0) {
      skipped.push({ id, why: 'no-name' });
      continue;
    }
    byId.set(id, { id, kind: 'sanktion', names, births, remark });
  }
  if (byId.size > MAX_ENTRIES) return fail('bad-list');
  const index: ListIndex = {
    source: EU_LIST_SOURCE,
    kind: 'sanktion',
    fetchedOn,
    entries: [...byId.values()],
  };
  return ok({ index, skipped, adjusted });
}

export interface EuListFile extends EuListParse {
  /** Proposal for the list's date; the UI lets the user confirm it. */
  suggestedOn: DateKey;
  suggestedFrom: 'generationDate' | 'lastModified';
}

/**
 * Reads a chosen file of the EU list. The date is read from the XML (`generationDate` of the root);
 * without it the file's local modification date is proposed. The file name is never interpreted.
 */
export async function readEuListFile(
  file: File,
  maxBytes: number = DEFAULT_MAX_EU_LIST_BYTES,
): Promise<Result<EuListFile>> {
  if (file.size > maxBytes) return fail('file-too-large');
  let xml: string;
  try {
    xml = await file.text();
  } catch {
    return fail('bad-list');
  }
  const gen = readGenerationDate(xml);
  const suggestedOn = gen ?? todayKey(new Date(file.lastModified));
  const r = parseEuSanctionsXml(xml, suggestedOn);
  if (!r.ok) return r;
  return ok({ ...r.value, suggestedOn, suggestedFrom: gen ? 'generationDate' : 'lastModified' });
}
