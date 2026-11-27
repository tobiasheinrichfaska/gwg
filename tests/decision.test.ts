import {
  buildTasks,
  checkDecision,
  confirmedHits,
  DEFAULT_RULES,
  emptyPep,
  entrySnapshot,
  mandateSnapshot,
  openHits,
  parseBackup,
  personSnapshot,
  screenAll,
  screenMandates,
  serializeBackup,
  type Backup,
  type ListEntry,
  type ListIndex,
  type Person,
  type ScreeningDecision,
} from '../src/logic/index.ts';
import { mandate, rules } from './helpers.ts';

const th = rules.sanctionThresholds;
const TODAY = '2026-11-27';
const entry = (over: Partial<ListEntry> = {}): ListEntry => ({
  id: 'E1',
  kind: 'sanktion',
  names: ['Ivan Petrov'],
  births: ['1970'],
  remark: '',
  ...over,
});
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
const index = (entries: ListEntry[]): ListIndex => ({
  source: 't',
  kind: 'sanktion',
  fetchedOn: '2026-11-20',
  entries,
});
const ms = [mandate()];
const decisionFor = (
  p: Person,
  e: ListEntry,
  over: Partial<ScreeningDecision> = {},
): ScreeningDecision => ({
  subjectKind: 'person',
  subjectId: p.id,
  entryId: e.id,
  listKind: e.kind,
  listFetchedOn: '2026-11-20',
  decision: 'kein-treffer',
  reason: 'Anderes Geburtsdatum laut Ausweis',
  decidedOn: TODAY,
  decidedBy: 'A. Beispiel',
  subjectSnapshot: personSnapshot(p),
  entrySnapshot: entrySnapshot(e),
  actionNote: '',
  ...over,
});
const hitsOf = (ps: Person[], es: ListEntry[]) => screenAll(ps, ms, index(es), th).hits;

