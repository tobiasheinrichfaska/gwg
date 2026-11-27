import type { RulesConfig } from '../config.ts';
import type { Mandate, Person, Reason, SanctionClass } from '../mandate/model.ts';
import { entrySnapshot, mandateSnapshot, personSnapshot, type SubjectKind } from './decision.ts';
import {
  classifyPrepared,
  classifyPreparedCompany,
  prepareEntry,
  type PreparedEntry,
} from './classify.ts';
import type { ListIndex, ListKind } from './list.ts';
import { normalizeName } from './normalize.ts';
import {
  isCompanyEmpty,
  prepareCompany,
  prepareName,
  type PreparedCompany,
  type PreparedName,
} from './similarity.ts';

/** A possible match of a person with a list entry; green is never a hit. */
export interface Hit {
  subjectKind: SubjectKind;
  /** Person id, or the mandate id for a mandate hit. */
  subjectId: string;
  mandateId: string;
  entryId: string;
  kind: ListKind;
  klasse: Exclude<SanctionClass, 'gruen'>;
  /** The list name (main name or alias) that matched best. */
  besterName: string;
  aehnlichkeit: number;
  /** Fingerprint of the entry (`entrySnapshot`), to void decisions when the entry changes. */
  entrySnapshot: string;
}

/** A person who could not be compared; never silently green. */
export interface Unscreenable {
  personId: string;
  reason: Extract<Reason, 'bad-person' | 'unknown-mandate'>;
}

type Thresholds = RulesConfig['sanctionThresholds'];

const prepared = new WeakMap<ListIndex, PreparedEntry[]>();
function preparedEntries(index: ListIndex): PreparedEntry[] {
  let p = prepared.get(index);
  if (!p) prepared.set(index, (p = index.entries.map(prepareEntry)));
  return p;
}

const personName = (p: Person): string => `${p.firstName} ${p.lastName}`;
const canScreen = (p: Person): boolean => normalizeName(p.lastName) !== '';

function compare(a: Hit, b: Hit): number {
  if (a.klasse !== b.klasse) return a.klasse === 'rot' ? -1 : 1;
  if (a.aehnlichkeit !== b.aehnlichkeit) return b.aehnlichkeit - a.aehnlichkeit;
  const ka = `${a.subjectKind}/${a.subjectId}`;
  const kb = `${b.subjectKind}/${b.subjectId}`;
  return ka < kb ? -1 : ka > kb ? 1 : a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0;
}

/** Context of one person: name prepared once. */
type Subject = {
  kind: SubjectKind;
  id: string;
  mandateId: string;
  birth: string | null;
  client: PreparedName;
  /** Set for a mandate: compared as a company name (legal-form words removed). */
  company?: PreparedCompany;
  empty: boolean;
};
const subjectOf = (p: Person): Subject => {
  const name = personName(p);
  return {
    kind: 'person',
    id: p.id,
    mandateId: p.mandateId,
    birth: p.birth,
    client: prepareName(name),
    empty: normalizeName(name) === '',
  };
};
const subjectOfMandate = (m: Mandate): Subject => {
  const company = prepareCompany(m.name);
  return {
    kind: 'mandate',
    id: m.id,
    mandateId: m.id,
    birth: null,
    client: company.name,
    company,
    empty: normalizeName(m.name) === '' || isCompanyEmpty(company),
  };
};

function addHits(
  out: Hit[],
  s: Subject,
  entries: readonly PreparedEntry[],
  from: number,
  to: number,
  t: Thresholds,
  floor: number,
): void {
  for (let i = from; i < to; i++) {
    const pe = entries[i];
    if (pe === undefined) continue;
    const m = s.company
      ? classifyPreparedCompany(s.company, s.birth, pe, t, floor)
      : classifyPrepared(s.client, s.empty, s.birth, pe, t, floor);
    if (m === null || m.klasse === 'gruen') continue;
    out.push({
      subjectKind: s.kind,
      subjectId: s.id,
      mandateId: s.mandateId,
      entryId: pe.entry.id,
      kind: pe.entry.kind,
      klasse: m.klasse,
      besterName: m.besterName,
      aehnlichkeit: m.aehnlichkeit,
      entrySnapshot: entrySnapshot(pe.entry),
    });
  }
}

/** Entries per block: one block of prepared names fits the CPU cache, so it is read once for all persons, not once per person. */
const BLOCK = 64;

/**
 * All yellow and red hits of one person against a list, sorted: red before yellow, higher similarity
 * first, then by person and entry id. The person's name is "first last". A person whose last name
 * normalizes to nothing cannot be compared: use `screenAll`, which reports it as unscreenable
 * (here it yields no hit, because there is nothing to say).
 */
