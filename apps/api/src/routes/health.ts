import { Hono } from 'hono';
import type { Providers } from '../orchestrator/resolve-lyrics.js';

export function healthRoute(providers: Providers): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    return c.json({
      providers: {
        ...(providers.spicy ? { spicy: providers.spicy.health() } : {}),
        ...(providers.kpoe ? { kpoe: providers.kpoe.health() } : {}),
        ...(providers.lrclib ? { lrclib: providers.lrclib.health() } : {}),
      },
    });
  });

  return app;
}
