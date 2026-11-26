import type { RulesConfig } from '../config.ts';
import type { SanctionClass } from '../mandate/model.ts';
import { normalizeName } from './normalize.ts';
import { nameSimilarity } from './similarity.ts';

/** A birth date as far as known: a list entry often has only the year. Strings 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'. */
export type PartialDate = string | null;

/**
 * Traffic light of a client name against a list name: the entry point for the screening. A name that
 * normalizes to nothing (empty, or only punctuation) cannot be compared; it is never cleared as green
 * but handed to a human (gelb).
 */
export function classifyNames(
  clientName: string,
  listName: string,
  clientBirth: PartialDate,
  listBirth: PartialDate,
  thresholds: RulesConfig['sanctionThresholds'],
): SanctionClass {
  if (normalizeName(clientName) === '' || normalizeName(listName) === '') return 'gelb';
  return classifyMatch(nameSimilarity(clientName, listName), clientBirth, listBirth, thresholds);
}

const isFull = (d: PartialDate): d is string => d !== null && /^\d{4}-\d{2}-\d{2}$/.test(d);
const yearOf = (d: PartialDate): string | null => (d && /^\d{4}/.test(d) ? d.slice(0, 4) : null);

/**
 * Traffic light of one client person against one list entry.
 * - rot: name ≥ strong threshold and the exact birth date matches (block + alert the officer);
 * - gruen: name below the possible threshold, or both birth YEARS are known and differ;
 * - gelb: everything else — a human decides (birth date missing, same year, only month/day differs).
 * Conservative on purpose: only a clearly different birth YEAR clears a name match automatically.
 */
export function classifyMatch(
  similarity: number,
  clientBirth: PartialDate,
  listBirth: PartialDate,
  thresholds: RulesConfig['sanctionThresholds'],
): SanctionClass {
  if (similarity < thresholds.possible) return 'gruen';
  if (isFull(clientBirth) && isFull(listBirth) && clientBirth === listBirth) {
    return similarity >= thresholds.strong ? 'rot' : 'gelb';
  }
  const [cy, ly] = [yearOf(clientBirth), yearOf(listBirth)];
  if (cy !== null && ly !== null && cy !== ly) return 'gruen';
  return 'gelb';
}
