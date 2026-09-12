import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getValidAccessToken, handleCallback, isLoggedIn, logout, SpotifyAuthError, startLogin } from '../src/auth/spotify-auth.js';
import { getPendingPkce, getStoredTokens, setPendingPkce, setStoredTokens } from '../src/auth/token-store.js';

describe('Spotify PKCE auth', () => {
  const originalLocation = window.location;
  let assignMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    // jsdom expose `location.assign` en non-configurable : on remplace tout l'objet pour le test.
    assignMock = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, assign: assignMock } });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('startLogin', () => {
    it("construit l'URL d'autorisation avec PKCE S256 et stocke le verifier/state", async () => {
      await startLogin();

      expect(assignMock).toHaveBeenCalledTimes(1);
      const url = new URL(assignMock.mock.calls[0]![0] as string);
      expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/callback');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('scope')).toContain('user-read-currently-playing');

      const pending = getPendingPkce();
      expect(pending?.state).toBe(url.searchParams.get('state'));
      expect(pending?.codeVerifier).toBeTruthy();
    });
  });

  describe('handleCallback', () => {
    it('échange le code contre des tokens quand le state correspond', async () => {
      setPendingPkce({ codeVerifier: 'verifier-1', state: 'state-1' });
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }), { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      await handleCallback('?code=abc&state=state-1');

      const [url, options] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://accounts.spotify.com/api/token');
      const body = (options as RequestInit).body as URLSearchParams;
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('abc');
      expect(body.get('code_verifier')).toBe('verifier-1');
      expect(body.has('client_secret')).toBe(false);

      expect(getStoredTokens()).toMatchObject({ accessToken: 'at', refreshToken: 'rt' });
      expect(getPendingPkce()).toBeNull(); // nettoyé après usage
    });

    it('lève une erreur explicite quand Spotify renvoie ?error=', async () => {
      await expect(handleCallback('?error=access_denied')).rejects.toBeInstanceOf(SpotifyAuthError);
    });

    it('lève une erreur sur state manquant en storage ou différent (protection CSRF)', async () => {
      setPendingPkce({ codeVerifier: 'v', state: 'expected' });
      await expect(handleCallback('?code=abc&state=wrong')).rejects.toBeInstanceOf(SpotifyAuthError);
    });

    it('lève une erreur si code ou state absent de l\'URL', async () => {
      await expect(handleCallback('')).rejects.toBeInstanceOf(SpotifyAuthError);
    });

    it("lève une erreur si l'échange de code échoue côté Spotify", async () => {
      setPendingPkce({ codeVerifier: 'v', state: 's' });
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('bad request', { status: 400 })));
      await expect(handleCallback('?code=abc&state=s')).rejects.toBeInstanceOf(SpotifyAuthError);
    });
  });

  describe('getValidAccessToken', () => {
    it('renvoie undefined si non connecté', async () => {
      expect(await getValidAccessToken()).toBeUndefined();
    });

    it('renvoie le token stocké sans réseau tant qu\'il est loin de l\'expiration', async () => {
      setStoredTokens({ accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3600_000 });
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', fetchMock);

      expect(await getValidAccessToken()).toBe('at');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rafraîchit automatiquement un token proche de l\'expiration', async () => {
      setStoredTokens({ accessToken: 'old', refreshToken: 'rt', expiresAt: Date.now() + 1000 });
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ access_token: 'new', expires_in: 3600 }), { status: 200 })),
      );

      const token = await getValidAccessToken();
      expect(token).toBe('new');
      expect(getStoredTokens()).toMatchObject({ accessToken: 'new', refreshToken: 'rt' }); // refresh_token conservé si absent de la réponse
    });

    it('efface le stockage et renvoie undefined si le rafraîchissement échoue', async () => {
      setStoredTokens({ accessToken: 'old', refreshToken: 'rt', expiresAt: Date.now() - 1000 });
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('invalid_grant', { status: 400 })));

      expect(await getValidAccessToken()).toBeUndefined();
      expect(getStoredTokens()).toBeNull();
    });
  });

  describe('isLoggedIn / logout', () => {
    it('reflète la présence de tokens stockés', () => {
      expect(isLoggedIn()).toBe(false);
      setStoredTokens({ accessToken: 'a', refreshToken: 'b', expiresAt: Date.now() + 1000 });
      expect(isLoggedIn()).toBe(true);
      logout();
      expect(isLoggedIn()).toBe(false);
    });
  });
});
