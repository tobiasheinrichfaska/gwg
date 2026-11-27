import type { Reason } from '../../src/logic/index.ts';
import { reasonText, REASON_TEXTS, retentionSentence } from '../../src/ui/messages.ts';
import { mandate, rules } from '../helpers.ts';

// A missing key is a compile error; the test also checks the content of every sentence.
const ALL: Record<Reason, true> = {
  'bad-date': true,
  'bad-id': true,
  'unknown-legal-form': true,
  'unknown-risk-group': true,
  'bad-risk-reason': true,
  'bad-status': true,
  'bad-end': true,
  'bad-config': true,
  'bad-backup': true,
  'unsupported-version': true,
  'duplicate-id': true,
  'file-too-large': true,
  'store-failed': true,
};

describe('REASON_TEXTS', () => {
  it('has exactly one German sentence for every reason code', () => {
    expect(Object.keys(REASON_TEXTS).sort()).toEqual(Object.keys(ALL).sort());
    for (const code of Object.keys(ALL) as Reason[]) {
      const text = reasonText(code);
      expect(text.length).toBeGreaterThan(10);
      expect(text.endsWith('.')).toBe(true);
      expect(text).not.toContain(code);
    }
  });
});

describe('retentionSentence', () => {
  it('names the due date for an ended mandate, still running', () => {
    const s = retentionSentence(
      mandate({ active: false, endedOn: '2026-03-31' }),
      rules,
      '2026-11-27',
    );
    expect(s).toContain('01.01.2032');
    expect(s).toContain('31.03.2026');
    expect(s).toContain('rechtlich zu klären');
  });
  it('says the period is over once the due date has come', () => {
    const s = retentionSentence(
      mandate({ active: false, endedOn: '2020-03-31' }),
      rules,
      '2026-11-27',
    );
    expect(s).toContain('01.01.2026');
    expect(s).toContain('abgelaufen');
  });
  it('points to the legal clarification for a mandate that has not ended', () => {
    const s = retentionSentence(mandate(), rules, '2026-11-27');
    expect(s).toContain('nicht beendet');
    expect(s).toContain('rechtlich zu klären');
  });
});
