import {
  classifyEntry,
  companySimilarity,
  LEGAL_FORM_WORDS,
  nameSimilarity,
  normalizeName,
  screenMandates,
  type ListEntry,
  type ListIndex,
} from '../src/logic/index.ts';
import { stripLegalWords } from '../src/logic/sanctions/legal-words.ts';
import { mandate, rules } from './helpers.ts';

const th = rules.sanctionThresholds;
const entry = (names: string[], over: Partial<ListEntry> = {}): ListEntry => ({
  id: 'E1',
  kind: 'sanktion',
  names,
  births: [],
  remark: '',
  ...over,
});
const list = (entries: ListEntry[]): ListIndex => ({
  source: 'test',
  kind: 'sanktion',
  fetchedOn: '2026-11-20',
  entries,
});
const klasse = (client: string, ...names: string[]) =>
  classifyEntry(client, null, entry(names), th, 'company').klasse;

describe('LEGAL_FORM_WORDS', () => {
  it('holds normalized words only, none of the distinguishing ones', () => {
    for (const w of LEGAL_FORM_WORDS) expect(normalizeName(w)).toBe(w);
    for (const w of ['holding', 'holdings', 'group', 'oil', 'bank', 'shipping']) {
      expect(LEGAL_FORM_WORDS).not.toContain(w);
    }
  });
});

describe('stripLegalWords', () => {
  const strip = (n: string) => stripLegalWords(normalizeName(n).split(' ').filter(Boolean));
  it('removes forms and the sequence "GmbH & Co. KG"', () => {
    expect(strip('Muster GmbH & Co. KG')).toEqual(['muster']);
    expect(strip('OOO Rosneft')).toEqual(['rosneft']);
    expect(strip('Muster e.K.')).toEqual(['muster']);
    expect(strip('Muster Oil Company')).toEqual(['muster', 'oil']);
  });
  it('keeps ambiguous words when they would be the only name part', () => {
    expect(strip('AS')).toEqual(['as']);
    expect(strip('Co SE')).toEqual(['co', 'se']);
    expect(strip('Ab GmbH')).toEqual(['ab']);
    expect(strip('Muster AB')).toEqual(['muster']);
    expect(strip('Muster Co')).toEqual(['muster']);
  });
  it('removes everything for legal-form words alone', () => {
    expect(strip('GmbH')).toEqual([]);
    expect(strip('GmbH & Co. KG')).toEqual([]);
  });
});

describe('companySimilarity', () => {
  it('the three examples of the audit are yellow now, never red', () => {
    for (const [client, listName] of [
      ['Sovcomflot GmbH', 'Sovcomflot'],
      ['Rosneft', 'Rosneft Oil Company'],
      ['OOO Rosneft', 'Rosneft'],
    ] as const) {
      expect(nameSimilarity(client, listName)).toBeLessThan(th.possible); // was green
      expect(companySimilarity(client, listName)).toBeGreaterThanOrEqual(th.possible);
      expect(klasse(client, listName)).toBe('gelb');
    }
  });
  it('the single-word rule never reaches strong', () => {
    expect(companySimilarity('Rosneft', 'Rosneft Oil Company')).toBe(th.possible);
    expect(companySimilarity('Rosneft', 'Rosneft Oil Company')).toBeLessThan(th.strong);
    // no boost when possible is not below strong
    expect(
      companySimilarity('Rosneft', 'Rosneft Oil Company', { possible: 0.9, strong: 0.9 }),
    ).toBeLessThan(0.9);
  });
  it('"Müller GmbH" against "Hans Müller" is yellow: one remaining word of 6+ letters occurs in the other name', () => {
    expect(nameSimilarity('Müller GmbH', 'Hans Müller')).toBeLessThan(th.possible);
    expect(klasse('Müller GmbH', 'Hans Müller')).toBe('gelb');
    expect(companySimilarity('Müller GmbH', 'Hans Müller')).toBe(th.possible);
  });
  it('a single word under 6 letters triggers nothing', () => {
    expect(klasse('Wang GmbH', 'Wang Wei Trading')).toBe('gruen');
    expect(klasse('Putin GmbH', 'Vladimir Putin')).toBe('gruen'); // 5 letters
    expect(klasse('Orlov Ltd', 'Orlov Maxim')).toBe('gruen');
  });
  it('the single word must occur as a whole word', () => {
    expect(klasse('Rosneft GmbH', 'Rosneftegaz Holding')).toBe('gruen');
  });
  it('industry words are not removed', () => {
    // 'bank' stays: only the single-word rule lifts this to yellow, the similarity is not 1
    expect(companySimilarity('Muster Bank', 'Muster')).toBe(th.possible);
    expect(klasse('Alpha Bank AG', 'Alpha Shipping')).toBe('gruen');
  });
  it('legal-form words alone are not comparable: no similarity, not green for the client', () => {
    expect(companySimilarity('GmbH', 'GmbH')).toBe(0);
    expect(companySimilarity('Muster GmbH', 'GmbH')).toBe(0);
    expect(classifyEntry('GmbH', null, entry(['GmbH']), th, 'company').klasse).toBe('gelb');
    const r = screenMandates(
      [mandate({ id: '1', name: 'GmbH & Co. KG' }), mandate({ id: '2', name: 'Muster GmbH' })],
      list([entry(['GmbH', 'Limited'])]),
      th,
    );
    expect(r.hits).toEqual([]);
    expect(r.unscreenable).toEqual([{ mandateId: '1', reason: 'bad-id' }]);
  });
  it('screenMandates finds the three examples as yellow hits', () => {
    const idx = list([
      entry(['Sovcomflot'], { id: 'A' }),
      entry(['Rosneft Oil Company'], { id: 'B' }),
      entry(['Rosneft'], { id: 'C' }),
    ]);
    const hits = screenMandates(
      [
        mandate({ id: '1', name: 'Sovcomflot GmbH' }),
        mandate({ id: '2', name: 'Rosneft' }),
        mandate({ id: '3', name: 'OOO Rosneft' }),
      ],
      idx,
      th,
    ).hits;
    const key = (h: { subjectId: string; entryId: string }) => `${h.subjectId}/${h.entryId}`;
    expect(hits.map(key)).toEqual(expect.arrayContaining(['1/A', '2/B', '2/C', '3/B', '3/C']));
    expect(hits.every((h) => h.klasse === 'gelb')).toBe(true);
  });
  it('person behaviour is unchanged', () => {
    expect(classifyEntry('Müller GmbH', null, entry(['Hans Müller']), th).klasse).toBe('gruen');
    expect(classifyEntry('Müller GmbH', null, entry(['Hans Müller']), th, 'person').klasse).toBe(
      'gruen',
    );
    expect(nameSimilarity('Sovcomflot GmbH', 'Sovcomflot')).toBeCloseTo(0.667, 2);
  });
});

