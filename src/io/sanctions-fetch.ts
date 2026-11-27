import { fail, isDateKey, ok, type DateKey, type ListIndex, type Result } from '../logic/index.ts';
import { parseEuSanctionsXml, readGenerationDate, type ListNote } from './eu-list.ts';

export const DEFAULT_MAX_FETCH_BYTES = 100_000_000;
export const DEFAULT_FETCH_TIMEOUT_MS = 120_000;

export interface FetchOptions {
  /** Address of the relay (checked by `checkListSettings`); only `<relayUrl>/liste` is requested. */
  relayUrl: string;
  fetchFn: typeof fetch;
  today: DateKey;
  /** A date the user confirmed; wins over every other source of the list's state. */
  fetchedOnOverride?: DateKey;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface FetchedList {
  index: ListIndex;
  skipped: ListNote[];
  adjusted: ListNote[];
  /** `Last-Modified` header of the answer, as sent; null = none. */
  lastModified: string | null;
  /** The relay answered from an old copy (header `X-Stale`); the list may be older than hoped. */
  stale: boolean;
}

/** Address of the one file the app asks for. Nothing but this string goes into the request. */
export const listUrl = (relayUrl: string): string => `${relayUrl.replace(/\/+$/, '')}/liste`;

const isXml = (type: string | null): boolean =>
  type !== null && /^(?:application|text)\/(?:[\w.+-]+\+)?xml\b/i.test(type.trim());

/**
 * Downloads the public EU list from the relay. The request is a plain GET with no client data: no
 * body, no extra header, no cookies, no referrer, no redirect. The size limit applies while reading the
 * stream. State of the list: `fetchedOnOverride`, else the XML's `generationDate`, else header
 * `X-Fetched-At` (the relay's fetch time, only a fallback: a fresh copy of an old list is still old),
 * else today.
 */
export async function fetchSanctionsList(o: FetchOptions): Promise<Result<FetchedList>> {
  const maxBytes = o.maxBytes ?? DEFAULT_MAX_FETCH_BYTES;
  const timeoutMs = o.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await o.fetchFn(listUrl(o.relayUrl), {
        method: 'GET',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        cache: 'no-store',
        signal: ctrl.signal,
      });
    } catch {
      return fail('fetch-failed');
    }
    if (res.status !== 200) {
      void res.body?.cancel().catch(() => undefined);
      return fail('fetch-failed');
    }
    if (!isXml(res.headers.get('Content-Type'))) {
      void res.body?.cancel().catch(() => undefined);
      return fail('relay-bad-response');
    }
    const declared = Number(res.headers.get('Content-Length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      void res.body?.cancel().catch(() => undefined);
      return fail('relay-bad-response');
    }

    let bytes: Uint8Array;
    try {
      const read = await readLimited(res, maxBytes);
      if (read === null) return fail('relay-bad-response');
      bytes = read;
    } catch {
      return fail('fetch-failed');
    }
    let xml: string;
    try {
      xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return fail('relay-bad-response');
    }

    const header = res.headers.get('X-Fetched-At')?.slice(0, 10) ?? '';
    const fetchedOn: DateKey =
      o.fetchedOnOverride ??
      readGenerationDate(xml) ??
      (isDateKey(header) ? header : null) ??
      o.today;
    const parsed = parseEuSanctionsXml(xml, fetchedOn);
    if (!parsed.ok) return parsed;
    return ok({
      index: parsed.value.index,
      skipped: parsed.value.skipped,
      adjusted: parsed.value.adjusted,
      lastModified: res.headers.get('Last-Modified'),
      stale: res.headers.get('X-Stale') === '1',
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Reads the body chunk by chunk; `null` = over the limit (reading stops, nothing is kept). */
async function readLimited(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    return all.length > maxBytes ? null : all;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
