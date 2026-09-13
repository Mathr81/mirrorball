import type { ReactNode } from 'react';
import { SpotifyIcon } from '../ui/icons.js';

/** Coque commune aux écrans hors lecteur (chargement, connexion, retour OAuth). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth__glow" aria-hidden="true" />
      <div className="auth__card">
        <div className="mirrorball" aria-hidden="true">
          <span className="mirrorball__sheen" />
        </div>
        <h1 className="auth__wordmark">mirrorball</h1>
        {children}
      </div>
    </main>
  );
}

export function LoadingScreen() {
  return (
    <AuthShell>
      <p className="auth__status">Chargement…</p>
    </AuthShell>
  );
}

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <AuthShell>
      <p className="auth__tagline">Les paroles, mot à mot, au rythme de Spotify.</p>
      <button type="button" className="button button--spotify" onClick={onLogin}>
        <SpotifyIcon />
        Se connecter avec Spotify
      </button>
    </AuthShell>
  );
}
