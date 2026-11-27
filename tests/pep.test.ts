import {
  buildTasks,
  checkPerson,
  effectiveRiskClass,
  emptyPep,
  isPepAffected,
  nextReviewDate,
  parseBackup,
  serializeBackup,
  type Backup,
  type Mandate,
  type PepDisclosure,
  type Person,
} from '../src/logic/index.ts';
import { mandate, rules } from './helpers.ts';

const TODAY = '2026-11-27';
const pep = (over: Partial<PepDisclosure> = {}): PepDisclosure => ({ ...emptyPep(), ...over });
const person = (over: Partial<Person> = {}): Person => ({
  id: 'p1',
  mandateId: '10001',
  role: 'inhaber',
  lastName: 'Muster',
  firstName: 'Max',
  birth: null,
  pep: pep(),
  ...over,
});
const ms = [mandate()];
const code = (p: Person) => {
  const r = checkPerson(p, ms);
  return r.ok ? 'ok' : r.reason;
};

describe('checkPerson: pep', () => {
  it('accepts the default and complete disclosures', () => {
    expect(code(person())).toBe('ok');
    expect(code(person({ pep: pep({ answer: 'nein', askedOn: '2026-11-01' }) }))).toBe('ok');
    expect(
      code(
        person({
          pep: pep({
            answer: 'ja',
            askedOn: '2026-11-01',
            funktion: 'Bürgermeister',
            amtEndedOn: '2024-05-01',
            approvedOn: '2026-11-02',
            approvedBy: 'Dr. Beispiel',
          }),
        }),
      ),
    ).toBe('ok');
    expect(
      code(person({ pep: pep({ nahestehend: 'ja', approvedOn: '2026-11-02', approvedBy: 'X' }) })),
    ).toBe('ok');
  });
  it.each([
    ['answer without askedOn', { answer: 'nein' }],
    ['unknown answer', { answer: 'vielleicht', askedOn: '2026-11-01' }],
    ['unknown nahestehend', { nahestehend: 'x' }],
    ['bad askedOn', { answer: 'ja', askedOn: '2026-02-30' }],
    ['bad amtEndedOn', { amtEndedOn: 'gestern' }],
    ['long funktion', { funktion: 'x'.repeat(201) }],
    ['multi-line funktion', { funktion: 'a\nb' }],
    ['long approver', { approvedBy: 'x'.repeat(101) }],
    [
      'approval without ja',
      { answer: 'nein', askedOn: '2026-11-01', approvedOn: '2026-11-02', approvedBy: 'X' },
    ],
    ['approval without anything', { approvedOn: '2026-11-02', approvedBy: 'X' }],
    [
      'approval without name',
      { answer: 'ja', askedOn: '2026-11-01', approvedOn: '2026-11-02', approvedBy: ' ' },
    ],
    [
      'bad approvedOn',
      { answer: 'ja', askedOn: '2026-11-01', approvedOn: '2026-13-01', approvedBy: 'X' },
    ],
  ])('rejects %s as bad-pep', (_n, over) => {
    expect(code(person({ pep: pep(over as Partial<PepDisclosure>) }))).toBe('bad-pep');
  });
  it('rejects a missing pep object', () => {
    expect(code({ ...person(), pep: undefined } as unknown as Person)).toBe('bad-pep');
  });
});

