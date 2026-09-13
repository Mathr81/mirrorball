import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitize } from '../src/settings/use-settings.js';

describe('sanitize — réglages persistés', () => {
  it('accepte un objet complet', () => {
    const stored = { lyricsSize: 'lg', ambient: false, accentFromArtwork: false, immersive: true, showDebug: true, showRemaining: true };
    expect(sanitize(stored)).toEqual(stored);
  });

  it('complète les champs absents avec les valeurs par défaut', () => {
    expect(sanitize({ immersive: true })).toEqual({ ...DEFAULT_SETTINGS, immersive: true });
  });

  it('rejette les valeurs de mauvais type plutôt que de les propager dans le DOM', () => {
    expect(sanitize({ lyricsSize: 'gigantesque', ambient: 'oui' })).toEqual(DEFAULT_SETTINGS);
  });

  it('résiste à tout ce qui n\'est pas un objet', () => {
    for (const value of [null, undefined, 42, 'texte', []]) {
      expect(sanitize(value)).toEqual(DEFAULT_SETTINGS);
    }
  });
});
