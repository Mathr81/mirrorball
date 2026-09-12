import { useCallback, useEffect, useRef, useState } from 'react';
import { PlaybackPoller } from './poller.js';
import { seek as seekApi, type CurrentlyPlaying, type PollError } from './spotify-api.js';
import { VirtualClock } from './virtual-clock.js';

export interface PlaybackClockState {
  /** Horloge interpolée — c'est elle qui alimente `currentTime` du composant, jamais le brut du polling. */
  currentTimeMs: number;
  isPlaying: boolean;
  track: CurrentlyPlaying | undefined;
  /** Panneau de debug. */
  debug: { driftMs: number; rate: number; rttMs: number };
  error: PollError | undefined;
  seekTo: (positionMs: number) => Promise<void>;
}

export function usePlaybackClock(getAccessToken: () => Promise<string | undefined>): PlaybackClockState {
  const clockRef = useRef<VirtualClock>();
  if (!clockRef.current) clockRef.current = new VirtualClock();
  const pollerRef = useRef<PlaybackPoller>();
  const trackIdRef = useRef<string | undefined>();

  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [track, setTrack] = useState<CurrentlyPlaying | undefined>();
  const [debug, setDebug] = useState({ driftMs: 0, rate: 1, rttMs: 0 });
  const [error, setError] = useState<PollError | undefined>();

  useEffect(() => {
    const clock = clockRef.current!;
    const poller = new PlaybackPoller({
      getAccessToken,
      onResult: (result) => {
        setError(undefined);
        const nowMs = performance.now();

        if (!result.playing) {
          trackIdRef.current = undefined;
          setTrack(undefined);
          setDebug((d) => ({ ...d, rttMs: result.rttMs }));
          return;
        }

        const { playing } = result;
        if (playing.trackId !== trackIdRef.current) {
          trackIdRef.current = playing.trackId;
          clock.resetForTrack(playing.progressMs, playing.isPlaying);
        } else {
          clock.observe({ progressMs: playing.progressMs, isPlaying: playing.isPlaying, receivedAt: result.receivedAt, rttMs: result.rttMs }, nowMs);
        }
        setTrack(playing);
        setDebug({ driftMs: clock.getLastDriftMs(), rate: clock.getRate(), rttMs: result.rttMs });
      },
      onError: (err) => setError(err),
    });
    pollerRef.current = poller;
    poller.start();
    return () => poller.stop();
  }, [getAccessToken]);

  useEffect(() => {
    const clock = clockRef.current!;
    let raf: number;
    const loop = (nowMs: number) => {
      clock.tick(nowMs);
      setCurrentTimeMs(clock.getTimeMs());
      setIsPlaying(clock.isPlaying());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seekTo = useCallback(
    async (positionMs: number) => {
      const token = await getAccessToken();
      if (!token) return;
      await seekApi(token, positionMs);
      pollerRef.current?.pollNow();
    },
    [getAccessToken],
  );

  return { currentTimeMs, isPlaying, track, debug, error, seekTo };
}
