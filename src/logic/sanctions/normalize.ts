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
export function clean(name: string): string {
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
export function normalizeLoose(name: string): string {
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
