import { useEffect } from 'react';
import { CallbackPage } from '../auth/CallbackPage.js';
import { getValidAccessToken } from '../auth/spotify-auth.js';
import { useSpotifyAuth, type SpotifyAuth } from '../auth/use-spotify-auth.js';
import { DebugPanel } from '../debug/DebugPanel.js';
import { AmLyricsPanel } from '../lyrics/AmLyricsPanel.js';
import { useLyrics } from '../lyrics/use-lyrics.js';
import { usePlaybackClock } from '../playback/use-playback-clock.js';
import { useOnlineStatus } from '../pwa/use-online-status.js';
import { useWakeLock } from '../pwa/use-wake-lock.js';
import './App.css';

export function App() {
  const isCallback = window.location.pathname === '/callback';
  const auth = useSpotifyAuth();

  if (isCallback) {
    return <CallbackPage onDone={() => void auth.refresh()} />;
  }

  if (auth.status === 'loading') {
    return (
      <main className="auth-screen">
        <p>Chargement…</p>
      </main>
    );
  }

  if (auth.status === 'unauthenticated') {
    return (
      <main className="auth-screen">
        <h1>mirrorball</h1>
        <button type="button" onClick={auth.login}>
          Se connecter avec Spotify
        </button>
      </main>
    );
  }

  return <Player auth={auth} />;
}

function Player({ auth }: { auth: SpotifyAuth }) {
  const playback = usePlaybackClock(getValidAccessToken);
  const lyrics = useLyrics(playback.track, getValidAccessToken);
  const online = useOnlineStatus();
  useWakeLock(playback.isPlaying);

  // Le token utilisé par le poller peut être rejeté (revocation côté Spotify,
  // déconnexion sur un autre appareil) sans que getValidAccessToken l'ait
  // détecté à l'avance : on revérifie l'état d'auth, ce qui renvoie à l'écran
  // de connexion si vraiment déconnecté, plutôt que de rester figé en silence.
  useEffect(() => {
    if (playback.error?.kind === 'unauthorized') void auth.refresh();
  }, [playback.error, auth]);

  return (
    <div className="app-layout">
      <aside className="app-layout__side">
        {playback.track?.albumImageUrl && <img className="app-layout__cover" src={playback.track.albumImageUrl} alt="" />}
        <div className="app-layout__track-info">
          <h2>{playback.track?.name ?? 'Aucune lecture en cours'}</h2>
          <p>{playback.track?.artists.join(', ') ?? ''}</p>
        </div>
        <div className="app-layout__controls">
          <button type="button" onClick={auth.logout}>
            Déconnexion
          </button>
        </div>
        {!online && <p className="app-layout__error">Hors ligne — horloge de lecture indisponible, dernières paroles affichées.</p>}
        {online && playback.error && playback.error.kind !== 'unauthorized' && (
          <p className="app-layout__error">Connexion à Spotify instable…</p>
        )}
      </aside>
      <section className="app-layout__lyrics">
        <AmLyricsPanel track={playback.track} currentTimeMs={playback.currentTimeMs} lyrics={lyrics} onSeek={(ms) => void playback.seekTo(ms)} />
      </section>
      <DebugPanel debug={playback.debug} track={playback.track} lyrics={lyrics} />
    </div>
  );
}
