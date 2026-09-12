export interface Env {
  readonly port: number;
  readonly spDc: string | undefined;
  readonly spicyTotpSecretHex: string | undefined;
  readonly spicyTotpVersion: string | undefined;
  readonly appOrigin: string;
  readonly dbPath: string;
  readonly kpoeUserAgent: string;
  readonly lrclibUserAgent: string;
  readonly spicyUserAgent: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return {
    port: Number(source.PORT ?? 8787),
    spDc: source.SP_DC || undefined,
    // Cf. providers/spicy/web-player-token.ts : sans ces deux valeurs, le
    // provider Spicy fonctionne quand même, mais sans paroles synchronisées.
    spicyTotpSecretHex: source.SPICY_TOTP_SECRET_HEX || undefined,
    spicyTotpVersion: source.SPICY_TOTP_VERSION || undefined,
    appOrigin: source.APP_ORIGIN ?? 'http://localhost:5173',
    dbPath: source.DB_PATH ?? './data/cache.db',
    kpoeUserAgent: source.KPOE_USER_AGENT ?? 'mirrorball/0.1 (personal lyrics reader)',
    lrclibUserAgent:
      source.LRCLIB_USER_AGENT ?? 'mirrorball/0.1 (+personal use; https://github.com/mathr81/mirrorball)',
    spicyUserAgent: source.SPICY_USER_AGENT ?? 'mirrorball/0.1 (personal lyrics reader)',
  };
}
