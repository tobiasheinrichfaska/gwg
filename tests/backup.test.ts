import { DEFAULT_RULES, parseBackup, serializeBackup, type Backup } from '../src/logic/index.ts';
import { mandate } from './helpers.ts';

const base = (): Backup => ({
  format: 'gwg-backup',
  version: 1,
  createdOn: '2026-11-26',
  rules: DEFAULT_RULES,
  mandates: [mandate({ id: '10002', name: 'Zweite GmbH' }), mandate({ id: '10001' })],
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
    expect(r.value).toEqual({ ...b, mandates: [b.mandates[1], b.mandates[0]] });
    expect(serializeBackup(r.value)).toBe(serializeBackup(b));
  });
  it('has a stable key order', () => {
    expect(Object.keys(obj())).toEqual(['format', 'version', 'createdOn', 'rules', 'mandates']);
    expect(obj().mandates[0].id).toBe('10001');
  });
  it('accepts an empty mandate list', () => {
    expect(parseBackup(serializeBackup({ ...base(), mandates: [] })).ok).toBe(true);
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
  it('rejects version 2 as unsupported', () => {
    fails(parse({ ...obj(), version: 2 }), 'unsupported-version');
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
