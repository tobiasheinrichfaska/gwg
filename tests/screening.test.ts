import {
  classifyEntry,
  screenAll,
  screenPerson,
  type ListEntry,
  type ListIndex,
  type Person,
  emptyPep,
} from '../src/logic/index.ts';
import { mandate, rules } from './helpers.ts';

const th = rules.sanctionThresholds;
const entry = (over: Partial<ListEntry> = {}): ListEntry => ({
  id: 'E1',
  kind: 'sanktion',
  names: ['Ivan Petrov'],
  births: [],
  remark: '',
  ...over,
});
const person = (over: Partial<Person> = {}): Person => ({
  id: 'P1',
  mandateId: '10001',
  role: 'inhaber',
  lastName: 'Petrov',
  firstName: 'Ivan',
  birth: null,
  pep: emptyPep(),
  ...over,
});
const list = (entries: ListEntry[], kind: ListIndex['kind'] = 'sanktion'): ListIndex => ({
  source: 'test',
  kind,
  fetchedOn: '2026-11-20',
  entries,
});

describe('classifyEntry', () => {
  it('is green for a different name', () => {
    expect(classifyEntry('Thomas Weber', null, entry(), th).klasse).toBe('gruen');
  });
  it('matches an alias and names it', () => {
    const e = entry({ names: ['Hans Müller', 'Ivan Petrov'] });
    const r = classifyEntry('Ivan Petrov', null, e, th);
    expect(r).toEqual({ klasse: 'gelb', besterName: 'Ivan Petrov', aehnlichkeit: 1 });
  });
  it('takes the strongest result over several names', () => {
    const e = entry({ names: ['Ivan Petrof', 'Ivan Petrov'], births: ['1970-05-12'] });
    const r = classifyEntry('Ivan Petrov', '1970-05-12', e, th);
    expect(r.klasse).toBe('rot');
    expect(r.besterName).toBe('Ivan Petrov');
  });
  it('is yellow without any list birth date (unknown), whatever the client says', () => {
    expect(classifyEntry('Ivan Petrov', '1970-05-12', entry(), th).klasse).toBe('gelb');
  });
  it('clears only if EVERY list birth date has a known, different year', () => {
    const e = entry({ births: ['1960', '1980-01-01'] });
    expect(classifyEntry('Ivan Petrov', '1970-05-12', e, th).klasse).toBe('gruen');
    const e2 = entry({ births: ['1960', '1970'] });
    expect(classifyEntry('Ivan Petrov', '1970-05-12', e2, th).klasse).toBe('gelb');
    expect(classifyEntry('Ivan Petrov', null, e, th).klasse).toBe('gelb');
  });
  it('is red if any of several birth dates is the exact full date', () => {
    const e = entry({ births: ['1960', '1970-05-12', '1970'] });
    expect(classifyEntry('Ivan Petrov', '1970-05-12', e, th).klasse).toBe('rot');
    expect(classifyEntry('Ivan Petrov', '1970-05-13', e, th).klasse).toBe('gelb');
  });
  it('treats a span as outside-only clearing', () => {
    const e = entry({ births: ['1960/1965'] });
    expect(classifyEntry('Ivan Petrov', '1970', e, th).klasse).toBe('gruen');
    expect(classifyEntry('Ivan Petrov', '1959-12-31', e, th).klasse).toBe('gruen');
    expect(classifyEntry('Ivan Petrov', '1960', e, th).klasse).toBe('gelb');
    expect(classifyEntry('Ivan Petrov', '1965-12-31', e, th).klasse).toBe('gelb');
    expect(classifyEntry('Ivan Petrov', null, e, th).klasse).toBe('gelb');
    const mixed = entry({ births: ['1960/1965', '1970'] });
    expect(classifyEntry('Ivan Petrov', '1970', mixed, th).klasse).toBe('gelb');
    expect(classifyEntry('Ivan Petrov', '1980', mixed, th).klasse).toBe('gruen');
  });
  it('never turns red from a year only or a span', () => {
    expect(classifyEntry('Ivan Petrov', '1970', entry({ births: ['1970'] }), th).klasse).toBe(
      'gelb',
    );
    expect(
      classifyEntry('Ivan Petrov', '1970-01-01', entry({ births: ['1970/1970'] }), th).klasse,
    ).toBe('gelb');
  });
  it('is yellow for an empty client name, with similarity 0', () => {
    expect(classifyEntry('  ', null, entry(), th)).toEqual({
      klasse: 'gelb',
      besterName: 'Ivan Petrov',
      aehnlichkeit: 0,
    });
  });
  it('matches umlaut and non-Latin spellings', () => {
    const e = entry({ names: ['Mueller Juergen'] });
    expect(classifyEntry('Jürgen Müller', null, e, th).klasse).toBe('gelb');
    const cy = entry({ names: ['Иван Петров'] });
    expect(classifyEntry('Петров Иван', null, cy, th).klasse).toBe('gelb');
    expect(classifyEntry('Ivan Petrov', null, cy, th).klasse).toBe('gruen'); // known blind spot: no transliteration
    const ar = entry({ names: ['محمد علي'] });
    expect(classifyEntry('علي محمد', null, ar, th).klasse).toBe('gelb');
  });
});

