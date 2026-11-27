import {
  parseIndex,
  serializeIndex,
  LIST_FORMAT,
  MAX_ENTRIES,
  type ListEntry,
  type ListIndex,
} from '../src/logic/index.ts';

const entry = (over: Partial<ListEntry> = {}): ListEntry => ({
  id: 'EU-1',
  kind: 'sanktion',
  names: ['Ivan Petrov', 'Иван Петров'],
  births: ['1970', '1971-05', '1972-06-07', '1960/1965'],
  remark: 'Vermögenseinfrierung',
  ...over,
});
const index = (over: Partial<ListIndex> = {}): ListIndex => ({
  source: 'EU konsolidierte Liste',
  kind: 'sanktion',
  fetchedOn: '2026-11-20',
  entries: [entry({ id: 'B' }), entry({ id: 'A', births: [] })],
  ...over,
});
const raw = (over: Record<string, unknown> = {}) => ({
  format: LIST_FORMAT,
  version: 1,
  source: 's',
  kind: 'sanktion',
  fetchedOn: '2026-11-20',
  entries: [entry()],
  ...over,
});
const parse = (o: unknown) => parseIndex(JSON.stringify(o));
const failsWith = (o: unknown, reason: string, where?: string) => {
  const r = parse(o);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.reason).toBe(reason);
    if (where !== undefined) expect(r.where).toBe(where);
  }
};

