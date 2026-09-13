/**
 * Banc d'essai visuel — ouvre `preview.html?scene=…` pour inspecter chaque
 * état de l'interface sans compte Spotify ni backend. Hors du bundle de
 * production (Vite ne construit que `index.html`).
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { AmbientBackdrop } from '../src/app/AmbientBackdrop.js';
import { AuthShell, LoginScreen } from '../src/app/AuthScreen.js';
import { SettingsPanel } from '../src/app/SettingsPanel.js';
import { ShortcutsOverlay } from '../src/app/ShortcutsOverlay.js';
import { useArtworkPalette } from '../src/color/use-artwork-palette.js';
import { DebugPanel } from '../src/debug/DebugPanel.js';
import { AmLyricsPanel } from '../src/lyrics/AmLyricsPanel.js';
import type { LyricsState } from '../src/lyrics/use-lyrics.js';
import { NowPlaying } from '../src/playback/NowPlaying.js';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings/use-settings.js';
import { CollapseIcon, ExpandIcon, OfflineIcon, SettingsIcon } from '../src/ui/icons.js';
import { Toasts } from '../src/ui/Toasts.js';
import { STATIC_RESPONSE, SYLLABLE_RESPONSE, TRACK } from './fixtures.js';
import '../src/app/App.css';

const noop = () => undefined;

function lyricsState(partial: Partial<LyricsState>): LyricsState {
  return { status: 'ready', data: SYLLABLE_RESPONSE, attempts: SYLLABLE_RESPONSE.attempts, reload: noop, ...partial };
}

interface Scene {
  lyrics: LyricsState;
  settings: Partial<Settings>;
  track?: typeof TRACK | undefined;
  offline?: boolean;
  settingsOpen?: boolean;
  shortcutsOpen?: boolean;
  toast?: string;
  idle?: boolean;
}

const SCENES: Record<string, Scene> = {
  player: { lyrics: lyricsState({}), settings: {} },
  immersive: { lyrics: lyricsState({}), settings: { immersive: true } },
  idle: { lyrics: lyricsState({}), settings: {}, idle: true },
  loading: { lyrics: lyricsState({ status: 'loading', data: undefined, attempts: [] }), settings: {} },
  notfound: { lyrics: lyricsState({ status: 'not_found', data: undefined, attempts: [] }), settings: {} },
  static: { lyrics: lyricsState({ data: STATIC_RESPONSE }), settings: {} },
  stopped: { lyrics: lyricsState({}), settings: {}, track: undefined },
  settings: { lyrics: lyricsState({}), settings: {}, settingsOpen: true },
  shortcuts: { lyrics: lyricsState({}), settings: {}, shortcutsOpen: true },
  debug: { lyrics: lyricsState({}), settings: { showDebug: true }, offline: true, toast: 'Aucun appareil Spotify actif — lance la lecture depuis Spotify, puis réessaie.' },
  plain: { lyrics: lyricsState({}), settings: { ambient: false, accentFromArtwork: false } },
  large: { lyrics: lyricsState({}), settings: { lyricsSize: 'lg' } },
};

const LYRICS_SCALE: Record<string, number> = { sm: 0.82, md: 1, lg: 1.22 };

function PreviewPlayer({ scene }: { scene: Scene }) {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, ...scene.settings });
  const track = 'track' in scene ? scene.track : TRACK;
  const palette = useArtworkPalette(track?.albumImageUrl);

  // L'horloge avance vraiment : le surlignage mot à mot se voit en conditions réelles.
  const [timeMs, setTimeMs] = useState(62_000);
  useEffect(() => {
    const id = window.setInterval(() => setTimeMs((t) => t + 100), 100);
    return () => window.clearInterval(id);
  }, []);

  const style = {
    '--accent': settings.accentFromArtwork ? palette.accent : 'hsl(0 0% 96%)',
    '--lyrics-scale': LYRICS_SCALE[settings.lyricsSize] ?? 1,
  } as CSSProperties;

  const toggle = (key: keyof Settings) => setSettings((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div
      className={['player', settings.immersive ? 'player--immersive' : '', scene.idle ? 'player--idle' : ''].filter(Boolean).join(' ')}
      style={style}
    >
      <AmbientBackdrop palette={palette} enabled={settings.ambient} />
      <aside className="player__rail">
        <NowPlaying
          track={track}
          currentTimeMs={timeMs}
          isPlaying
          pending={undefined}
          lyrics={scene.lyrics}
          settings={settings}
          onToggleRemaining={() => toggle('showRemaining')}
          onSeek={noop}
          onCommand={noop}
        />
      </aside>
      <section className="player__stage">
        <AmLyricsPanel track={track} currentTimeMs={timeMs} lyrics={scene.lyrics} onSeek={noop} />
      </section>

      <div className="chrome">
        {scene.offline && (
          <span className="chrome__offline">
            <OfflineIcon />
            Hors ligne
          </span>
        )}
        <button type="button" className="icon-button icon-button--glass" aria-pressed={settings.immersive} onClick={() => toggle('immersive')}>
          {settings.immersive ? <CollapseIcon /> : <ExpandIcon />}
        </button>
        <button type="button" className="icon-button icon-button--glass">
          <SettingsIcon />
        </button>
      </div>

      {settings.immersive && track && (
        <div className="mini-now-playing">
          {track.albumImageUrl && <img src={track.albumImageUrl} alt="" />}
          <span className="mini-now-playing__text">
            <strong>{track.name}</strong>
            <span>{track.artists.join(', ')}</span>
          </span>
        </div>
      )}

      {scene.toast && <Toasts toasts={[{ id: 1, message: scene.toast, tone: 'warn' }]} dismiss={noop} />}

      <SettingsPanel
        open={scene.settingsOpen ?? false}
        onClose={noop}
        onShowShortcuts={noop}
        onLogout={noop}
        settings={settings}
        update={(patch) => setSettings((s) => ({ ...s, ...patch }))}
        toggle={(key) => toggle(key)}
      />
      <ShortcutsOverlay open={scene.shortcutsOpen ?? false} onClose={noop} />
      {settings.showDebug && <DebugPanel debug={{ driftMs: -18, rate: 0.994, rttMs: 142 }} track={track} lyrics={scene.lyrics} />}
    </div>
  );
}

function Preview() {
  const name = new URLSearchParams(window.location.search).get('scene') ?? 'player';
  if (name === 'login') return <LoginScreen onLogin={noop} />;
  if (name === 'connecting') {
    return (
      <AuthShell>
        <p className="auth__status">Connexion à Spotify…</p>
      </AuthShell>
    );
  }
  return <PreviewPlayer scene={SCENES[name] ?? SCENES.player!} />;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root introuvable');
createRoot(rootEl).render(<Preview />);
