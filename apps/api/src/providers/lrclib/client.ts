import type { LrclibTrack } from './types.js';

const BASE_URL = 'https://lrclib.net/api/get';
const TIMEOUT_MS = 8_000;

export interface LrclibClientHealth {
  available: boolean;
  lastError?: string;
}

/**
 * Pas d'authentification, rate limits confortables (contrairement à KPoe) :
 * pas de file d'attente sérialisée nécessaire, juste un User-Agent honnête
 * comme demandé par la doc LRCLIB.
 */
export class LrclibClient {
  private lastError: string | undefined;

  constructor(private readonly userAgent: string) {}

  getHealth(): LrclibClientHealth {
    return this.lastError !== undefined ? { available: false, lastError: this.lastError } : { available: true };
  }

  async get(params: { title: string; artist: string; album?: string; durationSec?: number }): Promise<LrclibTrack | null> {
    const url = new URL(BASE_URL);
    url.searchParams.set('track_name', params.title);
    url.searchParams.set('artist_name', params.artist);
    if (params.album) url.searchParams.set('album_name', params.album);
    if (params.durationSec !== undefined) url.searchParams.set('duration', String(params.durationSec));

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': this.userAgent } });
      if (res.status === 404) {
        this.lastError = undefined;
        return null;
      }
      if (!res.ok) {
        this.lastError = `http-${res.status}`;
        throw new Error(`lrclib: http ${res.status}`);
      }
      this.lastError = undefined;
      return (await res.json()) as LrclibTrack;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
