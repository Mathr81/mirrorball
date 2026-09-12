import { describe, expect, it } from 'vitest';
import { buildKpoeCascade, toSearchParams } from '../src/providers/kpoe/query-cascade.js';
import type { ProviderQuery } from '../src/providers/provider.js';

function query(overrides: Partial<ProviderQuery>): ProviderQuery {
  return { trackId: 't1', ...overrides };
}

describe('buildKpoeCascade', () => {
  it("n'envoie que l'isrc, seul, quand il est disponible (finding #9)", () => {
    const attempts = buildKpoeCascade(query({ isrc: 'GBUM71029604', title: 'Bohemian Rhapsody', artist: 'Queen', durationSec: 354 }));
    expect(attempts).toEqual([{ isrc: 'GBUM71029604', title: undefined, artist: undefined, duration: undefined }]);
  });

  it('replie sur title+artist+duration puis title+artist seuls quand il n\'y a pas d\'isrc', () => {
    const attempts = buildKpoeCascade(query({ title: 'Alors on danse', artist: 'Stromae', durationSec: 205 }));
    expect(attempts).toEqual([
      { isrc: undefined, title: 'Alors on danse', artist: 'Stromae', duration: '205' },
      { isrc: undefined, title: 'Alors on danse', artist: 'Stromae', duration: undefined },
    ]);
  });

  it('ne tente que title+artist quand la durée est inconnue', () => {
    const attempts = buildKpoeCascade(query({ title: 'Alors on danse', artist: 'Stromae' }));
    expect(attempts).toEqual([{ isrc: undefined, title: 'Alors on danse', artist: 'Stromae', duration: undefined }]);
  });

  it("ne produit aucune tentative sans isrc ni title+artist", () => {
    expect(buildKpoeCascade(query({}))).toEqual([]);
    expect(buildKpoeCascade(query({ title: 'seul' }))).toEqual([]);
  });
});

describe('toSearchParams', () => {
  it("n'inclut jamais `source` ni `album` (finding #3 et #5)", () => {
    const params = toSearchParams({ isrc: undefined, title: 'x', artist: 'y', duration: '100' });
    expect(params.has('source')).toBe(false);
    expect(params.has('album')).toBe(false);
    expect(params.get('title')).toBe('x');
    expect(params.get('artist')).toBe('y');
    expect(params.get('duration')).toBe('100');
  });

  it('isrc seul ne fuit aucun autre paramètre', () => {
    const params = toSearchParams({ isrc: 'GBUM71029604', title: undefined, artist: undefined, duration: undefined });
    expect([...params.keys()]).toEqual(['isrc']);
  });
});
