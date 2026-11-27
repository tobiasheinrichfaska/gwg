import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { handle, type CachedList, type RelayCache, type RelayEnv } from './handler.ts';

const ORIGIN = 'https://app.example.org';
const BASE = 'https://relay.example.org';
/** Smallest export the relay accepts as complete: one entry and the closing tag. */
const OK_XML = '<export><sanctionEntity/></export>';
const T0 = Date.parse('2026-11-27T10:00:00Z');

const env: RelayEnv = {
  upstreamUrl: 'https://upstream.example.org/list.xml',
  allowedOrigin: ORIGIN,
  maxBytes: 1000,
  minRefetchSeconds: 3600,
  perCallerPerHour: 3,
  globalPerHour: 100,
};

function memCache() {
  let list: CachedList | null = null;
  const counts = new Map<string, number>();
  const cache: RelayCache = {
    getList: async () => list,
    setList: async (e) => {
      list = e;
    },
    counters: {
      increment: async (key) => {
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        return n;
      },
    },
  };
  return { cache, counts, seed: (e: CachedList) => (list = e) };
}

function setup(fetchImpl?: typeof fetch, clock = { t: T0 }) {
  const mem = memCache();
  const calls: { url: string; init?: RequestInit }[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) });
    return fetchImpl
      ? fetchImpl(url, init)
      : new Response(OK_XML, {
          headers: {
            'Last-Modified': 'Wed, 25 Nov 2026 08:00:00 GMT',
            'Content-Type': 'application/xml',
          },
        });
  }) as typeof fetch;
  const run = (req: Request, e: RelayEnv = env, callerKey = '203.0.113.7') =>
    handle(req, e, { fetch: fakeFetch, now: () => clock.t, cache: mem.cache, callerKey });
  return { mem, calls, run, clock };
}

const get = (
  path = '/liste',
  headers: Record<string, string> = { Origin: ORIGIN },
  method = 'GET',
) => new Request(BASE + path, { method, headers });

