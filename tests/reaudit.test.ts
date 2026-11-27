// @vitest-environment jsdom
// Re-audit T8d (task T10): findings M1, M2, N2, N5 at logic/io level.
import { downloadBackup, downloadText, fetchSanctionsList } from '../src/io/index.ts';
import {
  buildTasks,
  checkBackup,
  checkDecision,
  closingBlockers,
  DEFAULT_RULES,
  emptyLastScreening,
  emptyPep,
  entrySnapshot,
  isListStale,
  mandateSnapshot,
  parseBackup,
  parseBackupWithNotes,
  personSnapshot,
  serializeBackup,
  type Backup,
  type ListIndex,
  type Person,
  type ScreeningDecision,
} from '../src/logic/index.ts';
import { mandate, rules } from './helpers.ts';

const person = (over: Partial<Person> = {}): Person => ({
  id: 'P1',
  mandateId: '10001',
  role: 'inhaber',
  lastName: 'Petrov',
  firstName: 'Ivan',
  birth: '1970-05-12',
  pep: emptyPep(),
  ...over,
});

describe('M1: unscreenable subjects block the closing and make tasks', () => {
  const TODAY = '2026-11-26';
  const dash = person({ id: 'P9', lastName: '-', firstName: '' });
  const gmbh = mandate({ id: '10002', name: 'GmbH & Co. KG', lastCheckOn: '2026-11-01' });
  const ok = mandate({ lastCheckOn: '2026-11-01' });
  const list = buildTasks([ok, gmbh], [person(), dash], TODAY, rules, [], []);

  it('creates one task per unscreenable person and mandate', () => {
    const t = list.tasks.filter((x) => x.kind === 'sanction-unscreenable');
    expect(t.map((x) => [x.subjectKind, x.subjectId]).sort()).toEqual([
      ['mandate', '10002'],
      ['person', 'P9'],
    ]);
  });
  it('closingBlockers reports the count', () => {
    const c = closingBlockers({
      tasks: list.tasks,
      hits: [],
      decisions: [],
      persons: [person(), dash],
      mandates: [ok, gmbh],
      screening: { hasList: true, stale: false, ranOn: TODAY },
    });
    expect(c.blockers).toContainEqual({ kind: 'unscreenable', count: 2 });
  });
});

describe('M2: a list state in the future', () => {
  const idx = (fetchedOn: ListIndex['fetchedOn']): ListIndex => ({
    source: 's',
    kind: 'sanktion',
    fetchedOn,
    entries: [],
  });
  it('isListStale treats a negative age as stale', () => {
    expect(isListStale(idx('2027-01-01'), '2026-11-27', 7)).toBe(true);
  });
  it('fetchList rejects a state after today as relay-bad-response', async () => {
    const xml =
      `<?xml version="1.0"?><export xmlns="http://eu.europa.ec/fpi/fsd/export" generationDate="2027-05-01T10:00:00.000+01:00">` +
      `<sanctionEntity logicalId="1"><nameAlias wholeName="Zorin Quelle"/></sanctionEntity></export>`;
    const r = await fetchSanctionsList({
      relayUrl: 'https://relay.example/app',
      today: '2026-11-27',
      fetchFn: () =>
        Promise.resolve(new Response(xml, { headers: { 'Content-Type': 'application/xml' } })),
    });
    expect(r).toMatchObject({ ok: false, reason: 'relay-bad-response' });
  });
});

describe('N2: snapshots are short hashes', () => {
  const long = person({ firstName: 'ß'.repeat(200), lastName: 'Ä'.repeat(200) });
  const m = mandate();
  const dec = (p: Person): ScreeningDecision => ({
    subjectKind: 'person',
    subjectId: p.id,
    entryId: 'E1',
    listKind: 'sanktion',
    listFetchedOn: '2026-11-20',
    decision: 'kein-treffer',
    reason: 'andere Person',
    decidedOn: '2026-11-27',
    decidedBy: 'A',
    subjectSnapshot: personSnapshot(p),
    entrySnapshot: entrySnapshot({ names: ['ß'.repeat(200)], births: [] }),
    actionNote: '',
  });
  it('a decision on a person with a very long name is accepted', () => {
    expect(checkDecision(dec(long), [long], [m]).ok).toBe(true);
  });
  it('snapshots are stable, at most 32 characters, and differ per input', () => {
    expect(personSnapshot(long)).toBe(personSnapshot({ ...long }));
    expect(personSnapshot(long).length).toBeLessThanOrEqual(32);
    expect(mandateSnapshot(mandate({ name: 'ß'.repeat(200) })).length).toBeLessThanOrEqual(32);
    expect(personSnapshot(person())).not.toBe(personSnapshot(person({ birth: '1970-05-13' })));
  });
  it('parseBackup refuses a format 3 file with a long snapshot, with a clear place', () => {
    const p = person();
    const b: Backup = {
      format: 'gwg-backup',
      version: 3,
      createdOn: '2026-11-27',
      rules: DEFAULT_RULES,
      mandates: [m],
      persons: [p],
      auditClosings: [],
      screeningDecisions: [{ ...dec(p), subjectSnapshot: 'x'.repeat(100) }],
      lastScreening: emptyLastScreening(),
    };
    expect(checkBackup(b).ok).toBe(false);
    const r = parseBackup(serializeBackup(b));
    expect(r).toMatchObject({ ok: false, reason: 'bad-decision' });
  });
});

