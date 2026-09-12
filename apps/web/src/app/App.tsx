import { CallbackPage } from '../auth/CallbackPage.js';
import { useSpotifyAuth } from '../auth/use-spotify-auth.js';

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

  return (
    <main>
      <p>Connecté à Spotify. Lecteur de paroles à construire.</p>
      <button type="button" onClick={auth.logout}>
        Se déconnecter
      </button>
    </main>
  );
}
