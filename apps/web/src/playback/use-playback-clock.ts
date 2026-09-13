import { useCallback, useEffect, useRef, useState } from 'react';
import { PlaybackPoller } from './poller.js';
import {
  seek as seekApi,
  sendPlaybackCommand,
  type CurrentlyPlaying,
  type PlaybackCommandError,
  type PollError,
} from './spotify-api.js';
import { VirtualClock } from './virtual-clock.js';

export type TransportCommand = 'play' | 'pause' | 'next' | 'previous';

export interface PlaybackClockState {
  /** Horloge interpolée — c'est elle qui alimente `currentTime` du composant, jamais le brut du polling. */
  currentTimeMs: number;
  isPlaying: boolean;
  track: CurrentlyPlaying | undefined;
  /** Commande de transport en attente de confirmation — sert à neutraliser les boutons le temps de l'aller-retour. */
  pending: TransportCommand | undefined;
  /** Panneau de debug. */
  debug: { driftMs: number; rate: number; rttMs: number };
  error: PollError | undefined;
  seekTo: (positionMs: number) => Promise<void>;
  send: (command: TransportCommand) => Promise<void>;
}

/**
 * Fenêtre pendant laquelle l'état optimiste de lecture prime sur ce que
 * renvoie Spotify : `is_playing` reste brièvement à son ancienne valeur juste
 * après un play/pause, ce qui ferait clignoter le bouton et l'horloge.
 */
const OPTIMISTIC_WINDOW_MS = 2500;

/** Un changement de piste met un instant à se propager : un second poll rapproché évite d'attendre le créneau suivant. */
const CONFIRM_POLL_DELAY_MS = 700;

export interface PlaybackClockOptions {
  onCommandError?: (error: PlaybackCommandError) => void;
}

export function usePlaybackClock(
  getAccessToken: () => Promise<string | undefined>,
  options: PlaybackClockOptions = {},
): PlaybackClockState {
  const clockRef = useRef<VirtualClock>();
  if (!clockRef.current) clockRef.current = new VirtualClock();
  const pollerRef = useRef<PlaybackPoller>();
  const trackIdRef = useRef<string | undefined>();
  const optimisticRef = useRef<{ playing: boolean; until: number } | undefined>();

  const onCommandErrorRef = useRef(options.onCommandError);
  onCommandErrorRef.current = options.onCommandError;

  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [track, setTrack] = useState<CurrentlyPlaying | undefined>();
  const [pending, setPending] = useState<TransportCommand | undefined>();
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
          // Plus rien ne joue : l'horloge se fige au lieu de continuer à
          // avancer dans le vide jusqu'au prochain morceau.
          clock.setPlaying(false);
          optimisticRef.current = undefined;
          setPending(undefined);
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

        // L'état optimiste reprend la main tant que Spotify n'a pas rattrapé
        // la commande qu'on vient d'envoyer.
        const optimistic = optimisticRef.current;
        if (optimistic && Date.now() < optimistic.until) {
          if (optimistic.playing !== playing.isPlaying) clock.setPlaying(optimistic.playing);
          else optimisticRef.current = undefined;
        } else if (optimistic) {
          optimisticRef.current = undefined;
        }

        setPending(undefined);
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
      try {
        await seekApi(token, positionMs);
      } catch (err) {
        onCommandErrorRef.current?.(err as PlaybackCommandError);
        return;
      }
      pollerRef.current?.pollNow();
    },
    [getAccessToken],
  );

  const send = useCallback(
    async (command: TransportCommand) => {
      const token = await getAccessToken();
      if (!token) return;

      setPending(command);
      if (command === 'play' || command === 'pause') {
        const playing = command === 'play';
        optimisticRef.current = { playing, until: Date.now() + OPTIMISTIC_WINDOW_MS };
        clockRef.current?.setPlaying(playing);
      }

      try {
        await sendPlaybackCommand(token, command);
      } catch (err) {
        optimisticRef.current = undefined;
        setPending(undefined);
        onCommandErrorRef.current?.(err as PlaybackCommandError);
        pollerRef.current?.pollNow();
        return;
      }

      pollerRef.current?.pollNow();
      window.setTimeout(() => pollerRef.current?.pollNow(), CONFIRM_POLL_DELAY_MS);
    },
    [getAccessToken],
  );

  return { currentTimeMs, isPlaying, track, pending, debug, error, seekTo, send };
}
