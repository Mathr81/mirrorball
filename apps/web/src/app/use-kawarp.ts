import { Kawarp } from '@kawarp/core';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Palette } from '../color/palette.js';

/**
 * Réglages repris de spicy-lyrics (`src/components/DynamicBG/dynamicBackground.ts`),
 * qui utilise la même bibliothèque : ce sont eux qui donnent le rendu « artwork
 * liquide » d'Apple Music plutôt qu'un simple flou.
 */
const OPTIONS = {
  warpIntensity: 1,
  blurPasses: 8,
  animationSpeed: 0.1,
  saturation: 1.5,
  dithering: 0.008,
  transitionDuration: 500,
  tintIntensity: 0,
  scale: 1,
} as const;

/** Le fondu entre deux pochettes peut être lent une fois la première affichée ; au tout premier rendu il doit être court pour ne pas partir du noir. */
const SETTLED_TRANSITION_MS = 1000;

const SPEED_PLAYING = 1;
/** À l'arrêt le fond continue de respirer, mais nettement plus lentement. */
const SPEED_PAUSED = 0.12;

/**
 * Le rendu est intégralement flouté : inutile de peindre à la résolution de
 * l'écran. On plafonne la surface, ce qui divise le coût GPU sur iPad sans
 * aucune différence visible.
 */
const MAX_CANVAS_EDGE = 720;
const CANVAS_SCALE = 0.5;

function backingSize(rect: DOMRectReadOnly): { width: number; height: number } {
  const scale = Math.min(CANVAS_SCALE, MAX_CANVAS_EDGE / Math.max(rect.width, rect.height, 1));
  return {
    width: Math.max(1, Math.round(rect.width * scale)),
    height: Math.max(1, Math.round(rect.height * scale)),
  };
}

export interface KawarpState {
  canvasRef: RefObject<HTMLCanvasElement>;
  /** Faux tant qu'aucune image n'a pu être rendue — l'appelant affiche alors son repli CSS. */
  ready: boolean;
}

/**
 * Pilote une instance Kawarp sur un canvas : chargement de la pochette,
 * vitesse d'animation selon la lecture, redimensionnement, mise en veille
 * quand l'onglet passe en arrière-plan.
 *
 * Tout échec (WebGL indisponible, pochette servie sans en-tête CORS) laisse
 * `ready` à faux : l'ambiance est un agrément, jamais un préalable à
 * l'affichage des paroles.
 */
export function useKawarp(imageUrl: string | undefined, palette: Palette, enabled: boolean, isPlaying: boolean): KawarpState {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<Kawarp | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas) return;

    let instance: Kawarp;
    try {
      instance = new Kawarp(canvas, { ...OPTIONS });
    } catch {
      setReady(false);
      return;
    }
    instanceRef.current = instance;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = backingSize(entry.contentRect);
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      instance.resize();
    });
    observer.observe(canvas);

    // Onglet caché : le rAF de rendu est suspendu par le navigateur, mais on
    // coupe explicitement pour ne pas reprendre au retour avec un delta de
    // plusieurs minutes d'un coup.
    const onVisibility = () => {
      if (document.hidden) instance.stop();
      else instance.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
      instanceRef.current = null;
      setReady(false);
      instance.dispose();
    };
  }, [enabled]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;

    let cancelled = false;
    const load = async () => {
      if (imageUrl) await instance.loadImage(imageUrl);
      // Sans pochette (rien en lecture), la palette neutre sert de source :
      // l'écran garde une ambiance vivante au lieu de virer au noir plat.
      else instance.loadGradient([...palette.blobs, palette.accent], 135);
      if (cancelled) return;
      instance.start();
      setReady(true);
      window.setTimeout(() => instanceRef.current?.setOptions({ transitionDuration: SETTLED_TRANSITION_MS }), OPTIONS.transitionDuration * 2);
    };

    void load().catch(() => {
      if (!cancelled) setReady(false);
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl, palette, enabled]);

  useEffect(() => {
    instanceRef.current?.setOptions({ animationSpeed: isPlaying ? SPEED_PLAYING : SPEED_PAUSED });
  }, [isPlaying, ready]);

  return { canvasRef, ready };
}
