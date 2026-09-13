import { describe, expect, it } from 'vitest';
import { formatTime, providerLabel, syncLabel } from '../src/ui/format.js';

describe('formatTime', () => {
  it('formate en m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9_000)).toBe('0:09');
    expect(formatTime(65_400)).toBe('1:05');
    expect(formatTime(214_000)).toBe('3:34');
  });

  it('passe en h:mm:ss au-delà de l\'heure', () => {
    expect(formatTime(3_600_000)).toBe('1:00:00');
    expect(formatTime(3_725_000)).toBe('1:02:05');
  });

  it('ne rend jamais de durée négative (horloge interpolée légèrement en avance)', () => {
    expect(formatTime(-500)).toBe('0:00');
  });
});

describe('libellés', () => {
  it('traduit les niveaux de synchro connus, laisse les autres tels quels', () => {
    expect(syncLabel('syllable')).toBe('Mot à mot');
    expect(syncLabel('line')).toBe('Par ligne');
    expect(syncLabel('inconnu')).toBe('inconnu');
  });

  it('affiche le nom public des fournisseurs', () => {
    expect(providerLabel('kpoe')).toBe('KPoe');
    expect(providerLabel('lrclib')).toBe('LRCLIB');
    expect(providerLabel('autre')).toBe('autre');
  });
});
