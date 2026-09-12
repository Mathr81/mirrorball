/**
 * Représentation intermédiaire commune aux trois fournisseurs de paroles.
 * Un seul émetteur (`ttml-emitter.ts`) la traduit vers le dialecte TTML
 * attendu par le parser de @uimaxbai/am-lyrics — voir docs/kpoe-findings.md §8.
 */

export interface Syllable {
  text: string;
  startMs: number;
  endMs: number;
  /** true si cette syllabe se colle à la suivante, sans espace (même mot). */
  partOfWord: boolean;
  roman?: string;
}

export interface Voice {
  startMs: number;
  endMs: number;
  /** Vide pour une ligne sans synchro mot-à-mot (sync: 'line' | 'static'). */
  syllables: Syllable[];
}

export interface Line {
  /** L1, L2… généré par l'IR, jamais repris de la source. */
  key: string;
  startMs: number;
  endMs: number;
  text: string;
  lead: Voice;
  background: Voice[];
  agent: 'v1' | 'v2';
  oppositeAligned: boolean;
  roman?: { text: string; syllables?: Syllable[] };
  /** Traduction (changement de langue), distincte de la romanisation. */
  translation?: string;
  sectionIndex?: number;
}

export interface Section {
  name?: string;
  startMs: number;
  endMs: number;
}

export interface LyricsDoc {
  sync: 'syllable' | 'line' | 'static';
  lines: Line[];
  sections: Section[];
  songWriters: string[];
  provider: string;
}
