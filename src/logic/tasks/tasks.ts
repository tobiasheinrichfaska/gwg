import type { DunningStageName, RulesConfig } from '../config.ts';
import { addDays, daysBetween, isDateKey } from '../core/index.ts';
import {
  confirmedHits,
  openHits,
  unscreenableSubjects,
  type Hit,
  type ScreeningDecision,
  type SubjectKind,
} from '../sanctions/index.ts';
import {
  checkMandate,
  dunningStage,
  nextReviewDate,
  retentionDueFrom,
  type DateKey,
  type Mandate,
  type Person,
  type Reason,
  PEP_ROLES,
} from '../mandate/index.ts';

export type TaskKind =
  | 'review-due'
  | 'dunning-reminder'
  | 'dunning-threat'
  | 'dunning-escalate'
  | 'pep-ask'
  | 'pep-approval'
  | 'sanction-clear'
  | 'sanction-confirmed'
  | 'sanction-unscreenable'
  | 'request-missing'
  | 'retention-due'
  | 'unclassified';

export interface Task {
  mandateId: string;
  kind: TaskKind;
  /** Day the task became due; null when it has no deadline (missing request, no risk group). */
  dueOn: DateKey | null;
  /** Whole days since `dueOn` (0 when there is no due date or it is today). */
  daysOverdue: number;
  /** Only for the PEP kinds: the person concerned. */
  personId?: string;
  /** Only for the sanction kinds: who was hit, by which list entry, and how strong. */
  subjectKind?: SubjectKind;
  subjectId?: string;
  entryId?: string;
  klasse?: 'gelb' | 'rot';
}

export interface InvalidMandate {
  mandateId: string;
  reason: Reason;
}

export interface TaskList {
  tasks: Task[];
  /** Mandates that failed `checkMandate`: skipped, but reported, never silent. */
  invalid: InvalidMandate[];
}

/** Sort priority: lower comes first. */
const PRIORITY: Record<TaskKind, number> = {
  'dunning-escalate': 0,
  'sanction-clear': 1, // red hits; yellow ones rank `YELLOW_PRIORITY`
  'sanction-confirmed': 2,
  'sanction-unscreenable': 2.5,
  'pep-approval': 3,
  'retention-due': 4,
  'dunning-threat': 5,
  'review-due': 7,
  'dunning-reminder': 8,
  'pep-ask': 9,
  'request-missing': 10,
  unclassified: 11,
};
const YELLOW_PRIORITY = 6;
const priorityOf = (t: Task): number =>
  t.kind === 'sanction-clear' && t.klasse === 'gelb' ? YELLOW_PRIORITY : PRIORITY[t.kind];

const STAGE_KIND: Record<DunningStageName, TaskKind> = {
  erinnerung: 'dunning-reminder',
  androhung: 'dunning-threat',
  eskalation: 'dunning-escalate',
};

/**
 * Work list derived from the mandates: who is due, who gets dunned, who escalates.
 * Pure and deterministic; only active mandates get tasks, except `retention-due` (inactive only).
 * A mandate that fails `checkMandate` is listed in `invalid` instead of producing tasks.
 * `hits` are computed outside (screening); open ones become `sanction-clear` (one per hit), confirmed
 * ones `sanction-confirmed` until the decision has an `actionNote`. Only active mandates get them.
 * `today` must be a valid date key (a programming error otherwise, it throws).
 */
