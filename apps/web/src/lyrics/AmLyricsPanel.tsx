// Import à effet de bord obligatoire : `/react` exporte le wrapper mais n'enregistre
// jamais le custom element lui-même (`customElements.define`), seul `/am-lyrics.js`
// le fait. Sans cet import, <am-lyrics> reste un élément inerte sans aucune
// réactivité Lit — ttml/currentTime deviennent de simples propriétés JS ignorées.
import '@uimaxbai/am-lyrics/am-lyrics.js';
import { AmLyrics } from '@uimaxbai/am-lyrics/react';
import { useEffect, useRef } from 'react';
import type { CurrentlyPlaying } from '../playback/spotify-api.js';
import type { LyricsResponse } from './lyrics-client.js';
import { extractStaticLines } from './static-lyrics.js';
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

/** Sous-ensemble de l'API réelle du custom element dont on a besoin — évite une dépendance sur son type interne non exporté publiquement. */
interface AmLyricsElement extends HTMLElement {
  ttml: string;
  currentTime: number;
  duration: number;
  fetchLyrics: () => unknown;
}

/**
 * Contraintes strictes (cf. tâche) : jamais song-title/song-artist/query/
 * music-id/isrc sur <AmLyrics> — ça déclencherait son fetch réseau interne,
 * qu'on veut entièrement court-circuiter. Seuls `ttml` et `currentTime` le
 * pilotent ; `key={trackId}` force un remount propre à chaque changement de
 * morceau.
 *
 * ⚠️ `ttml`/`duration`/`currentTime` ne sont PAS passés en props JSX : ils
 * sont posés impérativement via `ref`, avec un appel explicite à
 * `fetchLyrics()`. Constaté empiriquement : le composant appelle son propre
 * `fetchLyrics()` automatiquement dans deux cas — `connectedCallback`
 * (systématiquement, avec un `ttml` encore vide à ce stade) et son
 * `updated()`, mais celui-ci est gardé par `!changedProperties.has('currentTime')`.
 * Or React (via @lit/react) et le cycle réactif interne de Lit sont deux
 * ordonnanceurs à base de microtasks indépendants : selon la charge du
 * document (ça a suffi à faire basculer le comportement entre un petit TTML
 * de test et un vrai morceau plus long), `ttml` et `currentTime` peuvent
 * atterrir dans le même cycle de mise à jour Lit ou non, de façon non
 * déterministe — un TTML valide pouvait donc ne jamais être pris en compte,
 * silencieusement (« No lyrics found »). Piloter `fetchLyrics()` nous-mêmes,
 * une fois `ttml` posé, supprime cette course au lieu de compter sur un
 * minutage favorable.
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

  const elRef = useRef<AmLyricsElement | null>(null);
  const appliedTtmlRef = useRef<string | undefined>(undefined);

  const stopped = !track;
  const last = lastReadyRef.current;
  const activeTtml =
    stopped
      ? last?.data.ttml
      : lyrics.status === 'ready' && lyrics.data && lyrics.data.sync !== 'static'
        ? lyrics.data.ttml
        : undefined;
  const activeDuration = stopped ? -1 : (track?.durationMs ?? -1);

  // Pose ttml puis déclenche fetchLyrics() nous-mêmes — voir le commentaire
  // de tête. Ne s'exécute que quand le TTML change réellement : passer de
  // lecture à arrêté sur le même morceau garde le même ttml (voir
  // l'effet duration séparé ci-dessous), pas la peine de reparser.
  useEffect(() => {
    const el = elRef.current;
    if (!el || activeTtml === undefined || appliedTtmlRef.current === activeTtml) return;
    appliedTtmlRef.current = activeTtml;
    el.ttml = activeTtml;
    void el.fetchLyrics();
  }, [activeTtml]);

  // duration est indépendante du contenu ttml (elle passe à -1 quand la
  // lecture s'arrête complètement, alors que le ttml affiché ne change pas)
  // — effet à part pour ne jamais déclencher un refetch dans ce cas.
  useEffect(() => {
    const el = elRef.current;
    if (el) el.duration = activeDuration;
  }, [activeDuration]);

  // currentTime piloté séparément, à chaque frame : jamais dans le même
  // effet que ttml/duration, précisément pour ne jamais dépendre de si Lit
  // les regroupe ou non dans le même cycle de réactivité.
  useEffect(() => {
    const el = elRef.current;
    if (!el || appliedTtmlRef.current === undefined) return;
    el.currentTime = stopped ? 0 : currentTimeMs;
  }, [currentTimeMs, stopped]);

  // Changement de morceau : nouvelle instance, plus aucun TTML appliqué dessus.
  useEffect(() => {
    appliedTtmlRef.current = undefined;
  }, [track?.trackId]);

  if (!track) {
    if (!last) {
      return (
        <div className="lyrics-panel lyrics-panel--status">
          <p>Aucune lecture en cours.</p>
        </div>
      );
    }
    return (
      <div className="lyrics-panel lyrics-panel--stopped">
        <AmLyrics ref={(node) => { elRef.current = node as unknown as AmLyricsElement | null; }} key={last.trackId} />
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
        ref={(node) => { elRef.current = node as unknown as AmLyricsElement | null; }}
        key={track.trackId}
        onLineClick={(e: Event) => onSeek((e as CustomEvent<{ timestamp: number }>).detail.timestamp)}
      />
    </div>
  );
}
