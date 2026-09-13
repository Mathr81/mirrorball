import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE, extractPalette, rgbToHsl } from '../src/color/palette.js';

/** Construit un buffer RGBA à partir de couleurs répétées, comme le ferait `getImageData`. */
function pixels(colors: Array<[number, number, number, number?]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(colors.length * 4);
  colors.forEach(([r, g, b, a], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a ?? 255;
  });
  return data;
}

function repeat(color: [number, number, number], count: number): Array<[number, number, number]> {
  return Array.from({ length: count }, () => color);
}

/** `hsl(H S% L%)` -> composantes numériques, pour asserter sur la teinte sans dépendre du formatage. */
function parseHsl(value: string): { h: number; s: number; l: number } {
  const match = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(value);
  if (!match) throw new Error(`format inattendu : ${value}`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

describe('rgbToHsl', () => {
  it('convertit les primaires', () => {
    expect(rgbToHsl(255, 0, 0).h).toBe(0);
    expect(Math.round(rgbToHsl(0, 255, 0).h)).toBe(120);
    expect(Math.round(rgbToHsl(0, 0, 255).h)).toBe(240);
  });

  it('donne une saturation nulle sur un gris', () => {
    expect(rgbToHsl(128, 128, 128).s).toBe(0);
  });
});

describe('extractPalette', () => {
  it('retombe sur la palette neutre si aucun pixel n\'est exploitable', () => {
    expect(extractPalette(pixels([]))).toBe(DEFAULT_PALETTE);
    // Noir et blanc purs uniquement : aucune ambiance à en tirer.
    expect(extractPalette(pixels([...repeat([0, 0, 0], 20), ...repeat([255, 255, 255], 20)]))).toBe(DEFAULT_PALETTE);
  });

  it('ignore les pixels transparents', () => {
    const data = pixels([[255, 0, 0, 0], [255, 0, 0, 0]]);
    expect(extractPalette(data)).toBe(DEFAULT_PALETTE);
  });

  it('reprend la teinte dominante pour l\'accent', () => {
    const palette = extractPalette(pixels(repeat([220, 40, 60], 40)));
    expect(palette.isDefault).toBe(false);
    const accent = parseHsl(palette.accent);
    expect(Math.abs(accent.h - 352)).toBeLessThan(15);
  });

  it('rend un accent lisible sur fond sombre, même à partir d\'une couleur très sombre ou terne', () => {
    for (const color of [[20, 30, 90], [90, 88, 84]] as Array<[number, number, number]>) {
      const accent = parseHsl(extractPalette(pixels(repeat(color, 40))).accent);
      expect(accent.l).toBeGreaterThanOrEqual(60);
      expect(accent.l).toBeLessThanOrEqual(74);
      expect(accent.s).toBeGreaterThanOrEqual(50);
    }
  });

  it('garde les halos de fond assez sombres pour laisser les paroles lisibles', () => {
    const palette = extractPalette(pixels([...repeat([250, 240, 60], 30), ...repeat([40, 200, 220], 30), ...repeat([230, 60, 150], 30)]));
    expect(palette.blobs).toHaveLength(3);
    for (const blob of palette.blobs) {
      expect(parseHsl(blob).l).toBeLessThanOrEqual(40);
    }
  });

  it('préfère trois teintes distinctes quand la pochette en offre', () => {
    const palette = extractPalette(pixels([...repeat([200, 40, 40], 30), ...repeat([40, 200, 60], 30), ...repeat([50, 60, 210], 30)]));
    const hues = palette.blobs.map((blob) => parseHsl(blob).h);
    const unique = new Set(hues.map((h) => Math.round(h / 30)));
    expect(unique.size).toBe(3);
  });

  it('reste stable sur une pochette monochrome (trois halos malgré tout)', () => {
    const palette = extractPalette(pixels(repeat([60, 90, 160], 40)));
    expect(palette.blobs.filter(Boolean)).toHaveLength(3);
  });
});
