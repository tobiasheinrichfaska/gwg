import {
  DEFAULT_RULES,
  parseBackup,
  checkBackup,
  removeMandate,
  removePerson,
  repairOrphanDecisions,
  type ScreeningDecision,
  serializeBackup,
  type AuditClosing,
  type Backup,
  type Person,
  emptyPep,
} from '../src/logic/index.ts';
import { mandate } from './helpers.ts';

const person = (over: Partial<Person> = {}): Person => ({
  id: 'p1',
  mandateId: '10001',
  role: 'geschaeftsfuehrer',
  lastName: 'Muster',
  firstName: 'Max',
  birth: '1970-05-01',
  pep: emptyPep(),
  ...over,
});
const closing = (over: Partial<AuditClosing> = {}): AuditClosing => ({
  stichtag: '2026-11-30',
  closedOn: '2026-12-01',
  by: 'Dr. Beispiel',
  note: '',
  ...over,
});
const base = (): Backup => ({
  format: 'gwg-backup',
  version: 3,
  createdOn: '2026-11-26',
  rules: DEFAULT_RULES,
  mandates: [mandate({ id: '10002', name: 'Zweite GmbH' }), mandate({ id: '10001' })],
  persons: [
    person({ id: 'p3', mandateId: '10002' }),
    person({ id: 'p2' }),
    person({ id: 'p1', birth: null }),
  ],
  auditClosings: [closing({ stichtag: '2026-11-30' }), closing({ stichtag: '2025-11-30' })],
  screeningDecisions: [],
  lastScreening: { sanktion: null, pep: null },
});
const obj = (b: Backup = base()): any => JSON.parse(serializeBackup(b));
const parse = (o: unknown) => parseBackup(JSON.stringify(o));
const fails = (r: ReturnType<typeof parseBackup>, reason: string, where?: string) => {
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.reason).toBe(reason);
  if (where !== undefined) expect(r.where).toBe(where);
};

describe('backup round trip', () => {
  it('serialize then parse gives the same data, mandates sorted by id', () => {
    const b = base();
    const r = parseBackup(serializeBackup(b));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      ...b,
      mandates: [b.mandates[1], b.mandates[0]],
      persons: [b.persons[2], b.persons[1], b.persons[0]],
      auditClosings: [b.auditClosings[1], b.auditClosings[0]],
    });
    expect(serializeBackup(r.value)).toBe(serializeBackup(b));
  });
  it('has a stable key order', () => {
    expect(Object.keys(obj())).toEqual([
      'format',
      'version',
      'createdOn',
      'rules',
      'mandates',
      'persons',
      'auditClosings',
      'screeningDecisions',
      'lastScreening',
    ]);
    expect(obj().version).toBe(3);
    expect(obj().persons.map((p: Person) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(obj().auditClosings.map((c: AuditClosing) => c.stichtag)).toEqual([
      '2025-11-30',
      '2026-11-30',
    ]);
    expect(obj().mandates[0].id).toBe('10001');
  });
  it('accepts an empty mandate list', () => {
    expect(parseBackup(serializeBackup({ ...base(), mandates: [], persons: [] })).ok).toBe(true);
  });
});

describe('backup reader: whole-file errors', () => {
  it.each(['', '   ', '{', 'nope'])('rejects invalid JSON %j', (t) => {
    fails(parseBackup(t), 'bad-backup');
  });
  it.each(['[]', '5', '"x"', 'null', 'true'])('rejects non-object %s', (t) => {
    fails(parseBackup(t), 'bad-backup', 'root');
  });
  it('rejects a wrong format marker', () => {
    fails(parse({ ...obj(), format: 'other' }), 'bad-backup', 'format');
  });
  it('rejects version 4 as unsupported', () => {
    fails(parse({ ...obj(), version: 4 }), 'unsupported-version');
  });
  it.each([0, 1.5, '1', null])('rejects bad version %j', (v) => {
    fails(parse({ ...obj(), version: v }), 'bad-backup', 'version');
  });
  it('rejects unknown root key', () => {
    fails(parse({ ...obj(), extra: 1 }), 'bad-backup', 'root.extra');
  });
  it('rejects missing root key', () => {
    const o = obj();
    delete o.mandates;
    fails(parse(o), 'bad-backup', 'root.mandates');
  });
  it('rejects bad createdOn', () => {
    fails(parse({ ...obj(), createdOn: '2026-02-30' }), 'bad-backup', 'createdOn');
    fails(parse({ ...obj(), createdOn: 5 }), 'bad-backup');
  });
  it('rejects mandates that is not an array', () => {
    fails(parse({ ...obj(), mandates: {} }), 'bad-backup', 'mandates');
  });
});

