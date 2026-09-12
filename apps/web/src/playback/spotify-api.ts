export interface CurrentlyPlaying {
  trackId: string;
  progressMs: number;
  isPlaying: boolean;
  durationMs: number;
  name: string;
  artists: string[];
  albumName: string;
  albumImageUrl: string | undefined;
  /** `external_ids.isrc` — clé de recherche prioritaire côté KPoe (cf. docs/kpoe-findings.md #9). */
  isrc: string | undefined;
}

export interface PollResult {
  /** `null` = rien en cours de lecture (204, ou `item: null`). */
  playing: CurrentlyPlaying | null;
  /** `performance.now()` à la réception de la réponse. */
  receivedAt: number;
  rttMs: number;
}

export type PollErrorKind = 'unauthorized' | 'network' | 'rate_limited';

export class PollError extends Error {
  constructor(
    readonly kind: PollErrorKind,
    readonly retryAfterMs?: number,
  ) {
    super(`spotify poll: ${kind}`);
  }
}

interface SpotifyCurrentlyPlayingResponse {
  progress_ms: number | null;
  is_playing: boolean;
  item: {
    id: string;
    name: string;
    duration_ms: number;
    artists: Array<{ name: string }>;
    album: { name: string; images: Array<{ url: string }> };
    external_ids?: { isrc?: string };
  } | null;
}

const CURRENTLY_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing';
const SEEK_URL = 'https://api.spotify.com/v1/me/player/seek';

export async function pollCurrentlyPlaying(accessToken: string): Promise<PollResult> {
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(CURRENTLY_PLAYING_URL, { headers: { authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new PollError('network');
  }
  const receivedAt = performance.now();
  const rttMs = receivedAt - started;

  if (res.status === 401) throw new PollError('unauthorized');
  if (res.status === 429) {
    const retryAfterHeader = res.headers.get('retry-after');
    const retryAfterMs = retryAfterHeader !== null ? Number(retryAfterHeader) * 1000 : undefined;
    throw new PollError('rate_limited', retryAfterMs);
  }
  if (res.status === 204) return { playing: null, receivedAt, rttMs };
  if (!res.ok) throw new PollError('network');

  const body = (await res.json()) as SpotifyCurrentlyPlayingResponse;
  if (!body.item) return { playing: null, receivedAt, rttMs };

  return {
    playing: {
      trackId: body.item.id,
      progressMs: body.progress_ms ?? 0,
      isPlaying: body.is_playing,
      durationMs: body.item.duration_ms,
      name: body.item.name,
      artists: body.item.artists.map((a) => a.name),
      albumName: body.item.album.name,
      albumImageUrl: body.item.album.images[0]?.url,
      isrc: body.item.external_ids?.isrc,
    },
    receivedAt,
    rttMs,
  };
}

export async function seek(accessToken: string, positionMs: number): Promise<void> {
  const url = new URL(SEEK_URL);
  url.searchParams.set('position_ms', String(Math.round(positionMs)));
  const res = await fetch(url, { method: 'PUT', headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 204) throw new PollError(res.status === 401 ? 'unauthorized' : 'network');
}
