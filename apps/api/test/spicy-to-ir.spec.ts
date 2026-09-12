import { describe, expect, it } from 'vitest';
import { emitTtml } from '../src/ir/ttml-emitter.js';
import { spicyToIr } from '../src/providers/spicy/to-ir.js';
import type { SpicyLineData, SpicyStaticData, SpicySyllableData } from '../src/providers/spicy/types.js';

describe('spicyToIr — Type: Static', () => {
  const raw: SpicyStaticData = {
    Type: 'Static',
    source: 'spt',
    Lines: [{ Text: 'Première ligne' }, { Text: '夜に駆ける', TransliteratedText: 'Yoru ni Kakeru' }],
  };
  const doc = spicyToIr(raw);

  it('mappe sync sur "static" et le provider sur spicy:<source>', () => {
    expect(doc.sync).toBe('static');
    expect(doc.provider).toBe('spicy:spt');
  });

  it('capture TransliteratedText en roman.text quand présent', () => {
    expect(doc.lines[0]!.roman).toBeUndefined();
    expect(doc.lines[1]!.roman).toEqual({ text: 'Yoru ni Kakeru' });
  });

  it('produit un TTML valide (bout en bout)', () => {
    expect(() => emitTtml(doc)).not.toThrow();
  });
});

describe('spicyToIr — Type: Line', () => {
  const raw: SpicyLineData = {
    Type: 'Line',
    source: 'aml',
    StartTime: 0,
    SongWriters: ['Freddie Mercury'],
    Content: [
      { Text: 'Is this the real life?', StartTime: 1000, EndTime: 3500 },
      { Text: 'Is this just fantasy?', StartTime: 3500, EndTime: 6000, OppositeAligned: true },
    ],
  };
  const doc = spicyToIr(raw);

  it('mappe StartTime/EndTime directement (pas de span)', () => {
    expect(doc.sync).toBe('line');
    expect(doc.lines[0]).toMatchObject({ startMs: 1000, endMs: 3500 });
    for (const l of doc.lines) expect(l.lead.syllables).toHaveLength(0);
  });

  it('reflète OppositeAligned sur Line.oppositeAligned, sans notion de deuxième agent', () => {
    expect(doc.lines[0]!.oppositeAligned).toBe(false);
    expect(doc.lines[1]!.oppositeAligned).toBe(true);
    expect(doc.lines.every((l) => l.agent === 'v1')).toBe(true);
  });

  it('conserve songWriters', () => {
    expect(doc.songWriters).toEqual(['Freddie Mercury']);
  });
});

describe('spicyToIr — Type: Syllable', () => {
  const raw: SpicySyllableData = {
    Type: 'Syllable',
    source: 'aml',
    StartTime: 0,
    Content: [
      {
        Lead: {
          StartTime: 0,
          EndTime: 1000,
          Syllables: [
            { Text: 'ka', StartTime: 0, EndTime: 200, IsPartOfWord: true },
            { Text: 'ra', StartTime: 200, EndTime: 400, IsPartOfWord: true },
            { Text: 'oke', StartTime: 400, EndTime: 600, IsPartOfWord: false },
          ],
        },
        Background: [
          { StartTime: 600, EndTime: 1000, Syllables: [{ Text: 'oh', StartTime: 600, EndTime: 1000 }] },
        ],
      },
    ],
  };
  const doc = spicyToIr(raw);

  it('reconstruit le texte de ligne à partir des syllabes lead (IsPartOfWord)', () => {
    expect(doc.lines[0]!.text).toBe('karaoke');
  });

  it('mappe Background[] directement sur background: Voice[]', () => {
    expect(doc.lines[0]!.background).toHaveLength(1);
    expect(doc.lines[0]!.background[0]!.syllables).toHaveLength(1);
  });

  it('IsPartOfWord se mappe sur partOfWord avec la même sémantique', () => {
    const syllables = doc.lines[0]!.lead.syllables;
    expect(syllables[0]!.partOfWord).toBe(true);
    expect(syllables[2]!.partOfWord).toBe(false);
  });

  it("n'a pas de translation (Spicy ne fournit que de la romanisation)", () => {
    expect(doc.lines[0]!.translation).toBeUndefined();
  });

  it('produit un TTML valide (bout en bout)', () => {
    expect(() => emitTtml(doc)).not.toThrow();
  });
});

describe('spicyToIr — romanisation syllabe par syllabe', () => {
  it('reconstruit roman.text et roman.syllables à partir de TransliteratedText par syllabe', () => {
    const raw: SpicySyllableData = {
      Type: 'Syllable',
      source: 'aml',
      StartTime: 0,
      Content: [
        {
          Lead: {
            StartTime: 0,
            EndTime: 1000,
            Syllables: [
              { Text: '夜', TransliteratedText: 'yo', StartTime: 0, EndTime: 500, IsPartOfWord: true },
              { Text: 'に', TransliteratedText: 'ru ni', StartTime: 500, EndTime: 1000 },
            ],
          },
        },
      ],
    };
    const doc = spicyToIr(raw);
    expect(doc.lines[0]!.roman?.text).toBe('yoru ni');
    expect(doc.lines[0]!.roman?.syllables).toHaveLength(2);
  });

  it("n'ajoute pas roman quand aucune syllabe n'a de TransliteratedText", () => {
    const raw: SpicySyllableData = {
      Type: 'Syllable',
      source: 'aml',
      StartTime: 0,
      Content: [{ Lead: { StartTime: 0, EndTime: 500, Syllables: [{ Text: 'hi', StartTime: 0, EndTime: 500 }] } }],
    };
    expect(spicyToIr(raw).lines[0]!.roman).toBeUndefined();
  });
});
