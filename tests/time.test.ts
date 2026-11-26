import { addDays, addMonths, daysBetween, isDateKey, todayKey } from '../src/logic/index.ts';

describe('time', () => {
  it('validates date keys', () => {
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('26-01-01')).toBe(false);
    expect(isDateKey(20260101)).toBe(false);
  });
  it('counts days across month and year ends', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-11-23', '2026-11-23')).toBe(0);
    expect(daysBetween('2026-11-23', '2026-11-20')).toBe(-3);
  });
  it('adds days', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('adds months and clamps to the last day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-23', 12)).toBe('2027-11-23');
    expect(addMonths('2026-11-23', 36)).toBe('2029-11-23');
    expect(addMonths('2026-02-28', -3)).toBe('2025-11-28');
  });
});

describe('invalid keys are refused, not rolled over', () => {
  it('throws for a day that does not exist', () => {
    expect(() => daysBetween('2026-02-30', '2026-03-01')).toThrow('bad date key');
    expect(() => addDays('2026-13-01', 1)).toThrow('bad date key');
    expect(() => addMonths('2026-04-31', 1)).toThrow('bad date key');
  });
});

describe('todayKey', () => {
  it('uses the local calendar fields, also around midnight', () => {
    expect(todayKey(new Date(2026, 10, 30, 0, 30))).toBe('2026-11-30');
    expect(todayKey(new Date(2026, 10, 30, 23, 30))).toBe('2026-11-30');
    expect(todayKey(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
  it('handles leap day', () => {
    expect(todayKey(new Date(2028, 1, 29, 12))).toBe('2028-02-29');
  });
  it('is independent of the time zone (local constructors) and yields a valid key', () => {
    for (const h of [0, 1, 12, 23]) {
      const k = todayKey(new Date(2027, 5, 15, h, 59));
      expect(k).toBe('2027-06-15');
      expect(isDateKey(k)).toBe(true);
    }
  });
});
