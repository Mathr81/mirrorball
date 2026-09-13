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
const PLAYER_BASE_URL = 'https://api.spotify.com/v1/me/player';
const SEEK_URL = `${PLAYER_BASE_URL}/seek`;

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

export type PlaybackCommand = 'play' | 'pause' | 'next' | 'previous' | 'seek';

export type CommandErrorKind =
  | 'unauthorized'
  /** Aucun appareil Spotify actif : rien à piloter (404 `NO_ACTIVE_DEVICE`). */
  | 'no_device'
  /** Compte non Premium, ou action interdite sur le contexte courant (403). */
  | 'forbidden'
  | 'network';

export class PlaybackCommandError extends Error {
  constructor(
    readonly kind: CommandErrorKind,
    readonly command: PlaybackCommand,
  ) {
    super(`spotify command ${command}: ${kind}`);
  }
}

const COMMAND_REQUESTS: Record<Exclude<PlaybackCommand, 'seek'>, { method: string; path: string }> = {
  play: { method: 'PUT', path: 'play' },
  pause: { method: 'PUT', path: 'pause' },
  next: { method: 'POST', path: 'next' },
  previous: { method: 'POST', path: 'previous' },
};

async function send(accessToken: string, command: PlaybackCommand, url: URL, method: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new PlaybackCommandError('network', command);
  }

  if (res.ok || res.status === 204) return;
  if (res.status === 401) throw new PlaybackCommandError('unauthorized', command);
  if (res.status === 404) throw new PlaybackCommandError('no_device', command);
  if (res.status === 403) throw new PlaybackCommandError('forbidden', command);
  throw new PlaybackCommandError('network', command);
}

/** Déplacement dans le morceau (clic sur une ligne de paroles, ou glissement de la barre de progression). */
export async function seek(accessToken: string, positionMs: number): Promise<void> {
  const url = new URL(SEEK_URL);
  url.searchParams.set('position_ms', String(Math.round(positionMs)));
  await send(accessToken, 'seek', url, 'PUT');
}

/**
 * Transport (lecture/pause/piste suivante/précédente). Toutes ces routes
 * exigent un appareil actif côté Spotify et un compte Premium : les deux refus
 * correspondants ont leur propre `kind` pour être expliqués à l'écran plutôt
 * que réduits à « erreur réseau ».
 */
export async function sendPlaybackCommand(accessToken: string, command: Exclude<PlaybackCommand, 'seek'>): Promise<void> {
  const { method, path } = COMMAND_REQUESTS[command];
  await send(accessToken, command, new URL(`${PLAYER_BASE_URL}/${path}`), method);
}
