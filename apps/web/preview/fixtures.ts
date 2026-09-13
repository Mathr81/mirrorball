/**
 * Données factices du banc d'essai visuel (`preview.html`) : aucun réseau,
 * aucun compte Spotify. Sert uniquement à regarder l'UI dans tous ses états.
 */
import type { LyricsResponse } from '../src/lyrics/lyrics-client.js';
import type { CurrentlyPlaying } from '../src/playback/spotify-api.js';

/** Pochette générée localement : même origine, donc l'extraction de palette (canvas) fonctionne comme avec une vraie pochette servie avec CORS. */
export const COVER_URL = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0426a"/>
      <stop offset="55%" stop-color="#7b2ff7"/>
      <stop offset="100%" stop-color="#1b6ef3"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="430" cy="180" r="120" fill="#ffd166" opacity="0.85"/>
  <circle cx="180" cy="430" r="150" fill="#06d6a0" opacity="0.5"/>
  <rect x="60" y="60" width="180" height="180" rx="24" fill="#0b0b12" opacity="0.55"/>
</svg>`)}`;

export const TRACK: CurrentlyPlaying = {
  trackId: 'preview-track',
  progressMs: 61_000,
  isPlaying: true,
  durationMs: 214_000,
  name: 'Mirrorball',
  artists: ['Taylor Swift'],
  albumName: 'folklore (deluxe version)',
  albumImageUrl: COVER_URL,
  isrc: 'USUG12004291',
};

const LINES: Array<[number, number, string]> = [
  [40_000, 44_500, "I want you to know"],
  [45_000, 49_800, "I'm a mirrorball"],
  [50_200, 55_000, "I'll show you every version of yourself tonight"],
  [55_500, 60_000, "I'll get you out on the floor"],
  [60_500, 65_500, "Shimmering beautiful"],
  [66_000, 71_000, "And when I break, it's in a million pieces"],
  [71_500, 76_000, "Hush, when no one is around, my dear"],
  [76_500, 81_000, "You'll find me on my tallest tiptoes"],
  [81_500, 86_500, "Spinning in my highest heels, love"],
  [87_000, 92_000, "Shining just for you"],
];

function ttmlTime(ms: number): string {
  const s = ms / 1000;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(3).padStart(6, '0');
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec}`;
}

/** Découpe chaque ligne mot à mot, dans le dialecte TTML lu par am-lyrics (cf. apps/api/src/ir/ttml-emitter.ts). */
function syllableParagraphs(): string {
  return LINES.map(([start, end, text], index) => {
    const words = text.split(' ');
    const step = (end - start) / words.length;
    const spans = words
      .map((word, i) => `<span begin="${ttmlTime(start + i * step)}" end="${ttmlTime(start + (i + 1) * step)}">${word} </span>`)
      .join('');
    return `      <p begin="${ttmlTime(start)}" end="${ttmlTime(end)}" itunes:key="L${index + 1}" ttm:agent="v1">${spans}</p>`;
  }).join('\n');
}

export const SYLLABLE_TTML = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml"
    xmlns:ttm="http://www.w3.org/ns/ttml#metadata"
    xmlns:itunes="http://music.apple.com/lyric-ttml-internal"
    xml:lang="und">
  <head>
    <metadata>
      <ttm:agent type="person" xml:id="v1"/>
    </metadata>
  </head>
  <body>
    <div itunes:songPart="Verse">
${syllableParagraphs()}
    </div>
  </body>
</tt>
`;

export const STATIC_TTML = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="und">
  <body>
    <div>
${LINES.map(([, , text]) => `      <p>${text}</p>`).join('\n')}
    </div>
  </body>
</tt>
`;

export const SYLLABLE_RESPONSE: LyricsResponse = {
  ttml: SYLLABLE_TTML,
  sync: 'syllable',
  provider: 'kpoe',
  cached: false,
  matched: { provider: 'kpoe', cacheKey: 'preview', sync: 'syllable' },
  attempts: [
    { provider: 'spicy', outcome: 'miss', ms: 210 },
    { provider: 'kpoe', outcome: 'hit', ms: 640, queuedMs: 120 },
  ],
};

export const STATIC_RESPONSE: LyricsResponse = {
  ...SYLLABLE_RESPONSE,
  ttml: STATIC_TTML,
  sync: 'static',
  provider: 'lrclib',
};
