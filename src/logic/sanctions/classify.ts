import type { RulesConfig } from '../config.ts';
import type { SanctionClass } from '../mandate/model.ts';
import { normalizeName } from './normalize.ts';
import type { ListEntry } from './list.ts';
import {
  isCompanyEmpty,
  nameSimilarity,
  prepareCompany,
  prepareName,
  preparedCompanySimilarity,
  preparedSimilarity,
  type PreparedCompany,
  type PreparedName,
} from './similarity.ts';

/** A birth date as far as known: a list entry often has only the year. Strings 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'. */
export type PartialDate = string | null;

/**
 * Traffic light of a client name against a list name: the entry point for the screening. A name that
 * normalizes to nothing (empty, or only punctuation) cannot be compared; it is never cleared as green
 * but handed to a human (gelb).
 */
export function classifyNames(
  clientName: string,
  listName: string,
  clientBirth: PartialDate,
  listBirth: PartialDate,
  thresholds: RulesConfig['sanctionThresholds'],
): SanctionClass {
  if (normalizeName(clientName) === '' || normalizeName(listName) === '') return 'gelb';
  return classifyMatch(nameSimilarity(clientName, listName), clientBirth, listBirth, thresholds);
}

const isFull = (d: PartialDate): d is string => d !== null && /^\d{4}-\d{2}-\d{2}$/.test(d);
const yearOf = (d: PartialDate): string | null => (d && /^\d{4}/.test(d) ? d.slice(0, 4) : null);

/**
 * Traffic light of one client person against one list entry.
 * - rot: name ≥ strong threshold and the exact birth date matches (block + alert the officer);
 * - gruen: name below the possible threshold, or both birth YEARS are known and differ;
 * - gelb: everything else — a human decides (birth date missing, same year, only month/day differs).
 * Conservative on purpose: only a clearly different birth YEAR clears a name match automatically.
 */
export function classifyMatch(
  similarity: number,
  clientBirth: PartialDate,
  listBirth: PartialDate,
  thresholds: RulesConfig['sanctionThresholds'],
): SanctionClass {
  if (similarity < thresholds.possible) return 'gruen';
  if (isFull(clientBirth) && isFull(listBirth) && clientBirth === listBirth) {
    return similarity >= thresholds.strong ? 'rot' : 'gelb';
  }
  const [cy, ly] = [yearOf(clientBirth), yearOf(listBirth)];
  if (cy !== null && ly !== null && cy !== ly) return 'gruen';
  return 'gelb';
}

/** Result of one client name against one list entry (all its names and birth dates). */
export type EntryMatch = {
  klasse: SanctionClass;
  /** The entry name (main name or alias) that produced the strongest result. */
  besterName: string;
  /** Similarity of that name; 0 when the comparison was impossible (empty name). */
  aehnlichkeit: number;
};

const RANK: Record<SanctionClass, number> = { gruen: 0, gelb: 1, rot: 2 };

/**
 * One list birth date against the client's, as classifyMatch, plus the span 'A/B' of a list entry that
 * only knows a range of years: it clears only when the client's year is known and outside the range.
 */
function classifyBirth(
  similarity: number,
  clientBirth: PartialDate,
  listBirth: string,
  thresholds: RulesConfig['sanctionThresholds'],
): SanctionClass {
  const slash = listBirth.indexOf('/');
  if (slash < 0) return classifyMatch(similarity, clientBirth, listBirth, thresholds);
  if (similarity < thresholds.possible) return 'gruen';
  const cy = yearOf(clientBirth);
  if (cy !== null && (cy < listBirth.slice(0, slash) || cy > listBirth.slice(slash + 1))) {
    return 'gruen';
  }
  return 'gelb';
}

/** Entry with its names prepared once (see `prepareName`); used by the screening to avoid re-normalizing. */
export type PreparedEntry = {
  entry: ListEntry;
  names: PreparedName[];
  empty: boolean[];
  /** The names prepared for the company comparison; built on first use (see `companyNames`). */
  companies: PreparedCompany[] | null;
};

export function prepareEntry(entry: ListEntry): PreparedEntry {
  const names = entry.names.map(prepareName);
  return { entry, names, empty: entry.names.map((n) => normalizeName(n) === ''), companies: null };
}

function companyNames(pe: PreparedEntry): PreparedCompany[] {
  return (pe.companies ??= pe.entry.names.map(prepareCompany));
}

const CLASSES: SanctionClass[] = ['gruen', 'gelb', 'rot'];

/** Strongest class of one list name that is similar enough, over all birth dates of the entry (unknown = gelb). */
function rankOfBirths(
  similarity: number,
  clientBirth: PartialDate,
  births: readonly string[],
  thresholds: RulesConfig['sanctionThresholds'],
): number {
  if (births.length === 0) return RANK[classifyMatch(similarity, clientBirth, null, thresholds)];
  let rank = 0;
  for (let i = 0; i < births.length; i++) {
    const k = RANK[classifyBirth(similarity, clientBirth, births[i] ?? '', thresholds)];
    if (k > rank) rank = k;
  }
  return rank;
}

