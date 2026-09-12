import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KpoeClient } from '../src/providers/kpoe/client.js';
import type { KpoeQueryParams } from '../src/providers/kpoe/query-cascade.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const WORD_RESPONSE = {
  type: 'Word',
  metadata: { source: 'qApple', songWriters: [] },
  lyrics: [{ time: 0, duration: 100, text: 'x', syllabus: [{ time: 0, duration: 100, text: 'x' }], element: { key: 'L1', singer: 'v1' } }],
};

const params = (p: Partial<KpoeQueryParams>): KpoeQueryParams => ({ isrc: undefined, title: undefined, artist: undefined, duration: undefined, ...p });

describe('KpoeClient', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('espace deux requêtes sortantes d\'au moins ~5,5 s (finding #2)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(404, { error: { message: 'not found', status: 404 } }))
      .mockResolvedValueOnce(jsonResponse(200, WORD_RESPONSE));
    vi.stubGlobal('fetch', fetchMock);

    const client = new KpoeClient('mirrorball-test');
    const attempts = [params({ title: 'a', artist: 'b', duration: '100' }), params({ title: 'a', artist: 'b' })];

    const promise = client.runCascade(attempts);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Sans avancer le temps d'au moins ~5,5s, la deuxième requête ne doit pas partir.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const { result } = await promise;
    expect(result?.outcome).toBe('syllable');
  });

  it("s'arrête à la première tentative réussie de la cascade", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, WORD_RESPONSE));
    vi.stubGlobal('fetch', fetchMock);

    const client = new KpoeClient('mirrorball-test');
    const promise = client.runCascade([params({ isrc: 'GBUM71029604' }), params({ title: 'a', artist: 'b' })]);
    await vi.runAllTimersAsync();
    const { result } = await promise;

    expect(result?.outcome).toBe('syllable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('détecte un bannissement WAF (429 + error_code 1015) et ouvre le circuit', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error_code: 1015, error_name: 'rate_limited' }), { status: 429 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new KpoeClient('mirrorball-test');
    const { result } = await (await client.runCascade([params({ isrc: 'x' })])) as { result: { outcome: string } };
    expect(result?.outcome).toBe('waf');
    expect(client.getHealth().circuitOpen).toBe(true);

    // Le circuit étant ouvert, une nouvelle tentative ne doit même pas appeler fetch
    // (l'attente d'espacement de la file continue de s'appliquer avant ce constat).
    fetchMock.mockClear();
    const second = client.runCascade([params({ isrc: 'y' })]);
    await vi.advanceTimersByTimeAsync(6000);
    await second;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("n'ouvre pas le circuit sur un 429 applicatif « soft » sans signature WAF", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Too Many Requests' }), { status: 429, headers: { 'retry-after': '5' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new KpoeClient('mirrorball-test');
    await client.runCascade([params({ isrc: 'x' })]);
    expect(client.getHealth().circuitOpen).toBe(false);
  });

  it('ouvre le circuit après 2 échecs transport consécutifs', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const client = new KpoeClient('mirrorball-test');
    await client.runCascade([params({ isrc: 'x' })]);
    expect(client.getHealth().circuitOpen).toBe(false);

    await vi.advanceTimersByTimeAsync(6000);
    await client.runCascade([params({ isrc: 'y' })]);
    expect(client.getHealth().circuitOpen).toBe(true);
  });

  it('renvoie not_found sans épuiser le circuit quand KPoe répond 404 proprement', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(404, { error: { message: 'not found', status: 404 } }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new KpoeClient('mirrorball-test');
    const { result } = await client.runCascade([params({ isrc: 'inexistant' })]);
    expect(result?.outcome).toBe('not_found');
    expect(client.getHealth().circuitOpen).toBe(false);
    expect(client.getHealth().available).toBe(true);
  });
});
