import { checkRules, type RulesConfig } from '../config.ts';
import { fail, isDateKey, ok, type DateKey, type Result } from '../core/index.ts';
import { checkAuditClosing, type AuditClosing } from '../audit/index.ts';
import {
  checkMandate,
  checkPerson,
  emptyPep,
  ID_STATUSES,
  type Mandate,
  type Person,
  type Reason,
} from '../mandate/index.ts';

export const BACKUP_FORMAT = 'gwg-backup';
export const BACKUP_VERSION = 2;

/** Stored form, version 2 (version 1 files are migrated on read: no persons, no closings). Pure data: encryption is the job of the io layer. */
export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: 2;
  createdOn: DateKey;
  rules: RulesConfig;
  mandates: Mandate[];
  persons: Person[];
  auditClosings: AuditClosing[];
};

type Obj = Record<string, unknown>;
type R<T> = Result<T, Reason>;

const FORBIDDEN_KEYS = ['__proto__', 'constructor'];

const sortById = (ms: readonly Mandate[]): Mandate[] =>
  [...ms].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const byKey =
  <T>(key: (x: T) => string) =>
  (a: T, b: T) => {
    const x = key(a);
    const y = key(b);
    return x < y ? -1 : x > y ? 1 : 0;
  };

/** JSON with a fixed key order and mandates sorted by id, persons by mandate and id, closings by cut-off date (equal data gives equal text). */
export function serializeBackup(b: Backup): string {
  const r = b.rules;
  const out = {
    format: b.format,
    version: b.version,
    createdOn: b.createdOn,
    rules: {
      reviewIntervalMonths: {
        niedrig: r.reviewIntervalMonths.niedrig,
        normal: r.reviewIntervalMonths.normal,
        hoch: r.reviewIntervalMonths.hoch,
      },
      dunningSteps: r.dunningSteps.map((s) => ({ day: s.day, stage: s.stage })),
      retentionYears: r.retentionYears,
      discrepancyRecheckDays: r.discrepancyRecheckDays,
      sanctionThresholds: {
        possible: r.sanctionThresholds.possible,
        strong: r.sanctionThresholds.strong,
      },
      legalForms: r.legalForms.map((f) => ({
        key: f.key,
        label: f.label,
        checkType: f.checkType,
        registerLookup: f.registerLookup,
      })),
      riskGroups: r.riskGroups.map((g) => ({ id: g.id, name: g.name, riskClass: g.riskClass })),
    },
    mandates: sortById(b.mandates).map((m) => ({
      id: m.id,
      name: m.name,
      legalForm: m.legalForm,
      active: m.active,
      idStatus: m.idStatus,
      riskGroupId: m.riskGroupId,
      riskReason: m.riskReason,
      isPep: m.isPep,
      firstRequestOn: m.firstRequestOn,
      lastCheckOn: m.lastCheckOn,
      endedOn: m.endedOn,
    })),
    persons: [...b.persons]
      .sort((a, c) => byKey<Person>((p) => p.mandateId)(a, c) || byKey<Person>((p) => p.id)(a, c))
      .map((p) => ({
        id: p.id,
        mandateId: p.mandateId,
        role: p.role,
        lastName: p.lastName,
        firstName: p.firstName,
        birth: p.birth,
        pep: {
          answer: p.pep.answer,
          askedOn: p.pep.askedOn,
          funktion: p.pep.funktion,
          amtEndedOn: p.pep.amtEndedOn,
          nahestehend: p.pep.nahestehend,
          approvedOn: p.pep.approvedOn,
          approvedBy: p.pep.approvedBy,
        },
      })),
    auditClosings: [...b.auditClosings]
      .sort(byKey<AuditClosing>((c) => c.stichtag))
      .map((c) => ({ stichtag: c.stichtag, closedOn: c.closedOn, by: c.by, note: c.note })),
  };
  return JSON.stringify(out, null, 2) + '\n';
}

const bad = (where: string): R<never> => fail('bad-backup', where);

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Pollution keys anywhere in the parsed tree. */
function hasForbiddenKey(v: unknown): string | null {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const w = hasForbiddenKey(v[i]);
      if (w !== null) return `[${i}]${w}`;
    }
  } else if (isObj(v)) {
    for (const k of Object.keys(v)) {
      if (FORBIDDEN_KEYS.includes(k)) return `.${k}`;
      const w = hasForbiddenKey(v[k]);
      if (w !== null) return `.${k}${w}`;
    }
  }
  return null;
}