describe('checkDecision', () => {
  const p = person();
  const e = entry();
  const ok = (d: ScreeningDecision) => checkDecision(d, [p], ms);
  it('accepts a complete decision, multi-line reason', () => {
    expect(ok(decisionFor(p, e)).ok).toBe(true);
    expect(ok(decisionFor(p, e, { reason: 'Zeile 1\nZeile 2' })).ok).toBe(true);
  });
  it('requires a reason, also for kein-treffer', () => {
    for (const reason of ['', '  ', 'x'.repeat(501), 'a\tb', 'a\u0000b']) {
      const r = ok(decisionFor(p, e, { reason }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('bad-decision');
    }
    expect(ok(decisionFor(p, e, { reason: 'x'.repeat(500) })).ok).toBe(true);
  });
  it('requires a one-line name up to 100 characters', () => {
    for (const decidedBy of ['', ' ', 'x'.repeat(101), 'a\nb']) {
      expect(ok(decisionFor(p, e, { decidedBy }))).toMatchObject({ reason: 'bad-decision' });
    }
  });
  it('rejects bad dates, unknown kinds, action note on kein-treffer', () => {
    expect(ok(decisionFor(p, e, { decidedOn: '2026-02-30' }))).toMatchObject({
      reason: 'bad-date',
    });
    expect(ok(decisionFor(p, e, { listFetchedOn: 'x' }))).toMatchObject({ reason: 'bad-date' });
    expect(ok(decisionFor(p, e, { decision: 'x' as ScreeningDecision['decision'] }))).toMatchObject(
      { reason: 'bad-decision' },
    );
    expect(ok(decisionFor(p, e, { actionNote: 'erledigt' }))).toMatchObject({
      reason: 'bad-decision',
    });
    expect(
      ok(decisionFor(p, e, { decision: 'treffer-bestaetigt', actionNote: 'erledigt' })).ok,
    ).toBe(true);
  });
  it('requires the subject to exist', () => {
    expect(ok(decisionFor(p, e, { subjectId: 'nope' }))).toMatchObject({
      reason: 'unknown-mandate',
    });
    const m = decisionFor(p, e, { subjectKind: 'mandate', subjectId: '10001' });
    expect(ok(m).ok).toBe(true);
    expect(ok({ ...m, subjectId: '99999' })).toMatchObject({ reason: 'unknown-mandate' });
  });
});

describe('screenMandates', () => {
  it('compares the mandate name, at most yellow, active mandates only', () => {
    const mm = [
      mandate({ id: '1', name: 'Ivan Petrov' }),
      mandate({ id: '2', name: 'Ivan Petrov', active: false, endedOn: '2026-01-01' }),
      mandate({ id: '3', name: 'Muster GmbH' }),
    ];
    const { hits, unscreenable } = screenMandates(
      mm,
      index([entry({ births: ['1970-05-12'] })]),
      th,
    );
    expect(unscreenable).toEqual([]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      subjectKind: 'mandate',
      subjectId: '1',
      mandateId: '1',
      klasse: 'gelb',
    });
  });
  it('reports a name that normalizes to nothing', () => {
    const r = screenMandates([mandate({ name: '--' })], index([entry()]), th);
    expect(r.hits).toEqual([]);
    expect(r.unscreenable).toEqual([{ mandateId: '10001', reason: 'bad-id' }]);
  });
});

describe('openHits / confirmedHits', () => {
  const p = person();
  const e = entry();
  it('a hit without a decision is open', () => {
    const hits = hitsOf([p], [e]);
    expect(hits).toHaveLength(1);
    expect(openHits(hits, [], [p], ms)).toEqual(hits);
  });
  it('a valid decision closes the hit; a new list state with the same entry keeps it', () => {
    const d = decisionFor(p, e);
    const hits = hitsOf([p], [e]);
    expect(openHits(hits, [d], [p], ms)).toEqual([]);
    const later = hitsOf([p], [entry({ remark: 'neuer Stand', births: ['1970'] })]);
    expect(openHits(later, [d], [p], ms)).toEqual([]);
  });
  it('a different list kind does not match', () => {
    const hits = hitsOf([p], [e]);
    expect(openHits(hits, [decisionFor(p, e, { listKind: 'pep' })], [p], ms)).toEqual(hits);
  });
  it('voids when the name or birth of the person changes', () => {
    const d = decisionFor(p, e);
    for (const changed of [person({ firstName: 'Iwan' }), person({ birth: '1970-05-13' })]) {
      const hits = hitsOf([changed], [e]);
      expect(openHits(hits, [d], [changed], ms)).toEqual(hits);
    }
  });
  it('voids when the mandate name changes (mandate subject)', () => {
    const m = mandate({ id: '1', name: 'Ivan Petrov' });
    const d: ScreeningDecision = {
      ...decisionFor(p, e),
      subjectKind: 'mandate',
      subjectId: '1',
      subjectSnapshot: mandateSnapshot(m),
    };
    const hits = screenMandates([m], index([e]), th).hits;
    expect(openHits(hits, [d], [], [m])).toEqual([]);
    const m2 = mandate({ id: '1', name: 'Ivan Petrow' });
    const hits2 = screenMandates([m2], index([e]), th).hits;
    expect(openHits(hits2, [d], [], [m2])).toEqual(hits2);
  });
  it('voids when the entry changes (name or birth)', () => {
    const d = decisionFor(p, e);
    for (const changed of [
      entry({ names: ['Ivan Petrov', 'Iwan P.'] }),
      entry({ births: ['1970', '1971'] }),
    ]) {
      const hits = hitsOf([p], [changed]);
      expect(hits).toHaveLength(1);
      expect(openHits(hits, [d], [p], ms)).toEqual(hits);
    }
  });
  it('entry snapshot ignores order', () => {
    expect(entrySnapshot(entry({ names: ['A B', 'C D'] }))).toBe(
      entrySnapshot(entry({ names: ['C D', 'A B'] })),
    );
  });
  it('confirmed hits are never open but listed by confirmedHits', () => {
    const d = decisionFor(p, e, { decision: 'treffer-bestaetigt', reason: 'Gleiche Person' });
    const hits = hitsOf([p], [e]);
    expect(openHits(hits, [d], [p], ms)).toEqual([]);
    expect(confirmedHits(hits, [d], [p], ms)).toEqual([{ hit: hits[0], decision: d }]);
    expect(confirmedHits(hits, [decisionFor(p, e)], [p], ms)).toEqual([]);
    const changed = person({ birth: null });
    const h2 = hitsOf([changed], [e]);
    expect(confirmedHits(h2, [d], [changed], ms)).toEqual([]);
  });
});

describe('sanction tasks', () => {
  const p = person();
  const e = entry();
  const build = (ps: Person[], es: ListEntry[], ds: ScreeningDecision[]) =>
    buildTasks(ms, ps, TODAY, rules, hitsOf(ps, es), ds).tasks.filter((t) =>
      t.kind.startsWith('sanction'),
    );
  it('one sanction-clear task per open hit with subject and entry', () => {
    const t = build([p], [e, entry({ id: 'E2' })], []);
    expect(t.map((x) => `${x.kind}/${x.subjectKind}/${x.subjectId}/${x.entryId}`)).toEqual([
      'sanction-clear/person/P1/E1',
      'sanction-clear/person/P1/E2',
    ]);
  });
  it('red before yellow; red right after dunning-escalate', () => {
    const red = person({ id: 'P2' });
    const yellow = person({ id: 'P1', birth: null });
    const m = mandate({
      idStatus: 'unvollstaendig',
      lastCheckOn: null,
      firstRequestOn: '2026-10-10',
    });
    const all = buildTasks(
      [m],
      [yellow, red],
      TODAY,
      rules,
      screenAll([yellow, red], [m], index([entry({ births: ['1970-05-12'] })]), th).hits,
      [],
    ).tasks;
    const picked = all
      .filter((t) => t.kind === 'dunning-escalate' || t.kind.startsWith('sanction'))
      .map((t) => `${t.kind}:${t.klasse ?? ''}:${t.subjectId ?? ''}`);
    expect(picked).toEqual([
      'dunning-escalate::',
      'sanction-clear:rot:P2',
      'sanction-clear:gelb:P1',
    ]);
    expect(all[1]?.kind).toBe('sanction-clear');
  });
  it('a decided "kein-treffer" removes the task; confirmed stays until the action is noted', () => {
    expect(build([p], [e], [decisionFor(p, e)])).toEqual([]);
    const conf = decisionFor(p, e, { decision: 'treffer-bestaetigt', reason: 'Gleiche Person' });
    expect(build([p], [e], [conf]).map((t) => t.kind)).toEqual(['sanction-confirmed']);
    expect(build([p], [e], [{ ...conf, actionNote: 'Meldung am 27.11. abgegeben' }])).toEqual([]);
  });
  it('no tasks for inactive mandates', () => {
    const inactive = mandate({ active: false, endedOn: '2020-01-01' });
    const t = buildTasks([inactive], [p], TODAY, rules, hitsOf([p], [e]), []).tasks;
    expect(t.some((x) => x.kind.startsWith('sanction'))).toBe(false);
  });
});

describe('backup with decisions', () => {
  const p = person();
  const e = entry();
  const base = (): Backup => ({
    format: 'gwg-backup',
    version: 2,
    createdOn: TODAY,
    rules: DEFAULT_RULES,
    mandates: ms,
    persons: [p],
    auditClosings: [],
    screeningDecisions: [
      decisionFor(p, e, { decision: 'treffer-bestaetigt', actionNote: 'Meldung erfolgt' }),
      decisionFor(p, entry({ id: 'E0' })),
    ],
    lastScreening: {
      sanktion: { ranOn: TODAY, listKind: 'sanktion', listFetchedOn: '2026-11-20', hitCount: 2 },
      pep: null,
    },
  });
  const obj = (b = base()) => JSON.parse(serializeBackup(b));
  it('round-trips, sorted by subject and entry', () => {
    const text = serializeBackup(base());
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.screeningDecisions.map((d) => d.entryId)).toEqual(['E0', 'E1']);
    expect(serializeBackup(r.value)).toBe(text);
    expect(r.value.lastScreening).toEqual(base().lastScreening);
  });
  it('a version 2 file without the new keys reads as empty', () => {
    const o = obj();
    delete o.screeningDecisions;
    delete o.lastScreening;
    const r = parseBackup(JSON.stringify(o));
    expect(r.ok && r.value.screeningDecisions).toEqual([]);
    expect(r.ok && r.value.lastScreening).toEqual({ sanktion: null, pep: null });
  });
  it('a version 1 file migrates with empty decisions', () => {
    const o = obj();
    const v1 = {
      format: o.format,
      version: 1,
      createdOn: o.createdOn,
      rules: o.rules,
      mandates: o.mandates,
    };
    const r = parseBackup(JSON.stringify(v1));
    expect(r.ok && r.value.screeningDecisions).toEqual([]);
    expect(r.ok && r.value.lastScreening).toEqual({ sanktion: null, pep: null });
  });
  it('is strict: unknown key, bad decision, unknown subject, duplicate, bad run', () => {
    const fails = (o: unknown, reason: string, where?: string) => {
      const r = parseBackup(JSON.stringify(o));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe(reason);
        if (where) expect(r.where).toBe(where);
      }
    };
    let o = obj();
    o.screeningDecisions[0].extra = 1;
    fails(o, 'bad-backup', 'screeningDecisions[0].extra');
    o = obj();
    o.screeningDecisions[1].reason = '';
    fails(o, 'bad-decision', 'screeningDecisions[1]');
    o = obj();
    o.screeningDecisions[0].subjectId = 'zzz';
    fails(o, 'unknown-mandate', 'screeningDecisions[0]');
    o = obj();
    o.screeningDecisions[0].entryId = 'E1';
    fails(o, 'duplicate-id', 'screeningDecisions[1]');
    o = obj();
    o.lastScreening.sanktion.hitCount = -1;
    fails(o, 'bad-decision', 'lastScreening.sanktion');
    o = obj();
    o.lastScreening.pep = { ...o.lastScreening.sanktion };
    fails(o, 'bad-decision', 'lastScreening.pep');
    o = obj();
    o.lastScreening.sanktion.ranOn = '2026-13-01';
    fails(o, 'bad-date', 'lastScreening.sanktion');
  });
});
