import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpicyClient, SpicyTransportError } from '../src/providers/spicy/client.js';

function envelope(result: { httpStatus: number; data: unknown }): Response {
  return new Response(JSON.stringify({ queries: [{ operationId: '0', operation: 'lyrics', result }] }), { status: 200 });
}

describe('SpicyClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('extrait result.httpStatus applicatif, distinct du statut HTTP transport (toujours 200 ici)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(envelope({ httpStatus: 404, data: null }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new SpicyClient('mirrorball-test', 'https://mirrorball.example');
    const [result] = await client.call([{ operation: 'lyrics', variables: { id: 'x', auth: 'SpicyLyrics-WebAuth' } }]);

    const [, options] = fetchMock.mock.calls[0]!;
    expect((options as RequestInit).method).toBe('POST');
    expect(result!.httpStatus).toBe(404);
  });

  it("n'envoie jamais l'Origin/Referer/User-Agent du client officiel Spotify (identification honnête)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(envelope({ httpStatus: 200, data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new SpicyClient('mirrorball/0.1 (personal lyrics reader)', 'https://mirrorball.example');
    await client.call([{ operation: 'lyrics', variables: { id: 'x', auth: 'SpicyLyrics-WebAuth' } }]);

    const [, options] = fetchMock.mock.calls[0]!;
    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers['origin']).toBe('https://mirrorball.example');
    expect(headers['user-agent']).toBe('mirrorball/0.1 (personal lyrics reader)');
    expect(headers['user-agent']).not.toMatch(/spotify/i);
    expect(headers['origin']).not.toContain('xpui.app.spotify.com');
  });

  it('place le token dans le header spicylyrics-webauth quand fourni', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(envelope({ httpStatus: 200, data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new SpicyClient('ua', 'https://mirrorball.example');
    await client.call([{ operation: 'lyrics', variables: { id: 'x', auth: 'SpicyLyrics-WebAuth' } }], 'user-token');

    const [, options] = fetchMock.mock.calls[0]!;
    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers['spicylyrics-webauth']).toBe('Bearer user-token');
  });

  it('lève SpicyTransportError et ouvre le disjoncteur sur un code transport (429)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('rate limited', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new SpicyClient('ua', 'https://mirrorball.example');
    await expect(client.call([{ operation: 'lyrics', variables: {} }])).rejects.toBeInstanceOf(SpicyTransportError);
    await expect(client.call([{ operation: 'lyrics', variables: {} }])).rejects.toBeInstanceOf(SpicyTransportError);
    expect(client.getHealth().circuitOpen).toBe(true);
  });

  it('callSingleWithSoftRetry retente en douceur sur httpStatus applicatif 503, sans toucher au disjoncteur', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(envelope({ httpStatus: 503, data: null }))
      .mockResolvedValueOnce(envelope({ httpStatus: 200, data: ['ok'] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new SpicyClient('ua', 'https://mirrorball.example');
    const promise = client.callSingleWithSoftRetry({ operation: 'lyrics', variables: {} });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result.httpStatus).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.getHealth().circuitOpen).toBe(false);
  });
});