describe('pre-filter in the company mode', () => {
  function rng(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }
  const SYL = [
    'ro',
    'sne',
    'ft',
    'sov',
    'com',
    'flot',
    'al',
    'pha',
    'mu',
    'ster',
    'nor',
    'dex',
    'ka',
  ];
  const EXTRA = ['oil', 'bank', 'trading', 'holding', ...LEGAL_FORM_WORDS.slice(0, 20)];
  function companyName(r: () => number): string {
    const parts = Array.from({ length: 1 + Math.floor(r() * 2) }, () =>
      Array.from({ length: 2 + Math.floor(r() * 2) }, () => SYL[Math.floor(r() * SYL.length)]).join(
        '',
      ),
    );
    const n = Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const w = EXTRA[Math.floor(r() * EXTRA.length)] as string;
      if (r() < 0.5) parts.push(w);
      else parts.unshift(w);
    }
    return parts.join(' ');
  }

  it(
    'gives the same hits with and without the pre-filter (200 x 2000, legal words mixed in)',
    {
      timeout: 120_000,
    },
    () => {
      const r = rng(11);
      const entries: ListEntry[] = Array.from({ length: 2000 }, (_, i) => ({
        id: `E${i}`,
        kind: 'sanktion',
        names: Array.from({ length: 1 + Math.floor(r() * 2) }, () => companyName(r)),
        births: [],
        remark: '',
      }));
      const ms = Array.from({ length: 200 }, (_, i) => {
        const planted =
          i % 3 === 0 ? (entries[(i * 13) % 2000]?.names[0] as string) : companyName(r);
        const parts = planted.split(' ');
        const name = i % 6 === 0 ? `${parts[0]} GmbH` : i % 6 === 3 ? `OOO ${parts[0]}` : planted;
        return mandate({ id: `M${i}`, name });
      });
      const idx = list(entries);
      const fast = screenMandates(ms, idx, th);
      const slow = screenMandates(ms, idx, th, { bruteForce: true });
      expect(fast.hits.length).toBeGreaterThan(30);
      expect(fast).toEqual(slow);
      for (const t of [
        { possible: 0.7, strong: 0.8 },
        { possible: 0.95, strong: 0.97 },
      ]) {
        expect(screenMandates(ms, list(entries.slice(0, 400)), t)).toEqual(
          screenMandates(ms, list(entries.slice(0, 400)), t, { bruteForce: true }),
        );
      }
    },
  );
});
