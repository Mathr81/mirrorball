import { useCallback, useEffect, useRef, useState } from 'react';
import type { CurrentlyPlaying } from '../playback/spotify-api.js';
import { fetchLyrics, LyricsError, type LyricsAttempt, type LyricsResponse } from './lyrics-client.js';

export interface LyricsState {
  status: 'idle' | 'loading' | 'ready' | 'not_found' | 'error';
  data: LyricsResponse | undefined;
  attempts: LyricsAttempt[];
  /** Relance la recherche pour le morceau courant (bouton « Réessayer »). */
  reload: () => void;
}

type LyricsResult = Omit<LyricsState, 'reload'>;

const IDLE: LyricsResult = { status: 'idle', data: undefined, attempts: [] };

/** Ne relance une requête que sur changement de morceau, jamais à chaque tick du poller. */
export function useLyrics(track: CurrentlyPlaying | undefined, getAccessToken: () => Promise<string | undefined>): LyricsState {
  const [state, setState] = useState<LyricsResult>(IDLE);
  const [nonce, setNonce] = useState(0);
  const trackIdRef = useRef<string | undefined>();

  const reload = useCallback(() => {
    trackIdRef.current = undefined;
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!track) {
      trackIdRef.current = undefined;
      setState(IDLE);
      return;
    }
    if (track.trackId === trackIdRef.current) return;
    trackIdRef.current = track.trackId;

    let cancelled = false;
    setState({ status: 'loading', data: undefined, attempts: [] });

    void (async () => {
      const token = await getAccessToken();
      if (!token) {
        if (!cancelled) setState({ status: 'error', data: undefined, attempts: [] });
        return;
      }
      try {
        const artist = track.artists[0];
        const result = await fetchLyrics(
          {
            trackId: track.trackId,
            title: track.name,
            durationSec: Math.round(track.durationMs / 1000),
            ...(artist !== undefined ? { artist } : {}),
            ...(track.isrc !== undefined ? { isrc: track.isrc } : {}),
          },
          token,
        );
        if (!cancelled) setState({ status: 'ready', data: result, attempts: result.attempts });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof LyricsError && err.kind === 'not_found') {
          setState({ status: 'not_found', data: undefined, attempts: err.attempts });
        } else {
          setState({ status: 'error', data: undefined, attempts: [] });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [track, getAccessToken, nonce]);

  return { ...state, reload };
}