type Kind = 'string' | 'boolean' | 'number' | 'string|null' | 'any';

/** Exactly these keys, each with its runtime type; returns the object or the failing place. */
function shape(v: unknown, spec: Record<string, Kind>, where: string): R<Obj> {
  if (!isObj(v)) return bad(where);
  for (const k of Object.keys(v)) if (!(k in spec)) return bad(`${where}.${k}`);
  for (const [k, kind] of Object.entries(spec)) {
    if (!Object.hasOwn(v, k)) return bad(`${where}.${k}`);
    const x = v[k];
    const okType =
      kind === 'any'
        ? true
        : kind === 'string|null'
          ? x === null || typeof x === 'string'
          : kind === 'number'
            ? typeof x === 'number' && Number.isFinite(x)
            : typeof x === kind;
    if (!okType) return bad(`${where}.${k}`);
  }
  return ok(v);
}

function list(v: unknown, where: string): R<unknown[]> {
  return Array.isArray(v) ? ok(v) : bad(where);
}

function readRules(v: unknown): R<RulesConfig> {
  const top = shape(
    v,
    {
      reviewIntervalMonths: 'any',
      dunningSteps: 'any',
      retentionYears: 'number',
      discrepancyRecheckDays: 'number',
      sanctionThresholds: 'any',
      legalForms: 'any',
      riskGroups: 'any',
    },
    'rules',
  );
  if (!top.ok) return top;
  const o = v as Obj;
  const ri = shape(
    o.reviewIntervalMonths,
    { niedrig: 'number', normal: 'number', hoch: 'number' },
    'rules.reviewIntervalMonths',
  );
  if (!ri.ok) return ri;
  const st = shape(
    o.sanctionThresholds,
    { possible: 'number', strong: 'number' },
    'rules.sanctionThresholds',
  );
  if (!st.ok) return st;
  const steps = list(o.dunningSteps, 'rules.dunningSteps');
  if (!steps.ok) return steps;
  const forms = list(o.legalForms, 'rules.legalForms');
  if (!forms.ok) return forms;
  const groups = list(o.riskGroups, 'rules.riskGroups');
  if (!groups.ok) return groups;
  for (const [i, s] of steps.value.entries()) {
    const r = shape(s, { day: 'number', stage: 'string' }, `rules.dunningSteps[${i}]`);
    if (!r.ok) return r;
  }
  for (const [i, f] of forms.value.entries()) {
    const w = `rules.legalForms[${i}]`;
    const r = shape(
      f,
      { key: 'string', label: 'string', checkType: 'string', registerLookup: 'boolean' },
      w,
    );
    if (!r.ok) return r;
    if (!['A', 'B', 'C'].includes(r.value.checkType as string)) return bad(`${w}.checkType`);
  }
  for (const [i, g] of groups.value.entries()) {
    const w = `rules.riskGroups[${i}]`;
    const r = shape(g, { id: 'string', name: 'string', riskClass: 'string' }, w);
    if (!r.ok) return r;
    if (!['niedrig', 'normal', 'hoch'].includes(r.value.riskClass as string)) {
      return bad(`${w}.riskClass`);
    }
  }
  const rules = {
    reviewIntervalMonths: ri.value,
    dunningSteps: steps.value,
    retentionYears: o.retentionYears,
    discrepancyRecheckDays: o.discrepancyRecheckDays,
    sanctionThresholds: st.value,
    legalForms: forms.value,
    riskGroups: groups.value,
  } as unknown as RulesConfig;
  const checked = checkRules(rules);
  return checked.ok ? checked : fail(checked.reason, 'rules');
}

const MANDATE_SPEC: Record<string, Kind> = {
  id: 'string',
  name: 'string',
  legalForm: 'string',
  active: 'boolean',
  idStatus: 'string',
  riskGroupId: 'string|null',
  riskReason: 'string',
  isPep: 'boolean',
  firstRequestOn: 'string|null',
  lastCheckOn: 'string|null',
  endedOn: 'string|null',
};

const PERSON_SPEC: Record<string, Kind> = {
  id: 'string',
  mandateId: 'string',
  role: 'string',
  lastName: 'string',
  firstName: 'string',
  birth: 'string|null',
  pep: 'any',
};

