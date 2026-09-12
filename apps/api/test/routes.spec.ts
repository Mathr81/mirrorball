import { describe, expect, it } from 'vitest';
import { openDb } from '../src/cache/db.js';
import { CacheRepository } from '../src/cache/repository.js';
import type { LyricsDoc } from '../src/ir/types.js';
import { LyricsOrchestrator } from '../src/orchestrator/resolve-lyrics.js';
import type { Provider, ProviderResult } from '../src/providers/provider.js';
import { healthRoute } from '../src/routes/health.js';
import { lyricsRoute } from '../src/routes/lyrics.js';

function doc(sync: LyricsDoc['sync']): LyricsDoc {
  return {
    sync,
    lines: [{ key: 'L1', startMs: 0, endMs: 1000, text: 'x', agent: 'v1', oppositeAligned: false, lead: { startMs: 0, endMs: 1000, syllables: [] }, background: [] }],
    sections: [],
    songWriters: [],
    provider: 'test',
  };
}

function fakeProvider(name: 'spicy' | 'kpoe' | 'lrclib', result: ProviderResult | null, healthValue: unknown = { available: true }): Provider {
  return { name, health: () => healthValue, fetch: async () => result };
}

describe('GET /api/lyrics', () => {
  it('renvoie 400 sans trackId', async () => {
    const orch = new LyricsOrchestrator({}, new CacheRepository(openDb(':memory:')));
    const res = await lyricsRoute(orch).request('/');
    expect(res.status).toBe(400);
  });

  it('renvoie 200 avec le contrat attendu (ttml/sync/provider/cached/matched/attempts)', async () => {
    const kpoe = fakeProvider('kpoe', { doc: doc('line'), ms: 5 });
    const orch = new LyricsOrchestrator({ kpoe }, new CacheRepository(openDb(':memory:')));
    const res = await lyricsRoute(orch).request('/?trackId=t1&isrc=X');

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ sync: 'line', provider: 'kpoe', cached: false });
    expect(typeof body.ttml).toBe('string');
    expect(Array.isArray(body.attempts)).toBe(true);
    expect(body.matched).toBeDefined();
  });

  it('renvoie 404 avec un corps JSON explicite quand rien n\'est trouvé', async () => {
    const kpoe = fakeProvider('kpoe', null);
    const orch = new LyricsOrchestrator({ kpoe }, new CacheRepository(openDb(':memory:')));
    const res = await lyricsRoute(orch).request('/?trackId=t1&title=a&artist=b');

    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('no_lyrics_found');
    expect(Array.isArray(body.attempts)).toBe(true);
  });

  it('transmet le token Bearer au provider en tant que spotifyAccessToken', async () => {
    let seenToken: string | undefined;
    const spicy: Provider = {
      name: 'spicy',
      health: () => ({}),
      async fetch(query) {
        seenToken = query.spotifyAccessToken;
        return null;
      },
    };
    const orch = new LyricsOrchestrator({ spicy }, new CacheRepository(openDb(':memory:')));
    await lyricsRoute(orch).request('/?trackId=t1', { headers: { authorization: 'Bearer abc123' } });

    expect(seenToken).toBe('abc123');
  });
});

describe('GET /api/health', () => {
  it("expose l'état de chaque provider configuré", async () => {
    const spicy = fakeProvider('spicy', null, { available: false, circuitOpen: true, sessionAlive: false, spDcConfigured: false });
    const kpoe = fakeProvider('kpoe', null, { available: true, circuitOpen: false, queueDepth: 0, instances: [] });
    const res = await healthRoute({ spicy, kpoe }).request('/');

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.providers).toMatchObject({
      spicy: { available: false, circuitOpen: true },
      kpoe: { available: true },
    });
    expect((body.providers as Record<string, unknown>).lrclib).toBeUndefined();
  });
});
