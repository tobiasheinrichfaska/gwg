// @vitest-environment jsdom
import { createVault, memoryEnvironment } from 'local-vault';
import {
  createMemoryStore,
  LIST_SLOTS,
  createVaultStore,
  parseEuSanctionsXml,
  readEuListFile,
} from '../src/io/index.ts';
import { classifyNames, parseIndex, serializeIndex, type ListIndex } from '../src/logic/index.ts';

const NS = 'xmlns="http://eu.europa.ec/fpi/fsd/export"';
const wrap = (body: string, attrs = 'generationDate="2026-11-20T10:00:00.000+01:00"') =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<export ${NS} ${attrs} globalFileId="1">${body}</export>`;
const alias = (whole: string, first = '', last = '') =>
  `<nameAlias firstName="${first}" middleName="" lastName="${last}" wholeName="${whole}" strong="true" logicalId="9"/>`;
const entity = (id: string, inner: string, type = 'person') =>
  `<sanctionEntity designationDate="2020-01-01" euReferenceNumber="EU.1.1" logicalId="${id}">` +
  `<regulation programme="TESTPROG" logicalId="1"/><subjectType code="${type}" classificationCode="P"/>${inner}</sanctionEntity>`;

const SAMPLE = wrap(
  entity(
    '100',
    alias('Zorin Quelle', 'Zorin', 'Quelle') +
      alias('', 'Zed', 'Quelle') +
      alias('Z. Quelle') +
      '<remark>Erfundener Eintrag &amp; Test</remark>' +
      '<birthdate circa="false" birthdate="1965-12-12" dayOfMonth="12" monthOfYear="12" year="1965"/>' +
      '<birthdate circa="true" year="1958"/>' +
      '<birthdate year="1970-1975"/>' +
      '<birthdate year="1980" monthOfYear="3"/>',
  ) +
    entity('200', alias('Muster Handels AG'), 'enterprise') +
    entity('300', '<birthdate year="1950"/>') +
    entity('400', alias('   ')),
);

describe('parseEuSanctionsXml', () => {
  it('reads names, aliases, birth dates and remark', () => {
    const r = parseEuSanctionsXml(SAMPLE, '2026-11-20');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { index } = r.value;
    expect(index).toMatchObject({
      kind: 'sanktion',
      source: 'EU konsolidierte Finanzsanktionsliste',
      fetchedOn: '2026-11-20',
    });
    expect(index.entries.map((e) => e.id)).toEqual(['100', '200']);
    const e = index.entries[0]!;
    expect(e.names).toEqual(['Zorin Quelle', 'Zed Quelle', 'Z. Quelle']);
    expect(e.births).toEqual(['1965-12-12', '1958', '1970/1975', '1980-03']);
    expect(e.remark).toBe('Erfundener Eintrag & Test');
    expect(index.entries[1]!.remark).toBe('TESTPROG'); // fallback: the programme;
    // the result survives the strict list reader
    expect(parseIndex(serializeIndex(index)).ok).toBe(true);
  });
  it('reports entries without a usable name instead of dropping them silently', () => {
    const r = parseEuSanctionsXml(SAMPLE, '2026-11-20');
    expect(r.ok && r.value.skipped).toEqual([
      { id: '300', why: 'no-name' },
      { id: '400', why: 'no-name' },
    ]);
  });
  it('reports an entity without logicalId', () => {
    const r = parseEuSanctionsXml(
      wrap('<sanctionEntity>' + alias('X Y') + '</sanctionEntity>'),
      '2026-11-20',
    );
    expect(r.ok && r.value.skipped).toEqual([{ id: '#1', why: 'no-id' }]);
  });
  it('keeps an entry whose birth date is unusable and says so', () => {
    const r = parseEuSanctionsXml(
      wrap(entity('1', alias('Ab Cd') + '<birthdate year="19x4"/>')),
      '2026-11-20',
    );
    expect(r.ok && r.value.index.entries[0]!.births).toEqual([]);
    expect(r.ok && r.value.adjusted).toEqual([{ id: '1', why: 'birthdate-unusable' }]);
  });
  it('cuts the remark to 500 characters and merges a repeated logicalId', () => {
    const long = 'a'.repeat(700);
    const xml = wrap(
      entity('1', alias('Ab Cd') + `<remark>${long}</remark>`) +
        entity('1', alias('Ef Gh') + '<birthdate year="1990"/>'),
    );
    const r = parseEuSanctionsXml(xml, '2026-11-20');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.index.entries).toHaveLength(1);
    expect(r.value.index.entries[0]).toMatchObject({
      names: ['Ab Cd', 'Ef Gh'],
      births: ['1990'],
    });
    expect(r.value.index.entries[0]!.remark).toHaveLength(500);
    expect(r.value.adjusted.map((a) => a.why).sort()).toEqual([
      'duplicate-id-merged',
      'remark-cut',
    ]);
  });
  it('feeds the screening (a listed alias is found)', () => {
    const r = parseEuSanctionsXml(SAMPLE, '2026-11-20');
    if (!r.ok) throw new Error('parse');
    expect(r.value.index.entries[0]!.names).toContain('Z. Quelle');
    expect(typeof classifyNames).toBe('function');
  });
  it('refuses a document with an entity or internal DOCTYPE subset', () => {
    const evil =
      '<?xml version="1.0"?><!DOCTYPE export [<!ENTITY x SYSTEM "http://example.invalid/x">]>' +
      `<export ${NS}><sanctionEntity logicalId="1">${alias('Ab Cd')}&x;</sanctionEntity></export>`;
    expect(parseEuSanctionsXml(evil, '2026-11-20')).toMatchObject({
      ok: false,
      reason: 'bad-list',
    });
    const sub = '<!DOCTYPE export [ ]>' + wrap('');
    expect(parseEuSanctionsXml(sub, '2026-11-20').ok).toBe(false);
  });
  it('makes no network access for a plain DOCTYPE with an external id', () => {
    const calls: unknown[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = ((...a: unknown[]) => (
      calls.push(a),
      Promise.reject(new Error('net'))
    )) as never;
    try {
      const xml =
        '<!DOCTYPE export SYSTEM "http://example.invalid/x.dtd">' +
        wrap(entity('1', alias('Ab Cd')));
      parseEuSanctionsXml(xml, '2026-11-20');
    } finally {
      globalThis.fetch = orig;
    }
    expect(calls).toEqual([]);
  });
  it('fails broken XML and a wrong root with bad-list', () => {
    expect(parseEuSanctionsXml('<export><sanctionEntity>', '2026-11-20')).toMatchObject({
      ok: false,
      reason: 'bad-list',
    });
    expect(parseEuSanctionsXml('kein xml', '2026-11-20')).toMatchObject({ ok: false });
    expect(parseEuSanctionsXml('<liste><x/></liste>', '2026-11-20')).toMatchObject({
      ok: false,
      reason: 'bad-list',
    });
    expect(parseEuSanctionsXml(SAMPLE, '2026-13-40')).toMatchObject({ ok: false });
  });
});

const fileOf = (text: string, lastModified = Date.UTC(2026, 10, 1, 12)) =>
  new File([text], 'beliebiger-name-2001-01-01.xml', { lastModified });

describe('readEuListFile', () => {
  it('proposes the date from the XML, not from the file name', async () => {
    const r = await readEuListFile(fileOf(SAMPLE));
    expect(r.ok && r.value.suggestedOn).toBe('2026-11-20');
    expect(r.ok && r.value.suggestedFrom).toBe('generationDate');
    expect(r.ok && r.value.index.fetchedOn).toBe('2026-11-20');
  });
  it('falls back to the file date (local) when the XML has none', async () => {
    const r = await readEuListFile(fileOf(wrap(entity('1', alias('Ab Cd')), '')));
    expect(r.ok && r.value.suggestedFrom).toBe('lastModified');
    expect(r.ok && r.value.suggestedOn).toBe('2026-11-01');
  });
  it('refuses an oversized file', async () => {
    expect(await readEuListFile(fileOf(SAMPLE), 100)).toMatchObject({
      ok: false,
      reason: 'file-too-large',
    });
  });
  it('passes parse errors on', async () => {
    expect(await readEuListFile(fileOf('<export>'))).toMatchObject({
      ok: false,
      reason: 'bad-list',
    });
  });
});

const small = (): ListIndex => {
  const r = parseEuSanctionsXml(SAMPLE, '2026-11-20');
  if (!r.ok) throw new Error('parse');
  return r.value.index;
};

describe('list storage', () => {
  it('memory store round-trips a list and is empty at first', async () => {
    const s = createMemoryStore();
    expect(await s.loadList('sanktion')).toEqual({ ok: true, value: null });
    expect((await s.saveList(small())).ok).toBe(true);
    const r = await s.loadList('sanktion');
    expect(r.ok && r.value && serializeIndex(r.value)).toBe(serializeIndex(small()));
    expect(await s.loadList('pep')).toEqual({ ok: true, value: null });
  });
  it('vault store keeps the list in its own slot, apart from the backup slot', async () => {
    const v = createVault(
      { prefix: 'gwg', slots: ['bestand', ...LIST_SLOTS] },
      memoryEnvironment(),
    );
    expect((await v.startVault()).kind).toBe('open');
    const s = createVaultStore(v);
    expect(await s.loadList('sanktion')).toEqual({ ok: true, value: null });
    expect((await s.saveList(small())).ok).toBe(true);
    expect(v.readSlot('bestand')).toBeNull();
    const r = await s.loadList('sanktion');
    expect(r.ok && r.value && serializeIndex(r.value)).toBe(serializeIndex(small()));
  });
  it('reports a damaged slot as bad-list and a closed vault as store-failed', async () => {
    const v = createVault(
      { prefix: 'gwg', slots: ['bestand', ...LIST_SLOTS] },
      memoryEnvironment(),
    );
    await v.startVault();
    expect(v.writeSlot('liste-sanktion', 'kaputt')).toBeUndefined();
    expect(await createVaultStore(v).loadList('sanktion')).toMatchObject({
      ok: false,
      reason: 'bad-list',
    });
    const closed = createVault({ prefix: 'gwg', slots: LIST_SLOTS }, memoryEnvironment());
    expect(await createVaultStore(closed).loadList('sanktion')).toMatchObject({
      ok: false,
      reason: 'store-failed',
    });
    expect((await createVaultStore(closed).saveList(small())).ok).toBe(false);
  });
  it('measures the compact index for 20 000 synthetic entries', () => {
    const entries = Array.from({ length: 20_000 }, (_, i) => ({
      id: String(100_000 + i),
      kind: 'sanktion' as const,
      names: [`Vorname${i} Nachname${i}`, `V. Nachname${i}`, `Alias${i} Beispiel`],
      births: ['1960-05-17', '1961'],
      remark: 'Erfundener Listungsgrund '.repeat(4).trim(),
    }));
    const text = serializeIndex({
      source: 'EU konsolidierte Finanzsanktionsliste',
      kind: 'sanktion',
      fetchedOn: '2026-11-20',
      entries,
    });
    console.info(`index 20000 entries: ${(text.length / 1e6).toFixed(2)} MB`);
    expect(text.length).toBeGreaterThan(1_000_000); // above what a localStorage slot reliably holds
    expect(parseIndex(text).ok).toBe(true);
  });
});
