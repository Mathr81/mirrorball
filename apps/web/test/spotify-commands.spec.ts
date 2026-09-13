import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackCommandError, seek, sendPlaybackCommand } from '../src/playback/spotify-api.js';

function mockFetch(response: Partial<Response> | Error) {
  const fn = vi.fn((_url: URL | string, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response as Response),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendPlaybackCommand', () => {
  it('utilise la bonne méthode et la bonne route par commande', async () => {
    const fetchMock = mockFetch({ ok: true, status: 204 });

    await sendPlaybackCommand('tok', 'play');
    await sendPlaybackCommand('tok', 'pause');
    await sendPlaybackCommand('tok', 'next');
    await sendPlaybackCommand('tok', 'previous');

    const calls = fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method]);
    expect(calls).toEqual([
      ['https://api.spotify.com/v1/me/player/play', 'PUT'],
      ['https://api.spotify.com/v1/me/player/pause', 'PUT'],
      ['https://api.spotify.com/v1/me/player/next', 'POST'],
      ['https://api.spotify.com/v1/me/player/previous', 'POST'],
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ authorization: 'Bearer tok' });
  });

  it('distingue les refus que l\'UI doit expliquer différemment', async () => {
    const cases: Array<[number, string]> = [
      [401, 'unauthorized'],
      // Pas d'appareil actif : rien à piloter, message dédié.
      [404, 'no_device'],
      // Compte non Premium / action interdite sur le contexte courant.
      [403, 'forbidden'],
      [500, 'network'],
    ];

    for (const [status, kind] of cases) {
      mockFetch({ ok: false, status });
      await expect(sendPlaybackCommand('tok', 'play')).rejects.toMatchObject({ kind, command: 'play' });
    }
  });

  it('traduit une coupure réseau en erreur de commande, jamais en exception brute', async () => {
    mockFetch(new TypeError('offline'));
    const error = await sendPlaybackCommand('tok', 'next').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlaybackCommandError);
    expect((error as PlaybackCommandError).kind).toBe('network');
  });
});

describe('seek', () => {
  it('arrondit la position et la passe en paramètre de requête', async () => {
    const fetchMock = mockFetch({ ok: true, status: 204 });
    await seek('tok', 42_499.7);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.spotify.com/v1/me/player/seek?position_ms=42500');
  });

  it('remonte le même diagnostic que les autres commandes', async () => {
    mockFetch({ ok: false, status: 404 });
    await expect(seek('tok', 0)).rejects.toMatchObject({ kind: 'no_device', command: 'seek' });
  });
});
