import { DUNNING_STEPS, type DunningStage } from '../config.ts';
import { daysBetween } from '../core/time.ts';
import type { DateKey } from './model.ts';

/** Dunning stage reached `today`, counted from the first request; the highest reached step wins. */
export function dunningStage(firstRequestOn: DateKey | null, today: DateKey): DunningStage {
  if (!firstRequestOn) return 'keine';
  const elapsed = daysBetween(firstRequestOn, today);
  let stage: DunningStage = 'keine';
  for (const step of DUNNING_STEPS) if (elapsed >= step.day) stage = step.stage;
  return stage;
}
