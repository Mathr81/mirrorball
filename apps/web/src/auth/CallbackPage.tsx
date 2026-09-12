import { useEffect, useState } from 'react';
import { handleCallback, startLogin } from './spotify-auth.js';

export function CallbackPage({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    handleCallback(window.location.search)
      .then(() => {
        window.history.replaceState(null, '', '/');
        onDone();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [onDone]);

  if (error) {
    return (
      <main className="auth-screen">
        <p>Connexion à Spotify impossible : {error}</p>
        <button type="button" onClick={() => void startLogin()}>
          Réessayer
        </button>
      </main>
    );
  }

  return (
    <main className="auth-screen">
      <p>Connexion à Spotify…</p>
    </main>
  );
}