describe('screenPerson / screenAll', () => {
  const ms = [mandate()];
  it('returns yellow and red only, never green', () => {
    const idx = list([entry({ id: 'A', names: ['Thomas Weber'] }), entry({ id: 'B' })]);
    const hits = screenPerson(person(), idx, th);
    expect(hits.map((h) => h.entryId)).toEqual(['B']);
    expect(hits[0]).toMatchObject({
      personId: 'P1',
      mandateId: '10001',
      kind: 'sanktion',
      klasse: 'gelb',
      besterName: 'Ivan Petrov',
      aehnlichkeit: 1,
    });
  });
  it('uses "first last" as the name', () => {
    const idx = list([entry({ names: ['Petrov Ivan'] })]);
    expect(screenPerson(person(), idx, th)).toHaveLength(1);
    expect(screenPerson(person({ firstName: '' }), idx, th)).toHaveLength(0);
  });
  it('sorts red before yellow, then similarity descending, then person id', () => {
    const idx = list([
      entry({ id: 'Y1', names: ['Ivan Petrow'] }),
      entry({ id: 'Y2', names: ['Ivan Petrov'] }),
      entry({ id: 'R1', names: ['Ivan Petrov'], births: ['1970-05-12'] }),
    ]);
    const persons = [
      person({ id: 'P2', birth: null }),
      person({ id: 'P1', birth: '1970-05-12' }),
      person({ id: 'P0', birth: null }),
    ];
    const { hits } = screenAll(persons, ms, idx, th);
    expect(hits.map((h) => `${h.personId}/${h.entryId}/${h.klasse}`)).toEqual([
      'P1/R1/rot',
      'P0/R1/gelb',
      'P0/Y2/gelb',
      'P1/Y2/gelb',
      'P2/R1/gelb',
      'P2/Y2/gelb',
      'P0/Y1/gelb',
      'P1/Y1/gelb',
      'P2/Y1/gelb',
    ]);
  });
  it('reports persons that cannot be screened, never as clean', () => {
    const idx = list([entry()]);
    const persons = [
      person({ id: 'X1', lastName: '---' }),
      person({ id: 'X2', lastName: '  ', firstName: 'Ivan' }),
      person({ id: 'X3', mandateId: 'gibt-es-nicht' }),
      person({ id: 'OK' }),
    ];
    const { hits, unscreenable } = screenAll(persons, ms, idx, th);
    expect(unscreenable).toEqual([
      { personId: 'X1', reason: 'bad-person' },
      { personId: 'X2', reason: 'bad-person' },
      { personId: 'X3', reason: 'unknown-mandate' },
    ]);
    expect(hits.map((h) => h.personId)).toEqual(['OK']);
  });
  it('carries the entry kind (pep)', () => {
    const idx = list([entry({ kind: 'pep', remark: 'Minister' })], 'pep');
    expect(screenPerson(person(), idx, th)[0]?.kind).toBe('pep');
  });
  it('finds a hit through a mixed birth list with several dates', () => {
    const idx = list([entry({ births: ['1960', '1970-05'] })]);
    expect(screenPerson(person({ birth: '1970-05-12' }), idx, th)).toHaveLength(1);
    expect(screenPerson(person({ birth: '1990-05-12' }), idx, th)).toHaveLength(0);
  });
});

