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

const wholeSimilarity = (x: string, y: string): number => {
  const longest = Math.max(x.length, y.length);
  return longest === 0 ? 0 : 1 - levenshtein(x, y) / longest;
};

/** Highest cap for a match found only through shared name parts: yellow at most, never red. */
const PARTIAL_CAP = 0.89;

/** Slack for the floating-point comparison of the pre-filter bounds (far above rounding error). */
const EPS = 1e-9;

const BUCKETS = 32;
/** Character histogram in 32 buckets (code unit mod 32) with the list of its non-empty buckets. Collisions only RAISE the overlap, so a bound derived from it stays valid. */
type Hist = { counts: Int16Array; used: Uint8Array };
function histogram(s: string): Hist {
  const counts = new Int16Array(BUCKETS);
  for (let i = 0; i < s.length; i++) {
    const k = s.charCodeAt(i) & (BUCKETS - 1);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const used: number[] = [];
  counts.forEach((c, k) => c > 0 && used.push(k));
  return { counts, used: Uint8Array.from(used) };
}
/** Sum over buckets of min(a, b): the number of characters the two strings can share at most. */
function overlap(a: Hist, b: Hist): number {
  let n = 0;
  for (let i = 0; i < a.used.length; i++) {
    const k = a.used[i] as number;
    const x = a.counts[k] as number;
    const y = b.counts[k] as number;
    n += x < y ? x : y;
  }
  return n;
}

/** One normalization of a name, with everything the comparison needs computed once. */
type Variant = {
  s: string;
  tokens: string[];
  sorted: string;
  /** Number of characters in the parts (without the separating spaces). */
  letters: number;
  hist: Hist;
  tokenHists: Hist[];
  /** Indexes of the parts, longest first (the bound below fails fastest on them). */
  byLength: number[];
};

function variantOf(s: string): Variant {
  const tokens = s.split(' ').filter(Boolean);
  return {
    s,
    tokens,
    sorted: [...tokens].sort().join(' '),
    letters: tokens.reduce((n, t) => n + t.length, 0),
    hist: histogram(s),
    tokenHists: tokens.map(histogram),
    byLength: tokens
      .map((_, i) => i)
      .sort((x, y) => (tokens[y]?.length ?? 0) - (tokens[x]?.length ?? 0)),
  };
}

/** A name prepared for repeated comparison: both spellings (strict and loose), normalized and tokenized once. */
export type PreparedName = { strict: Variant; loose: Variant };

export function prepareName(name: string): PreparedName {
  const strict = variantOf(normalizeName(name));
  const l = normalizeLoose(name);
  return { strict, loose: l === strict.s ? strict : variantOf(l) };
}

/**
 * Similarity of two prepared spellings. With `floor` > 0 a mode is skipped when a cheap upper bound
 * proves it stays below `floor`; the result is then exact whenever it is >= floor, and some value
 * < floor otherwise. The bounds: lev(x,y) >= longest - (character overlap), so the whole-name
 * similarity is at most overlap/longest; a part of the shorter name matches at most
 * overlap(part, whole longer name)/|part|.
 */
function similarityOf(a: Variant, b: Variant, floor: number): number {
  if (a.tokens.length === 0 || b.tokens.length === 0) return 0;
  let best = 0;
  const longest = Math.max(a.s.length, b.s.length);
  const aFew = a.tokens.length <= b.tokens.length;
  const few = aFew ? a : b;
  const many = aFew ? b : a;
  const n = few.tokens.length;
  // Cheap, lossless gates (only with floor > 0): lev >= longest - overlap bounds the whole-name modes.
  let whole = true;
  const partial = n >= 2 && PARTIAL_CAP + EPS >= floor;
  if (floor > 0) {
    whole =
      Math.min(a.s.length, b.s.length) / longest + EPS >= floor &&
      overlap(a.hist, b.hist) / longest + EPS >= floor;
    if (!whole && !partial) return 0;
  }
  // 1+2. whole name, parts sorted (word order is irrelevant: "Wei Zhang" = "Zhang Wei"), and in the
  //      given order (sorting can move a changed first letter: "Zhang"/"Chang"). Same length, same histogram.
  if (whole) best = Math.max(wholeSimilarity(a.sorted, b.sorted), wholeSimilarity(a.s, b.s));
  // 3. every part of the shorter name found in the longer one (patronymic, second given name):
  //    "Vladimir Putin" ~ "Vladimir Vladimirovich Putin". Needs two parts, else "Putin" alone would match.
  if (partial) {
    if (floor > 0) {
      // each part is at most 1, so the bound fails as soon as even full scores for the rest cannot reach n*floor
      let bound = 0;
      for (let k = 0; k < n; k++) {
        const i = few.byLength[k] ?? 0;
        const h = few.tokenHists[i];
        if (h === undefined) continue;
        bound += overlap(h, many.hist) / (few.tokens[i]?.length || 1);
        if (Math.min(PARTIAL_CAP * n, bound + (n - 1 - k)) + EPS < n * floor) return best;
      }
    }
    if (floor > 0) {
      // tighter bound: every part against each single part of the longer name (lev >= longer part - overlap)
      let bound = 0;
      for (let k = 0; k < n; k++) {
        const i = few.byLength[k] ?? 0;
        const h = few.tokenHists[i];
        const len = few.tokens[i]?.length ?? 1;
        let top = 0;
        for (let j = 0; j < many.tokens.length; j++) {
          const g = many.tokenHists[j];
          if (g === undefined) continue;
          const v = overlap(h ?? g, g) / Math.max(len, many.tokens[j]?.length ?? 1);
          if (v > top) top = v;
        }
        bound += top;
        if (Math.min(PARTIAL_CAP * n, bound + (n - 1 - k)) + EPS < n * floor) return best;
      }
    }
    const pool = [...many.tokens];
    let sum = 0;
    for (const t of few.tokens) {
      let at = -1;
      let top = 0;
      for (let i = 0; i < pool.length; i++) {
        const v = wholeSimilarity(t, pool[i] ?? '');
        if (v > top) {
          top = v;
          at = i;
        }
      }
      if (at >= 0) pool.splice(at, 1);
      sum += top;
    }
    best = Math.max(best, Math.min(PARTIAL_CAP, sum / n));
  }
  return best;
}

/**
 * Same as `nameSimilarity` on prepared names. `floor` (default 0 = exact, no filter) is an optimization
 * hint that loses nothing: a result >= floor is always exact; below it, any value < floor may come back.
 */
export function preparedSimilarity(a: PreparedName, b: PreparedName, floor = 0): number {
  let best = similarityOf(a.strict, b.strict, floor);
  if (a.loose !== a.strict || b.loose !== b.strict) {
    best = Math.max(best, similarityOf(a.loose, b.loose, floor));
  }
  return best;
}

/**
 * 1 = identical after normalization, 0 = nothing in common. Word order is ignored; extra name parts on
 * one side lower the score only to a yellow-at-most match. The better of two spellings counts (ö as "oe"
 * and as "o"), because lists transliterate both ways.
 */
export function nameSimilarity(a: string, b: string): number {
  return preparedSimilarity(prepareName(a), prepareName(b));
}
