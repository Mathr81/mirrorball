import type { Palette } from '../color/palette.js';
import { useKawarp } from './use-kawarp.js';

interface Props {
  imageUrl: string | undefined;
  palette: Palette;
  isPlaying: boolean;
  /** Faux : fond strictement sombre, aucune animation (réglage « sobre »). */
  enabled: boolean;
}

/**
 * Fond « pochette liquide » : la pochette elle-même, floutée et déformée en
 * continu par un shader (domain warping + flou de Kawase), comme le fond
 * animé d'Apple Music. Le rendu est délégué à @kawarp/core — la même
 * bibliothèque que spicy-lyrics, aux mêmes réglages.
 *
 * Si WebGL manque ou si la pochette n'est pas lisible en cross-origin, le
 * repli est un dégradé statique tiré de la palette extraite : jamais d'écran
 * noir, jamais d'erreur remontée à l'utilisateur.
 */
export function AmbientBackdrop({ imageUrl, palette, isPlaying, enabled }: Props) {
  const { canvasRef, ready } = useKawarp(imageUrl, palette, enabled, isPlaying);

  return (
    <div className="backdrop" aria-hidden="true">
      {enabled && <canvas ref={canvasRef} className={`backdrop__canvas${ready ? ' is-ready' : ''}`} />}
      {enabled && !ready && (
        <div
          className="backdrop__fallback"
          style={{ background: `linear-gradient(135deg, ${palette.blobs[0]}, ${palette.blobs[1]} 55%, ${palette.blobs[2]})` }}
        />
      )}
      <div className="backdrop__shade" />
    </div>
  );
}
