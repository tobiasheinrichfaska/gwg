// @vitest-environment jsdom
import { fetchSanctionsList } from '../src/io/index.ts';
import { isListStale } from '../src/logic/index.ts';

const NS = 'xmlns="http://eu.europa.ec/fpi/fsd/export"';
const XML = (gen = '2026-11-18T10:00:00.000+01:00') =>
  `<?xml version="1.0" encoding="UTF-8"?><export ${NS} generationDate="${gen}" globalFileId="1">` +
  `<sanctionEntity logicalId="100"><regulation programme="T"/><nameAlias wholeName="Zorin Quelle"/>` +
  `<birthdate year="1965"/></sanctionEntity></export>`;

const RELAY = 'https://relay.example/app';
const base = { relayUrl: RELAY, today: '2026-11-27' as const };

const respond = (body: BodyInit | null, headers: Record<string, string> = {}, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'application/xml', ...headers } });

const calls: { url: string; init: RequestInit | undefined }[] = [];
const fetchWith =
  (make: (init: RequestInit | undefined) => Promise<Response>): typeof fetch =>
  (url, init) => {
    calls.push({ url: String(url), init });
    return make(init);
  };

/** A body that delivers the given chunks one by one and records how many were pulled. */
function chunked(chunks: Uint8Array[], pulled: { n: number }): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream(
    {
      pull(c) {
        if (i >= chunks.length) return c.close();
        pulled.n++;
        c.enqueue(chunks[i++]);
      },
    },
    { highWaterMark: 0 },
  );
}

beforeEach(() => {
  calls.length = 0;
});
afterEach(() => vi.useRealTimers());