describe('backup reader: mandates', () => {
  it('rejects an unknown mandate key', () => {
    const o = obj();
    o.mandates[1].note = 'x';
    fails(parse(o), 'bad-backup', 'mandates[1].note');
  });
  it('rejects a missing mandate field', () => {
    const o = obj();
    delete o.mandates[0].isPep;
    fails(parse(o), 'bad-backup', 'mandates[0].isPep');
  });
  const wrong: [string, unknown][] = [
    ['id', 5],
    ['name', null],
    ['legalForm', 1],
    ['active', 'true'],
    ['idStatus', 2],
    ['riskGroupId', 7],
    ['riskReason', false],
    ['isPep', 0],
    ['firstRequestOn', 20260101],
    ['lastCheckOn', true],
    ['endedOn', {}],
  ];
  it.each(wrong)('rejects a wrong type in %s', (field, value) => {
    const o = obj();
    o.mandates[0][field] = value;
    fails(parse(o), 'bad-backup', `mandates[0].${field}`);
  });
  it('passes checkMandate errors through with the place', () => {
    const o = obj();
    o.mandates[0].legalForm = 'nope';
    fails(parse(o), 'unknown-legal-form', 'mandates[0]');
    const p = obj();
    p.mandates[1].lastCheckOn = '2026-13-01';
    fails(parse(p), 'bad-date', 'mandates[1]');
    const q = obj();
    q.mandates[0].idStatus = 'weird';
    fails(parse(q), 'bad-status');
  });
  it('rejects a duplicate client number', () => {
    const o = obj();
    o.mandates[1].id = o.mandates[0].id;
    fails(parse(o), 'duplicate-id', 'mandates[1].id');
  });
});

describe('backup reader: version 1 migration', () => {
  const v1 = () => {
    const o = obj();
    delete o.persons;
    delete o.auditClosings;
    delete o.screeningDecisions;
    delete o.lastScreening;
    o.version = 1;
    return o;
  };
  it('reads a version 1 file and migrates it to version 3 without persons and closings', () => {
    const r = parse(v1());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.version).toBe(3);
    expect(r.value.persons).toEqual([]);
    expect(r.value.auditClosings).toEqual([]);
    expect(r.value.mandates).toHaveLength(2);
    expect(JSON.parse(serializeBackup(r.value)).version).toBe(3);
  });
  it('stays strict: persons in a version 1 file are an unknown key', () => {
    fails(parse({ ...v1(), persons: [] }), 'bad-backup', 'root.persons');
  });
  it('rejects a version 2 file without persons or closings', () => {
    const o = obj();
    delete o.persons;
    fails(parse(o), 'bad-backup', 'root.persons');
    const p = obj();
    delete p.auditClosings;
    fails(parse(p), 'bad-backup', 'root.auditClosings');
  });
});

describe('backup reader: persons', () => {
  it('rejects non-arrays, unknown keys, missing keys', () => {
    fails(parse({ ...obj(), persons: {} }), 'bad-backup', 'persons');
    const o = obj();
    o.persons[0].extra = 1;
    fails(parse(o), 'bad-backup', 'persons[0].extra');
    const p = obj();
    delete p.persons[1].birth;
    fails(parse(p), 'bad-backup', 'persons[1].birth');
  });
  const wrong: [string, unknown][] = [
    ['id', 5],
    ['mandateId', null],
    ['role', 1],
    ['lastName', null],
    ['firstName', 2],
    ['birth', 1970],
  ];
  it.each(wrong)('rejects a wrong type in %s', (field, value) => {
    const o = obj();
    o.persons[0][field] = value;
    fails(parse(o), 'bad-backup', `persons[0].${field}`);
  });
  it('passes checkPerson errors through with the place', () => {
    const o = obj();
    o.persons[0].role = 'chef';
    fails(parse(o), 'bad-person', 'persons[0]');
    const p = obj();
    p.persons[2].birth = '1970-02-30';
    fails(parse(p), 'bad-person', 'persons[2]');
    const q = obj();
    q.persons[1].mandateId = '99999';
    fails(parse(q), 'unknown-mandate', 'persons[1]');
  });
  it('rejects a duplicate person id', () => {
    const o = obj();
    o.persons[1].id = o.persons[0].id;
    fails(parse(o), 'duplicate-id', 'persons[1].id');
  });
});

