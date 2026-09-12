import type { ProviderQuery } from '../providers/provider.js';

/** Minuscules, accents retirés, espaces compactés — pour un usage en clé de cache uniquement. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function titleArtistKey(query: ProviderQuery): string | null {
  if (!query.title || !query.artist) return null;
  const duration = query.durationSec !== undefined ? Math.round(query.durationSec) : 'x';
  return `ta:${normalize(query.title)}|${normalize(query.artist)}|${duration}`;
}

/**
 * Clé de cache par provider — reflète exactement ce que ce provider utilise
 * réellement pour chercher (cf. docs/architecture-proposal.md §6-§7) :
 * Spicy cherche par trackId exact, KPoe par isrc quand disponible (finding #9),
 * LRCLIB uniquement par titre/artiste/durée. Renvoie `null` quand la requête
 * ne porte pas assez d'information pour ce provider (pas la peine de l'appeler).
 */
export function cacheKeyFor(provider: 'spicy' | 'kpoe' | 'lrclib', query: ProviderQuery): string | null {
  switch (provider) {
    case 'spicy':
      return `id:${query.trackId}`;
    case 'kpoe':
      return query.isrc ? `isrc:${query.isrc}` : titleArtistKey(query);
    case 'lrclib':
      return titleArtistKey(query);
  }
}
