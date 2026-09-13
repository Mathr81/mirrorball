import { describe, expect, it } from 'vitest';
import { emitTtml } from '../src/ir/ttml-emitter.js';
import type { LyricsDoc } from '../src/ir/types.js';

function baseDoc(overrides: Partial<LyricsDoc> = {}): LyricsDoc {
  return {
    sync: 'syllable',
    lines: [],
    sections: [],
    songWriters: [],
    provider: 'test',
    ...overrides,
  };
}

describe('emitTtml — sync: syllable', () => {
  it('groupe les syllabes en mots via l\'espace final, pas un attribut', () => {
    const doc = baseDoc({
      lines: [
        {
          key: 'L1',
          startMs: 1000,
          endMs: 2500,
          text: 'Is this',
          agent: 'v1',
          oppositeAligned: false,
          background: [],
          lead: {
            startMs: 1000,
            endMs: 2500,
            syllables: [
              { text: 'Is', startMs: 1000, endMs: 1200, partOfWord: false },
              { text: 'this', startMs: 1200, endMs: 1500, partOfWord: false },
            ],
          },
        },
      ],
    });

    const ttml = emitTtml(doc);
    expect(ttml).toContain('<span begin="00:00:01.000" end="00:00:01.200">Is </span>');
    expect(ttml).toContain('<span begin="00:00:01.200" end="00:00:01.500">this </span>');
  });

  it('ne met pas d\'espace final entre deux syllabes du même mot (partOfWord)', () => {
    const doc = baseDoc({
      lines: [
        {
          key: 'L1',
          startMs: 0,
          endMs: 1000,
          text: 'karaoke',
          agent: 'v1',
          oppositeAligned: false,
          background: [],
          lead: {
            startMs: 0,
            endMs: 1000,
            syllables: [
              { text: 'ka', startMs: 0, endMs: 200, partOfWord: true },
              { text: 'ra', startMs: 200, endMs: 400, partOfWord: true },
              { text: 'oke', startMs: 400, endMs: 600, partOfWord: false },
            ],
          },
        },
      ],
    });

    const ttml = emitTtml(doc);
    expect(ttml).toContain('<span begin="00:00:00.000" end="00:00:00.200">ka</span>');
    expect(ttml).toContain('<span begin="00:00:00.200" end="00:00:00.400">ra</span>');
    expect(ttml).toContain('<span begin="00:00:00.400" end="00:00:00.600">oke </span>');
  });

  it('enveloppe la voix de fond dans <span ttm:role="x-bg">', () => {
    const doc = baseDoc({
      lines: [
        {
          key: 'L1',
          startMs: 0,
          endMs: 1000,
          text: 'lead oh',
          agent: 'v1',
          oppositeAligned: false,
          lead: {
            startMs: 0,
            endMs: 500,
            syllables: [{ text: 'lead', startMs: 0, endMs: 500, partOfWord: false }],
          },
          background: [
            {
              startMs: 500,
              endMs: 1000,
              syllables: [{ text: 'oh', startMs: 500, endMs: 1000, partOfWord: false }],
            },
          ],
        },
      ],
    });

    const ttml = emitTtml(doc);
    expect(ttml).toMatch(/<span ttm:role="x-bg"><span begin="00:00:00\.500" end="00:00:01\.000">oh <\/span><\/span>/);
  });

  it('collecte les agents v1/v2 réellement utilisés dans <head>', () => {
    const doc = baseDoc({
      lines: [
        line({ key: 'L1', agent: 'v1' }),
        line({ key: 'L2', agent: 'v2' }),
      ],
    });

    const ttml = emitTtml(doc);
    expect(ttml).toContain('<ttm:agent type="person" xml:id="v1"/>');
    expect(ttml).toContain('<ttm:agent type="person" xml:id="v2"/>');
  });

  it('retombe sur type="person" pour un agent absent de agentTypes (défaut du parser lui-même)', () => {
    const doc = baseDoc({ lines: [line({ key: 'L1', agent: 'v1' })], agentTypes: {} });
    const ttml = emitTtml(doc);
    expect(ttml).toContain('<ttm:agent type="person" xml:id="v1"/>');
  });

  it('émet le vrai type par agent (group/other) depuis agentTypes, pas "person" fixe', () => {
    const doc = baseDoc({
      lines: [
        line({ key: 'L1', agent: 'v1000' }),
        line({ key: 'L2', agent: 'v2000' }),
      ],
      agentTypes: { v1000: 'group', v2000: 'other' },
    });

    const ttml = emitTtml(doc);
    expect(ttml).toContain('<ttm:agent type="group" xml:id="v1000"/>');
    expect(ttml).toContain('<ttm:agent type="other" xml:id="v2000"/>');
    expect(ttml).toContain('ttm:agent="v1000"');
    expect(ttml).toContain('ttm:agent="v2000"');
  });
});

describe('emitTtml — sync: line', () => {
  it('émet un <p> sans span, avec le texte brut de la ligne', () => {
    const doc = baseDoc({
      sync: 'line',
      lines: [line({ key: 'L1', text: 'Non, je ne regrette rien', syllables: [] })],
    });

    const ttml = emitTtml(doc);
    expect(ttml).toContain('<p begin="00:00:00.000" end="00:00:01.000" itunes:key="L1" ttm:agent="v1">Non, je ne regrette rien</p>');
    expect(ttml).not.toContain('<span');
  });
});

describe('emitTtml — sync: static', () => {
  it('émet un <p> par ligne, sans aucun span', () => {
    const doc = baseDoc({
      sync: 'static',
      lines: [
        line({ key: 'L1', text: 'Première ligne', syllables: [] }),
        line({ key: 'L2', text: 'Deuxième ligne', syllables: [] }),
      ],
    });

    const ttml = emitTtml(doc);
    expect(ttml).toContain('Première ligne</p>');
    expect(ttml).toContain('Deuxième ligne</p>');
    expect(ttml).not.toContain('<span');
  });
});

