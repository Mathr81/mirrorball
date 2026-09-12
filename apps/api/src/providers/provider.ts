import type { LyricsDoc } from '../ir/types.js';

export type ProviderName = 'spicy' | 'kpoe' | 'lrclib';

export interface ProviderQuery {
  trackId: string;
  title?: string;
  artist?: string;
  durationSec?: number;
  isrc?: string;
  /** Transmis uniquement au provider Spicy ; jamais stocké. */
  spotifyAccessToken?: string;
}

export interface ProviderResult {
  doc: LyricsDoc;
  ms: number;
  /** Temps passé en file d'attente avant que la requête ne parte réellement. */
  queuedMs?: number;
}

/**
 * `fetch` ne lève que sur une vraie panne infra (timeout, 5xx transport,
 * disjoncteur ouvert). Un « pas de paroles » applicatif renvoie `null`,
 * jamais une exception : l'orchestrateur n'a ainsi qu'un seul type d'erreur
 * à distinguer (panne vs absence).
 */
export interface Provider<Health = unknown> {
  readonly name: ProviderName;
  fetch(query: ProviderQuery): Promise<ProviderResult | null>;
  health(): Health;
}
