import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitTtml } from '../src/ir/ttml-emitter.js';
import { kpoeToIr } from '../src/providers/kpoe/to-ir.js';
import type { KpoeResponse } from '../src/providers/kpoe/types.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

function loadFixture(name: string): KpoeResponse {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as KpoeResponse;
}

describe('kpoeToIr — type "Word" (syllable)', () => {
  const raw = loadFixture('queen-bohemian-rhapsody');
  const doc = kpoeToIr(raw);

  it('mappe sync sur "syllable" et le provider sur "kpoe:<source en minuscule>"', () => {
    expect(doc.sync).toBe('syllable');
    expect(doc.provider).toBe('kpoe:qapple'); // metadata.source vaut "qApple", pas "Apple" (finding #7)
  });

  it('régénère les clés L1, L2… par ordre de ligne plutôt que de reprendre element.key', () => {
    expect(doc.lines.map((l) => l.key)).toEqual(raw.lyrics.map((_, i) => `L${i + 1}`));
  });

  it('conserve le nombre de lignes et de syllabes de la fixture', () => {
    expect(doc.lines).toHaveLength(raw.lyrics.length);
    const totalSyllables = raw.lyrics.reduce((n, l) => n + l.syllabus.length, 0);
    const totalInDoc = doc.lines.reduce((n, l) => n + l.lead.syllables.length + l.background.reduce((m, v) => m + v.syllables.length, 0), 0);
    expect(totalInDoc).toBe(totalSyllables);
  });

  it('déduit partOfWord de l\'absence d\'espace final, et retire cet espace du texte stocké', () => {
    const firstWithMultipleSyllables = doc.lines.find((l) => l.lead.syllables.length > 1)!;
    for (const s of firstWithMultipleSyllables.lead.syllables) {
      expect(s.text.endsWith(' ')).toBe(false);
    }
  });

  it('produit un TTML valide via emitTtml (bout en bout)', () => {
    expect(() => emitTtml(doc)).not.toThrow();
  });
});

describe('kpoeToIr — type "Line" (sans syllabus)', () => {
  const raw = loadFixture('piaf-non-je-ne-regrette-rien');
  const doc = kpoeToIr(raw);

  it('mappe sync sur "line" et laisse lead.syllables vide', () => {
    expect(doc.sync).toBe('line');
    for (const l of doc.lines) {
      expect(l.lead.syllables).toHaveLength(0);
      expect(l.background).toHaveLength(0);
    }
  });

  it('conserve le texte de ligne pour l\'émission <p> sans span', () => {
    expect(doc.lines[0]!.text).toBe(raw.lyrics[0]!.text);
  });
});

describe('kpoeToIr — deux chanteurs (v1/v2)', () => {
  const raw = loadFixture('daftpunk-get-lucky');
  const doc = kpoeToIr(raw);

  it('reflète element.singer sur Line.agent', () => {
    const agents = new Set(doc.lines.map((l) => l.agent));
    expect(agents).toEqual(new Set(['v1', 'v2']));
    doc.lines.forEach((l, i) => {
      expect(l.agent).toBe(raw.lyrics[i]!.element.singer ?? 'v1');
    });
  });
});

