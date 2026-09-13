// Import à effet de bord obligatoire : `/react` exporte le wrapper mais n'enregistre
// jamais le custom element lui-même (`customElements.define`), seul `/am-lyrics.js`
// le fait. Sans cet import, <am-lyrics> reste un élément inerte sans aucune
// réactivité Lit — ttml/currentTime deviennent de simples propriétés JS ignorées.
import '@uimaxbai/am-lyrics/am-lyrics.js';
import { AmLyrics } from '@uimaxbai/am-lyrics/react';
import { useCallback, useEffect, useRef } from 'react';
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

/**
 * Le composant peint, sous la dernière ligne, un pied de page « Source … /
 * am-lyrics … Star me on GitHub » qu'aucune propriété publique ne désactive
 * (l'attribut `hide-source-footer` a disparu en 1.6.x) et qu'aucune règle
 * externe n'atteint, puisqu'il vit dans le shadow DOM. On injecte donc une
 * feuille de style dans ce shadow root — ouvert — plutôt que de laisser du
 * texte promotionnel au milieu des paroles. `opacity` et non `display: none` :
 * ce pied de page sert aussi de zone de défilement à la dernière ligne, le
 * supprimer de la mise en page casserait le scroll de fin de morceau.
 */
const SHADOW_PATCH = `
  .lyrics-footer { opacity: 0 !important; pointer-events: none; }

  /* Le retrait horizontal est figé en dur par les presets internes du composant
     (14px sous 520px, 32px au-delà de 900px) : ces règles-là visent un élément
     du shadow DOM, aucune variable posée de l'extérieur ne les atteint. D'où
     cette règle, qui rend le retrait pilotable via --mb-lyrics-inline-padding.
     Le !important est nécessaire : Lit passe par adoptedStyleSheets, qui
     s'appliquent APRÈS les balises style du shadow root — à spécificité égale,
     sans lui, ce sont les presets du composant qui gagneraient. */
  .lyrics-container { --am-lyrics-inline-padding: var(--mb-lyrics-inline-padding, 32px) !important; }
`;

function patchShadowRoot(el: AmLyricsElement): void {
  const root = el.shadowRoot;
  if (!root || root.querySelector('style[data-mirrorball]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-mirrorball', '');
  style.textContent = SHADOW_PATCH;
  root.append(style);
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

  const attachRef = useCallback((node: unknown) => {
    const el = node as AmLyricsElement | null;
    elRef.current = el;
    if (el) patchShadowRoot(el);
  }, []);

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
        <EmptyState
          title="Rien en lecture"
          hint="Lance un morceau sur Spotify : les paroles apparaîtront ici, calées à la milliseconde."
        />
      );
    }
    return (
      <div className="lyrics lyrics--stopped">
        <AmLyrics ref={attachRef} key={last.trackId} />
        <p className="lyrics__badge">Lecture arrêtée</p>
      </div>
    );
  }

  if (lyrics.status === 'idle' || lyrics.status === 'loading') {
    return <LyricsSkeleton />;
  }

  if (lyrics.status === 'not_found') {
    return (
      <EmptyState
        title="Aucune parole trouvée"
        hint="Les trois fournisseurs ont été interrogés sans résultat pour ce morceau."
        onRetry={lyrics.reload}
      />
    );
  }

  if (lyrics.status === 'error' || !lyrics.data) {
    return (
      <EmptyState
        title="Paroles indisponibles"
        hint="Le service de paroles n'a pas répondu."
        onRetry={lyrics.reload}
      />
    );
  }

  if (lyrics.data.sync === 'static') {
    return (
      <div className="lyrics lyrics--static">
        <div className="lyrics__static-inner">
          <p className="lyrics__static-note">Paroles non synchronisées</p>
          {extractStaticLines(lyrics.data.ttml).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="lyrics">
      <AmLyrics
        ref={attachRef}
        key={track.trackId}
        onLineClick={(e: Event) => onSeek((e as CustomEvent<{ timestamp: number }>).detail.timestamp)}
      />
    </div>
  );
}

/** Largeurs volontairement irrégulières : une pile de barres identiques ne ressemble pas à des paroles. */
const SKELETON_WIDTHS = ['62%', '78%', '48%', '70%', '84%', '56%', '66%'];

function LyricsSkeleton() {
  return (
    <div className="lyrics lyrics--skeleton" aria-label="Chargement des paroles" aria-busy="true">
      {SKELETON_WIDTHS.map((width, index) => (
        <span key={index} className="lyrics__skeleton-line" style={{ width, animationDelay: `${index * 90}ms` }} />
      ))}
    </div>
  );
}

function EmptyState({ title, hint, onRetry }: { title: string; hint: string; onRetry?: () => void }) {
  return (
    <div className="lyrics lyrics--empty">
      <p className="lyrics__empty-title">{title}</p>
      <p className="lyrics__empty-hint">{hint}</p>
      {onRetry && (
        <button type="button" className="button button--ghost" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}
