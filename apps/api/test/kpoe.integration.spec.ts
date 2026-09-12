/**
 * Canari réseau : tape la vraie instance KPoe vivante (docs/kpoe-findings.md §1).
 * Exclu du run par défaut, lancé via `pnpm --filter @mirrorball/api test:integration`.
 * Objectif : détecter si l'instance tombe ou si le format de réponse change,
 * pas de couvrir tous les cas (ça, c'est le rôle de kpoe-to-ir.spec.ts sur fixtures).
 */
import { describe, expect, it } from 'vitest';
import { emitTtml } from '../src/ir/ttml-emitter.js';
import { KpoeProvider } from '../src/providers/kpoe/index.js';

describe('KPoe — intégration réseau réelle', () => {
  it('résout Bohemian Rhapsody par isrc et produit un TTML valide', async () => {
    const provider = new KpoeProvider('mirrorball-integration-test/0.1');
    const result = await provider.fetch({ trackId: 'n/a', isrc: 'GBUM71029604' });

    expect(result).not.toBeNull();
    expect(result!.doc.lines.length).toBeGreaterThan(0);
    expect(['syllable', 'line']).toContain(result!.doc.sync);
    expect(() => emitTtml(result!.doc)).not.toThrow();
  });

  it('renvoie null (pas d\'exception) pour un isrc inexistant', async () => {
    const provider = new KpoeProvider('mirrorball-integration-test/0.1');
    const result = await provider.fetch({ trackId: 'n/a', isrc: 'ZZZZZ0000000' });
    expect(result).toBeNull();
  });
});