describe('isPepAffected and risk class', () => {
  const yes = pep({ answer: 'ja', askedOn: '2026-11-01' });
  const m = mandate({ riskGroupId: 'N-01', lastCheckOn: '2026-11-16' });
  it('is false without a mark or a disclosure', () => {
    expect(isPepAffected(m, [])).toBe(false);
    expect(
      isPepAffected(m, [person({ pep: pep({ answer: 'nein', askedOn: '2026-11-01' }) })]),
    ).toBe(false);
    expect(
      isPepAffected(m, [person({ pep: pep({ answer: 'unbekannt', askedOn: '2026-11-01' }) })]),
    ).toBe(false);
  });
  it('keeps the manual mark', () => {
    expect(isPepAffected(mandate({ isPep: true }), [])).toBe(true);
  });
  it.each([
    'inhaber',
    'geschaeftsfuehrer',
    'gesellschafter',
    'wirtschaftlich-berechtigter',
    'vertreter',
  ] as const)('counts a ja of role %s', (role) => {
    expect(isPepAffected(m, [person({ role, pep: yes })])).toBe(true);
  });
  it('counts nahestehend ja, but not role sonstige or another mandate', () => {
    expect(isPepAffected(m, [person({ pep: pep({ nahestehend: 'ja' }) })])).toBe(true);
    expect(isPepAffected(m, [person({ role: 'sonstige', pep: yes })])).toBe(false);
    expect(isPepAffected(m, [person({ mandateId: '99999', pep: yes })])).toBe(false);
  });
  it('makes the class hoch and the review date follow it', () => {
    expect(effectiveRiskClass(m, [], rules)).toBe('niedrig');
    expect(effectiveRiskClass(m, [person({ pep: yes })], rules)).toBe('hoch');
    expect(effectiveRiskClass(mandate({ riskGroupId: null }), [person({ pep: yes })], rules)).toBe(
      'hoch',
    );
    expect(nextReviewDate(m, [], rules)).toBe('2029-11-16');
    expect(nextReviewDate(m, [person({ pep: yes })], rules)).toBe('2027-11-16');
  });
});

describe('buildTasks: pep', () => {
  const kinds = (ms: Mandate[], ps: Person[]) =>
    buildTasks(ms, ps, TODAY, rules, [], []).tasks.map(
      (t) => `${t.kind}:${t.personId ?? ''}:${t.daysOverdue}`,
    );
  it('asks persons that were not asked, with no due date', () => {
    const t = buildTasks([mandate()], [person()], TODAY, rules, [], []).tasks;
    expect(t).toEqual([
      { mandateId: '10001', kind: 'pep-ask', dueOn: null, daysOverdue: 0, personId: 'p1' },
    ]);
  });
  it('asks again after unbekannt and counts the days since askedOn', () => {
    const p = person({ pep: pep({ answer: 'unbekannt', askedOn: '2026-11-17' }) });
    expect(kinds([mandate()], [p])).toEqual(['pep-ask:p1:10']);
  });
  it('creates no ask for nein, ja, sonstige, other mandates or inactive mandates', () => {
    const done = pep({ answer: 'nein', askedOn: '2026-11-01' });
    expect(kinds([mandate()], [person({ pep: done })])).toEqual([]);
    expect(kinds([mandate()], [person({ role: 'sonstige' })])).toEqual([]);
    expect(kinds([mandate()], [person({ mandateId: '77' })])).toEqual([]);
    const inactive = mandate({ active: false, endedOn: '2026-10-01', idStatus: 'gekuendigt' });
    expect(kinds([inactive], [person()])).toEqual([]);
  });
  it('asks for an approval on ja or nahestehend ja until approvedOn is set', () => {
    const ja = person({ pep: pep({ answer: 'ja', askedOn: '2026-11-01' }) });
    const near = person({
      id: 'p2',
      pep: pep({ answer: 'nein', askedOn: '2026-11-01', nahestehend: 'ja' }),
    });
    expect(kinds([mandate()], [ja, near])).toEqual(['pep-approval:p1:0', 'pep-approval:p2:0']);
    const signed = person({
      pep: pep({ answer: 'ja', askedOn: '2026-11-01', approvedOn: '2026-11-02', approvedBy: 'X' }),
    });
    expect(kinds([mandate()], [signed])).toEqual([]);
  });
  it('orders pep-approval after dunning-escalate and pep-ask before request-missing', () => {
    const ms2 = [
      mandate({ id: 'A', idStatus: 'leer', firstRequestOn: null, riskGroupId: null }),
      mandate({ id: 'B', idStatus: 'eskalation', firstRequestOn: '2026-01-01' }),
      mandate({ id: 'C' }),
    ];
    const ps = [
      person({ id: 'a', mandateId: 'A' }),
      person({ id: 'c', mandateId: 'C', pep: pep({ answer: 'ja', askedOn: '2026-11-01' }) }),
    ];
    const order = buildTasks(ms2, ps, TODAY, rules, [], []).tasks.map(
      (t) => `${t.kind}:${t.mandateId}`,
    );
    expect(order).toEqual([
      'dunning-escalate:B',
      'pep-approval:C',
      'pep-ask:A',
      'request-missing:A',
      'unclassified:A',
    ]);
  });
  it('a pep-affected mandate gets its review earlier', () => {
    const m = mandate({ riskGroupId: 'N-01', lastCheckOn: '2025-11-01' });
    const none = buildTasks([m], [], TODAY, rules, [], []).tasks.map((t) => t.kind);
    expect(none).toEqual([]);
    const ps = [
      person({
        pep: pep({
          answer: 'ja',
          askedOn: '2026-11-01',
          approvedOn: '2026-11-02',
          approvedBy: 'X',
        }),
      }),
    ];
    expect(buildTasks([m], ps, TODAY, rules, [], []).tasks.map((t) => t.kind)).toEqual([
      'review-due',
    ]);
  });
});

