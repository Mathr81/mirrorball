export interface Env {
  readonly port: number;
  readonly spDc: string | undefined;
  readonly dbPath: string;
  readonly kpoeUserAgent: string;
  readonly lrclibUserAgent: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return {
    port: Number(source.PORT ?? 8787),
    spDc: source.SP_DC || undefined,
    dbPath: source.DB_PATH ?? './data/cache.db',
    kpoeUserAgent: source.KPOE_USER_AGENT ?? 'mirrorball/0.1 (personal lyrics reader)',
    lrclibUserAgent:
      source.LRCLIB_USER_AGENT ?? 'mirrorball/0.1 (+personal use; https://github.com/mathr81/mirrorball)',
  };
}
