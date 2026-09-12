import { describe, expect, it } from 'vitest';
import { SpicyCircuitBreaker, TRANSPORT_FAILURE_STATUSES } from '../src/providers/spicy/circuit-breaker.js';

describe('SpicyCircuitBreaker', () => {
  it('liste les codes déclencheurs exacts de la doc (§7)', () => {
    expect([...TRANSPORT_FAILURE_STATUSES].sort()).toEqual([403, 408, 425, 429, 500, 502, 503, 504]);
  });

  it("reste fermé après un seul échec (seuil de 2)", () => {
    const breaker = new SpicyCircuitBreaker(() => 0.5);
    const t0 = 1_000_000;
    breaker.recordFailure(undefined, t0);
    expect(breaker.isOpen(t0)).toBe(false);
  });

  it('ouvre au premier palier (120s) après 2 échecs consécutifs', () => {
    const breaker = new SpicyCircuitBreaker(() => 0.5); // jitter fixe: facteur 1.0
    const t0 = 1_000_000;
    breaker.recordFailure(undefined, t0);
    breaker.recordFailure(undefined, t0 + 10);
    expect(breaker.isOpen(t0 + 10)).toBe(true);
    expect(breaker.isOpen(t0 + 10 + 120_000 + 1)).toBe(false);
  });

  it('escalade au palier suivant (300s) sur un nouvel échec pendant que le circuit est encore chaud', () => {
    const breaker = new SpicyCircuitBreaker(() => 0.5);
    let t = 1_000_000;
    breaker.recordFailure(undefined, t);
    t += 10;
    breaker.recordFailure(undefined, t); // ouvre à 120s
    t += 121_000; // le circuit est retombé
    breaker.recordFailure(undefined, t); // 3e échec, moins d'1h après le précédent → palier suivant
    expect(breaker.isOpen(t + 300_000 - 1)).toBe(true);
    expect(breaker.isOpen(t + 300_000 + 1)).toBe(false);
  });

  it("respecte retry-after quand il dépasse le palier calculé", () => {
    const breaker = new SpicyCircuitBreaker(() => 0.5);
    const t0 = 1_000_000;
    breaker.recordFailure(undefined, t0);
    breaker.recordFailure(3600, t0 + 10); // retry-after 1h > palier 120s
    expect(breaker.isOpen(t0 + 10 + 3600_000 - 1)).toBe(true);
  });

  it('redescend au premier palier après 1h de calme', () => {
    const breaker = new SpicyCircuitBreaker(() => 0.5);
    let t = 1_000_000;
    breaker.recordFailure(undefined, t);
    breaker.recordFailure(undefined, t + 10); // ouvre au palier 0 (120s)
    t += 10 + 3_600_001; // plus d'1h de calme depuis le dernier échec
    breaker.recordFailure(undefined, t);
    breaker.recordFailure(undefined, t + 10); // 2 échecs à nouveau → repart au palier 0, pas 1
    expect(breaker.isOpen(t + 10 + 120_000 - 1)).toBe(true);
    expect(breaker.isOpen(t + 10 + 120_000 + 1)).toBe(false);
  });

  it('recordSuccess referme le circuit immédiatement', () => {
    const breaker = new SpicyCircuitBreaker(() => 0.5);
    const t0 = 1_000_000;
    breaker.recordFailure(undefined, t0);
    breaker.recordFailure(undefined, t0 + 10);
    expect(breaker.isOpen(t0 + 10)).toBe(true);
    breaker.recordSuccess();
    expect(breaker.isOpen(t0 + 10)).toBe(false);
  });

  it('canProbe autorise une requête sonde au plus 1x/30s quand le circuit est ouvert', () => {
    const breaker = new SpicyCircuitBreaker(() => 0.5);
    const t0 = 1_000_000;
    breaker.recordFailure(undefined, t0);
    breaker.recordFailure(undefined, t0 + 10);
    expect(breaker.canProbe(t0 + 20)).toBe(true); // 1ère sonde
    expect(breaker.canProbe(t0 + 21)).toBe(false); // trop tôt pour la suivante
    expect(breaker.canProbe(t0 + 20 + 30_000)).toBe(true);
  });

  it('canProbe renvoie toujours true circuit fermé', () => {
    const breaker = new SpicyCircuitBreaker();
    expect(breaker.canProbe()).toBe(true);
  });
});