describe('backup format 2: pep', () => {
  const base = (persons: Person[]): Backup => ({
    format: 'gwg-backup',
    version: 3,
    createdOn: TODAY,
    rules,
    mandates: [mandate()],
    persons,
    auditClosings: [],
    screeningDecisions: [],
    lastScreening: { sanktion: null, pep: null },
  });
  const full = pep({
    answer: 'ja',
    askedOn: '2026-11-01',
    funktion: 'Landrat',
    amtEndedOn: '2024-01-31',
    nahestehend: 'nein',
    approvedOn: '2026-11-02',
    approvedBy: 'Dr. Beispiel',
  });
  it('round-trips with pep and with the default', () => {
    for (const ps of [[person({ pep: full })], [person()]]) {
      const b = base(ps);
      const text = serializeBackup(b);
      const r = parseBackup(text);
      expect(r.ok && r.value).toEqual(b);
      expect(r.ok && serializeBackup(r.value)).toBe(text);
    }
  });
  it('reads a version 2 file whose persons have no pep: default all null/empty', () => {
    const o = JSON.parse(serializeBackup(base([person({ pep: full })])));
    delete o.persons[0].pep;
    const r = parseBackup(JSON.stringify(o));
    expect(r.ok && r.value.persons[0]?.pep).toEqual(emptyPep());
  });
  it('migrates version 1 (no persons)', () => {
    const o = JSON.parse(serializeBackup(base([])));
    o.version = 1;
    delete o.persons;
    delete o.auditClosings;
    delete o.screeningDecisions;
    delete o.lastScreening;
    const r = parseBackup(JSON.stringify(o));
    expect(r.ok && r.value.version).toBe(3);
    expect(r.ok && r.value.persons).toEqual([]);
  });
  it('is strict about pep', () => {
    const o = JSON.parse(serializeBackup(base([person({ pep: full })])));
    const set = (f: (p: Record<string, unknown>) => void) => {
      const c = structuredClone(o);
      f(c.persons[0].pep);
      return parseBackup(JSON.stringify(c));
    };
    const e1 = set((p) => (p.extra = 1));
    expect(!e1.ok && e1.reason).toBe('bad-backup');
    const e2 = set((p) => delete p.funktion);
    expect(!e2.ok && e2.reason).toBe('bad-backup');
    const e3 = set((p) => (p.funktion = 5));
    expect(!e3.ok && e3.reason).toBe('bad-backup');
    const e4 = set((p) => (p.answer = 'vielleicht'));
    expect(!e4.ok && e4.reason).toBe('bad-pep');
    const e5 = set((p) => (p.askedOn = null));
    expect(!e5.ok && e5.reason).toBe('bad-pep');
  });
});
