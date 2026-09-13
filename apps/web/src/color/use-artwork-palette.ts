import { useEffect, useState } from 'react';
import { DEFAULT_PALETTE, extractPalette, type Palette } from './palette.js';

/** Miniature suffisante pour des couleurs dominantes stables, assez petite pour un coût négligeable. */
const SAMPLE_SIZE = 48;

const cache = new Map<string, Palette>();

async function loadPalette(url: string): Promise<Palette> {
  const image = new Image();
  // Sans CORS, `getImageData` lèverait sur un canvas contaminé : on charge une
  // seconde fois l'image en mode anonyme, uniquement pour l'analyse (l'affichage
  // garde son <img> normal, qui lui n'a besoin d'aucun en-tête particulier).
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return DEFAULT_PALETTE;

  ctx.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return extractPalette(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
}

/**
 * Palette dérivée de la pochette du morceau en cours. Toute défaillance
 * (CDN sans en-tête CORS, image illisible, canvas indisponible) retombe
 * silencieusement sur la palette neutre : l'ambiance est un agrément, jamais
 * un préalable à l'affichage des paroles.
 */
export function useArtworkPalette(imageUrl: string | undefined): Palette {
  const [palette, setPalette] = useState<Palette>(() => (imageUrl ? cache.get(imageUrl) ?? DEFAULT_PALETTE : DEFAULT_PALETTE));

  useEffect(() => {
    if (!imageUrl) {
      setPalette(DEFAULT_PALETTE);
      return;
    }

    const cached = cache.get(imageUrl);
    if (cached) {
      setPalette(cached);
      return;
    }

    let cancelled = false;
    void loadPalette(imageUrl)
      .then((result) => {
        cache.set(imageUrl, result);
        if (!cancelled) setPalette(result);
      })
      .catch(() => {
        if (!cancelled) setPalette(DEFAULT_PALETTE);
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return palette;
}
