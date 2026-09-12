import { Hono } from 'hono';
import type { LyricsOrchestrator } from '../orchestrator/resolve-lyrics.js';

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length);
}

export function lyricsRoute(orchestrator: LyricsOrchestrator): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const trackId = c.req.query('trackId');
    if (!trackId) {
      return c.json({ error: 'missing_track_id' }, 400);
    }

    const title = c.req.query('title');
    const artist = c.req.query('artist');
    const isrc = c.req.query('isrc');
    const durationParam = c.req.query('duration');
    const durationSec = durationParam !== undefined ? Number(durationParam) : undefined;
    const spotifyAccessToken = bearerToken(c.req.header('authorization'));

    const result = await orchestrator.resolve({
      trackId,
      ...(title !== undefined ? { title } : {}),
      ...(artist !== undefined ? { artist } : {}),
      ...(isrc !== undefined ? { isrc } : {}),
      ...(durationSec !== undefined && Number.isFinite(durationSec) ? { durationSec } : {}),
      ...(spotifyAccessToken !== undefined ? { spotifyAccessToken } : {}),
    });

    if (!result.found) {
      return c.json({ error: 'no_lyrics_found', attempts: result.attempts }, 404);
    }

    return c.json(result.output);
  });

  return app;
}
