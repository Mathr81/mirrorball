import { describe, expect, it } from 'vitest';
import { VirtualClock, type ClockObservation } from '../src/playback/virtual-clock.js';

function obs(overrides: Partial<ClockObservation>): ClockObservation {
  return { progressMs: 0, isPlaying: true, receivedAt: 0, rttMs: 0, ...overrides };
}

describe('VirtualClock — avance en temps simulé', () => {
  it('avance au rythme réel (rate=1) tant que rien ne dérive', () => {
    const clock = new VirtualClock();
    clock.resetForTrack(0, true);
    clock.tick(0);
    clock.tick(1000);
    expect(clock.getTimeMs()).toBe(1000);
    expect(clock.getRate()).toBe(1);
  });

  it("n'avance pas tant qu'aucun tick initial n'a établi de référence", () => {
    const clock = new VirtualClock();
    clock.resetForTrack(5000, true);
    clock.tick(1000); // premier tick : établit juste la référence, pas de delta
    expect(clock.getTimeMs()).toBe(5000);
  });
});

describe('VirtualClock — pause / reprise', () => {
  it('se fige sur is_playing:false, sans se remettre à zéro', () => {
    const clock = new VirtualClock();
    clock.resetForTrack(10_000, true);
    clock.tick(0);
    clock.tick(1000); // -> 11000

    clock.observe(obs({ progressMs: 11_000, isPlaying: false, receivedAt: 1000, rttMs: 0 }), 1000);
    clock.tick(1000);
    clock.tick(5000); // 4s d'écoulées, horloge gelée

    expect(clock.getTimeMs()).toBe(11_000);
    expect(clock.isPlaying()).toBe(false);
  });

  it('reprend depuis la position gelée à la reprise (petit drift, pas de saut visible)', () => {
    const clock = new VirtualClock();
    clock.resetForTrack(10_000, true);
    clock.tick(0);
    clock.observe(obs({ progressMs: 10_000, isPlaying: false, receivedAt: 0 }), 0);
    clock.tick(5000); // gelée pendant 5s (temps réel), reste à 10 000

    // Reprise : Spotify renvoie is_playing:true avec un progress cohérent (petit drift).
    clock.observe(obs({ progressMs: 10_010, isPlaying: true, receivedAt: 5000, rttMs: 20 }), 5000);
    expect(clock.getTimeMs()).toBe(10_000); // pas de saut au moment de l'observation elle-même
    expect(clock.isPlaying()).toBe(true);

    clock.tick(6000); // 1s de lecture après la reprise
    expect(clock.getTimeMs()).toBe(11_000);
  });
});

describe('VirtualClock — dérive lente (convergence progressive)', () => {
  it('ajuste le rate proportionnellement à la dérive, sans jamais sauter sous le seuil', () => {
    const clock = new VirtualClock();
    clock.resetForTrack(0, true);
    clock.tick(0);
    clock.tick(1000); // timeMs = 1000

    // Le serveur indique qu'on est en réalité 200ms plus loin (dérive lente, sous le seuil de snap).
    clock.observe(obs({ progressMs: 1200, isPlaying: true, receivedAt: 1000, rttMs: 0 }), 1000);
    expect(clock.getTimeMs()).toBe(1000); // toujours pas de saut
    expect(clock.getRate()).toBeCloseTo(1.05, 5); // clampé à +0.05 (200/2000 = 0.1 > 0.05)
  });

  it('clampe le rate à ±0.05 même pour une dérive proche du seuil de snap', () => {
    const clock = new VirtualClock();
    clock.resetForTrack(0, true);
    clock.tick(0);

    clock.observe(obs({ progressMs: 700, isPlaying: true, receivedAt: 0, rttMs: 0 }), 0);
    expect(clock.getRate()).toBeCloseTo(1.05, 5);

    clock.observe(obs({ progressMs: -700, isPlaying: true, receivedAt: 0, rttMs: 0 }), 0);
    expect(clock.getRate()).toBeCloseTo(0.95, 5);
  });

  it('converge et repasse à rate=1 une fois sous le seuil de ~30ms', () => {
    const clock = new VirtualClock();
    clock.resetForTrack(0, true);
    let simulatedNow = 0;
    clock.tick(simulatedNow);

    // Horloge "vraie" légèrement en avance (40ms) au départ ; on la simule qui avance à rate=1
    // pendant que notre horloge locale, ajustée en continu, doit la rattraper sans jamais sauter.
    let trueProgress = 40;
    for (let i = 0; i < 30; i++) {
      simulatedNow += 100;
      trueProgress += 100;
      clock.tick(simulatedNow);
      clock.observe(obs({ progressMs: trueProgress, isPlaying: true, receivedAt: simulatedNow, rttMs: 0 }), simulatedNow);
    }

    expect(Math.abs(clock.getTimeMs() - trueProgress)).toBeLessThan(30);
    expect(clock.getRate()).toBe(1);
  });
});

