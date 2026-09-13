import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getValidAccessToken } from '../auth/spotify-auth.js';
import type { SpotifyAuth } from '../auth/use-spotify-auth.js';
import { useArtworkPalette } from '../color/use-artwork-palette.js';
import { DebugPanel } from '../debug/DebugPanel.js';
import { AmLyricsPanel } from '../lyrics/AmLyricsPanel.js';
import { useLyrics } from '../lyrics/use-lyrics.js';
import { NowPlaying } from '../playback/NowPlaying.js';
import type { PlaybackCommandError } from '../playback/spotify-api.js';
import { usePlaybackClock } from '../playback/use-playback-clock.js';
import { useOnlineStatus } from '../pwa/use-online-status.js';
import { useWakeLock } from '../pwa/use-wake-lock.js';
import { useSettings } from '../settings/use-settings.js';
import { CollapseIcon, ExpandIcon, OfflineIcon, SettingsIcon } from '../ui/icons.js';
import { Toasts } from '../ui/Toasts.js';
import { useIdle } from '../ui/use-idle.js';
import { useToasts } from '../ui/use-toasts.js';
import { AmbientBackdrop } from './AmbientBackdrop.js';
import { SettingsPanel } from './SettingsPanel.js';
import { ShortcutsOverlay } from './ShortcutsOverlay.js';
import { useShortcuts } from './use-shortcuts.js';

/** Après ce délai sans geste ni frappe, les commandes flottantes s'effacent (l'iPad posé sur son support n'affiche plus que les paroles). */
const IDLE_DELAY_MS = 4000;

/** La barre de progression n'a pas besoin des 60 images par seconde de l'horloge : au quart de seconde, l'œil ne fait pas la différence et le volet ne se re-rend plus qu'à ce rythme. */
const PROGRESS_QUANTUM_MS = 250;

const LYRICS_SCALE: Record<string, number> = { sm: 0.82, md: 1, lg: 1.22 };

const MemoBackdrop = memo(AmbientBackdrop);
const MemoNowPlaying = memo(NowPlaying);

function commandErrorMessage(error: PlaybackCommandError): string {
  switch (error.kind) {
    case 'no_device':
      return 'Aucun appareil Spotify actif — lance la lecture depuis Spotify, puis réessaie.';
    case 'forbidden':
      return 'Spotify a refusé la commande (le pilotage à distance demande un compte Premium).';
    case 'unauthorized':
      return 'Session Spotify expirée — reconnecte-toi.';
    default:
      return 'Commande impossible à envoyer à Spotify.';
  }
}