describe('backup reader: audit closings', () => {
  it('rejects non-arrays, unknown keys, wrong types', () => {
    fails(parse({ ...obj(), auditClosings: 1 }), 'bad-backup', 'auditClosings');
    const o = obj();
    o.auditClosings[0].extra = 1;
    fails(parse(o), 'bad-backup', 'auditClosings[0].extra');
    for (const f of ['stichtag', 'closedOn', 'by', 'note']) {
      const p = obj();
      p.auditClosings[1][f] = 5;
      fails(parse(p), 'bad-backup', `auditClosings[1].${f}`);
    }
  });
  it('passes checkAuditClosing errors through with the place', () => {
    const o = obj();
    o.auditClosings[0].closedOn = '2025-01-01';
    fails(parse(o), 'bad-closing', 'auditClosings[0]');
    const p = obj();
    p.auditClosings[1].by = ' ';
    fails(parse(p), 'bad-closing', 'auditClosings[1]');
  });
  it('rejects two closings for one cut-off date', () => {
    const o = obj();
    o.auditClosings[1].stichtag = o.auditClosings[0].stichtag;
    fails(parse(o), 'duplicate-id', 'auditClosings[1].stichtag');
  });
});

describe('backup reader: rules', () => {
  it('passes checkRules errors through as bad-config', () => {
    const o = obj();
    o.rules.retentionYears = 0;
    fails(parse(o), 'bad-config', 'rules');
  });
  it('rejects an unknown rules key and a wrong type', () => {
    const o = obj();
    o.rules.extra = 1;
    fails(parse(o), 'bad-backup', 'rules.extra');
    const p = obj();
    p.rules.retentionYears = '5';
    fails(parse(p), 'bad-backup', 'rules.retentionYears');
    const q = obj();
    q.rules.legalForms[0].checkType = 'Z';
    fails(parse(q), 'bad-backup', 'rules.legalForms[0].checkType');
    const r = obj();
    r.rules = [];
    fails(parse(r), 'bad-backup', 'rules');
  });
});

describe('backup reader: prototype pollution', () => {
  it.each(['{"__proto__":{"x":1},"format":"gwg-backup","version":1}', '{"constructor":1}'])(
    'rejects at the root: %s',
    (t) => {
      fails(parseBackup(t), 'bad-backup');
    },
  );
  it('rejects at mandate and rules level', () => {
    const text = serializeBackup(base()).replace(
      '"isPep": false',
      '"__proto__": {}, "isPep": false',
    );
    fails(parseBackup(text), 'bad-backup');
    const text2 = serializeBackup(base()).replace(
      '"retentionYears"',
      '"constructor": 1, "retentionYears"',
    );
    fails(parseBackup(text2), 'bad-backup');
    expect(({} as any).x).toBeUndefined();
  });
});

describe('old data sets with over-long or multi-line mandate names', () => {
  it('parseBackup refuses a name over 200 characters and says where', () => {
    const o = obj();
    o.mandates[1].name = 'x'.repeat(201);
    fails(parse(o), 'bad-id', 'mandates[1]');
  });
  it('parseBackup refuses a name with a line break and a 51 character id', () => {
    const o = obj();
    o.mandates[0].name = 'a\u2028b';
    fails(parse(o), 'bad-id', 'mandates[0]');
    const p = obj();
    p.mandates[0].id = '1'.repeat(51);
    fails(parse(p), 'bad-id', 'mandates[0]');
  });
});

const dec = (kind: 'person' | 'mandate', subjectId: string, entryId = 'E1'): ScreeningDecision => ({
  subjectKind: kind,
  subjectId,
  entryId,
  listKind: 'sanktion',
  listFetchedOn: '2026-11-20',
  decision: 'kein-treffer',
  reason: 'Anderes Geburtsdatum',
  decidedOn: '2026-11-27',
  decidedBy: 'A. Beispiel',
  subjectSnapshot: 'x|',
  entrySnapshot: 'abc',
  actionNote: '',
});
const withDecisions = (): Backup => ({
  ...base(),
  screeningDecisions: [
    dec('person', 'p1'),
    dec('person', 'p2'),
    dec('person', 'p3'),
    dec('mandate', '10001'),
    dec('mandate', '10002'),
  ],
});