const PEP_SPEC: Record<string, Kind> = {
  answer: 'string|null',
  askedOn: 'string|null',
  funktion: 'string',
  amtEndedOn: 'string|null',
  nahestehend: 'string|null',
  approvedOn: 'string|null',
  approvedBy: 'string',
};

const CLOSING_SPEC: Record<string, Kind> = {
  stichtag: 'string',
  closedOn: 'string',
  by: 'string',
  note: 'string',
};

/** Strict, all-or-nothing reader: the first problem fails the whole file, nothing is dropped. */
export function parseBackup(text: string): Result<Backup, Reason> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return bad('json');
  }
  if (!isObj(raw)) return bad('root');
  const pollution = hasForbiddenKey(raw);
  if (pollution !== null) return bad(pollution.replace(/^\./, ''));
  if (raw.format !== BACKUP_FORMAT) return bad('format');
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
    return bad('version');
  }
  if (raw.version > BACKUP_VERSION) return fail('unsupported-version', 'version');
  const v1: Record<string, Kind> = {
    format: 'string',
    version: 'number',
    createdOn: 'string',
    rules: 'any',
    mandates: 'any',
  };
  const top = shape(
    raw,
    raw.version === 1 ? v1 : { ...v1, persons: 'any', auditClosings: 'any' },
    'root',
  );
  if (!top.ok) return top;
  if (!isDateKey(raw.createdOn as string)) return bad('createdOn');
  const rules = readRules(raw.rules);
  if (!rules.ok) return rules;
  const rawMandates = list(raw.mandates, 'mandates');
  if (!rawMandates.ok) return rawMandates;
  const seen = new Set<string>();
  const mandates: Mandate[] = [];
  for (const [i, item] of rawMandates.value.entries()) {
    const where = `mandates[${i}]`;
    const s = shape(item, MANDATE_SPEC, where);
    if (!s.ok) return s;
    const m = s.value as unknown as Mandate;
    if (!ID_STATUSES.includes(m.idStatus)) return fail('bad-status', `${where}.idStatus`);
    const c = checkMandate(m, rules.value);
    if (!c.ok) return fail(c.reason, where);
    if (seen.has(m.id)) return fail('duplicate-id', `${where}.id`);
    seen.add(m.id);
    mandates.push(m);
  }
  const persons: Person[] = [];
  const closings: AuditClosing[] = [];
  if (raw.version === 2) {
    const rawPersons = list(raw.persons, 'persons');
    if (!rawPersons.ok) return rawPersons;
    const seenPersons = new Set<string>();
    for (const [i, item] of rawPersons.value.entries()) {
      const where = `persons[${i}]`;
      // `pep` is optional in the file (older version 2 files): missing means the default.
      const hasPep = isObj(item) && Object.hasOwn(item, 'pep');
      let body: unknown = item;
      if (isObj(item) && !hasPep) body = { ...item, pep: emptyPep() };
      const s = shape(body, PERSON_SPEC, where);
      if (!s.ok) return s;
      const ps = shape(s.value.pep, PEP_SPEC, `${where}.pep`);
      if (!ps.ok) return ps;
      const p = s.value as unknown as Person;
      const c = checkPerson(p, mandates);
      if (!c.ok) return fail(c.reason, where);
      if (seenPersons.has(p.id)) return fail('duplicate-id', `${where}.id`);
      seenPersons.add(p.id);
      persons.push(p);
    }
    const rawClosings = list(raw.auditClosings, 'auditClosings');
    if (!rawClosings.ok) return rawClosings;
    const seenDays = new Set<string>();
    for (const [i, item] of rawClosings.value.entries()) {
      const where = `auditClosings[${i}]`;
      const s = shape(item, CLOSING_SPEC, where);
      if (!s.ok) return s;
      const a = s.value as unknown as AuditClosing;
      const c = checkAuditClosing(a);
      if (!c.ok) return fail(c.reason, where);
      if (seenDays.has(a.stichtag)) return fail('duplicate-id', `${where}.stichtag`);
      seenDays.add(a.stichtag);
      closings.push(a);
    }
  }
  return ok({
    format: BACKUP_FORMAT,
    version: 2,
    createdOn: raw.createdOn as string,
    rules: rules.value,
    mandates,
    persons,
    auditClosings: closings,
  });
}
