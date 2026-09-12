import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/cache/db.js';
import { CacheRepository } from '../src/cache/repository.js';
import type Database from 'better-sqlite3';

describe('CacheRepository', () => {
  let db: Database.Database;
  let repo: CacheRepository;

  beforeEach(() => {
    db = openDb(':memory:');
    repo = new CacheRepository(db);
  });
  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  it('renvoie null pour une clé absente', () => {
    expect(repo.getCached('kpoe', 'isrc:x')).toBeNull();
  });

  it('écrit puis relit une entrée positive', () => {
    repo.setCached('kpoe', 'isrc:x', 'syllable', '<tt/>', 60_000);
    expect(repo.getCached('kpoe', 'isrc:x')).toEqual({ ttml: '<tt/>', sync: 'syllable', cached: true });
  });

  it('expire une entrée positive après son TTL', () => {
    vi.useFakeTimers();
    repo.setCached('kpoe', 'isrc:x', 'line', '<tt/>', 1000);
    vi.advanceTimersByTime(1001);
    expect(repo.getCached('kpoe', 'isrc:x')).toBeNull();
  });

  it('upsert remplace la valeur précédente pour la même clé', () => {
    repo.setCached('kpoe', 'isrc:x', 'line', '<a/>', 60_000);
    repo.setCached('kpoe', 'isrc:x', 'syllable', '<b/>', 60_000);
    expect(repo.getCached('kpoe', 'isrc:x')).toEqual({ ttml: '<b/>', sync: 'syllable', cached: true });
  });

  it('isNegative distingue absent / présent / expiré', () => {
    expect(repo.isNegative('kpoe', 'isrc:y')).toBe(false);
    repo.setNegative('kpoe', 'isrc:y', 60_000);
    expect(repo.isNegative('kpoe', 'isrc:y')).toBe(true);
  });

  it('isNegative renvoie false après expiration', () => {
    vi.useFakeTimers();
    repo.setNegative('kpoe', 'isrc:y', 1000);
    vi.advanceTimersByTime(1001);
    expect(repo.isNegative('kpoe', 'isrc:y')).toBe(false);
  });

  it('getBest/setBest pointent vers la meilleure entrée connue pour un morceau', () => {
    expect(repo.getBest('track1')).toBeNull();
    repo.setBest('track1', { provider: 'kpoe', cacheKey: 'isrc:x', sync: 'syllable' });
    expect(repo.getBest('track1')).toEqual({ provider: 'kpoe', cacheKey: 'isrc:x', sync: 'syllable' });
  });

  it('setBest met à jour (une seule ligne par trackId)', () => {
    repo.setBest('track1', { provider: 'spicy', cacheKey: 'id:track1', sync: 'line' });
    repo.setBest('track1', { provider: 'kpoe', cacheKey: 'isrc:x', sync: 'syllable' });
    expect(repo.getBest('track1')).toEqual({ provider: 'kpoe', cacheKey: 'isrc:x', sync: 'syllable' });
  });

  it('les caches par provider sont indépendants (même cache_key, provider différent)', () => {
    repo.setCached('kpoe', 'k', 'line', '<kpoe/>', 60_000);
    repo.setCached('lrclib', 'k', 'static', '<lrclib/>', 60_000);
    expect(repo.getCached('kpoe', 'k')?.ttml).toBe('<kpoe/>');
    expect(repo.getCached('lrclib', 'k')?.ttml).toBe('<lrclib/>');
  });
});
