import { classifyMatch, levenshtein, nameSimilarity, normalizeName } from '../src/logic/index.ts';

describe('name normalization', () => {
  it('folds umlauts, ß, case and punctuation', () => {
    expect(normalizeName('Müller-Lüdenscheidt, Jürgen')).toBe('mueller luedenscheidt juergen');
    expect(normalizeName('Straße')).toBe('strasse');
    expect(normalizeName('José  Álvarez')).toBe('jose alvarez');
  });
});

describe('similarity', () => {
  it('knows the distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });
  it('is 1 for the same name in another spelling of umlauts and order', () => {
    expect(nameSimilarity('Müller', 'Mueller')).toBe(1);
    expect(nameSimilarity('Jürgen Müller', 'Mueller Juergen')).toBe(1);
  });
  it('is high for transliteration variants and low for different names', () => {
    expect(nameSimilarity('Alexander Ivanov', 'Aleksandr Ivanov')).toBeGreaterThan(0.8);
    expect(nameSimilarity('Thomas Weber', 'Sergej Iwanow')).toBeLessThan(0.5);
  });
  it('is 0 for empty names', () => {
    expect(nameSimilarity('', '')).toBe(0);
  });
});

describe('traffic light', () => {
  it('is green below the possible threshold, whatever the birth date', () => {
    expect(classifyMatch(0.84, '1974-05-12', '1974-05-12')).toBe('gruen');
  });
  it('is red for a strong name match with the exact birth date', () => {
    expect(classifyMatch(0.9, '1974-05-12', '1974-05-12')).toBe('rot');
    expect(classifyMatch(1, '1974-05-12', '1974-05-12')).toBe('rot');
  });
  it('is only yellow for a possible (not strong) name match with the exact date', () => {
    expect(classifyMatch(0.87, '1974-05-12', '1974-05-12')).toBe('gelb');
  });
  it('is yellow when a birth date is missing on either side', () => {
    expect(classifyMatch(0.95, null, '1974-00-00'.slice(0, 4))).toBe('gelb');
    expect(classifyMatch(0.95, '1974-05-12', null)).toBe('gelb');
    expect(classifyMatch(0.95, null, null)).toBe('gelb');
  });
  it('is yellow when the list has only the year and it matches', () => {
    expect(classifyMatch(0.95, '1974-05-12', '1974')).toBe('gelb');
  });
  it('is yellow for swapped day and month (same year): a human must look', () => {
    expect(classifyMatch(0.95, '1974-04-08', '1974-08-04')).toBe('gelb');
  });
  it('is green only when both birth years are known and differ', () => {
    expect(classifyMatch(0.95, '1980-05-12', '1974-05-12')).toBe('gruen');
    expect(classifyMatch(0.95, '1980-05-12', '1974')).toBe('gruen');
  });
});
