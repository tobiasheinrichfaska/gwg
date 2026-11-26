import type { RulesConfig } from '../config.ts';
import { daysBetween } from '../core/time.ts';
import type { DateKey } from './model.ts';

/** Dunning stage reached `today`, counted from the first request; the highest reached step wins. */
export function dunningStage(
  firstRequestOn: DateKey | null,
  today: DateKey,
  rules: RulesConfig,
): string {
  if (!firstRequestOn) return 'keine';
  const elapsed = daysBetween(firstRequestOn, today);
  let stage = 'keine';
  for (const step of [...rules.dunningSteps].sort((a, b) => a.day - b.day)) {
    if (elapsed >= step.day) stage = step.stage;
  }
  return stage;
}
