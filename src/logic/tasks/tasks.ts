import type { RulesConfig } from '../config.ts';
import { addDays, daysBetween, isDateKey } from '../core/index.ts';
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
  'pep-approval': 1,
  'retention-due': 2,
  'dunning-threat': 3,
  'review-due': 4,
  'dunning-reminder': 5,
  'pep-ask': 6,
  'request-missing': 7,
  unclassified: 8,
};

const STAGE_KIND: Record<string, TaskKind> = {
  erinnerung: 'dunning-reminder',
  androhung: 'dunning-threat',
  eskalation: 'dunning-escalate',
};

/**
 * Work list derived from the mandates: who is due, who gets dunned, who escalates.
 * Pure and deterministic; only active mandates get tasks, except `retention-due` (inactive only).
 * A mandate that fails `checkMandate` is listed in `invalid` instead of producing tasks.
 * `today` must be a valid date key (a programming error otherwise, it throws).
 */
export function buildTasks(
  mandates: readonly Mandate[],
  persons: readonly Person[],
  today: DateKey,
  rules: RulesConfig,
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
        const kind = STAGE_KIND[stage];
        const step = rules.dunningSteps.find((s) => s.stage === stage);
        if (kind && step) add(m, kind, addDays(m.firstRequestOn, step.day));
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

  tasks.sort(
    (a, b) =>
      PRIORITY[a.kind] - PRIORITY[b.kind] ||
      b.daysOverdue - a.daysOverdue ||
      (a.mandateId < b.mandateId ? -1 : a.mandateId > b.mandateId ? 1 : 0) ||
      ((a.personId ?? '') < (b.personId ?? '')
        ? -1
        : (a.personId ?? '') > (b.personId ?? '')
          ? 1
          : 0),
  );
  return { tasks, invalid };
}
