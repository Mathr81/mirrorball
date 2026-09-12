import { cacheKeyFor } from '../cache/cache-key.js';
import type { CacheRepository } from '../cache/repository.js';
import { emitTtml } from '../ir/ttml-emitter.js';
import type { LyricsDoc } from '../ir/types.js';
import type { Provider, ProviderQuery } from '../providers/provider.js';
import type { Attempt, ResolveLyricsOutput, ResolveResult } from './types.js';

const POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Plus court que les autres : laisse une chance à une source mot-à-mot d'apparaître plus tard (§6). */
const LRCLIB_POSITIVE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

type ProviderName = 'spicy' | 'kpoe' | 'lrclib';

function rank(sync: LyricsDoc['sync'] | undefined): number {
  switch (sync) {
    case 'syllable':
      return 2;
    case 'line':
      return 1;
    case 'static':
      return 0;
    default:
      return -1;
  }
}

function ttlFor(providerName: ProviderName): number {
  return providerName === 'lrclib' ? LRCLIB_POSITIVE_TTL_MS : POSITIVE_TTL_MS;
}

/** KpoeProviderError porte `outcome: 'waf'|'error'` ; on le lit par duck-typing pour rester découplé des providers. */
function outcomeFromError(err: unknown): 'waf' | 'error' {
  if (err && typeof err === 'object' && 'outcome' in err && (err as { outcome: unknown }).outcome === 'waf') return 'waf';
  return 'error';
}

export interface Providers {
  spicy?: Provider;
  kpoe?: Provider;
  lrclib?: Provider;
}

interface Current {
  ttml: string;
  sync: LyricsDoc['sync'];
  providerName: ProviderName;
  cacheKey: string;
}

/**
 * Politique « le meilleur dans le budget » (docs/architecture-proposal.md §6) :
 * syllable → arrêt immédiat ; line → réponse immédiate, amélioration KPoe
 * tentée en tâche de fond (décision actée) ; static → on continue vers une
 * source peu coûteuse (KPoe puis LRCLIB) avant de répondre.
 */
export class LyricsOrchestrator {
  private readonly inFlight = new Map<string, Promise<ResolveResult>>();

  constructor(
    private readonly providers: Providers,
    private readonly cache: CacheRepository,
  ) {}

  async resolve(query: ProviderQuery): Promise<ResolveResult> {
    const existing = this.inFlight.get(query.trackId);
    if (existing) return existing;

    const promise = this.resolveUncached(query).finally(() => this.inFlight.delete(query.trackId));
    this.inFlight.set(query.trackId, promise);
    return promise;
  }

  private async resolveUncached(query: ProviderQuery): Promise<ResolveResult> {
    const best = this.cache.getBest(query.trackId);
    if (best) {
      const hit = this.cache.getCached(best.provider, best.cacheKey);
      if (hit) {
        return {
          found: true,
          output: {
            ttml: hit.ttml,
            sync: hit.sync,
            provider: best.provider,
            cached: true,
            matched: { provider: best.provider, cacheKey: best.cacheKey, sync: hit.sync },
            attempts: [],
          },
        };
      }
    }

    const attempts: Attempt[] = [];
    let current: Current | null = null;

    current = await this.tryOne('spicy', query, attempts, current);
    if (current?.sync === 'syllable') return { found: true, output: this.finalize(query.trackId, current, attempts) };

    if (current?.sync === 'line') {
      this.persist(current);
      this.cache.setBest(query.trackId, { provider: current.providerName, cacheKey: current.cacheKey, sync: current.sync });
      void this.improveInBackground(query, current);
      return { found: true, output: this.toOutput(current, attempts, false) };
    }

    current = await this.tryOne('kpoe', query, attempts, current);
    if (current?.sync === 'syllable') return { found: true, output: this.finalize(query.trackId, current, attempts) };

    if (!current || current.sync === 'static') {
      current = await this.tryOne('lrclib', query, attempts, current);
    }

    if (!current) return { found: false, attempts };
    return { found: true, output: this.finalize(query.trackId, current, attempts) };
  }

  /** N'écrase `current` que si ce provider fait mieux ; consulte/alimente les caches positif et négatif. */
  private async tryOne(name: ProviderName, query: ProviderQuery, attempts: Attempt[], current: Current | null): Promise<Current | null> {
    const provider = this.providers[name];
    if (!provider) return current;
    if (provider.canAttempt && !provider.canAttempt(query)) return current;

    const cacheKey = cacheKeyFor(name, query);
    if (!cacheKey) return current;

    const hit = this.cache.getCached(name, cacheKey);
    if (hit) {
      attempts.push({ provider: name, outcome: 'cached', ms: 0 });
      return rank(hit.sync) > rank(current?.sync) ? { ttml: hit.ttml, sync: hit.sync, providerName: name, cacheKey } : current;
    }

    if (this.cache.isNegative(name, cacheKey)) {
      attempts.push({ provider: name, outcome: 'not_found', ms: 0 });
      return current;
    }

    const started = performance.now();
    try {
      const result = await provider.fetch(query);
      const ms = Math.round(performance.now() - started);

      if (!result) {
        attempts.push({ provider: name, outcome: 'not_found', ms });
        this.cache.setNegative(name, cacheKey, NEGATIVE_TTL_MS);
        return current;
      }

      attempts.push({ provider: name, outcome: result.doc.sync, ms, ...(result.queuedMs !== undefined ? { queuedMs: result.queuedMs } : {}) });
      if (rank(result.doc.sync) <= rank(current?.sync)) return current;

      return { ttml: emitTtml(result.doc), sync: result.doc.sync, providerName: name, cacheKey };
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      attempts.push({ provider: name, outcome: outcomeFromError(err), ms });
      return current;
    }
  }

  private persist(current: Current): void {
    this.cache.setCached(current.providerName, current.cacheKey, current.sync, current.ttml, ttlFor(current.providerName));
  }

  private toOutput(current: Current, attempts: Attempt[], cached: boolean): ResolveLyricsOutput {
    return {
      ttml: current.ttml,
      sync: current.sync,
      provider: current.providerName,
      cached,
      matched: { provider: current.providerName, cacheKey: current.cacheKey, sync: current.sync },
      attempts,
    };
  }

  private finalize(trackId: string, current: Current, attempts: Attempt[]): ResolveLyricsOutput {
    this.persist(current);
    this.cache.setBest(trackId, { provider: current.providerName, cacheKey: current.cacheKey, sync: current.sync });
    return this.toOutput(current, attempts, false);
  }

  /** Amélioration mot-à-mot tentée hors du cycle de requête : ne bloque jamais la réponse déjà envoyée. */
  private async improveInBackground(query: ProviderQuery, currentLine: Current): Promise<void> {
    const attempts: Attempt[] = [];
    const improved = await this.tryOne('kpoe', query, attempts, currentLine);
    if (improved && improved !== currentLine) {
      this.persist(improved);
      this.cache.setBest(query.trackId, { provider: improved.providerName, cacheKey: improved.cacheKey, sync: improved.sync });
    }
  }
}
