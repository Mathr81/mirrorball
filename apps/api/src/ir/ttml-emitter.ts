import type { Line, LyricsDoc, Syllable, Voice } from './types.js';

/**
 * Émet le TTML tel que `AmLyrics.parseTTML` (@uimaxbai/am-lyrics v1.6.3) le
 * lit réellement — pas un TTML « correct » dans l'absolu. Points constatés
 * en lisant ce parser (docs/kpoe-findings.md §8), tous appliqués ici :
 *
 * - Le groupement en mot vient de l'espace final du texte d'un `<span>`,
 *   jamais d'un attribut : `partOfWord: true` ⇒ pas d'espace final.
 * - Chœurs : `<span ttm:role="x-bg">` enveloppant les spans de la voix de fond.
 * - Sections : `itunes:songPart` en camelCase, posé sur le PARENT du `<p>`
 *   (le générateur natif d'am-lyrics écrit `itunes:song-part` en kebab-case,
 *   que son propre parser ne relit pas — on suit le parser, pas l'export).
 * - Romanisation : `<transliteration><text for="L1"><span begin end>…</span>`,
 *   `for` = `itunes:key` du `<p>` visé. Pas `ttm:role="x-roman"`.
 * - Traduction : même mécanisme, `<translation><text for="L1">…</text>`.
 * - Ne jamais émettre un TTML sans aucune ligne : le composant retombe alors
 *   sur son propre chemin réseau (qu'on veut précisément court-circuiter).
 * - `<ttm:agent type="…">` : le parser lit ce `type` par id d'agent
 *   (`agentMap[xml:id] = type`) et s'en sert, ligne par ligne, pour décider
 *   l'alignement gauche/droite (`calculateLineAlignments`) — un id de type
 *   "group" reste toujours à gauche, "other"/"person" alternent selon que
 *   l'id change d'une ligne à l'autre. On émet donc le vrai type par agent
 *   (`doc.agentTypes`) plutôt qu'un "person" fixe, qui ferait dégénérer tout
 *   choeur de groupe en alternance de duo classique.
 */
export function emitTtml(doc: LyricsDoc): string {
  if (doc.lines.length === 0) {
    throw new Error('emitTtml: un LyricsDoc sans ligne ferait retomber am-lyrics sur son réseau interne');
  }

  const agents = collectAgents(doc.lines);
  const body = emitBody(doc);
  const transliteration = emitTransliteration(doc.lines);
  const translation = emitTranslation(doc.lines);
  const songwriters = doc.songWriters.map((w) => `      <songwriter>${escapeXml(w)}</songwriter>`).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tt xmlns="http://www.w3.org/ns/ttml"',
    '    xmlns:ttm="http://www.w3.org/ns/ttml#metadata"',
    '    xmlns:itunes="http://music.apple.com/lyric-ttml-internal"',
    '    xml:lang="und">',
    '  <head>',
    '    <metadata>',
    ...agents.map((a) => `      <ttm:agent type="${escapeXml(doc.agentTypes?.[a] ?? 'person')}" xml:id="${escapeXml(a)}"/>`),
    ...(songwriters ? [songwriters] : []),
    '    </metadata>',
    '  </head>',
    '  <body>',
    body,
    '  </body>',
    ...(transliteration ? [transliteration] : []),
    ...(translation ? [translation] : []),
    '</tt>',
    '',
  ].join('\n');
}

function collectAgents(lines: Line[]): string[] {
  const set = new Set<string>();
  for (const l of lines) set.add(l.agent);
  if (set.size === 0) set.add('v1');
  return [...set].sort();
}

/** Regroupe les lignes consécutives partageant la même section en `<div>`. */
function emitBody(doc: LyricsDoc): string {
  const groups: Array<{ sectionIndex: number | undefined; lines: Line[] }> = [];
  for (const line of doc.lines) {
    const last = groups.at(-1);
    if (last && last.sectionIndex === line.sectionIndex) {
      last.lines.push(line);
    } else {
      groups.push({ sectionIndex: line.sectionIndex, lines: [line] });
    }
  }

  return groups
    .map((g) => {
      const name = g.sectionIndex !== undefined ? doc.sections[g.sectionIndex]?.name : undefined;
      const openTag = name ? `    <div itunes:songPart="${escapeXml(name)}">` : '    <div>';
      const ps = g.lines.map((l) => emitP(l, doc.sync)).join('\n');
      return `${openTag}\n${ps}\n    </div>`;
    })
    .join('\n');
}

function emitP(line: Line, sync: LyricsDoc['sync']): string {
  const begin = msToTtmlTime(line.startMs);
  const end = msToTtmlTime(line.endMs);
  const attrs = `begin="${begin}" end="${end}" itunes:key="${escapeXml(line.key)}" ttm:agent="${escapeXml(line.agent)}"`;

  if (sync !== 'syllable' || line.lead.syllables.length === 0) {
    return `      <p ${attrs}>${escapeXml(line.text)}</p>`;
  }

  const leadSpans = emitVoiceSpans(line.lead);
  const bgSpans = line.background
    .filter((v) => v.syllables.length > 0)
    .map((v) => `<span ttm:role="x-bg">${emitVoiceSpans(v)}</span>`)
    .join('');

  return `      <p ${attrs}>${leadSpans}${bgSpans}</p>`;
}

function emitVoiceSpans(voice: Voice): string {
  return voice.syllables.map((s) => emitSyllableSpan(s)).join('');
}

function emitSyllableSpan(s: Syllable): string {
  const begin = msToTtmlTime(s.startMs);
  const end = msToTtmlTime(s.endMs);
  const text = escapeXml(s.text) + (s.partOfWord ? '' : ' ');
  return `<span begin="${begin}" end="${end}">${text}</span>`;
}

function emitTransliteration(lines: Line[]): string | null {
  const withRoman = lines.filter((l) => l.roman !== undefined);
  if (withRoman.length === 0) return null;

  const texts = withRoman
    .map((l) => {
      const roman = l.roman!;
      if (roman.syllables && roman.syllables.length > 0) {
        const spans = roman.syllables.map((s) => emitSyllableSpan(s)).join('');
        return `    <text for="${escapeXml(l.key)}">${spans}</text>`;
      }
      return `    <text for="${escapeXml(l.key)}">${escapeXml(roman.text)}</text>`;
    })
    .join('\n');

  return `  <transliteration>\n${texts}\n  </transliteration>`;
}

function emitTranslation(lines: Line[]): string | null {
  const withTranslation = lines.filter((l) => l.translation !== undefined);
  if (withTranslation.length === 0) return null;

  const texts = withTranslation
    .map((l) => `    <text for="${escapeXml(l.key)}">${escapeXml(l.translation!)}</text>`)
    .join('\n');

  return `  <translation>\n${texts}\n  </translation>`;
}

function msToTtmlTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
