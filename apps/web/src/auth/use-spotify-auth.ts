import { useCallback, useEffect, useState } from 'react';
import { getValidAccessToken, logout as doLogout, startLogin } from './spotify-auth.js';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SpotifyAuth {
  status: AuthStatus;
  accessToken: string | undefined;
  login: () => void;
  logout: () => void;
  /** Force une relecture du token stocké (ex. juste après le callback). */
  refresh: () => Promise<void>;
}

export function useSpotifyAuth(): SpotifyAuth {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [accessToken, setAccessToken] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    const token = await getValidAccessToken();
    setAccessToken(token);
    setStatus(token ? 'authenticated' : 'unauthenticated');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    doLogout();
    setAccessToken(undefined);
    setStatus('unauthenticated');
  }, []);

  return { status, accessToken, login: () => void startLogin(), logout, refresh };
}
