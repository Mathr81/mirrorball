import { describe, expect, it } from 'vitest';
import { cacheKeyFor } from '../src/cache/cache-key.js';
import type { ProviderQuery } from '../src/providers/provider.js';

function query(overrides: Partial<ProviderQuery>): ProviderQuery {
  return { trackId: 't1', ...overrides };
}

describe('cacheKeyFor — spicy', () => {
  it('utilise toujours le trackId exact', () => {
    expect(cacheKeyFor('spicy', query({ trackId: 'abc123' }))).toBe('id:abc123');
  });
});

describe('cacheKeyFor — kpoe', () => {
  it("privilégie l'isrc quand disponible", () => {
    expect(cacheKeyFor('kpoe', query({ isrc: 'GBUM71029604', title: 'x', artist: 'y' }))).toBe('isrc:GBUM71029604');
  });

  it('replie sur titre/artiste/durée normalisés sans isrc', () => {
    expect(cacheKeyFor('kpoe', query({ title: 'Alors on Danse', artist: 'Stromae', durationSec: 205.4 }))).toBe('ta:alors on danse|stromae|205');
  });

  it('retire les accents et compacte les espaces', () => {
    expect(cacheKeyFor('kpoe', query({ title: 'Édith  Piaf', artist: 'Non, je ne regrette rien' }))).toBe(
      'ta:edith piaf|non, je ne regrette rien|x',
    );
  });

  it('renvoie null sans isrc ni title+artist', () => {
    expect(cacheKeyFor('kpoe', query({}))).toBeNull();
    expect(cacheKeyFor('kpoe', query({ title: 'seul' }))).toBeNull();
  });
});

describe('cacheKeyFor — lrclib', () => {
  it("n'utilise jamais l'isrc, seulement titre/artiste/durée", () => {
    expect(cacheKeyFor('lrclib', query({ isrc: 'GBUM71029604', title: 'x', artist: 'y', durationSec: 100 }))).toBe('ta:x|y|100');
  });

  it('renvoie null sans title+artist', () => {
    expect(cacheKeyFor('lrclib', query({ isrc: 'GBUM71029604' }))).toBeNull();
  });
});
