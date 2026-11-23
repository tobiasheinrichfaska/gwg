import {
  LEGAL_FORMS,
  REVIEW_INTERVAL_MONTHS,
  auditExceptions,
  auditIsClean,
  checkMandate,
  checkTypeOf,
  dunningStage,
  effectiveRiskClass,
  needsRegisterLookup,
  nextReviewDate,
  retentionDueFrom,
} from '../src/logic/index.ts';
import { mandate } from './helpers.ts';

describe('legal forms', () => {
  it('maps every form to a check type', () => {
    for (const f of LEGAL_FORMS) expect(checkTypeOf(f.key)).toBe(f.checkType);
    expect(checkTypeOf('unbekannt')).toBeNull();
  });
  it('separates the registered sole trader and the eGbR from their plain cousins', () => {
    expect(checkTypeOf('einzelunternehmen')).toBe('A');
    expect(checkTypeOf('ek')).toBe('B');
    expect(checkTypeOf('egbr')).toBe('C');
  });
  it('gives a plain GbR type C but no register lookup', () => {
    expect(checkTypeOf('gbr')).toBe('C');
    expect(needsRegisterLookup('gbr')).toBe(false);
    expect(needsRegisterLookup('egbr')).toBe(true);
    expect(needsRegisterLookup('gmbh')).toBe(true);
    expect(needsRegisterLookup('ek')).toBe(true);
    expect(needsRegisterLookup('einzelunternehmen')).toBe(false);
    expect(needsRegisterLookup('unbekannt')).toBe(false);
  });
  it('has unique keys', () => {
    expect(new Set(LEGAL_FORMS.map((f) => f.key)).size).toBe(LEGAL_FORMS.length);
  });
});

describe('risk class and next review', () => {
  it('takes the class from the group', () => {
    expect(effectiveRiskClass(mandate({ riskGroupId: 'N-01' }))).toBe('niedrig');
    expect(effectiveRiskClass(mandate({ riskGroupId: 'H-01' }))).toBe('hoch');
    expect(effectiveRiskClass(mandate({ riskGroupId: null }))).toBeNull();
  });
  it('forces high risk for a PEP, whatever the group', () => {
    expect(effectiveRiskClass(mandate({ riskGroupId: 'N-01', isPep: true }))).toBe('hoch');
    expect(effectiveRiskClass(mandate({ riskGroupId: null, isPep: true }))).toBe('hoch');
  });
  it('rolls the interval from the last check', () => {
    expect(nextReviewDate(mandate({ riskGroupId: 'H-01', lastCheckOn: '2026-11-16' }))).toBe(
      '2027-11-16',
    );
    expect(nextReviewDate(mandate({ riskGroupId: 'M-01', lastCheckOn: '2026-11-16' }))).toBe(
      '2028-11-16',
    );
    expect(nextReviewDate(mandate({ riskGroupId: 'N-01', lastCheckOn: '2026-11-16' }))).toBe(
      '2029-11-16',
    );
    expect(REVIEW_INTERVAL_MONTHS).toEqual({ niedrig: 36, normal: 24, hoch: 12 });
  });
  it('a PEP shortens the interval', () => {
    expect(
      nextReviewDate(mandate({ riskGroupId: 'N-01', isPep: true, lastCheckOn: '2026-11-16' })),
    ).toBe('2027-11-16');
  });
  it('has no date without a check or a class', () => {
    expect(nextReviewDate(mandate({ lastCheckOn: null }))).toBeNull();
    expect(nextReviewDate(mandate({ riskGroupId: null }))).toBeNull();
  });
});

describe('dunning ladder', () => {
  const first = '2026-11-01';
  it('has no stage before day 14 or without a request', () => {
    expect(dunningStage(null, '2026-12-31')).toBe('keine');
    expect(dunningStage(first, '2026-11-01')).toBe('keine');
    expect(dunningStage(first, '2026-11-14')).toBe('keine');
  });
  it('steps at 14, 28 and 42 days', () => {
    expect(dunningStage(first, '2026-11-15')).toBe('erinnerung');
    expect(dunningStage(first, '2026-11-28')).toBe('erinnerung');
    expect(dunningStage(first, '2026-11-29')).toBe('androhung');
    expect(dunningStage(first, '2026-12-12')).toBe('androhung');
    expect(dunningStage(first, '2026-12-13')).toBe('eskalation');
    expect(dunningStage(first, '2027-06-01')).toBe('eskalation');
  });
});

describe('retention', () => {
  it('is 5 years after the end of the calendar year of the end', () => {
    expect(retentionDueFrom('2026-05-14')).toBe('2032-01-01');
    expect(retentionDueFrom('2026-12-31')).toBe('2032-01-01');
    expect(retentionDueFrom('2027-01-01')).toBe('2033-01-01');
  });
  it('is unknown without an end date', () => {
    expect(retentionDueFrom(null)).toBeNull();
  });
});

describe('checkMandate', () => {
  it('accepts a sound mandate', () => {
    expect(checkMandate(mandate()).ok).toBe(true);
  });
  const reason = (over: Parameters<typeof mandate>[0]) => {
    const r = checkMandate(mandate(over));
    return r.ok ? 'ok' : r.reason;
  };
  it('refuses each defect with its code', () => {
    expect(reason({ id: ' ' })).toBe('bad-id');
    expect(reason({ name: '' })).toBe('bad-id');
    expect(reason({ legalForm: 'x' })).toBe('unknown-legal-form');
    expect(reason({ riskGroupId: 'Z-99' })).toBe('unknown-risk-group');
    expect(reason({ lastCheckOn: '2026-02-30' })).toBe('bad-date');
    expect(reason({ firstRequestOn: 'gestern' })).toBe('bad-date');
    expect(reason({ riskReason: 'a\nb' })).toBe('bad-risk-reason');
    expect(reason({ riskReason: 'x'.repeat(501) })).toBe('bad-risk-reason');
    expect(reason({ idStatus: 'vollstaendig', lastCheckOn: null })).toBe('bad-status');
    expect(reason({ active: true, endedOn: '2026-05-01' })).toBe('bad-end');
  });
  it('accepts an inactive mandate with an end date', () => {
    expect(reason({ active: false, endedOn: '2026-05-01' })).toBe('ok');
  });
});

describe('yearly audit exceptions', () => {
  const today = '2026-11-30';
  it('lists the four exception kinds, active mandates only', () => {
    const list = [
      mandate({ id: '1', riskGroupId: null }),
      mandate({ id: '2', idStatus: 'leer', lastCheckOn: null }),
      mandate({ id: '3', idStatus: 'unvollstaendig', lastCheckOn: null }),
      mandate({ id: '4', idStatus: 'eskalation', lastCheckOn: null }),
      mandate({ id: '5', riskGroupId: 'H-01', lastCheckOn: '2025-11-29' }),
      mandate({ id: '6', riskGroupId: null, active: false, endedOn: '2025-01-01' }),
      mandate({ id: '7' }),
    ];
    const e = auditExceptions(list, today);
    expect(e.unclassified.map((m) => m.id)).toEqual(['1']);
    expect(e.unidentified.map((m) => m.id)).toEqual(['2']);
    expect(e.stalled.map((m) => m.id)).toEqual(['3', '4']);
    expect(e.overdue.map((m) => m.id)).toEqual(['5']);
    expect(auditIsClean(e)).toBe(false);
  });
  it('is clean when nothing is overdue — on the due day itself still in time', () => {
    const onDueDay = mandate({ riskGroupId: 'H-01', lastCheckOn: '2025-11-30' });
    expect(auditIsClean(auditExceptions([onDueDay, mandate()], today))).toBe(true);
  });
});
