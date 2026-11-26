import { SANCTION_THRESHOLDS } from './config.ts';
import type { SanctionClass } from './mandate/model.ts';

/** A birth date as far as known: a list entry often has only the year. Strings 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'. */
export type PartialDate = string | null;

/** Letters that NFD does not decompose; folded to the usual Latin spelling of list transliterations. */
const FOLD: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  ø: 'oe',
  æ: 'ae',
  œ: 'oe',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
};

/** NFC (so a decomposed 'ü' from another system folds like 'ü'), lower-case, invisible characters removed. */
function clean(name: string): string {
  return (
    name
      .normalize('NFC')
      .toLowerCase()
      // soft hyphen, zero-width characters, bidi marks (format characters) and C0/DEL/C1 controls
      // eslint-disable-next-line no-control-regex
      .replace(/[\p{Cf}\u0000-\u0008\u000e-\u001f\u007f-\u009f]/gu, '')
  );
}

/** Same as `normalizeName`, but umlauts and ø/æ/ł only lose their marks (ö→o), as many list transliterations do. */
function normalizeLoose(name: string): string {
  return clean(name)
    .replace(/ß/g, 'ss')
    .replace(/[øðđ]/g, (c) => (c === 'ø' ? 'o' : 'd'))
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ł/g, 'l')
    .replace(/þ/g, 'th')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lower-case, umlauts/ß/ø/æ/ł… folded, diacritics and punctuation removed, whitespace collapsed.
 * Letters of any script are KEPT (Cyrillic, Arabic, CJK…): dropping them would turn a name into an
 * empty string that compares as "nothing in common" and would clear it green.
 */
export function normalizeName(name: string): string {
  return clean(name)
    .replace(/[äöüßøæœłđðþı]/g, (c) => FOLD[c] ?? c)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

const tokens = (s: string) => s.split(' ').filter(Boolean);
const wholeSimilarity = (x: string, y: string): number => {
  const longest = Math.max(x.length, y.length);
  return longest === 0 ? 0 : 1 - levenshtein(x, y) / longest;
};

/** Highest cap for a match found only through shared name parts: yellow at most, never red. */
const PARTIAL_CAP = 0.89;

function similarityOf(a: string, b: string): number {
  const [ta, tb] = [tokens(a), tokens(b)];
  if (ta.length === 0 || tb.length === 0) return 0;
  // 1. whole name, parts sorted (word order is irrelevant: "Wei Zhang" = "Zhang Wei").
  let best = wholeSimilarity([...ta].sort().join(' '), [...tb].sort().join(' '));
  // 2. whole name in the given order (sorting can move a changed first letter: "Zhang"/"Chang").
  best = Math.max(best, wholeSimilarity(a, b));
  // 3. every part of the shorter name found in the longer one (patronymic, second given name):
  //    "Vladimir Putin" ~ "Vladimir Vladimirovich Putin". Needs two parts, else "Putin" alone would match.
  const [few, many] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (few.length >= 2) {
    const pool = [...many];
    let sum = 0;
    for (const t of few) {
      let at = -1;
      let top = 0;
      pool.forEach((u, i) => {
        const v = wholeSimilarity(t, u);
        if (v > top) [top, at] = [v, i];
      });
      if (at >= 0) pool.splice(at, 1);
      sum += top;
    }
    best = Math.max(best, Math.min(PARTIAL_CAP, sum / few.length));
  }
  return best;
}

/**
 * 1 = identical after normalization, 0 = nothing in common. Word order is ignored; extra name parts on
 * one side lower the score only to a yellow-at-most match. The better of two spellings counts (ö as "oe"
 * and as "o"), because lists transliterate both ways.
 */
export function nameSimilarity(a: string, b: string): number {
  return Math.max(
    similarityOf(normalizeName(a), normalizeName(b)),
    similarityOf(normalizeLoose(a), normalizeLoose(b)),
  );
}

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
): SanctionClass {
  if (normalizeName(clientName) === '' || normalizeName(listName) === '') return 'gelb';
  return classifyMatch(nameSimilarity(clientName, listName), clientBirth, listBirth);
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
): SanctionClass {
  if (similarity < SANCTION_THRESHOLDS.possible) return 'gruen';
  if (isFull(clientBirth) && isFull(listBirth) && clientBirth === listBirth) {
    return similarity >= SANCTION_THRESHOLDS.strong ? 'rot' : 'gelb';
  }
  const [cy, ly] = [yearOf(clientBirth), yearOf(listBirth)];
  if (cy !== null && ly !== null && cy !== ly) return 'gruen';
  return 'gelb';
}
