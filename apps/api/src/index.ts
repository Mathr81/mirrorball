import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { openDb } from './cache/db.js';
import { CacheRepository } from './cache/repository.js';
import { loadEnv } from './config/env.js';
import { LyricsOrchestrator, type Providers } from './orchestrator/resolve-lyrics.js';
import { KpoeProvider } from './providers/kpoe/index.js';
import { LrclibProvider } from './providers/lrclib/index.js';
import { SpicyProvider } from './providers/spicy/index.js';
import { healthRoute } from './routes/health.js';
import { lyricsRoute } from './routes/lyrics.js';
import { spDcLeakGuard } from './security/sp-dc-guard.js';

const env = loadEnv();

const providers: Providers = {
  spicy: new SpicyProvider({
    userAgent: env.spicyUserAgent,
    appOrigin: env.appOrigin,
    ...(env.spDc !== undefined ? { spDc: env.spDc } : {}),
    ...(env.spicyTotpSecretHex !== undefined && env.spicyTotpVersion !== undefined
      ? { totp: { secretHex: env.spicyTotpSecretHex, version: env.spicyTotpVersion } }
      : {}),
  }),
  kpoe: new KpoeProvider(env.kpoeUserAgent),
  lrclib: new LrclibProvider(env.lrclibUserAgent),
};

const db = openDb(env.dbPath);
const cache = new CacheRepository(db);
const orchestrator = new LyricsOrchestrator(providers, cache);

const app = new Hono();
app.use('*', spDcLeakGuard(env.spDc));
app.route('/api/lyrics', lyricsRoute(orchestrator));
app.route('/api/health', healthRoute(providers));

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`mirrorball api listening on :${info.port}`);
});
