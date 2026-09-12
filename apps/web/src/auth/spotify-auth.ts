import { generateCodeChallenge, generateCodeVerifier, generateState } from './pkce.js';
import { clearPendingPkce, clearStoredTokens, getPendingPkce, getStoredTokens, setPendingPkce, setStoredTokens, type StoredTokens } from './token-store.js';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SCOPES = ['user-read-currently-playing', 'user-read-playback-state', 'user-modify-playback-state'];

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string;

/** Marge avant expiration réelle, pour rafraîchir un peu en avance plutôt que de rater un poll. */
const REFRESH_MARGIN_MS = 60_000;

export class SpotifyAuthError extends Error {}

/** Authorization Code + PKCE, entièrement côté navigateur — pas de client secret (cf. contrainte du projet). */
export async function startLogin(): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();
  setPendingPkce({ codeVerifier, state });

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', SCOPES.join(' '));

  window.location.assign(url.toString());
}

/**
 * À appeler sur la page de retour (`/callback`). Lit `code`/`state` dans
 * l'URL, vérifie le `state` contre celui stocké au démarrage du flux (survit
 * à un rechargement complet — cf. token-store.ts), échange le code, stocke
 * les tokens. Renvoie normalement ; lève `SpotifyAuthError` sur refus ou
 * incohérence, à afficher comme un état d'UI dédié plutôt qu'un écran vide.
 */
export async function handleCallback(locationSearch: string): Promise<void> {
  const params = new URLSearchParams(locationSearch);
  const error = params.get('error');
  if (error) throw new SpotifyAuthError(`Spotify a refusé la connexion : ${error}`);

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) throw new SpotifyAuthError('Réponse de callback incomplète.');

  const pending = getPendingPkce();
  if (!pending || pending.state !== state) {
    throw new SpotifyAuthError("État PKCE introuvable ou invalide — relance la connexion.");
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: pending.codeVerifier,
    }),
  });

  clearPendingPkce();

  if (!res.ok) throw new SpotifyAuthError(`Échange du code impossible (${res.status}).`);

  const body = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  setStoredTokens({
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  });
}

async function refreshAccessToken(refreshToken: string): Promise<StoredTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID }),
  });

  if (!res.ok) throw new SpotifyAuthError(`Rafraîchissement du token impossible (${res.status}).`);

  const body = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const tokens: StoredTokens = {
    accessToken: body.access_token,
    // Spotify ne renvoie pas toujours un nouveau refresh_token : on garde l'ancien sinon.
    refreshToken: body.refresh_token ?? refreshToken,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  setStoredTokens(tokens);
  return tokens;
}

/** `undefined` = pas connecté. Rafraîchit automatiquement si le token est proche de l'expiration. */
export async function getValidAccessToken(): Promise<string | undefined> {
  const tokens = getStoredTokens();
  if (!tokens) return undefined;

  if (Date.now() < tokens.expiresAt - REFRESH_MARGIN_MS) return tokens.accessToken;

  try {
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    return refreshed.accessToken;
  } catch {
    clearStoredTokens();
    return undefined;
  }
}

export function isLoggedIn(): boolean {
  return getStoredTokens() !== null;
}

export function logout(): void {
  clearStoredTokens();
  clearPendingPkce();
}
