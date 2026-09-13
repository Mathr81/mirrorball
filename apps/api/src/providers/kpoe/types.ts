/**
 * Forme réelle des réponses KPoe / LyricsPlus, vérifiée par sondage contre
 * l'instance vivante (docs/kpoe-findings.md §7) — pas la spec GitHub non
 * vérifiée dont ce projet est parti à l'origine.
 */

export interface KpoeSyllabusItem {
  time: number;
  duration: number;
  text: string;
  isBackground?: boolean;
}

export interface KpoeTranslation {
  lang: string;
  text: string;
}

export interface KpoeTransliteration {
  lang: string;
  text: string;
  syllabus?: KpoeSyllabusItem[];
}

export interface KpoeElement {
  key: string;
  /**
   * Pas seulement "v1"/"v2" en pratique : constaté aussi "v1000", "v2000"…
   * (voix de groupe/autres, cf. metadata.agents). Repris tel quel dans
   * Line.agent par to-ir.ts — c'est cet id précis qui pilote l'alignement
   * gauche/droite côté parser am-lyrics (calculateLineAlignments), pas
   * juste une distinction binaire.
   */
  singer?: string;
  songPartIndex?: number;
}

export interface KpoeLine {
  time: number;
  duration: number;
  text: string;
  syllabus: KpoeSyllabusItem[];
  element: KpoeElement;
  translation?: KpoeTranslation;
  transliteration?: KpoeTransliteration;
}

export interface KpoeSongPart {
  name: string;
  time: number;
  duration: number;
}

export interface KpoeMetadata {
  source: string;
  title?: string;
  artist?: string;
  album?: string;
  isrc?: string;
  language?: string;
  totalDuration?: string;
  songWriters?: string[];
  agents?: Record<string, { type: string; name: string; alias: string }>;
  songParts?: KpoeSongPart[];
}

export interface KpoeResponse {
  type: 'Word' | 'Line';
  metadata: KpoeMetadata;
  lyrics: KpoeLine[];
  cached?: boolean;
  KpoeTools?: string;
  processingTime?: unknown;
}

export interface KpoeErrorResponse {
  error: {
    message: string;
    status: number;
    details?: { searchedSources?: string[]; songInfo?: Record<string, string> };
  };
  processingTime?: unknown;
}