describe('Methoden, Pfade, Abfrage', () => {
  it('lehnt andere Methoden ab', async () => {
    const { run } = setup();
    expect((await run(get('/liste', {}, 'POST'))).status).toBe(405);
    expect((await run(get('/liste', {}, 'DELETE'))).status).toBe(405);
  });
  it('lehnt andere Pfade mit 404 ab', async () => {
    const { run } = setup();
    expect((await run(get('/'))).status).toBe(404);
    expect((await run(get('/liste/x'))).status).toBe(404);
    expect((await run(get('/andere'))).status).toBe(404);
  });
  it('lehnt jede Abfragezeichenfolge mit 400 ab, auch leer', async () => {
    const { run, calls } = setup();
    expect((await run(get('/liste?a=1'))).status).toBe(400);
    expect((await run(get('/liste?'))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it('lehnt eine nicht-https-Konfiguration ab', async () => {
    const { run } = setup();
    const res = await run(get(), { ...env, upstreamUrl: 'http://upstream.example.org/x' });
    expect(res.status).toBe(500);
  });
});

describe('CORS', () => {
  it('Preflight für die erlaubte Herkunft', async () => {
    const { run } = setup();
    const res = await run(get('/liste', { Origin: ORIGIN }, 'OPTIONS'));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(res.headers.get('Vary')).toBe('Origin');
  });
  it('Preflight einer fremden Herkunft wird abgelehnt', async () => {
    const { run } = setup();
    const res = await run(get('/liste', { Origin: 'https://evil.example' }, 'OPTIONS'));
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Vary')).toBe('Origin');
  });
  it('GET setzt CORS nur für die erlaubte Herkunft', async () => {
    const { run } = setup();
    const ok = await run(get());
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const other = await run(get('/liste', { Origin: 'https://evil.example' }));
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(other.headers.get('Vary')).toBe('Origin');
    const none = await run(get('/liste', {}));
    expect(none.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it("'null' als bewusst gesetzte Herkunft (file://)", async () => {
    const { run } = setup();
    const e = { ...env, allowedOrigin: 'null' };
    const res = await run(get('/liste', { Origin: 'null' }), e);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('null');
    const denied = await run(get('/liste', { Origin: ORIGIN }), e);
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('Fehlerantworten tragen CORS für die erlaubte Herkunft', async () => {
    const { run } = setup();
    const res = await run(get('/liste?x=1'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });
});

describe('Antwort und Cache', () => {
  it('liefert die Liste mit den vorgesehenen Headern', async () => {
    const { run } = setup();
    const res = await run(get());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(OK_XML);
    expect(res.headers.get('X-Fetched-At')).toBe('2026-11-27T10:00:00.000Z');
    expect(res.headers.get('Last-Modified')).toBe('Wed, 25 Nov 2026 08:00:00 GMT');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(res.headers.get('Age')).toBe('0');
    expect(res.headers.get('X-Stale')).toBeNull();
  });
  it('ruft Upstream frühestens nach minRefetchSeconds erneut ab', async () => {
    const { run, calls, clock } = setup();
    await run(get());
    clock.t += 3599_000;
    const cached = await run(get());
    expect(calls).toHaveLength(1);
    expect(cached.headers.get('Age')).toBe('3599');
    clock.t += 2000;
    await run(get());
    expect(calls).toHaveLength(2);
  });
  it('bei Upstream-Fehler: letzte gute Kopie mit X-Stale und Age', async () => {
    let fail = false;
    const { run, clock } = setup((async () =>
      fail
        ? new Response('x', { status: 500 })
        : new Response('<export><sanctionEntity>alt</sanctionEntity></export>')) as typeof fetch);
    await run(get());
    fail = true;
    clock.t += 4000_000;
    const res = await run(get());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<export><sanctionEntity>alt</sanctionEntity></export>');
    expect(res.headers.get('X-Stale')).toBe('1');
    expect(res.headers.get('Age')).toBe('4000');
  });
  it('eine HTML-Fehlerseite mit 200 überschreibt die gute Kopie nicht', async () => {
    let page = '<?xml version="1.0"?><export><sanctionEntity>gut</sanctionEntity></export>';
    let type = 'application/xml';
    const { run, clock, mem } = setup(
      (async () => new Response(page, { headers: { 'Content-Type': type } })) as typeof fetch,
    );
    await run(get());
    page = '<html><body>Wartungsarbeiten</body></html>';
    type = 'text/html';
    clock.t += 4000_000;
    const res = await run(get());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      '<?xml version="1.0"?><export><sanctionEntity>gut</sanctionEntity></export>',
    );
    expect(res.headers.get('X-Stale')).toBe('1');
    expect((await mem.cache.getList())?.fetchedAt).toBe(T0);
  });
  it('HTML mit Content-Type xml oder falscher Wurzel zählt als Fehler; ohne Kopie 502', async () => {
    for (const [body, type] of [
      ['<html></html>', 'application/xml'],
      ['<other/>', 'application/xml'],
      ['<?xml version="1.0"?><html/>', 'text/html'],
      [OK_XML, 'text/html'],
    ] as const) {
      const { run } = setup(
        (async () => new Response(body, { headers: { 'Content-Type': type } })) as typeof fetch,
      );
      const expected = body === OK_XML ? 200 : 502;
      expect((await run(get())).status).toBe(expected);
    }
  });
  it('akzeptiert BOM und Leerraum vor der XML-Deklaration, auch ohne XML-Content-Type', async () => {
    const { run } = setup(
      (async () =>
        new Response(`\uFEFF \n<?xml version="1.0"?>\n${OK_XML}`, {
          headers: { 'Content-Type': 'application/octet-stream' },
        })) as typeof fetch,
    );
    expect((await run(get())).status).toBe(200);
  });
  it('bei Netzfehler ohne Kopie: 502', async () => {
    const { run } = setup((async () => {
      throw new TypeError('offline');
    }) as typeof fetch);
    expect((await run(get())).status).toBe(502);
  });
});

describe('Upstream-Aufruf', () => {
  it('folgt keiner Weiterleitung und behandelt 3xx als Fehler', async () => {
    const { run, calls } = setup(
      (async () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://x.example' },
        })) as typeof fetch,
    );
    const res = await run(get());
    expect(res.status).toBe(502);
    expect(calls[0]?.init?.redirect).toBe('manual');
  });
  it('sendet weder Header noch Daten des Aufrufers', async () => {
    const { run, calls } = setup();
    await run(
      get('/liste', {
        Origin: ORIGIN,
        Cookie: 'a=b',
        Authorization: 'secret',
        'X-Forwarded-For': '1.2.3.4',
      }),
    );
    expect(calls[0]?.url).toBe(env.upstreamUrl);
    expect(calls[0]?.init?.headers).toEqual({});
    expect(calls[0]?.init?.body).toBeUndefined();
    expect(calls[0]?.init?.credentials).toBe('omit');
  });
  it('bricht bei zu großem Content-Length ab', async () => {
    const { run } = setup(
      (async () => new Response(OK_XML, { headers: { 'Content-Length': '5000' } })) as typeof fetch,
    );
    expect((await run(get())).status).toBe(502);
  });
  it('bricht beim Streamen über maxBytes ab, statt unbegrenzt zu lesen', async () => {
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(400));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { run } = setup((async () => new Response(stream)) as typeof fetch);
    const res = await run(get());
    expect(res.status).toBe(502);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
  });
  it('akzeptiert genau maxBytes', async () => {
    const { run } = setup(
      (async () =>
        new Response(
          `<export><sanctionEntity>${' '.repeat(1000 - 17 - 33)}</sanctionEntity></export>`,
        )) as typeof fetch,
    );
    expect((await run(get())).status).toBe(200);
  });
});

describe('Ratenbegrenzung und Protokoll', () => {
  it('429 mit Retry-After je Aufrufer; andere Aufrufer bleiben möglich', async () => {
    const { run } = setup();
    for (let i = 0; i < 3; i++) expect((await run(get())).status).toBe(200);
    const res = await run(get());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect((await run(get(), env, '198.51.100.1')).status).toBe(200);
  });
  it('globale Grenze', async () => {
    const { run } = setup();
    const e = { ...env, globalPerHour: 2 };
    await run(get(), e, 'a');
    await run(get(), e, 'b');
    expect((await run(get(), e, 'c')).status).toBe(429);
  });
  it('neues Stundenfenster setzt die Zähler zurück', async () => {
    const { run, clock } = setup();
    for (let i = 0; i < 4; i++) await run(get());
    clock.t += HOUR;
    expect((await run(get())).status).toBe(200);
  });
  it('speichert den Aufruferschlüssel nie roh, nur Zähler', async () => {
    const { run, mem } = setup();
    await run(get(), env, '203.0.113.7');
    const keys = [...mem.counts.keys()];
    expect(keys.length).toBe(2);
    expect(keys.some((k) => k.includes('203.0.113.7'))).toBe(false);
  });
});

const HOUR = 3_600_000;

describe('Trennung von src', () => {
  it('relay importiert nichts aus src, src nichts aus relay', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
      });
    const importRe = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
    const bad = (dir: string, re: RegExp) =>
      files(dir).filter((f) =>
        [...readFileSync(f, 'utf8').matchAll(importRe)].some((m) => re.test(m[1] ?? '')),
      );
    expect(bad('relay', /(^|\/)src(\/|$)/)).toEqual([]);
    expect(bad('src', /(^|\/)relay(\/|$)/)).toEqual([]);
  });
});

describe('Nachaudit N3: nur ein vollständiger Export wird gecacht', () => {
  const big = { ...env, maxBytes: 1_000_000 };
  const entity = (i: number) =>
    `<sanctionEntity logicalId="${i}"><nameAlias wholeName="N ${i}"/></sanctionEntity>`;
  const good = `<?xml version="1.0"?><export>${Array.from({ length: 40 }, (_, i) => entity(i)).join('')}</export>`;
  const seed = (mem: ReturnType<typeof memCache>) =>
    mem.seed({
      body: new TextEncoder().encode(good).buffer as ArrayBuffer,
      fetchedAt: T0 - 7_200_000,
      lastModified: null,
      contentType: 'application/xml',
    });
  const upstream = (body: string) =>
    (async () =>
      new Response(body, {
        headers: { 'Content-Type': 'application/xml' },
      })) as unknown as typeof fetch;

  for (const [name, body] of [
    ['leerer Export', '<?xml version="1.0"?><export/>'],
    ['ohne Schlusstag', `<?xml version="1.0"?><export>${entity(1)}`],
    ['ohne Eintrag', '<?xml version="1.0"?><export></export>'],
    ['unter 50 % der letzten Kopie', `<?xml version="1.0"?><export>${entity(1)}</export>`],
  ] as const) {
    it(`${name}: alte Kopie mit X-Stale, nichts überschrieben`, async () => {
      const { run, mem } = setup(upstream(body));
      seed(mem);
      const res = await run(get(), big);
      expect(res.headers.get('X-Stale')).toBe('1');
      expect(await res.text()).toBe(good);
      const kept = await mem.cache.getList();
      expect(kept === null ? null : new TextDecoder().decode(kept.body)).toBe(good);
    });
  }
  it('ohne alte Kopie: 502', async () => {
    const { run } = setup(upstream('<?xml version="1.0"?><export/>'));
    expect((await run(get(), big)).status).toBe(502);
  });
  it('ein vollständiger Export wird gecacht', async () => {
    const { run, mem } = setup(upstream(good));
    const res = await run(get(), big);
    expect(res.headers.get('X-Stale')).toBeNull();
    expect(await mem.cache.getList()).not.toBeNull();
  });
});
