import {
  buildTasks,
  closingBlockers,
  currentSnapshot,
  isListStale,
  listAgeDays,
  mandateSnapshot,
  personSnapshot,
  type Backup,
  type ClosingCheck,
  type DateKey,
  type Hit,
  type LastScreening,
  type ListIndex,
  type ListSettings,
  type Mandate,
  type Person,
} from '../../logic/index.ts';
import { dayCount, formatDate } from '../format.ts';
import type { ScreeningResult, ScreeningStatus } from './context.ts';

/** Persons per chunk of the screening run; between two chunks the page can draw and react. */
export const CHUNK = 25;

/** Persons whose mandate is active (or missing: reported as not screenable), and the active mandates. */
export function screeningSubjects(
  persons: readonly Person[],
  mandates: readonly Mandate[],
): { persons: Person[]; mandates: Mandate[] } {
  const known = new Set(mandates.map((m) => m.id));
  const active = new Set(mandates.filter((m) => m.active).map((m) => m.id));
  return {
    persons: persons.filter((p) => active.has(p.mandateId) || !known.has(p.mandateId)),
    mandates: mandates.filter((m) => m.active),
  };
}

/**
 * Fingerprint of everything the screening reads: who is screened and under which name and birth.
 * Another value than the one of the last run means "Abgleich veraltet". Cheap, no hashing needed.
 */
export function subjectsSignature(
  persons: readonly Person[],
  mandates: readonly Mandate[],
): string {
  const s = screeningSubjects(persons, mandates);
  return [
    ...s.persons.map((p) => `p|${p.id}|${p.mandateId}|${personSnapshot(p)}`),
    ...s.mandates.map((m) => `m|${m.id}|${mandateSnapshot(m)}`),
  ].join('\n');
}

const sortKey = (h: Hit): string => `${h.subjectKind}/${h.subjectId}/${h.entryId}`;

/** Red before yellow, higher similarity first, then by subject and entry. */
export function sortHits(hits: readonly Hit[]): Hit[] {
  return [...hits].sort((a, b) => {
    if (a.klasse !== b.klasse) return a.klasse === 'rot' ? -1 : 1;
    if (a.aehnlichkeit !== b.aehnlichkeit) return b.aehnlichkeit - a.aehnlichkeit;
    const ka = sortKey(a);
    const kb = sortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** Hits whose person/mandate still exists in an active mandate. */
export function liveHitsOf(
  result: ScreeningResult | null,
  persons: readonly Person[],
  mandates: readonly Mandate[],
): Hit[] {
  if (result === null) return [];
  const active = new Set(mandates.filter((m) => m.active).map((m) => m.id));
  return result.hits.filter(
    (h) =>
      currentSnapshot(h.subjectKind, h.subjectId, persons, mandates) !== null &&
      active.has(h.mandateId),
  );
}

/** Why the shown hits may not be the whole truth (the screen shows them next to "Abgleich veraltet"). */
export function statusOf(
  list: ListIndex | null,
  result: ScreeningResult | null,
  last: LastScreening,
  signature: string,
  settings: ListSettings,
  today: DateKey,
  listVersion: number,
): ScreeningStatus {
  if (list === null) {
    return {
      state: 'no-list',
      reasons: ['Keine Sanktionsliste geladen: ein Abgleich ist nicht möglich.'],
    };
  }
  const reasons: string[] = [];
  if (isListStale(list, today, settings.maxAgeDays)) {
    reasons.push(
      `Die Liste ist veraltet: Stand ${formatDate(list.fetchedOn)}, ${dayCount(listAgeDays(list.fetchedOn, today))} alt (Höchstalter ${dayCount(settings.maxAgeDays)}).`,
    );
  }
  if (result === null) {
    const prior = last.sanktion;
    reasons.push(
      prior === null
        ? 'Es wurde noch kein Abgleich durchgeführt.'
        : `In dieser Sitzung wurde noch nicht abgeglichen (letzter Abgleich am ${formatDate(prior.ranOn)}).`,
    );
  } else {
    if (result.signature !== signature) {
      reasons.push(
        `Personen oder Mandate wurden seit dem Abgleich vom ${formatDate(result.ranOn)} geändert.`,
      );
    }
    // Another list with the SAME state date is another list too: the version counts every load/save.
    if (result.listFetchedOn !== list.fetchedOn || result.listVersion !== listVersion) {
      reasons.push('Seit dem Abgleich wurde eine andere Liste geladen.');
    }
  }
  return { state: reasons.length === 0 ? 'ok' : 'stale', reasons };
}

/**
 * What blocks or warns about closing the audit, from one consistent state. The screen shows it, and
 * `closeAudit` calls it again inside the save queue with the newest data (never with an old render's).
 */
export function closingOf(
  backup: Backup,
  list: ListIndex | null,
  screening: ScreeningResult | null,
  settings: ListSettings,
  today: DateKey,
  listVersion: number,
): ClosingCheck {
  const { persons, mandates, rules, screeningDecisions: decisions } = backup;
  const hits = liveHitsOf(screening, persons, mandates);
  const status = statusOf(
    list,
    screening,
    backup.lastScreening,
    subjectsSignature(persons, mandates),
    settings,
    today,
    listVersion,
  );
  return closingBlockers({
    tasks: buildTasks(mandates, persons, today, rules, hits, decisions).tasks,
    hits,
    decisions,
    persons,
    mandates,
    screening: {
      hasList: list !== null,
      stale: status.state !== 'ok',
      ranOn: screening?.ranOn ?? null,
    },
  });
}