export function buildTasks(
  mandates: readonly Mandate[],
  persons: readonly Person[],
  today: DateKey,
  rules: RulesConfig,
  hits: readonly Hit[],
  decisions: readonly ScreeningDecision[],
): TaskList {
  if (!isDateKey(today)) throw new Error(`bad date key: ${today}`);
  const tasks: Task[] = [];
  const invalid: InvalidMandate[] = [];
  const add = (m: Mandate, kind: TaskKind, dueOn: DateKey | null): void => {
    tasks.push({
      mandateId: m.id,
      kind,
      dueOn,
      daysOverdue: dueOn === null ? 0 : daysBetween(dueOn, today),
    });
  };

  const addPep = (m: Mandate, kind: TaskKind, personId: string, daysOverdue: number): void => {
    tasks.push({ mandateId: m.id, kind, dueOn: null, daysOverdue, personId });
  };

  for (const m of mandates) {
    const checked = checkMandate(m, rules);
    if (!checked.ok) {
      invalid.push({ mandateId: m.id, reason: checked.reason });
      continue;
    }
    if (!m.active) {
      const due = retentionDueFrom(m.endedOn, rules);
      if (due !== null && daysBetween(due, today) >= 0) add(m, 'retention-due', due);
      continue;
    }
    if (m.idStatus === 'vollstaendig') {
      const due = nextReviewDate(m, persons, rules);
      if (due !== null && daysBetween(due, today) >= 0) add(m, 'review-due', due);
    }
    if (m.idStatus === 'leer' || m.idStatus === 'unvollstaendig' || m.idStatus === 'eskalation') {
      if (m.firstRequestOn === null) {
        if (m.idStatus !== 'eskalation') add(m, 'request-missing', null);
      } else {
        const stage = dunningStage(m.firstRequestOn, today, rules);
        const step = rules.dunningSteps.find((s) => s.stage === stage);
        if (stage !== 'keine' && step) {
          add(m, STAGE_KIND[stage], addDays(m.firstRequestOn, step.day));
        }
      }
    }
    for (const p of persons) {
      if (p.mandateId !== m.id || !PEP_ROLES.includes(p.role)) continue;
      const a = p.pep.answer;
      if (a === null) addPep(m, 'pep-ask', p.id, 0);
      else if (a === 'unbekannt') {
        const asked = p.pep.askedOn;
        addPep(
          m,
          'pep-ask',
          p.id,
          asked !== null && isDateKey(asked) ? daysBetween(asked, today) : 0,
        );
      }
      if ((a === 'ja' || p.pep.nahestehend === 'ja') && p.pep.approvedOn === null) {
        addPep(m, 'pep-approval', p.id, 0);
      }
    }
    if (m.riskGroupId === null || !rules.riskGroups.some((g) => g.id === m.riskGroupId)) {
      add(m, 'unclassified', null);
    }
  }

  const active = new Set(
    mandates.filter((m) => m.active && checkMandate(m, rules).ok).map((m) => m.id),
  );
  for (const h of openHits(hits, decisions, persons, mandates)) {
    if (!active.has(h.mandateId)) continue;
    tasks.push({
      mandateId: h.mandateId,
      kind: 'sanction-clear',
      dueOn: null,
      daysOverdue: 0,
      subjectKind: h.subjectKind,
      subjectId: h.subjectId,
      entryId: h.entryId,
      klasse: h.klasse,
    });
  }
  for (const { hit: h, decision: d } of confirmedHits(hits, decisions, persons, mandates)) {
    if (d.actionNote !== '' || !active.has(h.mandateId)) continue;
    tasks.push({
      mandateId: h.mandateId,
      kind: 'sanction-confirmed',
      dueOn: null,
      daysOverdue: 0,
      subjectKind: h.subjectKind,
      subjectId: h.subjectId,
      entryId: h.entryId,
      klasse: h.klasse,
    });
  }

  // Names the screening cannot compare: never silently green, so a task each (data to complete).
  const noName = unscreenableSubjects(persons, mandates);
  for (const p of noName.persons) {
    if (!active.has(p.mandateId)) continue;
    tasks.push({
      mandateId: p.mandateId,
      kind: 'sanction-unscreenable',
      dueOn: null,
      daysOverdue: 0,
      subjectKind: 'person',
      subjectId: p.id,
    });
  }
  for (const m of noName.mandates) {
    if (!active.has(m.id)) continue;
    tasks.push({
      mandateId: m.id,
      kind: 'sanction-unscreenable',
      dueOn: null,
      daysOverdue: 0,
      subjectKind: 'mandate',
      subjectId: m.id,
    });
  }

  const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);
  tasks.sort(
    (a, b) =>
      priorityOf(a) - priorityOf(b) ||
      b.daysOverdue - a.daysOverdue ||
      cmp(a.mandateId, b.mandateId) ||
      cmp(a.personId ?? '', b.personId ?? '') ||
      cmp(a.subjectId ?? '', b.subjectId ?? '') ||
      cmp(a.entryId ?? '', b.entryId ?? ''),
  );
  return { tasks, invalid };
}