describe('kpoeToIr — chanteurs "v1000"/"v2000" (DtMF — Bad Bunny)', () => {
  const raw = loadFixture('badbunny-dtmf');
  const doc = kpoeToIr(raw);

  it('constate des valeurs element.singer au-delà de "v1"/"v2" dans la fixture réelle', () => {
    const rawSingers = new Set(raw.lyrics.map((l) => l.element.singer));
    expect(rawSingers).toEqual(new Set(['v1', 'v1000', 'v2000']));
  });

  it('reprend element.singer tel quel sur Line.agent, sans le réduire à "v1"/"v2"', () => {
    doc.lines.forEach((l, i) => {
      expect(l.agent).toBe(raw.lyrics[i]!.element.singer ?? 'v1');
    });
    const agents = new Set(doc.lines.map((l) => l.agent));
    expect(agents).toEqual(new Set(['v1', 'v1000', 'v2000']));
  });

  it('reflète metadata.agents (type person/group/other) sur LyricsDoc.agentTypes', () => {
    expect(doc.agentTypes).toEqual({
      v1: 'person',
      v1000: 'group',
      v2000: 'other',
    });
  });

  it('produit un TTML valide via emitTtml (bout en bout), avec le vrai type par agent', () => {
    const ttml = emitTtml(doc);
    expect(ttml).toContain('<ttm:agent type="person" xml:id="v1"/>');
    expect(ttml).toContain('<ttm:agent type="group" xml:id="v1000"/>');
    expect(ttml).toContain('<ttm:agent type="other" xml:id="v2000"/>');
  });
});

describe('kpoeToIr — transliteration et translation', () => {
  const raw = loadFixture('translit-iu-lilac');
  const doc = kpoeToIr(raw);

  it('capture translation.text sur Line.translation', () => {
    const withTranslation = doc.lines.filter((l) => l.translation !== undefined);
    expect(withTranslation.length).toBeGreaterThan(0);
    const rawWithTranslation = raw.lyrics.find((l) => l.translation);
    const match = doc.lines.find((l) => l.translation === rawWithTranslation?.translation?.text);
    expect(match).toBeDefined();
  });

  it('capture transliteration.syllabus dans roman.syllables quand présent', () => {
    const rawIndex = raw.lyrics.findIndex((l) => l.transliteration?.syllabus && l.transliteration.syllabus.length > 0);
    expect(rawIndex).toBeGreaterThanOrEqual(0);
    const line = doc.lines[rawIndex]!;
    expect(line.roman?.syllables).toBeDefined();
    expect(line.roman?.syllables).toHaveLength(raw.lyrics[rawIndex]!.transliteration!.syllabus!.length);
  });

  it('produit un TTML avec <transliteration> et <translation> (bout en bout)', () => {
    const ttml = emitTtml(doc);
    expect(ttml).toContain('<transliteration>');
    expect(ttml).toContain('<translation>');
  });
});

describe('kpoeToIr — voix de fond (isBackground)', () => {
  it('sépare les syllabes isBackground du lead dans une Voice dédiée', () => {
    const raw = loadFixture('translit-iu-lilac');
    const rawIndex = raw.lyrics.findIndex((l) => l.syllabus.some((s) => s.isBackground));
    expect(rawIndex).toBeGreaterThanOrEqual(0);

    const doc = kpoeToIr(raw);
    const line = doc.lines[rawIndex]!;
    const rawLine = raw.lyrics[rawIndex]!;
    const expectedBg = rawLine.syllabus.filter((s) => s.isBackground).length;
    const expectedLead = rawLine.syllabus.filter((s) => !s.isBackground).length;

    expect(line.lead.syllables).toHaveLength(expectedLead);
    expect(line.background).toHaveLength(1);
    expect(line.background[0]!.syllables).toHaveLength(expectedBg);
  });
});

describe('kpoeToIr — sections', () => {
  it('mappe metadata.songParts sur sections, et element.songPartIndex sur Line.sectionIndex', () => {
    const raw = loadFixture('translit-iu-lilac');
    const doc = kpoeToIr(raw);

    expect(doc.sections).toHaveLength(raw.metadata.songParts?.length ?? 0);
    expect(doc.sections[0]).toEqual({
      name: raw.metadata.songParts![0]!.name,
      startMs: raw.metadata.songParts![0]!.time,
      endMs: raw.metadata.songParts![0]!.time + raw.metadata.songParts![0]!.duration,
    });

    const rawLine0 = raw.lyrics[0]!;
    expect(doc.lines[0]!.sectionIndex).toBe(rawLine0.element.songPartIndex);
  });
});