// ---- performance and lossless pre-filter ------------------------------------------------------

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const SYL = [
  'ma',
  'ko',
  'vi',
  'ra',
  'ste',
  'pa',
  'no',
  'li',
  'sha',
  'mir',
  'dan',
  'el',
  'zu',
  'ber',
  'ha',
  'ju',
  'ti',
  'ow',
  'ski',
  'ev',
  'ah',
  'med',
  'ali',
  'fa',
  'cho',
  'ne',
];
function word(r: () => number): string {
  const n = 2 + Math.floor(r() * 3);
  let w = '';
  for (let i = 0; i < n; i++) w += SYL[Math.floor(r() * SYL.length)];
  return w[0]!.toUpperCase() + w.slice(1);
}
function fullName(r: () => number): string {
  const parts = 2 + Math.floor(r() * 2);
  return Array.from({ length: parts }, () => word(r)).join(' ');
}
function synthetic(nPersons: number, nEntries: number, seed: number) {
  const r = rng(seed);
  const entries: ListEntry[] = Array.from({ length: nEntries }, (_, i) => ({
    id: `E${i}`,
    kind: i % 5 === 0 ? 'pep' : 'sanktion',
    names: Array.from({ length: 1 + Math.floor(r() * 3) }, () => fullName(r)),
    births: r() < 0.3 ? [] : [String(1940 + Math.floor(r() * 60))],
    remark: '',
  }));
  const persons: Person[] = Array.from({ length: nPersons }, (_, i) => {
    const name = fullName(r).split(' ');
    const p: Person = {
      id: `P${String(i).padStart(5, '0')}`,
      mandateId: '10001',
      role: 'inhaber',
      lastName: name.slice(1).join(' ') || 'X',
      firstName: name[0] ?? '',
      birth: r() < 0.5 ? null : String(1940 + Math.floor(r() * 60)),
      pep: emptyPep(),
    };
    // plant near matches (typo, reversed order, alias, umlaut) so the sample contains real hits
    if (i % 4 === 0 && entries[i % nEntries]) {
      const src = entries[(i * 7) % nEntries]!.names[0]!.split(' ');
      const mod = i % 16;
      if (mod === 0) [p.firstName, p.lastName] = [src[0]!, src.slice(1).join(' ') || src[0]!];
      if (mod === 4) [p.firstName, p.lastName] = [src.slice(1).join(' ') || 'A', src[0]!];
      if (mod === 8)
        [p.firstName, p.lastName] = [src[0]!.replace(/a/, 'e'), src.slice(1).join(' ') || src[0]!];
      if (mod === 12) [p.firstName, p.lastName] = ['', src.join(' ')];
    }
    return p;
  });
  return { persons, entries };
}

describe('screening performance and pre-filter', () => {
  const ms = [mandate()];

  it(
    'gives the same hits with and without the pre-filter (200 x 2000)',
    { timeout: 120_000 },
    () => {
      const { persons, entries } = synthetic(200, 2000, 42);
      const idx = list(entries);
      const fast = screenAll(persons, ms, idx, th);
      const slow = screenAll(persons, ms, idx, th, { bruteForce: true });
      expect(fast.hits.length).toBeGreaterThan(20);
      expect(fast).toEqual(slow);
    },
  );

  it('also agrees with other thresholds', { timeout: 120_000 }, () => {
    const { persons, entries } = synthetic(100, 1000, 7);
    const idx = list(entries);
    for (const t of [
      { possible: 0, strong: 0.5 },
      { possible: 0.7, strong: 0.8 },
      { possible: 0.95, strong: 0.97 },
    ]) {
      expect(screenAll(persons, ms, idx, t)).toEqual(
        screenAll(persons, ms, idx, t, { bruteForce: true }),
      );
    }
  });

  it('agrees with classifyEntry run entry by entry', () => {
    const { persons, entries } = synthetic(40, 300, 3);
    const idx = list(entries);
    const expected = persons.flatMap((p) =>
      entries.flatMap((e) => {
        const m = classifyEntry(`${p.firstName} ${p.lastName}`, p.birth, e, th);
        return m.klasse === 'gruen'
          ? []
          : [`${p.id}/${e.id}/${m.klasse}/${m.besterName}/${m.aehnlichkeit}`];
      }),
    );
    const got = screenAll(persons, ms, idx, th).hits.map(
      (h) => `${h.personId}/${h.entryId}/${h.klasse}/${h.besterName}/${h.aehnlichkeit}`,
    );
    expect(got.sort()).toEqual(expected.sort());
  });

  it('screens 1 000 persons against 20 000 entries well inside the limit', () => {
    const { persons, entries } = synthetic(1000, 20000, 1);
    const idx = list(entries);
    const t0 = performance.now();
    const { hits, unscreenable } = screenAll(persons, ms, idx, th);
    const ms1 = performance.now() - t0; // about 7 s on the dev machine (limit here is generous: 30 s)
    expect(unscreenable).toHaveLength(0);
    expect(hits.length).toBeGreaterThan(0);
    expect(ms1).toBeLessThan(30_000);
  }, 120_000);
});
