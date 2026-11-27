import { formatDate, NONE } from '../../src/ui/format.ts';

describe('formatDate', () => {
  it('shows a stored date as DD.MM.YYYY', () => {
    expect(formatDate('2026-01-05')).toBe('05.01.2026');
    expect(formatDate('2032-12-31')).toBe('31.12.2032');
  });
  it('shows a dash for a missing date', () => {
    expect(formatDate(null)).toBe(NONE);
    expect(formatDate(undefined)).toBe(NONE);
    expect(formatDate('')).toBe(NONE);
  });
  it('does not hide a value that is not a date', () => {
    expect(formatDate('2026-02-30')).toBe('2026-02-30');
    expect(formatDate('gestern')).toBe('gestern');
  });
});
