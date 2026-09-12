export interface LrcEntry {
  startMs: number;
  text: string;
}

const TIMESTAMP = /\[(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)\]/g;

/**
 * Parse un LRC ligne par ligne. Ignore les tags de métadonnées ([ar:...],
 * [ti:...], [length:...]…) qui ne correspondent pas au format horodatage.
 * Gère le cas — rare mais présent dans certains LRC — de plusieurs
 * horodatages sur une même ligne de texte (refrain répété).
 */
export function parseLrc(synced: string): LrcEntry[] {
  const entries: LrcEntry[] = [];

  for (const rawLine of synced.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(TIMESTAMP)];
    if (matches.length === 0) continue;

    const text = rawLine.slice(matches.at(-1)!.index + matches.at(-1)![0].length).trim();
    for (const m of matches) {
      const minutes = Number(m[1]);
      const seconds = Number(m[2]);
      entries.push({ startMs: Math.round((minutes * 60 + seconds) * 1000), text });
    }
  }

  entries.sort((a, b) => a.startMs - b.startMs);
  return entries;
}
