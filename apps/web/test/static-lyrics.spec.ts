import { describe, expect, it } from 'vitest';
import { extractStaticLines } from '../src/lyrics/static-lyrics.js';

describe('extractStaticLines', () => {
  it('extrait le texte de chaque <p>, dans l\'ordre', () => {
    const ttml = '<tt><body><div><p>Première ligne</p><p>Deuxième ligne</p></div></body></tt>';
    expect(extractStaticLines(ttml)).toEqual(['Première ligne', 'Deuxième ligne']);
  });

  it('ignore les lignes vides', () => {
    const ttml = '<tt><body><div><p>a</p><p>  </p><p>b</p></div></body></tt>';
    expect(extractStaticLines(ttml)).toEqual(['a', 'b']);
  });

  it('gère les entités XML échappées par notre propre émetteur', () => {
    const ttml = '<tt><body><div><p>Rock &amp; Roll</p></div></body></tt>';
    expect(extractStaticLines(ttml)).toEqual(['Rock & Roll']);
  });
});
