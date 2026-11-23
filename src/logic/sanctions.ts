import { SANCTION_THRESHOLDS } from './config.ts';
import type { SanctionClass } from './model.ts';

/** A birth date as far as known: a list entry often has only the year. Strings 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'. */
export type PartialDate = string | null;

/** Lower-case, umlauts and ß expanded, diacritics and punctuation removed, whitespace collapsed. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
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

/** 1 = identical after normalization, 0 = nothing in common. Word order is ignored. */
export function nameSimilarity(a: string, b: string): number {
  const sort = (s: string) => normalizeName(s).split(' ').filter(Boolean).sort().join(' ');
  const [x, y] = [sort(a), sort(b)];
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 0;
  return 1 - levenshtein(x, y) / longest;
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
