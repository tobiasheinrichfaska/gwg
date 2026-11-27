import { fail, ok, type Result } from '../core/index.ts';
import type { Reason } from '../mandate/model.ts';

/** Settings of the optional download of the public sanctions list. Not part of the backup file. */
export interface ListSettings {
  /** Address of the relay; '' = download switched off. */
  relayUrl: string;
  /** Fetch on start when the list is older than `maxAgeDays`. */
  autoFetch: boolean;
  maxAgeDays: number;
}

export const DEFAULT_LIST_SETTINGS: ListSettings = {
  relayUrl: '',
  autoFetch: false,
  maxAgeDays: 7,
};

const bad = (): Result<never, Reason> => fail('bad-settings');

/** Empty, or https://… without query or fragment; http only for localhost and 127.0.0.1. */
export function isRelayUrl(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  if (s === '') return true;
  // eslint-disable-next-line no-control-regex
  if (s.length > 500 || /[\s?#\u0000-\u001f]/.test(s)) return false;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  if (u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') return false;
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

/** Strict check of unknown data (exactly these keys); the error code is `bad-settings`. */
export function checkListSettings(v: unknown): Result<ListSettings, Reason> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return bad();
  const o = v as Record<string, unknown>;
  const keys = ['relayUrl', 'autoFetch', 'maxAgeDays'];
  if (Object.keys(o).length !== keys.length || !keys.every((k) => Object.hasOwn(o, k)))
    return bad();
  const { relayUrl, autoFetch, maxAgeDays } = o;
  if (!isRelayUrl(relayUrl)) return bad();
  if (typeof autoFetch !== 'boolean') return bad();
  if (
    typeof maxAgeDays !== 'number' ||
    !Number.isInteger(maxAgeDays) ||
    maxAgeDays < 1 ||
    maxAgeDays > 365
  ) {
    return bad();
  }
  return ok({ relayUrl, autoFetch, maxAgeDays });
}

export const serializeSettings = (s: ListSettings): string =>
  JSON.stringify({ relayUrl: s.relayUrl, autoFetch: s.autoFetch, maxAgeDays: s.maxAgeDays }) + '\n';

/** Reads stored settings; damaged text is `bad-settings`, never silently the defaults. */
export function parseSettings(text: string): Result<ListSettings, Reason> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return bad();
  }
  return checkListSettings(raw);
}
