import {
  closingBlockers,
  currentSnapshot,
  emptyPep,
  type ClosingBlockersInput,
  type Hit,
  type Person,
  type ScreeningDecision,
  type Task,
} from '../src/logic/index.ts';
import { mandate } from './helpers.ts';

const m = mandate();
const p: Person = {
  id: 'p1',
  mandateId: m.id,
  role: 'inhaber',
  lastName: 'Quelle',
  firstName: 'Zorin',
  birth: '1965-12-12',
  pep: emptyPep(),
};
const hit = (entryId: string, klasse: 'rot' | 'gelb'): Hit => ({
  subjectKind: 'person',
  subjectId: 'p1',
  mandateId: m.id,
  entryId,
  kind: 'sanktion',
  klasse,
  besterName: 'Zorin Quelle',
  aehnlichkeit: 0.95,
  entrySnapshot: `snap-${entryId}`,
});
const decide = (h: Hit): ScreeningDecision => ({
  subjectKind: h.subjectKind,
  subjectId: h.subjectId,
  entryId: h.entryId,
  listKind: h.kind,
  listFetchedOn: '2026-11-20',
  decision: 'kein-treffer',
  reason: 'andere Person',
  decidedOn: '2026-11-27',
  decidedBy: 'A. Prüfer',
  actionNote: '',
  subjectSnapshot: currentSnapshot('person', 'p1', [p], [m]) ?? '',
  entrySnapshot: h.entrySnapshot,
});
const pepTask: Task = {
  mandateId: m.id,
  kind: 'pep-approval',
  dueOn: null,
  daysOverdue: 0,
  personId: 'p1',
};
const input = (over: Partial<ClosingBlockersInput> = {}): ClosingBlockersInput => ({
  tasks: [],
  hits: [],
  decisions: [],
  persons: [p],
  mandates: [m],
  screening: { hasList: true, stale: false, ranOn: '2026-11-27' },
  ...over,
});

describe('closingBlockers', () => {
  it('has nothing to report for a trustworthy, clean screening', () => {
    expect(closingBlockers(input())).toEqual({ blockers: [], warnings: [] });
  });

  it('blocks on open red hits with their count; decided ones do not count', () => {
    const a = hit('1', 'rot');
    const b = hit('2', 'rot');
    expect(closingBlockers(input({ hits: [a, b] })).blockers).toEqual([
      { kind: 'red-hits', count: 2 },
    ]);
    expect(closingBlockers(input({ hits: [a, b], decisions: [decide(a)] })).blockers).toEqual([
      { kind: 'red-hits', count: 1 },
    ]);
    expect(closingBlockers(input({ hits: [a], decisions: [decide(a)] })).blockers).toEqual([]);
  });

  it('blocks on open PEP approvals, counting only that task kind', () => {
    const other: Task = { ...pepTask, kind: 'pep-ask' };
    expect(closingBlockers(input({ tasks: [pepTask, pepTask, other] })).blockers).toEqual([
      { kind: 'pep-approvals', count: 2 },
    ]);
    expect(closingBlockers(input({ tasks: [other] })).blockers).toEqual([]);
  });

  it('only warns about open yellow hits', () => {
    const r = closingBlockers(input({ hits: [hit('1', 'gelb'), hit('2', 'gelb')] }));
    expect(r.blockers).toEqual([]);
    expect(r.warnings).toEqual([{ kind: 'yellow-hits', count: 2 }]);
    expect(
      closingBlockers(input({ hits: [hit('1', 'gelb')], decisions: [decide(hit('1', 'gelb'))] })),
    ).toEqual({ blockers: [], warnings: [] });
  });

  it('blocks when the screening is missing: no list, never run, outdated', () => {
    const why = (screening: ClosingBlockersInput['screening']) =>
      closingBlockers(input({ screening })).blockers;
    expect(why({ hasList: false, stale: true, ranOn: null })).toEqual([
      { kind: 'screening-missing', why: 'no-list' },
    ]);
    expect(why({ hasList: true, stale: true, ranOn: null })).toEqual([
      { kind: 'screening-missing', why: 'never-run' },
    ]);
    expect(why({ hasList: true, stale: true, ranOn: '2026-11-20' })).toEqual([
      { kind: 'screening-missing', why: 'stale' },
    ]);
  });

  it('lists every blocker at once, red hits first', () => {
    const r = closingBlockers(
      input({
        tasks: [pepTask],
        hits: [hit('1', 'rot'), hit('2', 'gelb')],
        screening: { hasList: false, stale: true, ranOn: null },
      }),
    );
    expect(r.blockers.map((b) => b.kind)).toEqual([
      'red-hits',
      'pep-approvals',
      'screening-missing',
    ]);
    expect(r.warnings).toEqual([{ kind: 'yellow-hits', count: 1 }]);
  });
});
