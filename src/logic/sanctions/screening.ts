import type { RulesConfig } from '../config.ts';
import type { Mandate, Person, Reason, SanctionClass } from '../mandate/model.ts';
import { classifyPrepared, prepareEntry, type PreparedEntry } from './classify.ts';
import type { ListIndex, ListKind } from './list.ts';
import { normalizeName } from './normalize.ts';
import { prepareName, type PreparedName } from './similarity.ts';

/** A possible match of a person with a list entry; green is never a hit. */
export interface Hit {
  personId: string;
  mandateId: string;
  entryId: string;
  kind: ListKind;
  klasse: Exclude<SanctionClass, 'gruen'>;
  /** The list name (main name or alias) that matched best. */
  besterName: string;
  aehnlichkeit: number;
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
  return a.personId < b.personId
    ? -1
    : a.personId > b.personId
      ? 1
      : a.entryId < b.entryId
        ? -1
        : a.entryId > b.entryId
          ? 1
          : 0;
}

/** Context of one person: name prepared once. */
type Subject = { person: Person; client: PreparedName; empty: boolean };
const subjectOf = (p: Person): Subject => {
  const name = personName(p);
  return { person: p, client: prepareName(name), empty: normalizeName(name) === '' };
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
    const m = classifyPrepared(s.client, s.empty, s.person.birth, pe, t, floor);
    if (m === null || m.klasse === 'gruen') continue;
    out.push({
      personId: s.person.id,
      mandateId: s.person.mandateId,
      entryId: pe.entry.id,
      kind: pe.entry.kind,
      klasse: m.klasse,
      besterName: m.besterName,
      aehnlichkeit: m.aehnlichkeit,
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