/**
 * Core of `classifyEntry` on prepared names. `floor` is the lossless pre-filter hint of
 * `preparedSimilarity`; with `floor` > 0 a green result is returned as `null` (its similarity is then
 * not exact and nobody needs it). With `floor` = 0 the result is never null.
 */
export function classifyPrepared(
  client: PreparedName,
  clientEmpty: boolean,
  clientBirth: PartialDate,
  pe: PreparedEntry,
  thresholds: RulesConfig['sanctionThresholds'],
  floor: number,
): EntryMatch | null {
  return classifyBy(
    pe,
    clientBirth,
    thresholds,
    floor,
    clientEmpty,
    (i) => pe.empty[i] === true,
    (i) => {
      const pn = pe.names[i];
      return pn === undefined ? 0 : preparedSimilarity(client, pn, floor);
    },
  );
}

/**
 * Same for a COMPANY (mandate): legal-form words are removed before the comparison (`companySimilarity`).
 * A client name with nothing but legal-form words is "empty" (yellow, not comparable); a list name
 * like that is skipped, or every company would hit it.
 */
export function classifyPreparedCompany(
  client: PreparedCompany,
  clientBirth: PartialDate,
  pe: PreparedEntry,
  thresholds: RulesConfig['sanctionThresholds'],
  floor: number,
): EntryMatch | null {
  const list = companyNames(pe);
  return classifyBy(
    pe,
    clientBirth,
    thresholds,
    floor,
    isCompanyEmpty(client),
    (i) => pe.empty[i] === true,
    (i) => {
      const pn = list[i];
      return pn === undefined ? 0 : preparedCompanySimilarity(client, pn, thresholds, floor);
    },
    (i) => {
      const pn = list[i];
      return pn !== undefined && isCompanyEmpty(pn);
    },
  );
}

function classifyBy(
  pe: PreparedEntry,
  clientBirth: PartialDate,
  thresholds: RulesConfig['sanctionThresholds'],
  floor: number,
  clientEmpty: boolean,
  nameEmpty: (i: number) => boolean,
  similarity: (i: number) => number,
  skipped: (i: number) => boolean = () => false,
): EntryMatch | null {
  const names = pe.entry.names;
  let bestRank = 0;
  let bestSim = -1;
  let bestAt = 0;
  for (let i = 0; i < names.length; i++) {
    let rank = 1;
    let sim = 0;
    if (!clientEmpty && !nameEmpty(i)) {
      if (skipped(i)) {
        rank = 0;
      } else {
        sim = similarity(i);
        rank =
          sim >= thresholds.possible
            ? rankOfBirths(sim, clientBirth, pe.entry.births, thresholds)
            : 0;
      }
    }
    if (rank > bestRank || (rank === bestRank && sim > bestSim)) {
      bestRank = rank;
      bestSim = sim;
      bestAt = i;
    }
  }
  if (bestRank === 0 && floor > 0) return null;
  return {
    klasse: CLASSES[bestRank] ?? 'gelb',
    besterName: names[bestAt] ?? '',
    aehnlichkeit: Math.max(0, bestSim),
  };
}

/**
 * Traffic light of one client against one list entry: the client name is compared with EVERY name and
 * alias and every birth date of the entry; the strongest result counts.
 * - gruen only if no name reaches the possible threshold, or for EVERY birth date of the entry both
 *   birth years are known and differ (span 'A/B': the client's year lies outside it);
 * - rot as in `classifyMatch` (name >= strong and the same FULL date), gelb otherwise;
 * - an entry without birth date counts as unknown (gelb on a name match); an empty client name is gelb.
 * With `subject` 'company' (a mandate) the name is compared as a company name: legal-form words are
 * removed on both sides first, and a name of legal-form words only counts as empty.
 */
export function classifyEntry(
  clientName: string,
  clientBirth: PartialDate,
  entry: ListEntry,
  thresholds: RulesConfig['sanctionThresholds'],
  subject: 'person' | 'company' = 'person',
): EntryMatch {
  const m =
    subject === 'company'
      ? classifyPreparedCompany(
          prepareCompany(clientName),
          clientBirth,
          prepareEntry(entry),
          thresholds,
          0,
        )
      : classifyPrepared(
          prepareName(clientName),
          normalizeName(clientName) === '',
          clientBirth,
          prepareEntry(entry),
          thresholds,
          0,
        );
  return m ?? { klasse: 'gruen', besterName: entry.names[0] ?? '', aehnlichkeit: 0 };
}
