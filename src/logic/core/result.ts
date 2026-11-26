/** A failure may name where it happened (`where`, e.g. 'mandates[3].id'); callers that ignore it are unaffected. */
export type Result<T, E extends string = string> =
  { ok: true; value: T } | { ok: false; reason: E; where?: string };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const fail = <E extends string>(reason: E, where?: string): Result<never, E> =>
  where === undefined ? { ok: false, reason } : { ok: false, reason, where };