describe('F1 (T11): old formats with old decisions migrate to format 3', () => {
  const m = mandate();
  const p = person();
  const oldDecision = {
    subjectKind: 'person',
    subjectId: p.id,
    entryId: 'E1',
    listKind: 'sanktion',
    listFetchedOn: '2026-11-20',
    decision: 'kein-treffer',
    reason: 'andere Person',
    decidedOn: '2026-11-27',
    decidedBy: 'A',
    subjectSnapshot: 'ivan petrov|1970-05-12'.padEnd(300, 'x'),
    entrySnapshot: '4503599627370495',
    actionNote: '',
  };
  const current = (): Backup => ({
    format: 'gwg-backup',
    version: 3,
    createdOn: '2026-11-27',
    rules: DEFAULT_RULES,
    mandates: [m],
    persons: [p],
    auditClosings: [],
    screeningDecisions: [],
    lastScreening: emptyLastScreening(),
  });
  const asV2 = (decisions: unknown[]) => ({
    ...JSON.parse(serializeBackup(current())),
    version: 2,
    screeningDecisions: decisions,
  });

  it('serializeBackup writes version 3; version 4 is unsupported', () => {
    expect(JSON.parse(serializeBackup(current())).version).toBe(3);
    const o = { ...JSON.parse(serializeBackup(current())), version: 4 };
    expect(parseBackup(JSON.stringify(o))).toMatchObject({
      ok: false,
      reason: 'unsupported-version',
    });
  });
  it('format 2 with old decisions: ok, decisions dropped, note with the count', () => {
    const text = JSON.stringify(asV2([oldDecision, { ...oldDecision, entryId: 'E2' }]));
    const r = parseBackupWithNotes(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.backup.version).toBe(3);
    expect(r.value.backup.screeningDecisions).toEqual([]);
    expect(r.value.backup.persons).toHaveLength(1);
    expect(r.value.notes).toEqual([{ kind: 'decisions-dropped', count: 2 }]);
    expect(parseBackup(text).ok).toBe(true);
  });
  it('format 2 with valid-looking hash decisions is dropped as well', () => {
    const r = parseBackupWithNotes(
      JSON.stringify(
        asV2([
          {
            ...oldDecision,
            subjectSnapshot: '0123456789abcdef',
            entrySnapshot: 'fedcba9876543210',
          },
        ]),
      ),
    );
    expect(r.ok && r.value.notes).toEqual([{ kind: 'decisions-dropped', count: 1 }]);
  });
  it('format 2 without decisions: no note', () => {
    const r = parseBackupWithNotes(JSON.stringify(asV2([])));
    expect(r.ok && r.value.notes).toEqual([]);
  });
  it('format 1 migrates to 3 (no persons, no decisions, no note)', () => {
    const o = JSON.parse(serializeBackup(current()));
    const v1 = {
      format: o.format,
      version: 1,
      createdOn: o.createdOn,
      rules: o.rules,
      mandates: o.mandates,
    };
    const r = parseBackupWithNotes(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.backup.version).toBe(3);
    expect(r.value.backup.persons).toEqual([]);
    expect(r.value.notes).toEqual([]);
  });
  it('format 1 with a stray screeningDecisions key stays strict (unknown key)', () => {
    const o = JSON.parse(serializeBackup(current()));
    const v1 = {
      format: o.format,
      version: 1,
      createdOn: o.createdOn,
      rules: o.rules,
      mandates: o.mandates,
      screeningDecisions: [oldDecision],
    };
    expect(parseBackup(JSON.stringify(v1)).ok).toBe(false);
  });
  it('format 3 round-trips without notes', () => {
    const text = serializeBackup(current());
    const r = parseBackupWithNotes(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.notes).toEqual([]);
    expect(serializeBackup(r.value.backup)).toBe(text);
  });
});

describe('N5: the object URL is revoked later', () => {
  it('revokes only after a delay (both downloads)', () => {
    vi.useFakeTimers();
    try {
      const revoke = vi.fn();
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: revoke });
      downloadBackup('{}', 'a.json');
      downloadText('t', 'a.txt');
      expect(revoke).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(revoke).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('T11 small: the unscreenable blocker disappears after the data is corrected', () => {
  const TODAY = '2026-11-27';
  const m = mandate({ lastCheckOn: '2026-11-01' });
  const blockersFor = (p: Person) => {
    const tasks = buildTasks([m], [p], TODAY, rules, [], []).tasks;
    return closingBlockers({
      tasks,
      hits: [],
      decisions: [],
      persons: [p],
      mandates: [m],
      screening: { hasList: true, stale: false, ranOn: TODAY },
    }).blockers;
  };
  it('blocks with a dash as name, is free after the name was corrected', () => {
    expect(blockersFor(person({ lastName: '-' }))).toContainEqual({
      kind: 'unscreenable',
      count: 1,
    });
    expect(blockersFor(person({ lastName: 'Petrov' })).some((b) => b.kind === 'unscreenable')).toBe(
      false,
    );
  });
});
