import type { Line, LyricsDoc, Section, Syllable, Voice } from '../../ir/types.js';
import type { KpoeLine, KpoeResponse, KpoeSyllabusItem } from './types.js';

/**
 * Convertit une réponse KPoe en LyricsDoc. `key` est régénéré par l'IR
 * (L1, L2… par ordre de ligne) plutôt que repris de `element.key` : c'est la
 * règle commune à tous les fournisseurs (seul KPoe a une notion de clé
 * native, Spicy n'en a aucune — l'IR doit rester cohérente indépendamment
 * de la source, cf. docs/architecture-proposal.md §3).
 */
export function kpoeToIr(raw: KpoeResponse): LyricsDoc {
  const sections: Section[] = (raw.metadata.songParts ?? []).map((sp) => ({
    name: sp.name,
    startMs: sp.time,
    endMs: sp.time + sp.duration,
  }));

  const lines: Line[] = raw.lyrics.map((l, index) => toLine(l, index, sections));

  return {
    sync: raw.type === 'Word' ? 'syllable' : 'line',
    lines,
    sections,
    songWriters: raw.metadata.songWriters ?? [],
    provider: `kpoe:${raw.metadata.source.toLowerCase()}`,
  };
}

function toLine(l: KpoeLine, index: number, sections: Section[]): Line {
  const leadRaw = l.syllabus.filter((s) => !s.isBackground);
  const bgRaw = l.syllabus.filter((s) => s.isBackground);

  const lead: Voice = {
    startMs: l.time,
    endMs: l.time + l.duration,
    syllables: leadRaw.map(toSyllable),
  };

  const background: Voice[] =
    bgRaw.length > 0
      ? [
          {
            startMs: bgRaw[0]!.time,
            endMs: bgRaw.at(-1)!.time + bgRaw.at(-1)!.duration,
            syllables: bgRaw.map(toSyllable),
          },
        ]
      : [];

  const sectionIndex = l.element.songPartIndex;
  const line: Line = {
    key: `L${index + 1}`,
    startMs: l.time,
    endMs: l.time + l.duration,
    text: l.text,
    lead,
    background,
    agent: l.element.singer ?? 'v1',
    oppositeAligned: false,
    ...(sectionIndex !== undefined && sectionIndex < sections.length ? { sectionIndex } : {}),
  };

  if (l.transliteration) {
    const romanSyllables = l.transliteration.syllabus;
    line.roman =
      romanSyllables && romanSyllables.length > 0
        ? { text: l.transliteration.text, syllables: romanSyllables.map(toSyllable) }
        : { text: l.transliteration.text };
  }

  if (l.translation) {
    line.translation = l.translation.text;
  }

  return line;
}

/** KPoe porte le groupement en mot via l'espace final du texte, pas un attribut. */
function toSyllable(s: KpoeSyllabusItem): Syllable {
  return {
    text: s.text.replace(/\s+$/, ''),
    startMs: s.time,
    endMs: s.time + s.duration,
    partOfWord: !/\s$/.test(s.text),
  };
}
