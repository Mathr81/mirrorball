/** `m:ss` (ou `h:mm:ss` au-delà de l'heure), jamais négatif — affiché sous la barre de progression. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

const SYNC_LABELS: Record<string, string> = {
  syllable: 'Mot à mot',
  line: 'Par ligne',
  static: 'Non synchronisées',
};

/** Libellé lisible du niveau de synchronisation, pour la pastille de la pochette. */
export function syncLabel(sync: string): string {
  return SYNC_LABELS[sync] ?? sync;
}

const PROVIDER_LABELS: Record<string, string> = {
  spicy: 'Spicy Lyrics',
  kpoe: 'KPoe',
  lrclib: 'LRCLIB',
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}
