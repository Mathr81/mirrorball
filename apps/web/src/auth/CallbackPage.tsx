import { useEffect, useState } from 'react';
import { AuthShell } from '../app/AuthScreen.js';
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
      <AuthShell>
        <p className="auth__status auth__status--error">Connexion à Spotify impossible : {error}</p>
        <button type="button" className="button button--spotify" onClick={() => void startLogin()}>
          Réessayer
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <p className="auth__status">Connexion à Spotify…</p>
    </AuthShell>
  );
}
