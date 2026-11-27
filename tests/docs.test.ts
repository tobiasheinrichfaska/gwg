import { readFileSync } from 'node:fs';
import {
  DEFAULT_RISK_GROUPS,
  DISCREPANCY_RECHECK_DAYS,
  DUNNING_STEPS,
  LEGAL_FORMS,
  RETENTION_YEARS,
  REVIEW_INTERVAL_MONTHS,
  SANCTION_THRESHOLDS,
  type Reason,
} from '../src/logic/index.ts';

const html = readFileSync(new URL('../docs/data-model.html', import.meta.url), 'utf8');

// Every member of the union must be listed here, or this file does not compile.
const REASONS: Record<Reason, true> = {
  'bad-date': true,
  'bad-id': true,
  'unknown-legal-form': true,
  'unknown-risk-group': true,
  'bad-risk-reason': true,
  'bad-status': true,
  'bad-end': true,
  'bad-config': true,
  'bad-person': true,
  'bad-pep': true,
  'unknown-mandate': true,
  'bad-closing': true,
  'bad-decision': true,
  'bad-backup': true,
  'bad-list': true,
  'bad-settings': true,
  'fetch-failed': true,
  'relay-bad-response': true,
  'unsupported-version': true,
  'duplicate-id': true,
  'file-too-large': true,
  'store-failed': true,
};

describe('docs/data-model.html against the code', () => {
  it('lists every error code', () => {
    for (const code of Object.keys(REASONS)) expect(html).toContain(`<td>${code}</td>`);
  });
  it('lists every configuration number with its value', () => {
    const rows: [string, number][] = [
      ...Object.entries(REVIEW_INTERVAL_MONTHS).map(([k, v]): [string, number] => [
        `REVIEW_INTERVAL_MONTHS.${k}`,
        v,
      ]),
      ...DUNNING_STEPS.map((s): [string, number] => [`DUNNING_STEPS.${s.stage}`, s.day]),
      ['RETENTION_YEARS', RETENTION_YEARS],
      ['DISCREPANCY_RECHECK_DAYS', DISCREPANCY_RECHECK_DAYS],
      ['SANCTION_THRESHOLDS.possible', SANCTION_THRESHOLDS.possible],
      ['SANCTION_THRESHOLDS.strong', SANCTION_THRESHOLDS.strong],
    ];
    for (const [name, value] of rows) {
      expect(html).toContain(`<td>${name}</td><td>${value}</td>`);
    }
  });
  it('states the factory defaults with their counts', () => {
    expect(html).toContain(`(${LEGAL_FORMS.length} Rechtsformen)`);
    expect(html).toContain(`(${DEFAULT_RISK_GROUPS.length} Startgruppen`);
  });
});

describe('data-model.html lists every public function of the logic layer', () => {
  // Deliberately internal helpers that are exported only for sibling modules or tests.
  const INTERNAL = new Set([
    'ok',
    'fail',
    'levenshtein',
    'isPartialDate',
    'isListBirth',
    'goodLine',
  ]);

  it('has a <td> cell naming each exported function', async () => {
    const api: Record<string, unknown> = await import('../src/logic/index.ts');
    const missing = Object.entries(api)
      .filter(([name, value]) => typeof value === 'function' && !INTERNAL.has(name))
      .map(([name]) => name)
      .filter((name) => !new RegExp(`<td>[^<]*\\b${name}\\b[^<]*</td>`).test(html));
    expect(missing).toEqual([]);
  });
});
