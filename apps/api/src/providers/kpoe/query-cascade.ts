import type { ProviderQuery } from '../provider.js';

export type KpoeQueryParams = Record<'isrc' | 'title' | 'artist' | 'duration', string | undefined>;

/**
 * Jamais de `source` ni d'`album` (finding #3 et #5 : ignorés ou nuisibles).
 * Quand l'isrc est disponible, il part SEUL — combiner avec title/artist/
 * duration n'apporte rien de constaté (finding #9) et risque d'introduire
 * du bruit. La cascade titre/artiste ne sert qu'en repli, quand Spotify ne
 * fournit pas d'ISRC pour la piste.
 */
export function buildKpoeCascade(query: ProviderQuery): KpoeQueryParams[] {
  if (query.isrc) {
    return [{ isrc: query.isrc, title: undefined, artist: undefined, duration: undefined }];
  }

  if (!query.title || !query.artist) return [];

  const attempts: KpoeQueryParams[] = [];
  if (query.durationSec !== undefined) {
    attempts.push({ isrc: undefined, title: query.title, artist: query.artist, duration: String(query.durationSec) });
  }
  attempts.push({ isrc: undefined, title: query.title, artist: query.artist, duration: undefined });
  return attempts;
}

export function toSearchParams(params: KpoeQueryParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (params.isrc !== undefined) sp.set('isrc', params.isrc);
  if (params.title !== undefined) sp.set('title', params.title);
  if (params.artist !== undefined) sp.set('artist', params.artist);
  if (params.duration !== undefined) sp.set('duration', params.duration);
  return sp;
}
