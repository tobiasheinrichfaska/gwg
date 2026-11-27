import type { Person } from '../logic/index.ts';

/**
 * Next free person id for a mandate: '<mandateId>-P<n>', n one above the highest number in use for that
 * mandate. Ids already in the data set are never handed out again.
 */
export function nextPersonId(persons: readonly Person[], mandateId: string): string {
  const prefix = `${mandateId}-P`;
  let max = 0;
  for (const p of persons) {
    if (!p.id.startsWith(prefix)) continue;
    const rest = p.id.slice(prefix.length);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  let id = `${prefix}${max + 1}`;
  while (persons.some((p) => p.id === id)) id = `${prefix}${Number(id.slice(prefix.length)) + 1}`;
  return id;
}
