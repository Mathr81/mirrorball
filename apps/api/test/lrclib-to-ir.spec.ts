import { describe, expect, it } from 'vitest';
import { emitTtml } from '../src/ir/ttml-emitter.js';
import { lrclibToIr } from '../src/providers/lrclib/to-ir.js';
import type { LrclibTrack } from '../src/providers/lrclib/types.js';

function track(overrides: Partial<LrclibTrack> = {}): LrclibTrack {
  return {
    id: 1,
    trackName: 'x',
    artistName: 'y',
    albumName: null,
    duration: 200,
    instrumental: false,
    plainLyrics: null,
    syncedLyrics: null,
    ...overrides,
  };
}

describe('lrclibToIr — syncedLyrics', () => {
  it('produit un LyricsDoc sync: line avec des lignes sans syllabus', () => {
    const doc = lrclibToIr(track({ syncedLyrics: '[00:00.00]a\n[00:05.00]b\n[00:10.00]c' }), 200);
    expect(doc?.sync).toBe('line');
    expect(doc?.lines).toHaveLength(3);
    for (const l of doc!.lines) expect(l.lead.syllables).toHaveLength(0);
    expect(doc?.provider).toBe('lrclib');
  });

  it("la fin d'une ligne est le début de la suivante", () => {
    const doc = lrclibToIr(track({ syncedLyrics: '[00:00.00]a\n[00:05.00]b' }), 200);
    expect(doc?.lines[0]).toMatchObject({ startMs: 0, endMs: 5000 });
  });

  it('utilise la durée du morceau pour la fin de la dernière ligne', () => {
    const doc = lrclibToIr(track({ syncedLyrics: '[00:00.00]a\n[03:00.00]b' }), 200);
    expect(doc?.lines[1]).toMatchObject({ startMs: 180000, endMs: 200000 });
  });

  it('filtre les lignes vides (pauses)', () => {
    const doc = lrclibToIr(track({ syncedLyrics: '[00:00.00]a\n[00:02.00]\n[00:05.00]b' }), 200);
    expect(doc?.lines.map((l) => l.text)).toEqual(['a', 'b']);
  });

  it('produit un TTML valide (bout en bout)', () => {
    const doc = lrclibToIr(track({ syncedLyrics: '[00:00.00]a\n[00:05.00]b' }), 200)!;
    expect(() => emitTtml(doc)).not.toThrow();
  });
});

describe('lrclibToIr — plainLyrics (repli sans synchro)', () => {
  it('produit un LyricsDoc sync: static, une ligne par ligne de texte', () => {
    const doc = lrclibToIr(track({ plainLyrics: 'Ligne 1\nLigne 2\n\nLigne 3' }));
    expect(doc?.sync).toBe('static');
    expect(doc?.lines.map((l) => l.text)).toEqual(['Ligne 1', 'Ligne 2', 'Ligne 3']);
  });

  it("n'est utilisé qu'en l'absence de syncedLyrics", () => {
    const doc = lrclibToIr(track({ syncedLyrics: '[00:00.00]synced', plainLyrics: 'plain only' }));
    expect(doc?.sync).toBe('line');
  });
});

describe('lrclibToIr — cas sans paroles exploitables', () => {
  it('renvoie null pour un morceau instrumental', () => {
    expect(lrclibToIr(track({ instrumental: true, plainLyrics: 'ignored' }))).toBeNull();
  });

  it("renvoie null quand ni syncedLyrics ni plainLyrics ne sont fournis", () => {
    expect(lrclibToIr(track())).toBeNull();
  });
});
