import { checkRules, type RulesConfig } from '../config.ts';
import { fail, findUnsafe, isDateKey, ok, type DateKey, type Result } from '../core/index.ts';
import { checkAuditClosing, type AuditClosing } from '../audit/index.ts';
import {
  checkDecision,
  checkScreeningRun,
  decisionKey,
  emptyLastScreening,
  type LastScreening,
  type ScreeningRun,
  type ScreeningDecision,
} from '../sanctions/index.ts';
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
  /** Rulings on screening hits; a file without the key reads as empty. */
  screeningDecisions: ScreeningDecision[];
  /** Last screening run per list kind; a file without the key reads as 'never'. */
  lastScreening: LastScreening;
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

const runOut = (r: LastScreening['sanktion']) =>
  r === null
    ? null
    : {
        ranOn: r.ranOn,
        listKind: r.listKind,
        listFetchedOn: r.listFetchedOn,
        hitCount: r.hitCount,
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
    screeningDecisions: [...b.screeningDecisions]
      .sort(byKey<ScreeningDecision>(decisionKey))
      .map((d) => ({
        subjectKind: d.subjectKind,
        subjectId: d.subjectId,
        entryId: d.entryId,
        listKind: d.listKind,
        listFetchedOn: d.listFetchedOn,
        decision: d.decision,
        reason: d.reason,
        decidedOn: d.decidedOn,
        decidedBy: d.decidedBy,
        subjectSnapshot: d.subjectSnapshot,
        entrySnapshot: d.entrySnapshot,
        actionNote: d.actionNote,
      })),
    lastScreening: {
      sanktion: runOut(b.lastScreening.sanktion),
      pep: runOut(b.lastScreening.pep),
    },
  };
  return JSON.stringify(out, null, 2) + '\n';
}

/**
 * Whole-data-set check: values, duplicate ids and cross-references (orphan persons and decisions).
 * `parseBackup` runs it on what it read; the app runs it before every save and download, so an invalid
 * data set is never written. Pure; the first problem fails, with `where`.
 */
export function checkBackup(b: Backup): R<Backup> {
  if (b.format !== BACKUP_FORMAT || b.version !== 2) return bad('format');
  if (typeof b.createdOn !== 'string' || !isDateKey(b.createdOn)) return bad('createdOn');
  const rules = checkRules(b.rules);
  if (!rules.ok) return fail(rules.reason, 'rules');
  const seen = new Set<string>();
  for (const [i, m] of b.mandates.entries()) {
    const where = `mandates[${i}]`;
    if (!ID_STATUSES.includes(m.idStatus)) return fail('bad-status', `${where}.idStatus`);
    const c = checkMandate(m, b.rules);
    if (!c.ok) return fail(c.reason, where);
    if (seen.has(m.id)) return fail('duplicate-id', `${where}.id`);
    seen.add(m.id);
  }
  const seenPersons = new Set<string>();
  for (const [i, p] of b.persons.entries()) {
    const where = `persons[${i}]`;
    const c = checkPerson(p, b.mandates);
    if (!c.ok) return fail(c.reason, where);
    if (seenPersons.has(p.id)) return fail('duplicate-id', `${where}.id`);
    seenPersons.add(p.id);
  }
  const seenDays = new Set<string>();
  for (const [i, a] of b.auditClosings.entries()) {
    const where = `auditClosings[${i}]`;
    const c = checkAuditClosing(a);
    if (!c.ok) return fail(c.reason, where);
    if (seenDays.has(a.stichtag)) return fail('duplicate-id', `${where}.stichtag`);
    seenDays.add(a.stichtag);
  }
  const seenKeys = new Set<string>();
  for (const [i, d] of b.screeningDecisions.entries()) {
    const where = `screeningDecisions[${i}]`;
    const c = checkDecision(d, b.persons, b.mandates);
    if (!c.ok) return fail(c.reason, where);
    const key = decisionKey(d);
    if (seenKeys.has(key)) return fail('duplicate-id', where);
    seenKeys.add(key);
  }
  for (const k of ['sanktion', 'pep'] as const) {
    const r = b.lastScreening[k];
    if (r === null) continue;
    const c = checkScreeningRun(r, k);
    if (!c.ok) return fail(c.reason, `lastScreening.${k}`);
  }
  return ok(b);
}