describe('list index format', () => {
  it('round-trips and sorts entries by id', () => {
    const text = serializeIndex(index());
    const back = parseIndex(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.entries.map((e) => e.id)).toEqual(['A', 'B']);
    expect(serializeIndex(back.value)).toBe(text);
    expect(back.value.entries[1]).toEqual(entry({ id: 'B' }));
  });
  it('accepts an empty list and non-Latin names', () => {
    expect(parseIndex(serializeIndex(index({ entries: [] }))).ok).toBe(true);
    const r = parseIndex(serializeIndex(index({ kind: 'pep', entries: [entry({ kind: 'pep' })] })));
    expect(r.ok && r.value.entries[0]?.names[1]).toBe('Иван Петров');
  });
  it('rejects text that is not JSON, not an object, or has a wrong header', () => {
    expect(parseIndex('{nope').ok).toBe(false);
    failsWith([], 'bad-list', 'root');
    failsWith(raw({ format: 'gwg-backup' }), 'bad-list', 'format');
    failsWith(raw({ version: '1' }), 'bad-list', 'version');
    failsWith(raw({ version: 0 }), 'bad-list', 'version');
    failsWith(raw({ version: 1.5 }), 'bad-list', 'version');
  });
  it('reports a newer version as unsupported', () => {
    failsWith(raw({ version: 2 }), 'unsupported-version', 'version');
  });
  it('rejects unknown and missing keys, at the top and in entries', () => {
    failsWith(raw({ extra: 1 }), 'bad-list', 'root.extra');
    const noSource: Record<string, unknown> = raw();
    delete noSource.source;
    failsWith(noSource, 'bad-list', 'root.source');
    failsWith(raw({ entries: [{ ...entry(), extra: 1 }] }), 'bad-list', 'entries[0].extra');
    const noRemark: Record<string, unknown> = { ...entry() };
    delete noRemark.remark;
    failsWith(raw({ entries: [noRemark] }), 'bad-list', 'entries[0].remark');
  });
  it('rejects pollution keys anywhere', () => {
    expect(parseIndex(`{"__proto__":{"x":1},"format":"${LIST_FORMAT}"}`).ok).toBe(false);
    const text = JSON.stringify(raw()).replace('"remark"', '"constructor":1,"remark"');
    expect(parseIndex(text).ok).toBe(false);
  });
  it('rejects wrong types', () => {
    failsWith(raw({ source: 5 }), 'bad-list', 'source');
    failsWith(raw({ source: '' }), 'bad-list', 'source');
    failsWith(raw({ kind: 'andere' }), 'bad-list', 'kind');
    failsWith(raw({ entries: {} }), 'bad-list', 'entries');
    failsWith(raw({ entries: [5] }), 'bad-list', 'entries[0]');
    failsWith(
      raw({ entries: [entry({ id: 7 as unknown as string })] }),
      'bad-list',
      'entries[0].id',
    );
    failsWith(
      raw({ entries: [entry({ names: 'x' as unknown as string[] })] }),
      'bad-list',
      'entries[0].names',
    );
    failsWith(
      raw({ entries: [entry({ names: [5 as unknown as string] })] }),
      'bad-list',
      'entries[0].names[0]',
    );
    failsWith(
      raw({ entries: [entry({ births: [1970 as unknown as string] })] }),
      'bad-list',
      'entries[0].births[0]',
    );
    failsWith(
      raw({ entries: [entry({ remark: null as unknown as string })] }),
      'bad-list',
      'entries[0].remark',
    );
  });
  it('rejects a bad stand date', () => {
    failsWith(raw({ fetchedOn: '2026-02-30' }), 'bad-list', 'fetchedOn');
    failsWith(raw({ fetchedOn: 20261120 }), 'bad-list', 'fetchedOn');
  });
  it('rejects duplicate ids', () => {
    failsWith(raw({ entries: [entry(), entry()] }), 'duplicate-id', 'entries[1].id');
  });
  it('rejects an entry whose kind differs from the list kind', () => {
    failsWith(raw({ entries: [entry({ kind: 'pep' })] }), 'bad-list', 'entries[0].kind');
  });
  it('rejects bad names: none, too many, empty, control characters, nothing comparable', () => {
    failsWith(raw({ entries: [entry({ names: [] })] }), 'bad-list', 'entries[0].names');
    failsWith(
      raw({ entries: [entry({ names: Array.from({ length: 51 }, (_, i) => `N${i}`) })] }),
      'bad-list',
      'entries[0].names',
    );
    expect(
      parse(raw({ entries: [entry({ names: Array.from({ length: 50 }, (_, i) => `N${i}`) })] })).ok,
    ).toBe(true);
    failsWith(raw({ entries: [entry({ names: ['  '] })] }), 'bad-list', 'entries[0].names[0]');
    failsWith(raw({ entries: [entry({ names: ['A\nB'] })] }), 'bad-list', 'entries[0].names[0]');
    failsWith(
      raw({ entries: [entry({ names: ['x'.repeat(201)] })] }),
      'bad-list',
      'entries[0].names[0]',
    );
    failsWith(
      raw({ entries: [entry({ names: ['---', 'Ok'] })] }),
      'bad-list',
      'entries[0].names[0]',
    );
  });
  it('checks every birth date format', () => {
    for (const b of ['1970', '1970-05', '1970-05-31', '1970/1975', '1970/1970']) {
      expect(parse(raw({ entries: [entry({ births: [b] })] })).ok, b).toBe(true);
    }
    for (const b of [
      '',
      '70',
      '1970-13',
      '1970-02-30',
      '1970-5',
      '1975/1970',
      '1970-05/1975',
      '1970/1975/1980',
      '1899',
      '2201',
      '1970/',
      '/1970',
      '1970-05-31T00:00',
    ]) {
      failsWith(raw({ entries: [entry({ births: [b] })] }), 'bad-list', 'entries[0].births[0]');
    }
    failsWith(
      raw({ entries: [entry({ births: Array.from({ length: 51 }, () => '1970') })] }),
      'bad-list',
      'entries[0].births',
    );
  });
  it('limits the remark to 500 characters, no control characters', () => {
    expect(parse(raw({ entries: [entry({ remark: 'x'.repeat(500) })] })).ok).toBe(true);
    failsWith(
      raw({ entries: [entry({ remark: 'x'.repeat(501) })] }),
      'bad-list',
      'entries[0].remark',
    );
    failsWith(raw({ entries: [entry({ remark: 'a\u0000b' })] }), 'bad-list', 'entries[0].remark');
  });
  it('limits the number of entries to 200 000', () => {
    const many = Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => ({
      id: String(i),
      kind: 'sanktion',
      names: ['A'],
      births: [],
      remark: '',
    }));
    failsWith(raw({ entries: many }), 'bad-list', 'entries');
    expect(parse(raw({ entries: many.slice(0, MAX_ENTRIES) })).ok).toBe(true);
  });
});
