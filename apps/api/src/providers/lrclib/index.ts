import type { Provider, ProviderQuery, ProviderResult } from '../provider.js';
import { LrclibClient, type LrclibClientHealth } from './client.js';
import { lrclibToIr } from './to-ir.js';

export class LrclibProvider implements Provider<LrclibClientHealth> {
  readonly name = 'lrclib' as const;
  private readonly client: LrclibClient;

  constructor(userAgent: string) {
    this.client = new LrclibClient(userAgent);
  }

  async fetch(query: ProviderQuery): Promise<ProviderResult | null> {
    if (!query.title || !query.artist) return null;

    const started = performance.now();
    const track = await this.client.get({
      title: query.title,
      artist: query.artist,
      ...(query.durationSec !== undefined ? { durationSec: query.durationSec } : {}),
    });
    const ms = Math.round(performance.now() - started);

    if (!track) return null;
    const doc = lrclibToIr(track, query.durationSec);
    if (!doc) return null;

    return { doc, ms };
  }

  health(): LrclibClientHealth {
    return this.client.getHealth();
  }
}

export { parseLrc } from './lrc-parser.js';
export { lrclibToIr } from './to-ir.js';
