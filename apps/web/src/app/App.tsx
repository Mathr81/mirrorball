import { CallbackPage } from '../auth/CallbackPage.js';
import { useSpotifyAuth } from '../auth/use-spotify-auth.js';
import { LoadingScreen, LoginScreen } from './AuthScreen.js';
import { Player } from './Player.js';
import './App.css';

export function App() {
  const isCallback = window.location.pathname === '/callback';
  const auth = useSpotifyAuth();

  if (isCallback) return <CallbackPage onDone={() => void auth.refresh()} />;
  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status === 'unauthenticated') return <LoginScreen onLogin={auth.login} />;

  return <Player auth={auth} />;
}
