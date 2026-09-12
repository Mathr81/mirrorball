import type { Line, LyricsDoc, Syllable, Voice } from '../../ir/types.js';
import type { SpicyLyricsData, SpicySyllable } from './types.js';

/**
 * Convertit une réponse Spicy Lyrics décompressée (SLObjPack déjà unpack())
 * en LyricsDoc. Contrairement à KPoe, Spicy n'a aucune notion de section ni
 * de traduction (seulement de la romanisation, docs/spicy-lyrics-api.md §6.6),
 * et un seul agent implicite : l'alignement « duo » passe par
 * `OppositeAligned`, pas par un deuxième agent (aucune notion de « singer »
 * dans les données Spicy) — cf. docs/architecture-proposal.md §3.
 *
 * ⚠️ Hypothèse non vérifiée : `StartTime`/`EndTime` sont supposés déjà en
 * millisecondes (annoncé « proche de la milliseconde » par la doc, jamais
 * confirmé empiriquement faute de token Spotify réel dans cet environnement,
 * cf. docs/architecture-proposal.md §8 point 5). Si un test contre l'API
 * réelle révèle une autre unité, seule cette fonction doit changer.
 */
export function spicyToIr(raw: SpicyLyricsData): LyricsDoc {
  switch (raw.Type) {
    case 'Static':
      return fromStatic(raw);
    case 'Line':
      return fromLine(raw);
    case 'Syllable':
      return fromSyllable(raw);
  }
}

function providerName(source: SpicyLyricsData['source']): string {
  return `spicy:${source ?? 'unknown'}`;
}

function fromStatic(raw: Extract<SpicyLyricsData, { Type: 'Static' }>): LyricsDoc {
  const lines: Line[] = raw.Lines.map((l, i) => ({
    key: `L${i + 1}`,
    startMs: i * 1000,
    endMs: (i + 1) * 1000,
    text: l.Text,
    lead: { startMs: i * 1000, endMs: (i + 1) * 1000, syllables: [] },
    background: [],
    agent: 'v1',
    oppositeAligned: false,
    ...(l.TransliteratedText !== undefined ? { roman: { text: l.TransliteratedText } } : {}),
  }));

  return { sync: 'static', lines, sections: [], songWriters: [], provider: providerName(raw.source) };
}

function fromLine(raw: Extract<SpicyLyricsData, { Type: 'Line' }>): LyricsDoc {
  const lines: Line[] = raw.Content.map((l, i) => ({
    key: `L${i + 1}`,
    startMs: l.StartTime,
    endMs: l.EndTime,
    text: l.Text,
    lead: { startMs: l.StartTime, endMs: l.EndTime, syllables: [] },
    background: [],
    agent: 'v1',
    oppositeAligned: l.OppositeAligned ?? false,
    ...(l.TransliteratedText !== undefined ? { roman: { text: l.TransliteratedText } } : {}),
  }));

  return { sync: 'line', lines, sections: [], songWriters: raw.SongWriters ?? [], provider: providerName(raw.source) };
}

function fromSyllable(raw: Extract<SpicyLyricsData, { Type: 'Syllable' }>): LyricsDoc {
  const lines: Line[] = raw.Content.map((l, i) => {
    const leadSyllables = l.Lead.Syllables.map(toSyllable);
    const lead: Voice = { startMs: l.Lead.StartTime, endMs: l.Lead.EndTime, syllables: leadSyllables };
    const background: Voice[] = (l.Background ?? []).map((bg) => ({
      startMs: bg.StartTime,
      endMs: bg.EndTime,
      syllables: bg.Syllables.map(toSyllable),
    }));

    const line: Line = {
      key: `L${i + 1}`,
      startMs: l.Lead.StartTime,
      endMs: l.Lead.EndTime,
      text: reconstructText(l.Lead.Syllables),
      lead,
      background,
      agent: 'v1',
      oppositeAligned: l.OppositeAligned ?? false,
    };

    const roman = reconstructRoman(l.Lead.Syllables);
    if (roman) line.roman = roman;

    return line;
  });

  return { sync: 'syllable', lines, sections: [], songWriters: raw.SongWriters ?? [], provider: providerName(raw.source) };
}

/** `IsPartOfWord: true` ⇒ colle à la syllabe suivante (même sémantique que le partOfWord de l'IR). */
function toSyllable(s: SpicySyllable): Syllable {
  return { text: s.Text, startMs: s.StartTime, endMs: s.EndTime, partOfWord: s.IsPartOfWord ?? false };
}

function reconstructText(syllables: SpicySyllable[]): string {
  return syllables.map((s, i) => s.Text + (s.IsPartOfWord && i < syllables.length - 1 ? '' : ' ')).join('').trim();
}

function reconstructRoman(syllables: SpicySyllable[]): Line['roman'] | undefined {
  if (!syllables.some((s) => s.TransliteratedText !== undefined)) return undefined;

  const romanSyllables: Syllable[] = syllables.map((s) => ({
    text: s.TransliteratedText ?? s.Text,
    startMs: s.StartTime,
    endMs: s.EndTime,
    partOfWord: s.IsPartOfWord ?? false,
  }));
  const text = romanSyllables.map((s, i) => s.text + (s.partOfWord && i < romanSyllables.length - 1 ? '' : ' ')).join('').trim();
  return { text, syllables: romanSyllables };
}
