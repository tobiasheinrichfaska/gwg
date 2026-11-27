// Referenz-Relay für den Abruf EINER öffentlichen Sanktionsliste.
// Reine Funktion nach Web-Standard (Request/Response/fetch/crypto.subtle), kein Node-API,
// kein Import aus src/. Lauffähig bei Cloudflare Workers, Deno Deploy, Bunny Edge Scripting.

export interface RelayEnv {
  /** Feste Adresse aus der Allowlist (Konfiguration als Daten), nur https. */
  upstreamUrl: string;
  /** Exakte Herkunft der App, oder 'null' (file://-Herkunft; bewusst zu aktivieren). */
  allowedOrigin: string;
  maxBytes: number;
  /** Mindestabstand zwischen zwei Upstream-Abrufen (Standard 3600). */
  minRefetchSeconds: number;
  perCallerPerHour: number;
  globalPerHour: number;
}

export interface CachedList {
  body: ArrayBuffer;
  /** Zeitpunkt des Upstream-Abrufs, Millisekunden seit 1970. */
  fetchedAt: number;
  lastModified: string | null;
  contentType: string;
}

export interface RelayCache {
  getList(): Promise<CachedList | null>;
  setList(entry: CachedList): Promise<void>;
  /** Die einzige Aufzeichnung über Anfragen: Zähler. Liefert den neuen Stand. */
  counters: { increment(key: string, ttlSeconds: number): Promise<number> };
}

export interface RelayDeps {
  fetch: typeof fetch;
  now: () => number;
  cache: RelayCache;
  /** Vom Hoster geliefert (z. B. IP); wird vor dem Zählen gehasht, nie roh gespeichert. */
  callerKey: string;
}

export const DEFAULT_MIN_REFETCH_SECONDS = 3600;
const HOUR_MS = 3_600_000;
const LIST_PATH = '/liste';

function text(status: number, message: string, headers: Headers): Response {
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  return new Response(message, { status, headers });
}

function baseHeaders(env: RelayEnv, origin: string | null): Headers {
  const h = new Headers();
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Vary', 'Origin');
  if (origin !== null && origin === env.allowedOrigin) {
    h.set('Access-Control-Allow-Origin', env.allowedOrigin);
    h.set(
      'Access-Control-Expose-Headers',
      'X-Fetched-At, X-Stale, Age, Last-Modified, Retry-After',
    );
  }
  return h;
}

async function hashKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

class UpstreamError extends Error {}

async function readLimited(res: Response, maxBytes: number): Promise<ArrayBuffer> {
  const declared = res.headers.get('Content-Length');
  if (declared !== null && Number(declared) > maxBytes) {
    await res.body?.cancel();
    throw new UpstreamError('too large');
  }
  if (!res.body) throw new UpstreamError('no body');
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UpstreamError('too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

/**
 * Only an XML answer with the root `export` is a list. An HTML error page with status 200 must never
 * replace the last good copy: it is an upstream error, so the old copy is served with `X-Stale`.
 */
function looksLikeExportXml(body: ArrayBuffer, contentType: string): boolean {
  const head = new TextDecoder('utf-8').decode(body.slice(0, 4096)).replace(/^\uFEFF/, '');
  const text = head.replace(/^\s+/, '');
  const startsXml = text.startsWith('<?xml') || /^<(?:[\w.-]+:)?export[\s>/]/.test(text);
  if (!/xml/i.test(contentType) && !startsXml) return false;
  return /^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:[\w.-]+:)?export[\s>/]/.test(text);
}

async function fetchUpstream(env: RelayEnv, deps: RelayDeps): Promise<CachedList> {
  let res: Response;
  try {
    // Weder Header noch Daten des Aufrufers: nur die feste Adresse, keine Weiterleitung.
    res = await deps.fetch(env.upstreamUrl, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      headers: {},
    });
  } catch {
    throw new UpstreamError('unreachable');
  }
  if (
    res.type === 'opaqueredirect' ||
    res.status === 0 ||
    (res.status >= 300 && res.status < 400)
  ) {
    throw new UpstreamError('redirect');
  }
  if (res.status !== 200) {
    await res.body?.cancel();
    throw new UpstreamError('status');
  }
  const body = await readLimited(res, env.maxBytes);
  const contentType = res.headers.get('Content-Type') ?? '';
  if (!looksLikeExportXml(body, contentType)) throw new UpstreamError('not-xml');
  return {
    body,
    fetchedAt: deps.now(),
    lastModified: res.headers.get('Last-Modified'),
    contentType: contentType === '' ? 'application/octet-stream' : contentType,
  };
}

function listResponse(entry: CachedList, now: number, stale: boolean, headers: Headers): Response {
  headers.set('Content-Type', entry.contentType);
  headers.set('Cache-Control', 'public, max-age=3600');
  headers.set('X-Fetched-At', new Date(entry.fetchedAt).toISOString());
  headers.set('Age', String(Math.max(0, Math.floor((now - entry.fetchedAt) / 1000))));
  if (entry.lastModified) headers.set('Last-Modified', entry.lastModified);
  if (stale) headers.set('X-Stale', '1');
  return new Response(entry.body, { status: 200, headers });
}

export async function handle(request: Request, env: RelayEnv, deps: RelayDeps): Promise<Response> {
  const origin = request.headers.get('Origin');
  const headers = baseHeaders(env, origin);

  if (request.method !== 'GET' && request.method !== 'OPTIONS') {
    headers.set('Allow', 'GET, OPTIONS');
    return text(405, 'Nur GET und OPTIONS.', headers);
  }
  const url = new URL(request.url);
  if (url.pathname !== LIST_PATH) return text(404, 'Nicht gefunden.', headers);
  if (url.search !== '' || request.url.includes('?')) {
    return text(400, 'Keine Abfragezeichenfolge erlaubt.', headers);
  }
  if (!isHttps(env.upstreamUrl)) return text(500, 'Fehlkonfiguration.', headers);

  if (request.method === 'OPTIONS') {
    if (origin === null || origin !== env.allowedOrigin)
      return text(403, 'Herkunft nicht erlaubt.', headers);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Max-Age', '86400');
    return new Response(null, { status: 204, headers });
  }

  const now = deps.now();
  const hour = Math.floor(now / HOUR_MS);
  const retryAfter = String(Math.max(1, Math.ceil(((hour + 1) * HOUR_MS - now) / 1000)));
  const caller = await hashKey(deps.callerKey);
  const callerCount = await deps.cache.counters.increment(`c:${caller}:${hour}`, 7200);
  const globalCount = await deps.cache.counters.increment(`g:${hour}`, 7200);
  if (callerCount > env.perCallerPerHour || globalCount > env.globalPerHour) {
    headers.set('Retry-After', retryAfter);
    return text(429, 'Zu viele Anfragen.', headers);
  }

  const minRefetch =
    (env.minRefetchSeconds > 0 ? env.minRefetchSeconds : DEFAULT_MIN_REFETCH_SECONDS) * 1000;
  const cached = await deps.cache.getList();
  if (cached && now - cached.fetchedAt < minRefetch)
    return listResponse(cached, now, false, headers);

  try {
    const fresh = await fetchUpstream(env, deps);
    await deps.cache.setList(fresh);
    return listResponse(fresh, deps.now(), false, headers);
  } catch (e) {
    if (cached) return listResponse(cached, now, true, headers);
    const reason = e instanceof UpstreamError ? e.message : 'error';
    return text(502, `Upstream nicht verfügbar (${reason}).`, headers);
  }
}
