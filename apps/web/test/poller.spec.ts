import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackPoller } from '../src/playback/poller.js';

function fakeDoc() {
  const listeners: Array<() => void> = [];
  return {
    hidden: false,
    addEventListener: (_: string, cb: EventListenerOrEventListenerObject) => {
      listeners.push(cb as () => void);
    },
    removeEventListener: (_: string, cb: EventListenerOrEventListenerObject) => {
      const i = listeners.indexOf(cb as () => void);
      if (i >= 0) listeners.splice(i, 1);
    },
    fireVisibilityChange(hidden: boolean) {
      this.hidden = hidden;
      for (const l of [...listeners]) l();
    },
  };
}

describe('PlaybackPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('poll immédiatement au démarrage, puis toutes les intervalMs', async () => {
    const onResult = vi.fn();
    const poller = new PlaybackPoller({ getAccessToken: async () => 'token', onResult, onError: vi.fn(), intervalMs: 3000, doc: fakeDoc() });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(onResult).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('respecte Retry-After sur 429', async () => {
    const onError = vi.fn();
    const poller = new PlaybackPoller({ getAccessToken: async () => 'token', onResult: vi.fn(), onError, intervalMs: 3000, doc: fakeDoc() });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: { 'retry-after': '10' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'rate_limited', retryAfterMs: 10_000 }));

    await vi.advanceTimersByTimeAsync(9999);
    expect(fetchMock).toHaveBeenCalledTimes(1); // pas encore retenté

    await vi.advanceTimersByTimeAsync(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('escalade en backoff exponentiel sur des 429 répétés sans retry-after', async () => {
    const poller = new PlaybackPoller({ getAccessToken: async () => 'token', onResult: vi.fn(), onError: vi.fn(), intervalMs: 1000, doc: fakeDoc() });
    const fetchMock = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    poller.start();
    await vi.advanceTimersByTimeAsync(0); // 1er 429 -> backoff = 1000*2^1 = 2000
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // 2000 -> 2e appel, 2e 429 -> backoff = 1000*2^2=4000
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it('réinitialise le backoff après un poll réussi', async () => {
    const poller = new PlaybackPoller({ getAccessToken: async () => 'token', onResult: vi.fn(), onError: vi.fn(), intervalMs: 1000, doc: fakeDoc() });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('x', { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('x', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    poller.start();
    await vi.advanceTimersByTimeAsync(0); // 429 -> backoff 2000ms
    await vi.advanceTimersByTimeAsync(2000); // succès -> reset, prochain poll dans 1000ms (intervalMs normal)
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000); // 3e appel : nouveau 429, backoff repart à 2^1
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    poller.stop();
  });

  it("suspend le polling quand l'onglet devient caché, reprend immédiatement au retour", async () => {
    const onResult = vi.fn();
    const doc = fakeDoc();
    const poller = new PlaybackPoller({ getAccessToken: async () => 'token', onResult, onError: vi.fn(), intervalMs: 3000, doc });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledTimes(1);

    doc.fireVisibilityChange(true); // caché
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onResult).toHaveBeenCalledTimes(1); // aucun nouveau poll pendant que c'est caché

    doc.fireVisibilityChange(false); // visible à nouveau
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledTimes(2); // poll immédiat à la reprise
    poller.stop();
  });

  it('pollNow() déclenche un poll immédiat sans attendre le prochain créneau', async () => {
    const onResult = vi.fn();
    const poller = new PlaybackPoller({ getAccessToken: async () => 'token', onResult, onError: vi.fn(), intervalMs: 3000, doc: fakeDoc() });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500); // bien avant le prochain poll programmé (3000ms)
    poller.pollNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('stop() coupe le polling et retire le listener de visibilité', async () => {
    const onResult = vi.fn();
    const doc = fakeDoc();
    const poller = new PlaybackPoller({ getAccessToken: async () => 'token', onResult, onError: vi.fn(), intervalMs: 3000, doc });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(onResult).toHaveBeenCalledTimes(1); // rien de plus après stop()

    doc.fireVisibilityChange(false); // ne doit plus rien déclencher, le listener a été retiré
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('ne poll pas sans token disponible, mais réessaie au créneau suivant', async () => {
    const onResult = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const poller = new PlaybackPoller({ getAccessToken: async () => undefined, onResult, onError: vi.fn(), intervalMs: 1000, doc: fakeDoc() });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).not.toHaveBeenCalled(); // toujours pas de token, mais le cycle continue
    poller.stop();
  });
});
