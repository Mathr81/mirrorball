import type { Provider, ProviderQuery, ProviderResult } from '../provider.js';
import { SpicyClient, SpicyTransportError, type SpicyClientHealth } from './client.js';
import { ObjPackNotImplementedError, SLObjPack, type PackedPayload } from './objpack.js';
import { SpicySessionStore } from './session-store.js';
import { spicyToIr } from './to-ir.js';
import type { SpicyLyricsData } from './types.js';
import { mintWebPlayerToken, type WebPlayerTokenConfig } from './web-player-token.js';

export interface SpicyProviderConfig {
  userAgent: string;
  appOrigin: string;
  spDc?: string;
  totp?: WebPlayerTokenConfig;
}

export interface SpicyProviderHealth {
  available: boolean;
  circuitOpen: boolean;
  sessionAlive: boolean;
  spDcConfigured: boolean;
}

/** Panne infra (transport, disjoncteur ouvert) — distincte d'une absence de paroles (404). */
export class SpicyProviderError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly ms: number,
  ) {
    super(`spicy: httpStatus ${httpStatus}`);
  }
}

const WEB_PLAYER_TOKEN_TTL_MS = 50 * 60 * 1000;

export class SpicyProvider implements Provider<SpicyProviderHealth> {
  readonly name = 'spicy' as const;
  private readonly client: SpicyClient;
  private readonly session: SpicySessionStore;
  private readonly objpack = new SLObjPack();
  private readonly spDc: string | undefined;
  private readonly totpConfig: WebPlayerTokenConfig | undefined;
  private cachedWebPlayerToken: { token: string; fetchedAt: number } | undefined;

  constructor(config: SpicyProviderConfig) {
    this.client = new SpicyClient(config.userAgent, config.appOrigin);
    this.spDc = config.spDc;
    this.totpConfig = config.totp;
    this.session = new SpicySessionStore(async (operation, variables) => {
      const [result] = await this.client.call([{ operation, variables }]);
      return result ?? { httpStatus: 502, data: null };
    });
    this.session.start();
  }

  async fetch(query: ProviderQuery): Promise<ProviderResult | null> {
    const auth = await this.resolveAuthToken(query);
    if (!auth) return null; // aucun token disponible (ni utilisateur, ni web-player) : rien à tenter

    const started = performance.now();
    let result;
    try {
      result = await this.client.callSingleWithSoftRetry({ operation: 'lyrics', variables: { id: query.trackId, auth: 'SpicyLyrics-WebAuth' } }, auth);
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      if (err instanceof SpicyTransportError) throw new SpicyProviderError(err.status, ms);
      throw err;
    }
    const ms = Math.round(performance.now() - started);

    if (result.httpStatus === 404) return null;
    if (result.httpStatus !== 200) throw new SpicyProviderError(result.httpStatus, ms);

    let unpacked: SpicyLyricsData;
    try {
      unpacked = this.objpack.unpack(result.data as PackedPayload) as SpicyLyricsData;
    } catch (err) {
      if (err instanceof ObjPackNotImplementedError) return null; // dégrade silencieusement (voir objpack.ts)
      throw err;
    }

    return { doc: spicyToIr(unpacked), ms };
  }

  health(): SpicyProviderHealth {
    const clientHealth: SpicyClientHealth = this.client.getHealth();
    return {
      available: !clientHealth.circuitOpen,
      circuitOpen: clientHealth.circuitOpen,
      sessionAlive: this.session.isAlive(),
      spDcConfigured: this.spDc !== undefined,
    };
  }

  /**
   * Priorité au token web-player minté (paroles synchronisées) quand
   * `sp_dc`/TOTP sont configurés ; repli sur le token utilisateur transmis
   * par le front (paroles non synchronisées uniquement, §9.1).
   */
  private async resolveAuthToken(query: ProviderQuery): Promise<string | undefined> {
    if (this.spDc && this.totpConfig) {
      const now = Date.now();
      if (this.cachedWebPlayerToken && now - this.cachedWebPlayerToken.fetchedAt < WEB_PLAYER_TOKEN_TTL_MS) {
        return this.cachedWebPlayerToken.token;
      }
      const minted = await mintWebPlayerToken(this.spDc, this.totpConfig);
      if (minted) {
        this.cachedWebPlayerToken = { token: minted, fetchedAt: now };
        return minted;
      }
      // Minting en échec (secret périmé, etc.) : repli sur le token utilisateur ci-dessous.
    }
    return query.spotifyAccessToken;
  }
}
