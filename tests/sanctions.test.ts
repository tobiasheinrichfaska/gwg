import {
  classifyMatch,
  classifyNames,
  levenshtein,
  nameSimilarity,
  normalizeName,
} from '../src/logic/index.ts';

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

describe('names the Latin fold would lose (fail-open guard)', () => {
  it('keeps letters of other scripts instead of emptying the name', () => {
    expect(normalizeName('Иван Петров')).toBe('иван петров');
    expect(nameSimilarity('Иван Петров', 'Иван Петров')).toBe(1);
    expect(classifyNames('Иван Петров', 'Иван Петров', '1974-05-12', '1974-05-12')).toBe('rot');
  });
  it('folds ø, æ, ł, đ like the usual list transliterations', () => {
    expect(normalizeName('Søren Łukasz')).toBe('soeren lukasz');
    expect(nameSimilarity('Søren', 'Soeren')).toBe(1);
  });
  it('never clears a name that cannot be compared: it goes to a human', () => {
    expect(classifyNames('', '', null, null)).toBe('gelb');
    expect(classifyNames('...', 'Ivan Petrov', '1980-01-01', '1974-01-01')).toBe('gelb');
  });
  it('classifyNames agrees with classifyMatch for ordinary names', () => {
    expect(classifyNames('Jürgen Müller', 'Mueller Juergen', '1980-05-12', '1974')).toBe('gruen');
    expect(classifyNames('Thomas Weber', 'Sergej Iwanow', null, null)).toBe('gruen');
  });
});

describe('findings of the independent re-audit', () => {
  it('does not lose a changed first letter to the word sorting', () => {
    expect(nameSimilarity('Zhang Wei', 'Chang Wei')).toBeGreaterThan(0.85);
  });
  it('rates extra name parts yellow at most, never red', () => {
    const s = nameSimilarity('Vladimir Putin', 'Vladimir Vladimirovich Putin');
    expect(s).toBeGreaterThanOrEqual(0.85);
    expect(classifyMatch(s, '1952-10-07', '1952-10-07')).toBe('gelb');
    expect(nameSimilarity('Putin', 'Vladimir Putin')).toBeLessThan(0.85);
  });
  it('folds a decomposed umlaut like a composed one', () => {
    expect(normalizeName('Mu\u0308ller')).toBe('mueller');
  });
  it('treats ö as o as well, as list transliterations do', () => {
    expect(nameSimilarity('Özil', 'Ozil')).toBe(1);
  });
  it('removes invisible characters instead of splitting the word', () => {
    expect(normalizeName('Ali\u00ADev')).toBe('aliev');
    expect(normalizeName('Ali\u200Bev')).toBe('aliev');
    expect(nameSimilarity('Ali\u00ADev', 'Aliev')).toBe(1);
  });
});
