import { buildTasks, type Mandate } from '../src/logic/index.ts';
import { mandate, rules } from './helpers.ts';

const TODAY = '2026-11-26';
const build = (ms: Mandate[], today = TODAY) => buildTasks(ms, today, rules);
const kinds = (ms: Mandate[], today = TODAY) => build(ms, today).tasks.map((t) => t.kind);

describe('buildTasks', () => {
  it('review-due on the due day, not the day before', () => {
    const m = mandate({ riskGroupId: 'M-01', lastCheckOn: '2024-11-26' }); // normal: 24 months
    const due = build([m]).tasks;
    expect(due).toEqual([
      { mandateId: '10001', kind: 'review-due', dueOn: '2026-11-26', daysOverdue: 0 },
    ]);
    expect(kinds([m], '2026-11-25')).toEqual([]);
    expect(build([m], '2026-12-06').tasks[0]!.daysOverdue).toBe(10);
  });

  it('request-missing for leer/unvollstaendig without first request, none for eskalation', () => {
    for (const idStatus of ['leer', 'unvollstaendig'] as const) {
      expect(build([mandate({ idStatus, lastCheckOn: null })]).tasks).toEqual([
        { mandateId: '10001', kind: 'request-missing', dueOn: null, daysOverdue: 0 },
      ]);
    }
    expect(kinds([mandate({ idStatus: 'eskalation', lastCheckOn: null })])).toEqual([]);
  });

  it('dunning boundaries 13/14/27/28/41/42 days', () => {
    const at = (days: number) => {
      const first = new Date(Date.UTC(2026, 10, 26 - days)).toISOString().slice(0, 10);
      return build([
        mandate({ idStatus: 'unvollstaendig', lastCheckOn: null, firstRequestOn: first }),
      ]).tasks[0];
    };
    expect(at(13)).toBeUndefined();
    expect(at(14)).toMatchObject({ kind: 'dunning-reminder', dueOn: '2026-11-26', daysOverdue: 0 });
    expect(at(27)).toMatchObject({ kind: 'dunning-reminder', daysOverdue: 13 });
    expect(at(28)).toMatchObject({ kind: 'dunning-threat', dueOn: '2026-11-26', daysOverdue: 0 });
    expect(at(41)).toMatchObject({ kind: 'dunning-threat', daysOverdue: 13 });
    expect(at(42)).toMatchObject({ kind: 'dunning-escalate', dueOn: '2026-11-26', daysOverdue: 0 });
    expect(at(100)).toMatchObject({ kind: 'dunning-escalate', daysOverdue: 58 });
  });

  it('dunning also applies to status eskalation and leer', () => {
    for (const idStatus of ['leer', 'eskalation'] as const) {
      expect(
        kinds([mandate({ idStatus, lastCheckOn: null, firstRequestOn: '2026-09-01' })]),
      ).toEqual(['dunning-escalate']);
    }
  });

  it('unclassified for null and unknown risk group', () => {
    expect(kinds([mandate({ riskGroupId: null })])).toEqual(['unclassified']);
    const r = buildTasks([mandate({ riskGroupId: 'X-99' })], TODAY, rules);
    expect(r.tasks).toEqual([]);
    expect(r.invalid).toEqual([{ mandateId: '10001', reason: 'unknown-risk-group' }]);
  });

  it('retention-due only for inactive mandates, from 1 January of end year + 6', () => {
    const m = mandate({ active: false, endedOn: '2020-05-01', idStatus: 'gekuendigt' });
    expect(build([m], '2025-12-31').tasks).toEqual([]);
    expect(build([m], '2026-01-01').tasks).toEqual([
      { mandateId: '10001', kind: 'retention-due', dueOn: '2026-01-01', daysOverdue: 0 },
    ]);
    expect(build([m]).tasks[0]!.daysOverdue).toBe(329);
  });

  it('inactive mandates produce only retention tasks', () => {
    const m = mandate({
      active: false,
      endedOn: '2026-05-01',
      idStatus: 'leer',
      riskGroupId: null,
      firstRequestOn: '2026-01-01',
    });
    expect(kinds([m])).toEqual([]);
  });

  it('puts an invalid mandate into invalid, never silently dropped', () => {
    const bad = mandate({ id: '20002', legalForm: 'nope' });
    const good = mandate({ id: '20003', riskGroupId: null });
    const r = build([bad, good]);
    expect(r.invalid).toEqual([{ mandateId: '20002', reason: 'unknown-legal-form' }]);
    expect(r.tasks.map((t) => t.mandateId)).toEqual(['20003']);
  });

  it('sorts by kind priority, then daysOverdue descending, then mandateId', () => {
    const ms = [
      mandate({ id: '5', riskGroupId: null }),
      mandate({ id: '4', idStatus: 'leer', lastCheckOn: null }),
      mandate({
        id: '3',
        idStatus: 'unvollstaendig',
        lastCheckOn: null,
        firstRequestOn: '2026-11-12',
      }),
      mandate({ id: '2', lastCheckOn: '2024-10-26' }),
      mandate({ id: '1', active: false, endedOn: '2020-01-01', idStatus: 'gekuendigt' }),
      mandate({ id: '0', idStatus: 'leer', lastCheckOn: null, firstRequestOn: '2026-08-01' }),
      mandate({ id: '9', lastCheckOn: '2024-10-26' }),
      mandate({ id: '8', lastCheckOn: '2024-09-26' }),
    ];
    const r = build(ms).tasks.map((t) => `${t.kind}:${t.mandateId}`);
    expect(r).toEqual([
      'dunning-escalate:0',
      'retention-due:1',
      'review-due:8',
      'review-due:2',
      'review-due:9',
      'dunning-reminder:3',
      'request-missing:4',
      'unclassified:5',
    ]);
  });

  it('is deterministic and does not mutate its input', () => {
    const ms = [mandate({ id: '2', riskGroupId: null }), mandate({ id: '1', riskGroupId: null })];
    const copy = structuredClone(ms);
    expect(build(ms)).toEqual(build([...ms].reverse()));
    expect(ms).toEqual(copy);
  });

  it('throws on a bad today', () => {
    expect(() => build([], '2026-13-01')).toThrow();
  });
});
