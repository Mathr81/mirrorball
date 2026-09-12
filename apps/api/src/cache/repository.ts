import type Database from 'better-sqlite3';
import type { LyricsDoc } from '../ir/types.js';

export interface CachedEntry {
  ttml: string;
  sync: LyricsDoc['sync'];
  cached: true;
}

export interface BestEntry {
  provider: string;
  cacheKey: string;
  sync: LyricsDoc['sync'];
}

interface CacheRow {
  ttml: string;
  sync: string;
  expires_at: number;
}

interface NegativeRow {
  expires_at: number;
}

interface BestRow {
  provider: string;
  cache_key: string;
  sync: string;
}

export class CacheRepository {
  constructor(private readonly db: Database.Database) {}

  getCached(provider: string, cacheKey: string): CachedEntry | null {
    const row = this.db
      .prepare<[string, string], CacheRow>('SELECT ttml, sync, expires_at FROM lyrics_cache WHERE provider = ? AND cache_key = ?')
      .get(provider, cacheKey);
    if (!row || row.expires_at < Date.now()) return null;
    return { ttml: row.ttml, sync: row.sync as LyricsDoc['sync'], cached: true };
  }

  setCached(provider: string, cacheKey: string, sync: LyricsDoc['sync'], ttml: string, ttlMs: number): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO lyrics_cache (provider, cache_key, sync, ttml, fetched_at, expires_at)
         VALUES (@provider, @cacheKey, @sync, @ttml, @now, @expiresAt)
         ON CONFLICT (provider, cache_key) DO UPDATE SET sync=@sync, ttml=@ttml, fetched_at=@now, expires_at=@expiresAt`,
      )
      .run({ provider, cacheKey, sync, ttml, now, expiresAt: now + ttlMs });
  }

  isNegative(provider: string, cacheKey: string): boolean {
    const row = this.db
      .prepare<[string, string], NegativeRow>('SELECT expires_at FROM lyrics_negative WHERE provider = ? AND cache_key = ?')
      .get(provider, cacheKey);
    return row !== undefined && row.expires_at >= Date.now();
  }

  setNegative(provider: string, cacheKey: string, ttlMs: number): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO lyrics_negative (provider, cache_key, fetched_at, expires_at)
         VALUES (@provider, @cacheKey, @now, @expiresAt)
         ON CONFLICT (provider, cache_key) DO UPDATE SET fetched_at=@now, expires_at=@expiresAt`,
      )
      .run({ provider, cacheKey, now, expiresAt: now + ttlMs });
  }

  getBest(trackId: string): BestEntry | null {
    const row = this.db
      .prepare<[string], BestRow>('SELECT provider, cache_key, sync FROM lyrics_best WHERE track_id = ?')
      .get(trackId);
    return row ? { provider: row.provider, cacheKey: row.cache_key, sync: row.sync as LyricsDoc['sync'] } : null;
  }

  setBest(trackId: string, entry: BestEntry): void {
    this.db
      .prepare(
        `INSERT INTO lyrics_best (track_id, provider, cache_key, sync, updated_at)
         VALUES (@trackId, @provider, @cacheKey, @sync, @now)
         ON CONFLICT (track_id) DO UPDATE SET provider=@provider, cache_key=@cacheKey, sync=@sync, updated_at=@now`,
      )
      .run({ trackId, provider: entry.provider, cacheKey: entry.cacheKey, sync: entry.sync, now: Date.now() });
  }
}
