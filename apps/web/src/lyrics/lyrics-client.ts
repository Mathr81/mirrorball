export interface LyricsAttempt {
  provider: 'spicy' | 'kpoe' | 'lrclib';
  outcome: string;
  ms: number;
  queuedMs?: number;
}

export interface LyricsResponse {
  ttml: string;
  sync: 'syllable' | 'line' | 'static';
  provider: string;
  cached: boolean;
  matched: { provider: string; cacheKey: string; sync: string };
  attempts: LyricsAttempt[];
}

export type LyricsErrorKind = 'not_found' | 'unauthorized' | 'network';

export class LyricsError extends Error {
  constructor(
    readonly kind: LyricsErrorKind,
    readonly attempts: LyricsAttempt[] = [],
  ) {
    super(`lyrics: ${kind}`);
  }
}

export interface LyricsQuery {
  trackId: string;
  title?: string;
  artist?: string;
  durationSec?: number;
  isrc?: string;
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

export async function fetchLyrics(query: LyricsQuery, accessToken: string): Promise<LyricsResponse> {
  const url = new URL('/api/lyrics', API_BASE_URL);
  url.searchParams.set('trackId', query.trackId);
  if (query.title) url.searchParams.set('title', query.title);
  if (query.artist) url.searchParams.set('artist', query.artist);
  if (query.durationSec !== undefined) url.searchParams.set('duration', String(query.durationSec));
  if (query.isrc) url.searchParams.set('isrc', query.isrc);

  let res: Response;
  try {
    res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new LyricsError('network');
  }

  if (res.status === 401) throw new LyricsError('unauthorized');

  if (res.status === 404) {
    const body = (await res.json().catch(() => ({ attempts: [] }))) as { attempts?: LyricsAttempt[] };
    throw new LyricsError('not_found', body.attempts ?? []);
  }

  if (!res.ok) throw new LyricsError('network');

  return (await res.json()) as LyricsResponse;
}
