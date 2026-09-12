import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/cache/db.js';
import { CacheRepository } from '../src/cache/repository.js';
import type { LyricsDoc } from '../src/ir/types.js';
import { LyricsOrchestrator, type Providers } from '../src/orchestrator/resolve-lyrics.js';
import type { Provider, ProviderQuery, ProviderResult } from '../src/providers/provider.js';
import type Database from 'better-sqlite3';

function doc(sync: LyricsDoc['sync'], text = 'x'): LyricsDoc {
  return {
    sync,
    lines: [
      {
        key: 'L1',
        startMs: 0,
        endMs: 1000,
        text,
        agent: 'v1',
        oppositeAligned: false,
        lead: { startMs: 0, endMs: 1000, syllables: sync === 'syllable' ? [{ text, startMs: 0, endMs: 1000, partOfWord: false }] : [] },
        background: [],
      },
    ],
    sections: [],
    songWriters: [],
    provider: 'test',
  };
}

/** Provider factice : renvoie `result` (ou lève `error`) à chaque fetch(), en comptant les appels. */
function fakeProvider(name: 'spicy' | 'kpoe' | 'lrclib', behavior: { result?: ProviderResult | null; error?: unknown; canAttempt?: boolean }): Provider & { calls: ProviderQuery[] } {
  const calls: ProviderQuery[] = [];
  return {
    name,
    calls,
    ...(behavior.canAttempt !== undefined ? { canAttempt: () => behavior.canAttempt! } : {}),
    async fetch(query: ProviderQuery): Promise<ProviderResult | null> {
      calls.push(query);
      if (behavior.error) throw behavior.error;
      return behavior.result ?? null;
    },
    health: () => ({}),
  };
}

function query(overrides: Partial<ProviderQuery> = {}): ProviderQuery {
  return { trackId: 'track1', isrc: 'ISRC1', ...overrides };
}

