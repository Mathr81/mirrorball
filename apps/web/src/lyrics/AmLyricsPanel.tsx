// Import à effet de bord obligatoire : `/react` exporte le wrapper mais n'enregistre
// jamais le custom element lui-même (`customElements.define`), seul `/am-lyrics.js`
// le fait. Sans cet import, <am-lyrics> reste un élément inerte sans aucune
// réactivité Lit — ttml/currentTime deviennent de simples propriétés JS ignorées.
import '@uimaxbai/am-lyrics/am-lyrics.js';
import { AmLyrics } from '@uimaxbai/am-lyrics/react';
import { useRef } from 'react';
import type { CurrentlyPlaying } from '../playback/spotify-api.js';
import type { LyricsResponse } from './lyrics-client.js';
import { extractStaticLines } from './static-lyrics.js';
import { useAmLyricsHandoff } from './use-am-lyrics-handoff.js';
import type { LyricsState } from './use-lyrics.js';

interface Props {
  track: CurrentlyPlaying | undefined;
  currentTimeMs: number;
  lyrics: LyricsState;
  onSeek: (positionMs: number) => void;
}

interface LastReady {
  trackId: string;
  data: LyricsResponse;
}

/**
 * Contraintes strictes (cf. tâche) : jamais song-title/song-artist/query/
 * music-id/isrc sur <AmLyrics> — ça déclencherait son fetch réseau interne,
 * qu'on veut entièrement court-circuiter. Seuls `ttml` et `currentTime` le
 * pilotent ; `key={trackId}` force un remount propre à chaque changement de
 * morceau plutôt que de gérer l'incertitude d'un reset partiel via duration.
 * Le décalage `ttml` → `currentTime` (voir use-am-lyrics-handoff.ts)
 * contourne un bug du composant sinon systématique au premier montage.
 *
 * `duration = -1` n'est utilisé que dans le seul cas documenté où il a du
 * sens : la lecture Spotify s'arrête complètement (plus de morceau actif).
 * On garde alors les dernières paroles affichées à l'écran (pas d'écran
 * vide) mais on demande au composant d'arrêter son moteur interne. Une
 * pause (is_playing:false) ne passe JAMAIS par ce chemin : `currentTimeMs`
 * se contente de ne plus avancer (horloge gelée côté virtual-clock.ts).
 */
export function AmLyricsPanel({ track, currentTimeMs, lyrics, onSeek }: Props) {
  const lastReadyRef = useRef<LastReady | null>(null);
  if (track && lyrics.status === 'ready' && lyrics.data && lyrics.data.sync !== 'static') {
    lastReadyRef.current = { trackId: track.trackId, data: lyrics.data };
  }

  // Appelé inconditionnellement (règle des hooks) : la piste concernée est
  // soit celle en cours, soit la dernière connue si la lecture s'est arrêtée.
  const activeTrackId = track?.trackId ?? lastReadyRef.current?.trackId;
  const { ttmlPhaseReady, feedClock } = useAmLyricsHandoff(activeTrackId);

  if (!track) {
    const last = lastReadyRef.current;
    if (!last) {
      return (
        <div className="lyrics-panel lyrics-panel--status">
          <p>Aucune lecture en cours.</p>
        </div>
      );
    }
    return (
      <div className="lyrics-panel lyrics-panel--stopped">
        <AmLyrics key={last.trackId} ttml={ttmlPhaseReady ? last.data.ttml : ''} currentTime={0} duration={-1} />
        <p className="lyrics-overlay">Lecture arrêtée</p>
      </div>
    );
  }

  if (lyrics.status === 'idle' || lyrics.status === 'loading') {
    return (
      <div className="lyrics-panel lyrics-panel--status">
        <p>Chargement des paroles…</p>
      </div>
    );
  }

  if (lyrics.status === 'not_found') {
    return (
      <div className="lyrics-panel lyrics-panel--status">
        <p>Aucune parole trouvée pour ce morceau.</p>
      </div>
    );
  }

  if (lyrics.status === 'error' || !lyrics.data) {
    return (
      <div className="lyrics-panel lyrics-panel--status">
        <p>Paroles indisponibles pour le moment.</p>
      </div>
    );
  }

  if (lyrics.data.sync === 'static') {
    return (
      <div className="lyrics-panel lyrics-panel--static">
        {extractStaticLines(lyrics.data.ttml).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="lyrics-panel">
      <AmLyrics
        key={track.trackId}
        ttml={ttmlPhaseReady ? lyrics.data.ttml : ''}
        duration={track.durationMs}
        {...(feedClock ? { currentTime: currentTimeMs } : {})}
        onLineClick={(e: Event) => onSeek((e as CustomEvent<{ timestamp: number }>).detail.timestamp)}
      />
    </div>
  );
}