describe('emitTtml — transliteration et translation', () => {
  it('émet <transliteration> avec for= = itunes:key, pas ttm:role="x-roman"', () => {
    const doc = baseDoc({
      sync: 'line',
      lines: [{ ...line({ key: 'L1', text: '夜に駆ける', syllables: [] }), roman: { text: 'Yoru ni Kakeru' } }],
    });

    const ttml = emitTtml(doc);
    expect(ttml).toContain('<transliteration>');
    expect(ttml).toContain('<text for="L1">Yoru ni Kakeru</text>');
    expect(ttml).not.toContain('x-roman');
  });

  it('émet une romanisation syllabe par syllabe quand roman.syllables est fourni', () => {
    const doc = baseDoc({
      lines: [
        {
          ...line({ key: 'L1', syllables: [{ text: 'hi', startMs: 0, endMs: 200, partOfWord: false }] }),
          roman: {
            text: 'hi',
            syllables: [{ text: 'hi', startMs: 0, endMs: 200, partOfWord: false, roman: 'hi' }],
          },
        },
      ],
    });

    const ttml = emitTtml(doc);
    const translitBlock = ttml.slice(ttml.indexOf('<transliteration>'));
    expect(translitBlock).toContain('<span begin="00:00:00.000" end="00:00:00.200">hi </span>');
  });

  it('émet <translation> séparément de <transliteration>, avec le même mécanisme de clé', () => {
    const doc = baseDoc({
      sync: 'line',
      lines: [{ ...line({ key: 'L1', text: 'Ist das echte Leben?', syllables: [] }), translation: 'Is this the real life?' }],
    });

    const ttml = emitTtml(doc);
    expect(ttml).toContain('<translation>');
    expect(ttml).toContain('<text for="L1">Is this the real life?</text>');
  });

  it("n'émet ni <transliteration> ni <translation> quand aucune ligne n'en a", () => {
    const doc = baseDoc({ sync: 'line', lines: [line({ key: 'L1', syllables: [] })] });
    const ttml = emitTtml(doc);
    expect(ttml).not.toContain('<transliteration>');
    expect(ttml).not.toContain('<translation>');
  });
});

describe('emitTtml — sections', () => {
  it('regroupe les lignes consécutives de même section dans un <div itunes:songPart> camelCase', () => {
    const doc = baseDoc({
      sync: 'line',
      sections: [
        { name: 'Verse 1', startMs: 0, endMs: 2000 },
        { name: 'Chorus', startMs: 2000, endMs: 4000 },
      ],
      lines: [
        line({ key: 'L1', text: 'a', syllables: [], sectionIndex: 0 }),
        line({ key: 'L2', text: 'b', syllables: [], sectionIndex: 0 }),
        line({ key: 'L3', text: 'c', syllables: [], sectionIndex: 1 }),
      ],
    });

    const ttml = emitTtml(doc);
    expect(ttml).toContain('itunes:songPart="Verse 1"');
    expect(ttml).toContain('itunes:songPart="Chorus"');
    expect(ttml).not.toContain('itunes:song-part');
    // Les deux premières lignes doivent être dans le même <div>.
    const verseDiv = ttml.slice(ttml.indexOf('itunes:songPart="Verse 1"'), ttml.indexOf('itunes:songPart="Chorus"'));
    expect(verseDiv).toContain('itunes:key="L1"');
    expect(verseDiv).toContain('itunes:key="L2"');
  });

  it('omet itunes:songPart quand aucune section n\'est définie', () => {
    const doc = baseDoc({ sync: 'line', lines: [line({ key: 'L1', syllables: [] })] });
    const ttml = emitTtml(doc);
    expect(ttml).not.toContain('itunes:songPart');
  });
});

describe('emitTtml — cas limites', () => {
  it('lève une erreur plutôt que de produire un TTML sans ligne', () => {
    expect(() => emitTtml(baseDoc({ lines: [] }))).toThrow();
  });

  it('échappe les caractères XML spéciaux dans le texte', () => {
    const doc = baseDoc({ sync: 'line', lines: [line({ key: 'L1', text: 'Rock & "Roll" <live>', syllables: [] })] });
    const ttml = emitTtml(doc);
    expect(ttml).toContain('Rock &amp; &quot;Roll&quot; &lt;live&gt;');
  });

  it('inclut les auteurs dans <songwriter>', () => {
    const doc = baseDoc({ sync: 'line', songWriters: ['Freddie Mercury'], lines: [line({ key: 'L1', syllables: [] })] });
    const ttml = emitTtml(doc);
    expect(ttml).toContain('<songwriter>Freddie Mercury</songwriter>');
  });
});

// ── Aide à la construction de fixtures ──────────────────────────────────────
function line(opts: {
  key: string;
  text?: string;
  agent?: string;
  syllables?: Array<{ text: string; startMs: number; endMs: number; partOfWord: boolean; roman?: string }>;
  sectionIndex?: number;
}) {
  const syllables = opts.syllables ?? [{ text: opts.text ?? 'x', startMs: 0, endMs: 1000, partOfWord: false }];
  return {
    key: opts.key,
    startMs: 0,
    endMs: 1000,
    text: opts.text ?? 'x',
    agent: opts.agent ?? ('v1' as const),
    oppositeAligned: false,
    lead: { startMs: 0, endMs: 1000, syllables },
    background: [],
    ...(opts.sectionIndex !== undefined ? { sectionIndex: opts.sectionIndex } : {}),
  };
}