export function Player({ auth }: { auth: SpotifyAuth }) {
  const { toasts, push, dismiss } = useToasts();
  const { settings, update, toggle } = useSettings();

  const onCommandError = useCallback((error: PlaybackCommandError) => push(commandErrorMessage(error), 'warn'), [push]);
  const playbackOptions = useMemo(() => ({ onCommandError }), [onCommandError]);

  const playback = usePlaybackClock(getValidAccessToken, playbackOptions);
  const lyrics = useLyrics(playback.track, getValidAccessToken);
  const online = useOnlineStatus();
  const palette = useArtworkPalette(playback.track?.albumImageUrl);
  const idle = useIdle(IDLE_DELAY_MS, playback.isPlaying);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useWakeLock(playback.isPlaying);

  // Le token utilisé par le poller peut être rejeté (revocation côté Spotify,
  // déconnexion sur un autre appareil) sans que getValidAccessToken l'ait
  // détecté à l'avance : on revérifie l'état d'auth, ce qui renvoie à l'écran
  // de connexion si vraiment déconnecté, plutôt que de rester figé en silence.
  useEffect(() => {
    if (playback.error?.kind === 'unauthorized') void auth.refresh();
  }, [playback.error, auth]);

  useEffect(() => {
    if (!online || !playback.error) return;
    if (playback.error.kind === 'rate_limited') push('Spotify limite les requêtes — mise à jour ralentie un instant.', 'info');
    else if (playback.error.kind === 'network') push('Connexion à Spotify instable…', 'warn');
  }, [playback.error, online, push]);

  const seekTo = useCallback((positionMs: number) => void playback.seekTo(positionMs), [playback]);
  const sendCommand = playback.send;

  useShortcuts(
    {
      togglePlay: () => void sendCommand(playback.isPlaying ? 'pause' : 'play'),
      seekBy: (deltaMs) => {
        if (!playback.track) return;
        seekTo(Math.min(playback.track.durationMs, Math.max(0, playback.currentTimeMs + deltaMs)));
      },
      next: () => void sendCommand('next'),
      previous: () => void sendCommand('previous'),
      toggleImmersive: () => toggle('immersive'),
      toggleDebug: () => toggle('showDebug'),
      toggleHelp: () => setShortcutsOpen((open) => !open),
      escape: () => {
        setShortcutsOpen(false);
        setSettingsOpen(false);
      },
    },
    !settingsOpen,
  );

  const accent = settings.accentFromArtwork ? palette.accent : 'hsl(0 0% 96%)';
  const style = {
    '--accent': accent,
    '--lyrics-scale': LYRICS_SCALE[settings.lyricsSize] ?? 1,
  } as CSSProperties;

  const chromeHidden = idle && !settingsOpen && !shortcutsOpen;
  const coarseTimeMs = Math.round(playback.currentTimeMs / PROGRESS_QUANTUM_MS) * PROGRESS_QUANTUM_MS;

  return (
    <div
      className={[
        'player',
        settings.immersive ? 'player--immersive' : '',
        chromeHidden ? 'player--idle' : '',
        settings.ambient ? '' : 'player--plain',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <MemoBackdrop
        imageUrl={playback.track?.albumImageUrl}
        palette={palette}
        isPlaying={playback.isPlaying}
        enabled={settings.ambient}
      />

      <aside className="player__rail">
        <MemoNowPlaying
          track={playback.track}
          currentTimeMs={coarseTimeMs}
          isPlaying={playback.isPlaying}
          pending={playback.pending}
          settings={settings}
          onToggleRemaining={() => toggle('showRemaining')}
          onSeek={seekTo}
          onCommand={(command) => void sendCommand(command)}
        />
      </aside>

      <section className="player__stage">
        <AmLyricsPanel track={playback.track} currentTimeMs={playback.currentTimeMs} lyrics={lyrics} onSeek={seekTo} />
      </section>

      <div className="chrome">
        {!online && (
          <span className="chrome__offline" title="Hors ligne — dernières paroles conservées">
            <OfflineIcon />
            Hors ligne
          </span>
        )}
        <button
          type="button"
          className="icon-button icon-button--glass"
          onClick={() => toggle('immersive')}
          aria-pressed={settings.immersive}
          aria-label={settings.immersive ? 'Quitter le mode immersif' : 'Mode immersif'}
          title={`${settings.immersive ? 'Quitter le mode immersif' : 'Mode immersif'} (F)`}
        >
          {settings.immersive ? <CollapseIcon /> : <ExpandIcon />}
        </button>
        <button
          type="button"
          className="icon-button icon-button--glass"
          onClick={() => setSettingsOpen(true)}
          aria-label="Réglages"
          title="Réglages"
        >
          <SettingsIcon />
        </button>
      </div>

      {settings.immersive && playback.track && (
        <div className="mini-now-playing">
          {playback.track.albumImageUrl && <img src={playback.track.albumImageUrl} alt="" />}
          <span className="mini-now-playing__text">
            <strong>{playback.track.name}</strong>
            <span>{playback.track.artists.join(', ')}</span>
          </span>
        </div>
      )}

      <Toasts toasts={toasts} dismiss={dismiss} />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onShowShortcuts={() => {
          setSettingsOpen(false);
          setShortcutsOpen(true);
        }}
        onLogout={auth.logout}
        settings={settings}
        update={update}
        toggle={toggle}
      />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {settings.showDebug && <DebugPanel debug={playback.debug} track={playback.track} lyrics={lyrics} />}
    </div>
  );
}
