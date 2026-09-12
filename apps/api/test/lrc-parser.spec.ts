import { describe, expect, it } from 'vitest';
import { parseLrc } from '../src/providers/lrclib/lrc-parser.js';

describe('parseLrc', () => {
  it('parse les lignes horodatées mm:ss.xx', () => {
    const entries = parseLrc('[00:12.34]Première ligne\n[00:15.00]Deuxième ligne');
    expect(entries).toEqual([
      { startMs: 12340, text: 'Première ligne' },
      { startMs: 15000, text: 'Deuxième ligne' },
    ]);
  });

  it('ignore les tags de métadonnées ([ar:], [ti:], [length:]…)', () => {
    const entries = parseLrc('[ar:Queen]\n[ti:Bohemian Rhapsody]\n[00:05.00]Is this the real life');
    expect(entries).toEqual([{ startMs: 5000, text: 'Is this the real life' }]);
  });

  it('gère plusieurs horodatages sur la même ligne (refrain répété)', () => {
    const entries = parseLrc('[00:10.00][00:40.00]Even so');
    expect(entries).toEqual([
      { startMs: 10000, text: 'Even so' },
      { startMs: 40000, text: 'Even so' },
    ]);
  });

  it('trie les entrées par horodatage croissant', () => {
    const entries = parseLrc('[00:20.00]Plus tard\n[00:05.00]Plus tôt');
    expect(entries.map((e) => e.startMs)).toEqual([5000, 20000]);
  });

  it('accepte 2 ou 3 chiffres de fraction de seconde', () => {
    expect(parseLrc('[00:01.5]x')[0]!.startMs).toBe(1500);
    expect(parseLrc('[00:01.500]x')[0]!.startMs).toBe(1500);
  });

  it("renvoie un tableau vide sur une entrée sans aucun horodatage", () => {
    expect(parseLrc('pas de synchro ici')).toEqual([]);
  });
});
