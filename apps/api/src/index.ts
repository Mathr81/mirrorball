import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { loadEnv } from './config/env.js';
import { spDcLeakGuard } from './security/sp-dc-guard.js';

const env = loadEnv();

const app = new Hono();
app.use('*', spDcLeakGuard(env.spDc));

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`mirrorball api listening on :${info.port}`);
});