describe('LyricsOrchestrator', () => {
  let db: Database.Database;
  let cache: CacheRepository;

  beforeEach(() => {
    db = openDb(':memory:');
    cache = new CacheRepository(db);
  });

  it('arrête la cascade dès que Spicy renvoie syllable', async () => {
    const spicy = fakeProvider('spicy', { result: { doc: doc('syllable'), ms: 10 } });
    const kpoe = fakeProvider('kpoe', { result: { doc: doc('syllable'), ms: 10 } });
    const orch = new LyricsOrchestrator({ spicy, kpoe }, cache);

    const result = await orch.resolve(query());
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.output.provider).toBe('spicy');
      expect(result.output.sync).toBe('syllable');
    }
    expect(kpoe.calls).toHaveLength(0); // jamais tenté : spicy a déjà donné l'optimum
  });

  it("répond immédiatement sur un 'line' de Spicy et tente KPoe en tâche de fond", async () => {
    const spicy = fakeProvider('spicy', { result: { doc: doc('line'), ms: 10 } });
    const kpoe = fakeProvider('kpoe', { result: { doc: doc('syllable'), ms: 10 } });
    const orch = new LyricsOrchestrator({ spicy, kpoe }, cache);

    const result = await orch.resolve(query());
    expect(result.found).toBe(true);
    if (result.found) expect(result.output).toMatchObject({ provider: 'spicy', sync: 'line' });
    // La tâche de fond n'a pas encore forcément fini ; on laisse tourner les microtasks.
    await new Promise((r) => setTimeout(r, 0));
    expect(kpoe.calls.length).toBeGreaterThan(0);
    expect(cache.getBest('track1')).toEqual({ provider: 'kpoe', cacheKey: 'isrc:ISRC1', sync: 'syllable' });
  });

  it("continue vers KPoe puis LRCLIB quand Spicy ne renvoie que 'static'", async () => {
    const spicy = fakeProvider('spicy', { result: { doc: doc('static'), ms: 10 } });
    const kpoe = fakeProvider('kpoe', { result: null });
    const lrclib = fakeProvider('lrclib', { result: { doc: doc('line'), ms: 10 } });
    const orch = new LyricsOrchestrator({ spicy, kpoe, lrclib }, cache);

    const result = await orch.resolve(query({ title: 't', artist: 'a' }));
    expect(result.found).toBe(true);
    if (result.found) expect(result.output.provider).toBe('lrclib');
    expect(kpoe.calls).toHaveLength(1);
    expect(lrclib.calls).toHaveLength(1);
  });

  it("ne tente pas LRCLIB si KPoe a déjà fait mieux que 'static'", async () => {
    const kpoe = fakeProvider('kpoe', { result: { doc: doc('line'), ms: 10 } });
    const lrclib = fakeProvider('lrclib', { result: { doc: doc('syllable'), ms: 10 } });
    const orch = new LyricsOrchestrator({ kpoe, lrclib }, cache);

    const result = await orch.resolve(query());
    if (result.found) expect(result.output.provider).toBe('kpoe');
    expect(lrclib.calls).toHaveLength(0);
  });

  it("renvoie found:false avec les attempts quand aucune source n'a de paroles", async () => {
    const kpoe = fakeProvider('kpoe', { result: null });
    const lrclib = fakeProvider('lrclib', { result: null });
    const orch = new LyricsOrchestrator({ kpoe, lrclib }, cache);

    const result = await orch.resolve(query({ title: 't', artist: 'a' }));
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.attempts.map((a) => a.provider)).toEqual(['kpoe', 'lrclib']);
      expect(result.attempts.every((a) => a.outcome === 'not_found')).toBe(true);
    }
  });

  it('sert le prochain appel depuis le cache (lyrics_best), sans re-solliciter les providers', async () => {
    const kpoe = fakeProvider('kpoe', { result: { doc: doc('line'), ms: 10 } });
    const orch = new LyricsOrchestrator({ kpoe }, cache);

    await orch.resolve(query());
    kpoe.calls.length = 0;
    const second = await orch.resolve(query());

    expect(kpoe.calls).toHaveLength(0);
    expect(second.found).toBe(true);
    if (second.found) {
      expect(second.output.cached).toBe(true);
      expect(second.output.attempts).toEqual([]);
    }
  });

  it('respecte le cache négatif par provider (pas de nouvel appel réseau tant que le TTL court)', async () => {
    const kpoe = fakeProvider('kpoe', { result: null });
    const orch = new LyricsOrchestrator({ kpoe }, cache);

    await orch.resolve(query());
    const result2 = await orch.resolve(query());

    expect(kpoe.calls).toHaveLength(1); // le 2e appel a lu le cache négatif, pas retenté kpoe
    expect(result2.found).toBe(false);
    if (!result2.found) expect(result2.attempts).toEqual([{ provider: 'kpoe', outcome: 'not_found', ms: 0 }]);
  });

  it("n'appelle pas un provider dont canAttempt() renvoie false, et ne pollue pas le cache négatif", async () => {
    const spicy = fakeProvider('spicy', { result: { doc: doc('syllable'), ms: 10 }, canAttempt: false });
    const kpoe = fakeProvider('kpoe', { result: { doc: doc('line'), ms: 10 } });
    const orch = new LyricsOrchestrator({ spicy, kpoe }, cache);

    const result = await orch.resolve(query());
    expect(spicy.calls).toHaveLength(0);
    if (result.found) {
      expect(result.output.attempts.some((a) => a.provider === 'spicy')).toBe(false);
    }
  });

  it('capture une erreur de provider (panne infra) comme un attempt "error", et continue la cascade', async () => {
    const spicy = fakeProvider('spicy', { error: new Error('boom') });
    const kpoe = fakeProvider('kpoe', { result: { doc: doc('line'), ms: 10 } });
    const orch = new LyricsOrchestrator({ spicy, kpoe }, cache);

    const result = await orch.resolve(query());
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.output.provider).toBe('kpoe');
      expect(result.output.attempts[0]).toMatchObject({ provider: 'spicy', outcome: 'error' });
    }
  });

  it('marque "waf" un attempt dont l\'erreur porte outcome: "waf" (duck-typing KpoeProviderError)', async () => {
    const kpoe = fakeProvider('kpoe', { error: { outcome: 'waf', message: 'banned' } });
    const orch = new LyricsOrchestrator({ kpoe }, cache);

    const result = await orch.resolve(query());
    expect(result.found).toBe(false);
    if (!result.found) expect(result.attempts[0]).toMatchObject({ provider: 'kpoe', outcome: 'waf' });
  });

  it('déduplique les requêtes concurrentes sur le même trackId', async () => {
    let resolveFetch!: (r: ProviderResult) => void;
    const pending = new Promise<ProviderResult>((r) => (resolveFetch = r));
    const kpoe: Provider & { calls: number } = {
      name: 'kpoe',
      calls: 0,
      health: () => ({}),
      async fetch() {
        kpoe.calls++;
        return pending;
      },
    };
    const orch = new LyricsOrchestrator({ kpoe }, cache);

    const p1 = orch.resolve(query());
    const p2 = orch.resolve(query());
    resolveFetch({ doc: doc('line'), ms: 5 });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(kpoe.calls).toBe(1);
    expect(r1).toEqual(r2);
  });
});