describe('fetchSanctionsList', () => {
  it('reads synthetic XML into an index; the XML generationDate is the state, not the header', async () => {
    const r = await fetchSanctionsList({
      ...base,
      fetchFn: fetchWith(() =>
        Promise.resolve(
          respond(XML(), {
            'X-Fetched-At': '2026-11-26T03:00:00.000Z',
            'Last-Modified': 'Wed, 25 Nov 2026 10:00:00 GMT',
          }),
        ),
      ),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.index.entries.map((e) => e.id)).toEqual(['100']);
    expect(r.value.index.fetchedOn).toBe('2026-11-18');
    expect(r.value.lastModified).toBe('Wed, 25 Nov 2026 10:00:00 GMT');
    expect(r.value.stale).toBe(false);
    expect(r.value.skipped).toEqual([]);
  });
  it('falls back to generationDate, then X-Fetched-At, then today; the override wins', async () => {
    const f = (xml: string) => fetchWith(() => Promise.resolve(respond(xml)));
    const a = await fetchSanctionsList({ ...base, fetchFn: f(XML()) });
    expect(a.ok && a.value.index.fetchedOn).toBe('2026-11-18');
    const noGen = XML().replace(/ generationDate="[^"]*"/, '');
    const b = await fetchSanctionsList({ ...base, fetchFn: f(noGen) });
    expect(b.ok && b.value.index.fetchedOn).toBe('2026-11-27');
    const h = await fetchSanctionsList({
      ...base,
      fetchFn: fetchWith(() =>
        Promise.resolve(respond(noGen, { 'X-Fetched-At': '2026-11-26T03:00:00.000Z' })),
      ),
    });
    expect(h.ok && h.value.index.fetchedOn).toBe('2026-11-26');
    const c = await fetchSanctionsList({
      ...base,
      fetchedOnOverride: '2026-11-01',
      fetchFn: fetchWith(() =>
        Promise.resolve(respond(XML(), { 'X-Fetched-At': '2026-11-26T00:00:00Z' })),
      ),
    });
    expect(c.ok && c.value.index.fetchedOn).toBe('2026-11-01');
  });
  it('an old list through a fresh relay copy keeps its old state and is stale', async () => {
    const r = await fetchSanctionsList({
      ...base,
      fetchFn: fetchWith(() =>
        Promise.resolve(
          respond(XML('2025-01-01T10:00:00.000+01:00'), {
            'X-Fetched-At': '2026-11-27T03:00:00.000Z',
          }),
        ),
      ),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.index.fetchedOn).toBe('2025-01-01');
    expect(isListStale(r.value.index, base.today, 14)).toBe(true);
  });
  it('reports the X-Stale header', async () => {
    const r = await fetchSanctionsList({
      ...base,
      fetchFn: fetchWith(() => Promise.resolve(respond(XML(), { 'X-Stale': '1' }))),
    });
    expect(r.ok && r.value.stale).toBe(true);
  });
  it('fails with fetch-failed on status 500, 404 and a network error', async () => {
    for (const make of [
      () => Promise.resolve(respond('x', {}, 500)),
      () => Promise.resolve(respond('x', {}, 404)),
      () => Promise.reject(new TypeError('network')),
    ]) {
      expect(await fetchSanctionsList({ ...base, fetchFn: fetchWith(make) })).toMatchObject({
        ok: false,
        reason: 'fetch-failed',
      });
    }
  });
  it('treats a redirect as a failure (redirect: error makes fetch reject)', async () => {
    const r = await fetchSanctionsList({
      ...base,
      fetchFn: fetchWith((init) =>
        init?.redirect === 'error'
          ? Promise.reject(new TypeError('redirect'))
          : Promise.resolve(respond(XML())),
      ),
    });
    expect(r).toMatchObject({ ok: false, reason: 'fetch-failed' });
    expect(calls[0]?.init?.redirect).toBe('error');
  });
  it('fails with fetch-failed on a timeout and aborts the request', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const p = fetchSanctionsList({
      ...base,
      timeoutMs: 1000,
      fetchFn: fetchWith(
        (init) =>
          new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ),
    });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toMatchObject({ ok: false, reason: 'fetch-failed' });
    expect(aborted).toBe(true);
  });
  it('fails with fetch-failed when the body stalls past the timeout', async () => {
    vi.useFakeTimers();
    const p = fetchSanctionsList({
      ...base,
      timeoutMs: 1000,
      fetchFn: fetchWith((init) => {
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('<export'));
            init?.signal?.addEventListener('abort', () => c.error(new Error('aborted')));
          },
        });
        return Promise.resolve(respond(body));
      }),
    });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toMatchObject({ ok: false, reason: 'fetch-failed' });
  });
  it('stops reading as soon as the stream exceeds the limit', async () => {
    const pulled = { n: 0 };
    const chunk = new Uint8Array(1000).fill(32);
    const r = await fetchSanctionsList({
      ...base,
      maxBytes: 2500,
      fetchFn: fetchWith(() =>
        Promise.resolve(
          respond(
            chunked(
              Array.from({ length: 1000 }, () => chunk),
              pulled,
            ),
          ),
        ),
      ),
    });
    expect(r).toMatchObject({ ok: false, reason: 'relay-bad-response' });
    expect(pulled.n).toBeLessThan(10); // nowhere near the 1000 chunks on offer
  });
  it('refuses a declared size over the limit without reading', async () => {
    const pulled = { n: 0 };
    const r = await fetchSanctionsList({
      ...base,
      maxBytes: 100,
      fetchFn: fetchWith(() =>
        Promise.resolve(
          respond(chunked([new Uint8Array(10)], pulled), { 'Content-Length': '5000' }),
        ),
      ),
    });
    expect(r).toMatchObject({ ok: false, reason: 'relay-bad-response' });
    expect(pulled.n).toBe(0);
  });
  it('refuses a wrong content type and a body that is not the list', async () => {
    const wrongType = await fetchSanctionsList({
      ...base,
      fetchFn: fetchWith(() =>
        Promise.resolve(respond('<html/>', { 'Content-Type': 'text/html' })),
      ),
    });
    expect(wrongType).toMatchObject({ ok: false, reason: 'relay-bad-response' });
    const notList = await fetchSanctionsList({
      ...base,
      fetchFn: fetchWith(() => Promise.resolve(respond('<html/>'))),
    });
    expect(notList).toMatchObject({ ok: false, reason: 'bad-list' });
  });
  it('sends exactly GET <relayUrl>/liste with the fixed options and nothing else', async () => {
    await fetchSanctionsList({
      ...base,
      relayUrl: 'https://relay.example/app/',
      fetchFn: fetchWith(() => Promise.resolve(respond(XML()))),
    });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe('https://relay.example/app/liste');
    const { signal, ...rest } = init!;
    expect(signal).toBeInstanceOf(AbortSignal);
    // no body, no headers, no extra option: this object is everything that leaves the device
    expect(rest).toEqual({
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store',
    });
    expect(Object.keys(rest).sort()).toEqual(
      ['cache', 'credentials', 'method', 'redirect', 'referrerPolicy'].sort(),
    );
  });
});
