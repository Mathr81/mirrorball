/**
 * État des 5 base URLs listées par la spec de départ (en réalité codées en
 * dur dans am-lyrics, cf. docs/kpoe-findings.md §1). Une seule est vivante
 * aujourd'hui (`binimum.org`) ; les autres restent surveillées au cas où
 * elles reviendraient, mais sans consommer le budget de requêtes de
 * l'instance vivante.
 */
export const KPOE_BASE_URLS: readonly string[] = [
  'https://lyricsplus.binimum.org',
  'https://lyricsplus.atomix.one',
  'https://lyricsplus-seven.vercel.app',
  'https://lyricsplus.prjktla.workers.dev',
  'https://lyrics-plus-backend.vercel.app',
];

export interface KpoeInstanceState {
  url: string;
  alive: boolean;
  latencyMs?: number;
  reason?: string;
  lastCheckedAt: number;
}

export class KpoeInstanceHealth {
  private readonly states = new Map<string, KpoeInstanceState>();

  constructor(seed: readonly string[] = KPOE_BASE_URLS) {
    const now = Date.now();
    for (const url of seed) {
      // Optimiste par défaut : une instance jamais sondée est traitée comme
      // potentiellement vivante jusqu'à preuve du contraire, plutôt que de
      // figer indéfiniment le constat du sondage initial dans le code.
      this.states.set(url, { url, alive: true, lastCheckedAt: 0 });
    }
  }

  /** Première instance connue vivante, dans l'ordre de la liste. */
  getPrimary(): string | null {
    for (const url of KPOE_BASE_URLS) {
      if (this.states.get(url)?.alive) return url;
    }
    return null;
  }

  recordSuccess(url: string, latencyMs: number): void {
    this.states.set(url, { url, alive: true, latencyMs, lastCheckedAt: Date.now() });
  }

  recordFailure(url: string, reason: string): void {
    const prev = this.states.get(url);
    this.states.set(url, { url, alive: false, reason, lastCheckedAt: Date.now(), ...(prev?.latencyMs !== undefined ? { latencyMs: prev.latencyMs } : {}) });
  }

  snapshot(): KpoeInstanceState[] {
    return KPOE_BASE_URLS.map((url) => this.states.get(url) ?? { url, alive: false, lastCheckedAt: 0 });
  }

  /** Instances mortes depuis plus de `staleMs`, candidates à un re-sondage. */
  staleDeadInstances(staleMs: number): string[] {
    const now = Date.now();
    return KPOE_BASE_URLS.filter((url) => {
      const s = this.states.get(url);
      return s && !s.alive && now - s.lastCheckedAt >= staleMs;
    });
  }
}