describe('VirtualClock — seek', () => {
  it('snap immédiat sur un seek en avant (drift > 750ms)', () => {
    const clock = new VirtualClock();
    clock.resetForTrack(10_000, true);
    clock.tick(0);

    clock.observe(obs({ progressMs: 60_000, isPlaying: true, receivedAt: 0, rttMs: 0 }), 0);
    expect(clock.getTimeMs()).toBe(60_000);
    expect(clock.getRate()).toBe(1);
  });

  it('snap immédiat sur un seek en arrière (drift très négatif)', () => {
    const clock = new VirtualClock();
    clock.resetForTrack(60_000, true);
    clock.tick(0);

    clock.observe(obs({ progressMs: 5_000, isPlaying: true, receivedAt: 0, rttMs: 0 }), 0);
    expect(clock.getTimeMs()).toBe(5_000);
    expect(clock.getRate()).toBe(1);
  });

  it('ne snap PAS pour un drift juste sous le seuil (749ms)', () => {
    const clock = new VirtualClock();
    clock.resetForTrack(0, true);
    clock.tick(0);

    clock.observe(obs({ progressMs: 749, isPlaying: true, receivedAt: 0, rttMs: 0 }), 0);
    expect(clock.getTimeMs()).toBe(0); // pas de saut, juste un ajustement de rate
    expect(clock.getRate()).not.toBe(1);
  });
});

describe('VirtualClock — changement de morceau', () => {
  it('resetForTrack ignore complètement le rate/la position précédente', () => {
    const clock = new VirtualClock();
    clock.resetForTrack(0, true);
    clock.tick(0);
    clock.observe(obs({ progressMs: 700, isPlaying: true, receivedAt: 0 }), 0); // rate != 1
    clock.tick(1); // établit un lastTickAt non nul avec un rate modifié

    clock.resetForTrack(3000, false);
    expect(clock.getTimeMs()).toBe(3000);
    expect(clock.getRate()).toBe(1);
    expect(clock.isPlaying()).toBe(false);

    clock.tick(2); // toujours gelé après le reset
    clock.tick(5000);
    expect(clock.getTimeMs()).toBe(3000);
  });
});

describe('VirtualClock — réponse de polling arrivée en retard', () => {
  it("compense le délai de traitement via receivedAt, sans dérive fantôme", () => {
    const clock = new VirtualClock();
    clock.resetForTrack(5000, true);
    clock.tick(1000); // réf initiale
    clock.tick(1500); // 500ms de lecture réelle -> timeMs = 5500

    // La réponse a été REÇUE à receivedAt=1000 (progress_ms=5000 à cet instant),
    // mais traitée seulement à 1500 (500ms de retard). observe() est appelé à nowMs=1500.
    clock.observe(obs({ progressMs: 5000, isPlaying: true, receivedAt: 1000, rttMs: 0 }), 1500);

    // observedMs = 5000 + (1500-1000) + 0 = 5500 = timeMs actuel : drift nul, pas de saut ni de rate modifié.
    expect(clock.getTimeMs()).toBe(5500);
    expect(clock.getRate()).toBe(1);
  });
});
