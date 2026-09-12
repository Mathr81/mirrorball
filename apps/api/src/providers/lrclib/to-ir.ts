import type { Line, LyricsDoc } from '../../ir/types.js';
import { parseLrc } from './lrc-parser.js';
import type { LrclibTrack } from './types.js';

/**
 * LRCLIB ne renvoie jamais de mot-à-mot : ligne par ligne (`syncedLyrics`)
 * ou texte brut (`plainLyrics`). Renvoie `null` quand il n'y a rien
 * d'exploitable (instrumental, ou aucun des deux champs rempli).
 */
export function lrclibToIr(track: LrclibTrack, durationSec?: number): LyricsDoc | null {
  if (track.instrumental) return null;

  if (track.syncedLyrics) {
    const doc = fromSynced(track.syncedLyrics, durationSec);
    if (doc) return doc;
  }

  if (track.plainLyrics) {
    return fromPlain(track.plainLyrics);
  }

  return null;
}

function fromSynced(synced: string, durationSec?: number): LyricsDoc | null {
  const entries = parseLrc(synced).filter((e) => e.text.length > 0);
  if (entries.length === 0) return null;

  const fallbackEndMs = durationSec !== undefined ? durationSec * 1000 : entries.at(-1)!.startMs + 4000;

  const lines: Line[] = entries.map((e, i) => ({
    key: `L${i + 1}`,
    startMs: e.startMs,
    endMs: entries[i + 1]?.startMs ?? fallbackEndMs,
    text: e.text,
    lead: { startMs: e.startMs, endMs: entries[i + 1]?.startMs ?? fallbackEndMs, syllables: [] },
    background: [],
    agent: 'v1',
    oppositeAligned: false,
  }));

  return { sync: 'line', lines, sections: [], songWriters: [], provider: 'lrclib' };
}

function fromPlain(plain: string): LyricsDoc | null {
  const rawLines = plain.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) return null;

  // Pas de synchro réelle : horodatages arbitraires et croissants, uniquement
  // pour satisfaire le type — le front n'utilise pas am-lyrics pour du
  // `static`, il affiche ce texte dans sa propre UI (docs/architecture-proposal.md §2).
  const lines: Line[] = rawLines.map((text, i) => ({
    key: `L${i + 1}`,
    startMs: i * 1000,
    endMs: (i + 1) * 1000,
    text: text.trim(),
    lead: { startMs: i * 1000, endMs: (i + 1) * 1000, syllables: [] },
    background: [],
    agent: 'v1',
    oppositeAligned: false,
  }));

  return { sync: 'static', lines, sections: [], songWriters: [], provider: 'lrclib' };
}
