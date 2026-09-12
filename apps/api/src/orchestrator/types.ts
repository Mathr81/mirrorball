import type { LyricsDoc } from '../ir/types.js';

export interface Attempt {
  provider: 'spicy' | 'kpoe' | 'lrclib';
  outcome: LyricsDoc['sync'] | 'not_found' | 'error' | 'waf' | 'cached';
  ms: number;
  queuedMs?: number;
}

export interface Matched {
  provider: string;
  cacheKey: string;
  sync: LyricsDoc['sync'];
}

export interface ResolveLyricsOutput {
  ttml: string;
  sync: LyricsDoc['sync'];
  provider: string;
  cached: boolean;
  matched: Matched;
  attempts: Attempt[];
}

/** Discriminant explicite plutôt que `null` : même un échec porte les `attempts` pour le panneau de debug. */
export type ResolveResult = { found: true; output: ResolveLyricsOutput } | { found: false; attempts: Attempt[] };
