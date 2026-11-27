/**
 * Legal-form and company-suffix words in `normalizeName` form (lower case, no punctuation), removed
 * before a COMPANY name is compared ('Sovcomflot GmbH' = 'Sovcomflot'). Startvorschlag, je Kanzlei
 * erweiterbar. Deliberately NOT in the list: 'holding', 'holdings', 'group' and branch words such as
 * 'oil', 'bank', 'shipping': they tell companies apart.
 */
export const LEGAL_FORM_WORDS: readonly string[] = [
  ...['gmbh', 'mbh', 'ag', 'kg', 'ohg', 'ug', 'ek', 'ev', 'eg', 'se', 'kgaa', 'gbr'],
  ...['ltd', 'limited', 'llc', 'llp', 'lp', 'inc', 'incorporated', 'corp', 'corporation'],
  ...['co', 'company', 'plc', 'sa', 'sarl', 'srl', 'spa', 'bv', 'nv', 'ab', 'as', 'oy', 'oyj'],
  ...['oao', 'ooo', 'zao', 'pao', 'ao', 'jsc', 'ojsc', 'cjsc', 'fze', 'fzco', 'pte', 'pvt'],
  ...['sdn', 'bhd'],
];

/**
 * Word sequences that are one legal form, as `normalizeName` writes them: 'GmbH & Co. KG', 'G.m.b.H.',
 * 'e.K.', 'L.L.C.'. Same rule as the words: removed whole.
 */
export const LEGAL_FORM_SEQUENCES: readonly string[] = [
  'gmbh co kg',
  'g m b h',
  'a g',
  'k g',
  'e k',
  'e v',
  'e g',
  'l l c',
  'l t d',
  's r l',
  's p a',
  'o o o',
];

/** Words that can be a name themselves: removed only if a real name word remains (see `stripLegalWords`). */
const AMBIGUOUS = new Set(['co', 'as', 'ab', 'sa', 'se', 'ao', 'oy', 'ek', 'ev', 'eg', 'lp']);

const WORDS = new Set(LEGAL_FORM_WORDS);
const SEQUENCES = LEGAL_FORM_SEQUENCES.map((s) => s.split(' ')).sort((a, b) => b.length - a.length);

/** Sequences that cannot be a name (removed like a plain legal word); the other sequences count as ambiguous. */
const SURE_SEQUENCES = new Set(['gmbh co kg', 'g m b h']);

/**
 * Parts of a normalized name without its legal-form words. Words that can be names ('co', 'as', 'ab',
 * 'sa', 'se', letter sequences like 'e k') go only when at least one part that is no legal-form word
 * at all remains, so they are never the only name part. Nothing left = the name consists of legal
 * forms alone (not comparable).
 */
export function stripLegalWords(tokens: readonly string[]): string[] {
  const state: ('keep' | 'sure' | 'weak')[] = tokens.map(() => 'keep');
  for (let i = 0; i < tokens.length; i++) {
    const seq = SEQUENCES.find((s) => s.every((w, k) => tokens[i + k] === w));
    if (seq !== undefined) {
      const kind = SURE_SEQUENCES.has(seq.join(' ')) ? 'sure' : 'weak';
      for (let k = 0; k < seq.length; k++) state[i + k] = kind;
      i += seq.length - 1;
    } else if (WORDS.has(tokens[i] ?? '')) {
      state[i] = AMBIGUOUS.has(tokens[i] ?? '') ? 'weak' : 'sure';
    }
  }
  const core = state.includes('keep');
  return tokens.filter((_, i) => state[i] === 'keep' || (state[i] === 'weak' && !core));
}
