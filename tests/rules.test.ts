import {
  LEGAL_FORMS,
  REVIEW_INTERVAL_MONTHS,
  type RulesConfig,
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
import { mandate, rules } from './helpers.ts';

describe('legal forms', () => {
  it('maps every form to a check type', () => {
    for (const f of LEGAL_FORMS) expect(checkTypeOf(f.key, rules)).toBe(f.checkType);
    expect(checkTypeOf('unbekannt', rules)).toBeNull();
  });
  it('separates the registered sole trader and the eGbR from their plain cousins', () => {
    expect(checkTypeOf('einzelunternehmen', rules)).toBe('A');
    expect(checkTypeOf('ek', rules)).toBe('B');
    expect(checkTypeOf('egbr', rules)).toBe('C');
  });
  it('gives a plain GbR type C but no register lookup', () => {
    expect(checkTypeOf('gbr', rules)).toBe('C');
    expect(needsRegisterLookup('gbr', rules)).toBe(false);
    expect(needsRegisterLookup('egbr', rules)).toBe(true);
    expect(needsRegisterLookup('gmbh', rules)).toBe(true);
    expect(needsRegisterLookup('ek', rules)).toBe(true);
    expect(needsRegisterLookup('einzelunternehmen', rules)).toBe(false);
    expect(needsRegisterLookup('unbekannt', rules)).toBe(false);
  });
  it('has unique keys', () => {
    expect(new Set(LEGAL_FORMS.map((f) => f.key)).size).toBe(LEGAL_FORMS.length);
  });
});

describe('risk class and next review', () => {
  it('takes the class from the group', () => {
    expect(effectiveRiskClass(mandate({ riskGroupId: 'N-01' }), [], rules)).toBe('niedrig');
    expect(effectiveRiskClass(mandate({ riskGroupId: 'H-01' }), [], rules)).toBe('hoch');
    expect(effectiveRiskClass(mandate({ riskGroupId: null }), [], rules)).toBeNull();
  });
  it('forces high risk for a PEP, whatever the group', () => {
    expect(effectiveRiskClass(mandate({ riskGroupId: 'N-01', isPep: true }), [], rules)).toBe(
      'hoch',
    );
    expect(effectiveRiskClass(mandate({ riskGroupId: null, isPep: true }), [], rules)).toBe('hoch');
  });
  it('rolls the interval from the last check', () => {
    expect(
      nextReviewDate(mandate({ riskGroupId: 'H-01', lastCheckOn: '2026-11-16' }), [], rules),
    ).toBe('2027-11-16');
    expect(
      nextReviewDate(mandate({ riskGroupId: 'M-01', lastCheckOn: '2026-11-16' }), [], rules),
    ).toBe('2028-11-16');
    expect(
      nextReviewDate(mandate({ riskGroupId: 'N-01', lastCheckOn: '2026-11-16' }), [], rules),
    ).toBe('2029-11-16');
    expect(REVIEW_INTERVAL_MONTHS).toEqual({ niedrig: 36, normal: 24, hoch: 12 });
  });
  it('a PEP shortens the interval', () => {
    expect(
      nextReviewDate(
        mandate({ riskGroupId: 'N-01', isPep: true, lastCheckOn: '2026-11-16' }),
        [],
        rules,
      ),
    ).toBe('2027-11-16');
  });
  it('has no date without a check or a class', () => {
    expect(nextReviewDate(mandate({ lastCheckOn: null }), [], rules)).toBeNull();
    expect(nextReviewDate(mandate({ riskGroupId: null }), [], rules)).toBeNull();
  });
});

describe('dunning ladder', () => {
  const first = '2026-11-01';
  it('has no stage before day 14 or without a request', () => {
    expect(dunningStage(null, '2026-12-31', rules)).toBe('keine');
    expect(dunningStage(first, '2026-11-01', rules)).toBe('keine');
    expect(dunningStage(first, '2026-11-14', rules)).toBe('keine');
  });
  it('steps at 14, 28 and 42 days', () => {
    expect(dunningStage(first, '2026-11-15', rules)).toBe('erinnerung');
    expect(dunningStage(first, '2026-11-28', rules)).toBe('erinnerung');
    expect(dunningStage(first, '2026-11-29', rules)).toBe('androhung');
    expect(dunningStage(first, '2026-12-12', rules)).toBe('androhung');
    expect(dunningStage(first, '2026-12-13', rules)).toBe('eskalation');
    expect(dunningStage(first, '2027-06-01', rules)).toBe('eskalation');
  });
});

describe('retention', () => {
  it('is 5 years after the end of the calendar year of the end', () => {
    expect(retentionDueFrom('2026-05-14', rules)).toBe('2032-01-01');
    expect(retentionDueFrom('2026-12-31', rules)).toBe('2032-01-01');
    expect(retentionDueFrom('2027-01-01', rules)).toBe('2033-01-01');
  });
  it('is unknown without an end date', () => {
    expect(retentionDueFrom(null, rules)).toBeNull();
  });
});

describe('checkMandate', () => {
  it('accepts a sound mandate', () => {
    expect(checkMandate(mandate(), rules).ok).toBe(true);
  });
  const reason = (over: Parameters<typeof mandate>[0]) => {
    const r = checkMandate(mandate(over), rules);
    return r.ok ? 'ok' : r.reason;
  };
  it('refuses each defect with its code', () => {
    expect(reason({ id: ' ' })).toBe('bad-id');
    expect(reason({ name: '' })).toBe('bad-id');
    expect(reason({ name: 'a'.repeat(201) })).toBe('bad-id');
    expect(reason({ id: '1'.repeat(51) })).toBe('bad-id');
    expect(reason({ name: 'a'.repeat(200) })).toBe('ok');
    for (const ch of ['\n', '\r', '\t', '\u0000', '\u2028', '\u2029', '\u0085', '\u007f']) {
      expect(reason({ name: `Muster${ch}GmbH` })).toBe('bad-id');
      expect(reason({ id: `100${ch}01` })).toBe('bad-id');
    }
    expect(reason({ legalForm: 'x' })).toBe('unknown-legal-form');
    expect(reason({ riskGroupId: 'Z-99' })).toBe('unknown-risk-group');
    expect(reason({ lastCheckOn: '2026-02-30' })).toBe('bad-date');
    expect(reason({ firstRequestOn: 'gestern' })).toBe('bad-date');
    expect(reason({ riskReason: 'a\nb' })).toBe('bad-risk-reason');
    expect(reason({ riskReason: 'x'.repeat(501) })).toBe('bad-risk-reason');
    expect(reason({ idStatus: 'vollstaendig', lastCheckOn: null })).toBe('bad-status');
    expect(reason({ active: true, endedOn: '2026-05-01' })).toBe('bad-end');
  });
  it('refuses a status value outside the list and exotic line breaks', () => {
    expect(reason({ idStatus: 'Vollständig' as never })).toBe('bad-status');
    expect(reason({ riskReason: 'a\u2028b' })).toBe('bad-risk-reason');
    expect(reason({ riskReason: 'a\u007fb' })).toBe('bad-risk-reason');
  });
  it('refuses an inactive mandate without an end date (retention clock would never start)', () => {
    expect(reason({ active: false, endedOn: null })).toBe('bad-end');
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
    const e = auditExceptions(list, [], today, rules);
    expect(e.unclassified.map((m) => m.id)).toEqual(['1']);
    expect(e.unidentified.map((m) => m.id)).toEqual(['2']);
    expect(e.stalled.map((m) => m.id)).toEqual(['3', '4']);
    expect(e.overdue.map((m) => m.id)).toEqual(['5']);
    expect(auditIsClean(e)).toBe(false);
  });
  it('is clean when nothing is overdue — on the due day itself still in time', () => {
    const onDueDay = mandate({ riskGroupId: 'H-01', lastCheckOn: '2025-11-30' });
    expect(auditIsClean(auditExceptions([onDueDay, mandate()], [], today, rules))).toBe(true);
  });
});

describe('audit fails toward a finding, not toward silence', () => {
  const today = '2026-11-30';
  it('lists an unknown (e.g. deleted) risk group as unclassified', () => {
    const e = auditExceptions([mandate({ id: '1', riskGroupId: 'GELOESCHT' })], [], today, rules);
    expect(e.unclassified.map((m) => m.id)).toEqual(['1']);
    expect(e.overdue).toEqual([]);
  });
  it('lists a "complete" identification without a valid last-review date as overdue', () => {
    const e = auditExceptions(
      [mandate({ id: '1', lastCheckOn: null }), mandate({ id: '2', lastCheckOn: 'gestern' })],
      [],
      today,
      rules,
    );
    expect(e.overdue.map((m) => m.id)).toEqual(['1', '2']);
  });
  it('gives no review date for an invalid last-review date instead of throwing', () => {
    expect(nextReviewDate(mandate({ lastCheckOn: '2026-02-30' }), [], rules)).toBeNull();
  });
});

describe('robustness at the edges', () => {
  it('does not crash when the review date leaves the input range', () => {
    expect(
      nextReviewDate(mandate({ riskGroupId: 'N-01', lastCheckOn: '2199-01-01' }), [], rules),
    ).toBe('2202-01-01');
  });
  it('gives no retention date for garbage', () => {
    expect(retentionDueFrom('abc', rules)).toBeNull();
  });
  it('always refuses an invalid today, even with an empty list', () => {
    expect(() => auditExceptions([], [], 'not-a-date', rules)).toThrow('bad date key');
  });
});

describe('a firm passes its own configuration', () => {
  const own: RulesConfig = {
    ...rules,
    reviewIntervalMonths: { niedrig: 60, normal: 6, hoch: 3 },
    riskGroups: [{ id: 'X-01', name: 'Eigene Gruppe', riskClass: 'normal' }],
  };
  it('nextReviewDate uses its group and interval', () => {
    const m = mandate({ riskGroupId: 'X-01', lastCheckOn: '2026-01-31' });
    expect(nextReviewDate(m, [], own)).toBe('2026-07-31');
    expect(nextReviewDate(m, [], rules)).toBeNull();
  });
  it('auditExceptions uses its groups and intervals', () => {
    const list = [
      mandate({ id: '1', riskGroupId: 'X-01', lastCheckOn: '2026-01-31' }),
      mandate({ id: '2', riskGroupId: 'M-01' }),
    ];
    const e = auditExceptions(list, [], '2026-11-30', own);
    expect(e.overdue.map((m) => m.id)).toEqual(['1']);
    expect(e.unclassified.map((m) => m.id)).toEqual(['2']);
    expect(auditExceptions(list, [], '2026-11-30', rules).overdue).toEqual([]);
  });
});