const bad = (where: string): R<never> => fail('bad-backup', where);

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Pollution keys anywhere in the parsed tree. */
function hasForbiddenKey(v: unknown): string | null {
  const f = findUnsafe(v, FORBIDDEN_KEYS);
  return f === null ? null : f.kind === 'deep' ? '.nesting' : f.path;
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

const DECISION_SPEC: Record<string, Kind> = {
  subjectKind: 'string',
  subjectId: 'string',
  entryId: 'string',
  listKind: 'string',
  listFetchedOn: 'string',
  decision: 'string',
  reason: 'string',
  decidedOn: 'string',
  decidedBy: 'string',
  subjectSnapshot: 'string',
  entrySnapshot: 'string',
  actionNote: 'string',
};

const RUN_SPEC: Record<string, Kind> = {
  ranOn: 'string',
  listKind: 'string',
  listFetchedOn: 'string',
  hitCount: 'number',
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
  // The screening keys are optional in version 2 (missing = empty): default them before the strict shape check.
  const src: Obj =
    raw.version === 2
      ? {
          ...raw,
          ...(Object.hasOwn(raw, 'screeningDecisions') ? {} : { screeningDecisions: [] }),
          ...(Object.hasOwn(raw, 'lastScreening') ? {} : { lastScreening: emptyLastScreening() }),
        }
      : raw;
  const top = shape(
    src,
    raw.version === 1
      ? v1
      : {
          ...v1,
          persons: 'any',
          auditClosings: 'any',
          screeningDecisions: 'any',
          lastScreening: 'any',
        },
    'root',
  );
  if (!top.ok) return top;
  const rules = readRules(raw.rules);
  if (!rules.ok) return rules;
  if (!isDateKey(raw.createdOn as string)) return bad('createdOn');
  const rawMandates = list(raw.mandates, 'mandates');
  if (!rawMandates.ok) return rawMandates;
  const mandates: Mandate[] = [];
  for (const [i, item] of rawMandates.value.entries()) {
    const s = shape(item, MANDATE_SPEC, `mandates[${i}]`);
    if (!s.ok) return s;
    mandates.push(s.value as unknown as Mandate);
  }
  const persons: Person[] = [];
  const closings: AuditClosing[] = [];
  const decisions: ScreeningDecision[] = [];
  let lastScreening = emptyLastScreening();
  if (raw.version === 2) {
    const rawPersons = list(raw.persons, 'persons');
    if (!rawPersons.ok) return rawPersons;
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
      persons.push(s.value as unknown as Person);
    }
    const rawClosings = list(raw.auditClosings, 'auditClosings');
    if (!rawClosings.ok) return rawClosings;
    for (const [i, item] of rawClosings.value.entries()) {
      const where = `auditClosings[${i}]`;
      const s = shape(item, CLOSING_SPEC, where);
      if (!s.ok) return s;
      closings.push(s.value as unknown as AuditClosing);
    }
    const rawDecisions = list(src.screeningDecisions, 'screeningDecisions');
    if (!rawDecisions.ok) return rawDecisions;
    for (const [i, item] of rawDecisions.value.entries()) {
      const where = `screeningDecisions[${i}]`;
      const s = shape(item, DECISION_SPEC, where);
      if (!s.ok) return s;
      decisions.push(s.value as unknown as ScreeningDecision);
    }
    const ls = shape(src.lastScreening, { sanktion: 'any', pep: 'any' }, 'lastScreening');
    if (!ls.ok) return ls;
    for (const k of ['sanktion', 'pep'] as const) {
      const where = `lastScreening.${k}`;
      const v = ls.value[k];
      if (v === null) continue;
      const r = shape(v, RUN_SPEC, where);
      if (!r.ok) return r;
      lastScreening = { ...lastScreening, [k]: r.value as unknown as ScreeningRun };
    }
  }
  // Every cross-reference and value rule lives in `checkBackup`, the same check the save runs.
  return checkBackup({
    format: BACKUP_FORMAT,
    version: 2,
    createdOn: raw.createdOn as string,
    rules: rules.value,
    mandates,
    persons,
    auditClosings: closings,
    screeningDecisions: decisions,
    lastScreening,
  });
}