describe('removePerson / removeMandate', () => {
  it('removePerson drops the person and only its decisions; the result is valid', () => {
    const r = removePerson(withDecisions(), 'p2');
    expect(r.persons.map((p) => p.id).sort()).toEqual(['p1', 'p3']);
    expect(r.screeningDecisions.map((d) => d.subjectId).sort()).toEqual([
      '10001',
      '10002',
      'p1',
      'p3',
    ]);
    expect(checkBackup(r).ok).toBe(true);
    expect(parseBackup(serializeBackup(r)).ok).toBe(true);
  });
  it('without removePerson the same deletion would be refused as an orphan decision', () => {
    const b = withDecisions();
    const naive = { ...b, persons: b.persons.filter((p) => p.id !== 'p2') };
    const r = checkBackup(naive);
    expect(r).toMatchObject({ ok: false, reason: 'unknown-mandate' });
  });
  it('removeMandate drops persons and the decisions of the mandate and of its persons', () => {
    const r = removeMandate(withDecisions(), '10001');
    expect(r.mandates.map((m) => m.id)).toEqual(['10002']);
    expect(r.persons.map((p) => p.id)).toEqual(['p3']);
    expect(r.screeningDecisions.map((d) => `${d.subjectKind}:${d.subjectId}`).sort()).toEqual([
      'mandate:10002',
      'person:p3',
    ]);
    expect(checkBackup(r).ok).toBe(true);
  });
  it('a person id equal to a mandate id does not mix up the kinds', () => {
    const b: Backup = {
      ...base(),
      persons: [person({ id: '10002', mandateId: '10001' })],
      screeningDecisions: [dec('person', '10002'), dec('mandate', '10002')],
    };
    expect(removePerson(b, '10002').screeningDecisions.map((d) => d.subjectKind)).toEqual([
      'mandate',
    ]);
    const m = removeMandate(b, '10002');
    expect(m.screeningDecisions.map((d) => d.subjectKind)).toEqual(['person']);
  });
});

describe('checkBackup', () => {
  it('accepts a sound data set and gives it back', () => {
    const b = withDecisions();
    expect(checkBackup(b)).toEqual({ ok: true, value: b });
  });
  it('finds orphan persons, orphan decisions and duplicates, with the place', () => {
    const b = withDecisions();
    expect(checkBackup({ ...b, persons: [person({ mandateId: '99999' })] })).toMatchObject({
      reason: 'unknown-mandate',
      where: 'persons[0]',
    });
    expect(checkBackup({ ...b, screeningDecisions: [dec('mandate', '99999')] })).toMatchObject({
      reason: 'unknown-mandate',
      where: 'screeningDecisions[0]',
    });
    expect(checkBackup({ ...b, persons: [person(), person()] })).toMatchObject({
      reason: 'duplicate-id',
      where: 'persons[1].id',
    });
    expect(checkBackup({ ...b, mandates: [mandate(), mandate()] })).toMatchObject({
      reason: 'duplicate-id',
      where: 'mandates[1].id',
    });
    expect(
      checkBackup({ ...b, screeningDecisions: [dec('mandate', '10001'), dec('mandate', '10001')] }),
    ).toMatchObject({ reason: 'duplicate-id', where: 'screeningDecisions[1]' });
  });
});

describe('repairOrphanDecisions', () => {
  const orphaned = (extra: (o: any) => void = () => {}) => {
    const o = obj(withDecisions());
    o.persons = o.persons.filter((p: any) => p.id !== 'p2');
    extra(o);
    return JSON.stringify(o);
  };
  it('removes only the orphans and says how many', () => {
    const text = orphaned();
    expect(parseBackup(text).ok).toBe(false);
    const r = repairOrphanDecisions(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.removed).toBe(1);
    expect(r.value.backup.screeningDecisions).toHaveLength(4);
    expect(checkBackup(r.value.backup).ok).toBe(true);
  });
  it('refuses when anything else is wrong, or when nothing is orphaned', () => {
    expect(repairOrphanDecisions(orphaned((o) => (o.mandates[0].name = '')))).toMatchObject({
      ok: false,
    });
    expect(repairOrphanDecisions(serializeBackup(withDecisions())).ok).toBe(false);
    expect(repairOrphanDecisions('{kaputt').ok).toBe(false);
  });
});

describe('nesting depth (iterative scan)', () => {
  it('refuses a file nested 100 000 levels deep with bad-backup, without a stack overflow', () => {
    const deep = '['.repeat(100_000) + ']'.repeat(100_000);
    const r = parseBackup(`{"format":"gwg-backup","version":2,"x":${deep}}`);
    expect(r).toMatchObject({ ok: false, reason: 'bad-backup' });
    const objs = '{"a":'.repeat(100_000) + '1' + '}'.repeat(100_000);
    expect(parseBackup(`{"format":"gwg-backup","x":${objs}}`)).toMatchObject({
      ok: false,
      reason: 'bad-backup',
    });
  });
  it('refuses 65 levels, accepts the normal depth', () => {
    const lvl = (n: number) => '['.repeat(n) + ']'.repeat(n);
    const o = { ...obj(), extra: JSON.parse(lvl(65)) };
    expect(parse(o)).toMatchObject({ ok: false, reason: 'bad-backup', where: 'nesting' });
    expect(parseBackup(serializeBackup(base())).ok).toBe(true);
  });
});
