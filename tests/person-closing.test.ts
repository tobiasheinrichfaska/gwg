import {
  checkAuditClosing,
  checkPerson,
  PERSON_ROLES,
  type AuditClosing,
  type Person,
} from '../src/logic/index.ts';
import { mandate } from './helpers.ts';

const ms = [mandate({ id: '10001' })];
const person = (over: Partial<Person> = {}): Person => ({
  id: 'p1',
  mandateId: '10001',
  role: 'inhaber',
  lastName: 'Muster',
  firstName: 'Max',
  birth: '1970-05-01',
  ...over,
});
const code = (p: Person) => {
  const r = checkPerson(p, ms);
  return r.ok ? 'ok' : r.reason;
};

describe('checkPerson', () => {
  it('accepts a valid person, every role, empty first name, all birth forms', () => {
    expect(code(person())).toBe('ok');
    for (const role of PERSON_ROLES) expect(code(person({ role }))).toBe('ok');
    expect(code(person({ firstName: '' }))).toBe('ok');
    for (const birth of [null, '1970', '1970-05', '1970-05-01', '2000-02-29']) {
      expect(code(person({ birth }))).toBe('ok');
    }
  });
  it.each([
    ['empty id', { id: '' }],
    ['blank id', { id: '  ' }],
    ['empty last name', { lastName: '' }],
    ['blank last name', { lastName: ' ' }],
    ['multi-line last name', { lastName: 'a\nb' }],
    ['control char in first name', { firstName: 'a\u0007' }],
    ['too long last name', { lastName: 'x'.repeat(201) }],
    ['too long id', { id: 'x'.repeat(201) }],
    ['unknown role', { role: 'chef' as Person['role'] }],
    ['empty birth', { birth: '' }],
    ['month 13', { birth: '1970-13' }],
    ['day 32', { birth: '1970-01-32' }],
    ['30 February', { birth: '2001-02-30' }],
    ['29 February in a common year', { birth: '2001-02-29' }],
    ['day without month', { birth: '1970--01' }],
    ['two-digit year', { birth: '70' }],
    ['text', { birth: 'unbekannt' }],
  ])('rejects %s as bad-person', (_n, over) => {
    expect(code(person(over as Partial<Person>))).toBe('bad-person');
  });
  it('accepts the length limit exactly', () => {
    expect(code(person({ lastName: 'x'.repeat(200) }))).toBe('ok');
  });
  it('rejects an unknown mandate', () => {
    expect(code(person({ mandateId: '99999' }))).toBe('unknown-mandate');
    expect(checkPerson(person(), [])).toEqual({ ok: false, reason: 'unknown-mandate' });
  });
});

const closing = (over: Partial<AuditClosing> = {}): AuditClosing => ({
  stichtag: '2026-11-30',
  closedOn: '2026-11-30',
  by: 'Dr. Beispiel',
  note: 'ok',
  ...over,
});
const cc = (c: AuditClosing) => {
  const r = checkAuditClosing(c);
  return r.ok ? 'ok' : r.reason;
};

describe('checkAuditClosing', () => {
  it('accepts a valid closing, the same day, a later day and an empty note', () => {
    expect(cc(closing())).toBe('ok');
    expect(cc(closing({ closedOn: '2027-01-02' }))).toBe('ok');
    expect(cc(closing({ note: '' }))).toBe('ok');
  });
  it.each([
    ['bad stichtag', { stichtag: '2026-02-30' }],
    ['bad closedOn', { closedOn: 'x' }],
    ['closed before the cut-off', { closedOn: '2026-11-29' }],
    ['empty by', { by: '' }],
    ['blank by', { by: '  ' }],
    ['multi-line by', { by: 'a\nb' }],
    ['by too long', { by: 'x'.repeat(101) }],
    ['note too long', { note: 'x'.repeat(501) }],
    ['multi-line note', { note: 'a\nb' }],
    ['control char in note', { note: 'a\u0000' }],
  ])('rejects %s as bad-closing', (_n, over) => {
    expect(cc(closing(over as Partial<AuditClosing>))).toBe('bad-closing');
  });
  it('accepts the length limits exactly', () => {
    expect(cc(closing({ by: 'x'.repeat(100), note: 'y'.repeat(500) }))).toBe('ok');
  });
});
