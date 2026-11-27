import { normalizeLoose, normalizeName } from './normalize.ts';

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
