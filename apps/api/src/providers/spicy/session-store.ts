import type { SpicyRpcResult } from './client.js';

export interface SpicyPingConfig {
  pingIntervalMs: number;
  minPingIntervalMs: number;
  sessionTtlSeconds: number;
  refreshAtTtlFraction: number;
}

/** Valeurs de repli si `pingConfig` échoue — reprises de l'exemple de la doc. */
const DEFAULT_CONFIG: SpicyPingConfig = {
  pingIntervalMs: 300_000,
  minPingIntervalMs: 240_000,
  sessionTtlSeconds: 3600,
  refreshAtTtlFraction: 0.8,
};

export type SpicyRpcCaller = (operation: 'createSession' | 'refreshSession' | 'ping' | 'pingConfig', variables: Record<string, unknown>) => Promise<SpicyRpcResult>;

/**
 * Session mutualisée unique côté serveur (docs/spicy-lyrics-api.md §4) :
 * createSession → ping périodique → refreshSession avant expiration.
 * Le trafic sans session active est rate-limité — cette maintenance tourne
 * en tâche de fond indépendamment des requêtes `lyrics` elles-mêmes, qui ne
 * portent pas le `tk` (absent de `lyrics.variables` dans la doc, §2).
 */
export class SpicySessionStore {
  private tk: string | undefined;
  private config: SpicyPingConfig = DEFAULT_CONFIG;
  private lastRefreshAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(private readonly rpc: SpicyRpcCaller) {}

  isAlive(): boolean {
    return this.tk !== undefined;
  }

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    void this.fetchConfig();
    this.scheduleNext(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async fetchConfig(): Promise<void> {
    try {
      const res = await this.rpc('pingConfig', {});
      if (res.httpStatus === 200 && res.data && typeof res.data === 'object') {
        this.config = { ...DEFAULT_CONFIG, ...(res.data as Partial<SpicyPingConfig>) };
      }
    } catch {
      // Repli silencieux sur DEFAULT_CONFIG — pas fatal, juste moins précis.
    }
  }

  private async tick(): Promise<void> {
    try {
      if (!this.tk) {
        await this.createSession();
      } else {
        await this.pingOrRefresh();
      }
    } catch {
      // Dégradation silencieuse : on retentera au prochain tick. Le provider
      // Spicy retombe sur Static (paroles non synchronisées) en attendant.
    }
    this.scheduleNext(this.config.pingIntervalMs);
  }

  private async createSession(): Promise<void> {
    const res = await this.rpc('createSession', {});
    if (res.httpStatus === 200 && res.data && typeof res.data === 'object' && 'tk' in res.data) {
      this.tk = String((res.data as { tk: unknown }).tk);
      this.lastRefreshAt = Date.now();
    }
  }

  private async pingOrRefresh(): Promise<void> {
    const ttlMs = this.config.sessionTtlSeconds * 1000;
    const refreshAt = this.lastRefreshAt + ttlMs * this.config.refreshAtTtlFraction;

    if (Date.now() >= refreshAt) {
      const res = await this.rpc('refreshSession', { tk: this.tk });
      if (res.httpStatus === 403) {
        this.tk = undefined;
        return;
      }
      if (res.httpStatus === 200 && res.data && typeof res.data === 'object' && 'tk' in res.data) {
        this.tk = String((res.data as { tk: unknown }).tk);
        this.lastRefreshAt = Date.now();
      }
      return;
    }

    const res = await this.rpc('ping', { tk: this.tk });
    if (res.httpStatus === 403) this.tk = undefined;
  }
}