export function screenPerson(person: Person, index: ListIndex, thresholds: Thresholds): Hit[] {
  if (!canScreen(person)) return [];
  const entries = preparedEntries(index);
  const hits: Hit[] = [];
  addHits(hits, subjectOf(person), entries, 0, entries.length, thresholds, thresholds.possible);
  return hits.sort(compare);
}

/**
 * Screens every person against the list. Persons that cannot be compared (last name empty after
 * normalization: 'bad-person'; mandate missing: 'unknown-mandate') are returned in `unscreenable`.
 * `bruteForce` (tests only) switches the lossless pre-filter off to prove it changes nothing.
 */
export function screenAll(
  persons: readonly Person[],
  mandates: readonly Mandate[],
  index: ListIndex,
  thresholds: Thresholds,
  options: { bruteForce?: boolean } = {},
): { hits: Hit[]; unscreenable: Unscreenable[] } {
  const known = new Set(mandates.map((m) => m.id));
  const entries = preparedEntries(index);
  const floor = options.bruteForce ? 0 : thresholds.possible;
  const hits: Hit[] = [];
  const unscreenable: Unscreenable[] = [];
  const subjects: Subject[] = [];
  for (const p of persons) {
    if (!canScreen(p)) unscreenable.push({ personId: p.id, reason: 'bad-person' });
    else if (!known.has(p.mandateId))
      unscreenable.push({ personId: p.id, reason: 'unknown-mandate' });
    else subjects.push(subjectOf(p));
  }
  for (let from = 0; from < entries.length; from += BLOCK) {
    const to = Math.min(entries.length, from + BLOCK);
    for (const s of subjects) addHits(hits, s, entries, from, to, thresholds, floor);
  }
  return { hits: hits.sort(compare), unscreenable };
}

/** A mandate that could not be compared (its name normalizes to nothing); never silently green. */
export interface UnscreenableMandate {
  mandateId: string;
  reason: Extract<Reason, 'bad-id'>;
}

/**
 * Screens the names of the ACTIVE mandates against the list. A mandate has no birth date (unknown), so
 * a name match is at most yellow, never red. Names are compared as company names (legal-form words
 * removed on both sides). Mandates whose name is empty after normalization or consists of legal-form
 * words only are reported.
 */
export function screenMandates(
  mandates: readonly Mandate[],
  index: ListIndex,
  thresholds: Thresholds,
  options: { bruteForce?: boolean } = {},
): { hits: Hit[]; unscreenable: UnscreenableMandate[] } {
  const entries = preparedEntries(index);
  const floor = options.bruteForce ? 0 : thresholds.possible;
  const hits: Hit[] = [];
  const unscreenable: UnscreenableMandate[] = [];
  const subjects: Subject[] = [];
  for (const m of mandates) {
    if (!m.active) continue;
    const s = subjectOfMandate(m);
    if (s.empty) unscreenable.push({ mandateId: m.id, reason: 'bad-id' });
    else subjects.push(s);
  }
  for (let from = 0; from < entries.length; from += BLOCK) {
    const to = Math.min(entries.length, from + BLOCK);
    for (const s of subjects) addHits(hits, s, entries, from, to, thresholds, floor);
  }
  return { hits: hits.sort(compare), unscreenable };
}

/**
 * Persons and mandates of ACTIVE mandates that the screening cannot compare (name empty after
 * normalization, or a mandate name of legal-form words only). They are never silently green: tasks and
 * the closing blockers use this, independent of whether a run happened.
 */
export function unscreenableSubjects(
  persons: readonly Person[],
  mandates: readonly Mandate[],
): { persons: Person[]; mandates: Mandate[] } {
  const active = new Set(mandates.filter((m) => m.active).map((m) => m.id));
  return {
    persons: persons.filter((p) => active.has(p.mandateId) && !canScreen(p)),
    mandates: mandates.filter((m) => m.active && subjectOfMandate(m).empty),
  };
}

/** Snapshot of the subject of a hit as it is now, or null when the person/mandate no longer exists. */
export function currentSnapshot(
  kind: SubjectKind,
  id: string,
  persons: readonly Person[],
  mandates: readonly Mandate[],
): string | null {
  if (kind === 'person') {
    const p = persons.find((x) => x.id === id);
    return p === undefined ? null : personSnapshot(p);
  }
  const m = mandates.find((x) => x.id === id);
  return m === undefined ? null : mandateSnapshot(m);
}
