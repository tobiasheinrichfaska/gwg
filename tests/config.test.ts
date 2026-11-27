import { DEFAULT_RULES, checkRules, type RulesConfig } from '../src/logic/index.ts';

const bad = (patch: Partial<RulesConfig>) =>
  expect(checkRules({ ...DEFAULT_RULES, ...patch })).toEqual({ ok: false, reason: 'bad-config' });

describe('checkRules', () => {
  it('accepts DEFAULT_RULES', () => {
    expect(checkRules(DEFAULT_RULES).ok).toBe(true);
  });
  it('rejects a review interval <= 0', () => {
    bad({ reviewIntervalMonths: { ...DEFAULT_RULES.reviewIntervalMonths, hoch: 0 } });
  });
  it('rejects a dunning day <= 0', () => {
    bad({ dunningSteps: [{ day: -1, stage: 'erinnerung' }] });
  });
  it('rejects an unknown dunning stage', () => {
    bad({ dunningSteps: [{ day: 14, stage: 'mahnbescheid' as never }] });
  });
  it('rejects retention years <= 0', () => {
    bad({ retentionYears: 0 });
  });
  it('rejects recheck days <= 0', () => {
    bad({ discrepancyRecheckDays: 0 });
  });
  it('rejects dunning steps that do not ascend', () => {
    bad({
      dunningSteps: [
        { day: 28, stage: 'androhung' },
        { day: 14, stage: 'erinnerung' },
      ],
    });
  });
  it('rejects possible > strong', () => {
    bad({ sanctionThresholds: { possible: 0.95, strong: 0.9 } });
  });
  it('rejects thresholds outside 0..1', () => {
    bad({ sanctionThresholds: { possible: 0.5, strong: 1.5 } });
    bad({ sanctionThresholds: { possible: -0.1, strong: 0.5 } });
  });
  it('rejects duplicate legal form keys', () => {
    bad({ legalForms: [DEFAULT_RULES.legalForms[0]!, DEFAULT_RULES.legalForms[0]!] });
  });
  it('rejects duplicate risk group ids', () => {
    bad({ riskGroups: [DEFAULT_RULES.riskGroups[0]!, DEFAULT_RULES.riskGroups[0]!] });
  });
});
