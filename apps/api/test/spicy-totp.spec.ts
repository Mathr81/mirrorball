import { describe, expect, it } from 'vitest';
import { hotp, totp } from '../src/providers/spicy/totp.js';

// Vecteurs de test RFC 6238 Annexe B (SHA-1, secret ASCII "12345678901234567890", 8 chiffres).
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('totp — vecteurs RFC 6238 (SHA-1)', () => {
  it.each([
    [59_000, '94287082'],
    [1_111_111_109_000, '07081804'],
    [1_111_111_111_000, '14050471'],
    [1_234_567_890_000, '89005924'],
    [2_000_000_000_000, '69279037'],
  ])('T=%i → %s', (timeMs, expected) => {
    expect(totp(RFC_SECRET, timeMs, 30, 8)).toBe(expected);
  });
});

describe('hotp — vecteurs RFC 4226 (compteurs 0 à 3)', () => {
  const RFC4226_SECRET = Buffer.from('12345678901234567890', 'ascii');
  it.each([
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [3, '969429'],
  ])('compteur=%i → %s', (counter, expected) => {
    expect(hotp(RFC4226_SECRET, counter, 6)).toBe(expected);
  });
});
