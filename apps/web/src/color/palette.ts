/**
 * Extraction de palette depuis la pochette, sans dépendance : l'ambiance de
 * l'écran (halos du fond, couleur d'accent) est dérivée des couleurs
 * dominantes du morceau en cours. Tout est pur et testable ici ; le chargement
 * de l'image vit dans `use-artwork-palette.ts`.
 */

export interface Palette {
  /** Couleur d'accent lisible sur fond sombre (boutons, progression, surbrillance). */
  accent: string;
  /** Trois halos du fond ambiant, du plus dominant au moins dominant. */
  blobs: [string, string, string];
  /** Vrai tant qu'aucune pochette n'a pu être analysée (palette neutre « mirrorball »). */
  isDefault: boolean;
}

export const DEFAULT_PALETTE: Palette = {
  accent: 'hsl(268 85% 72%)',
  blobs: ['hsl(268 55% 32%)', 'hsl(198 58% 30%)', 'hsl(324 45% 28%)'],
  isDefault: true,
};

interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l };

  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;

  return { h, s, l };
}

function css({ h, s, l }: Hsl): string {
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Distance circulaire entre deux teintes, en degrés (0–180). */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

interface Bin {
  count: number;
  r: number;
  g: number;
  b: number;
}

/** 12 secteurs de teinte × 3 niveaux de saturation × 3 de luminosité : assez fin pour séparer les couleurs d'une pochette, assez grossier pour rester stable d'une image à l'autre. */
const HUE_BINS = 12;

function binKey({ h, s, l }: Hsl): number {
  const hueBin = s < 0.12 ? HUE_BINS : Math.floor((h / 360) * HUE_BINS) % HUE_BINS;
  const satBin = s < 0.12 ? 0 : s < 0.45 ? 1 : 2;
  const lightBin = l < 0.28 ? 0 : l < 0.62 ? 1 : 2;
  return (hueBin * 3 + satBin) * 3 + lightBin;
}

interface Candidate extends Hsl {
  count: number;
}

function collect(pixels: Uint8ClampedArray): Candidate[] {
  const bins = new Map<number, Bin>();

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const a = pixels[i + 3] ?? 0;
    if (a < 128) continue;
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const hsl = rgbToHsl(r, g, b);
    // Le noir et le blanc purs dominent beaucoup de pochettes sans rien dire de
    // leur ambiance : ils ne peuvent pas porter la palette.
    if (hsl.l < 0.07 || hsl.l > 0.95) continue;

    const key = binKey(hsl);
    const bin = bins.get(key);
    if (bin) {
      bin.count += 1;
      bin.r += r;
      bin.g += g;
      bin.b += b;
    } else {
      bins.set(key, { count: 1, r, g, b });
    }
  }

  return [...bins.values()]
    .map((bin) => ({ ...rgbToHsl(bin.r / bin.count, bin.g / bin.count, bin.b / bin.count), count: bin.count }))
    .sort((x, y) => score(y) - score(x));
}

/** Une couleur vive mais minoritaire vaut mieux qu'un gris omniprésent : la saturation pèse autant que la surface. */
function score(c: Candidate): number {
  return Math.sqrt(c.count) * (0.35 + c.s) * (0.6 + 0.4 * (1 - Math.abs(c.l - 0.5) * 2));
}

/** Sélectionne des couleurs perceptiblement différentes plutôt que trois variantes du même bleu. */
function pickDistinct(candidates: Candidate[], count: number, minHueGap: number): Candidate[] {
  const picked: Candidate[] = [];
  for (const candidate of candidates) {
    if (picked.length >= count) break;
    const tooClose = picked.some(
      (p) => hueDistance(p.h, candidate.h) < minHueGap && Math.abs(p.l - candidate.l) < 0.22,
    );
    if (!tooClose) picked.push(candidate);
  }
  // Pochette quasi monochrome : plutôt que d'abandonner sa couleur pour la
  // palette neutre, on dérive des variantes de teinte du dominant — trois halos
  // rigoureusement identiques ne se distingueraient pas les uns des autres.
  while (picked.length > 0 && picked.length < count) {
    const base = picked[0]!;
    picked.push({ ...base, h: (base.h + 26 * picked.length) % 360 });
  }
  return picked;
}

/** Halo de fond : assez sombre pour laisser les paroles lisibles par-dessus, assez coloré pour se voir. */
function toBlob(c: Candidate, index: number): string {
  return css({
    h: c.h,
    s: clamp(c.s * 1.1, c.s < 0.08 ? 0.05 : 0.32, 0.8),
    l: clamp(c.l, 0.22, 0.4) - index * 0.03,
  });
}

/** Accent : remonté en saturation et calé dans la plage où le contraste sur fond noir reste bon. */
function toAccent(c: Candidate): string {
  return css({ h: c.h, s: clamp(c.s * 1.25, 0.5, 0.92), l: clamp(c.l * 1.15, 0.6, 0.74) });
}

/**
 * `pixels` = données RGBA brutes d'une miniature de la pochette. Renvoie la
 * palette neutre si l'image n'apporte aucune couleur exploitable.
 */
export function extractPalette(pixels: Uint8ClampedArray): Palette {
  const candidates = collect(pixels);
  if (candidates.length === 0) return DEFAULT_PALETTE;

  const blobs = pickDistinct(candidates, 3, 25);
  const [b0, b1, b2] = blobs;
  if (!b0 || !b1 || !b2) return DEFAULT_PALETTE;

  // L'accent se choisit sur la vivacité seule : c'est lui qu'on pose sur les
  // boutons et la barre de progression, une couleur terne y serait invisible.
  const accentSource = [...candidates].sort((x, y) => y.s * Math.sqrt(y.count) - x.s * Math.sqrt(x.count))[0] ?? b0;

  return {
    accent: toAccent(accentSource),
    blobs: [toBlob(b0, 0), toBlob(b1, 1), toBlob(b2, 2)],
    isDefault: false,
  };
}
