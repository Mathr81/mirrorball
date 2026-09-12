import { describe, expect, it } from 'vitest';
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../src/auth/pkce.js';

describe('generateCodeVerifier', () => {
  it('produit une chaîne base64url (pas de +, /, =) de longueur suffisante (RFC 7636 : 43-128)', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produit une valeur différente à chaque appel', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe('generateCodeChallenge', () => {
  it('est déterministe (S256) pour un même verifier', async () => {
    const verifier = 'a'.repeat(64);
    const a = await generateCodeChallenge(verifier);
    const b = await generateCodeChallenge(verifier);
    expect(a).toBe(b);
  });

  it('diffère pour des verifiers différents', async () => {
    const a = await generateCodeChallenge('verifier-a-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const b = await generateCodeChallenge('verifier-b-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(a).not.toBe(b);
  });

  it('correspond au vecteur de test officiel RFC 7636 (annexe B)', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(await generateCodeChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('generateState', () => {
  it('produit une valeur non triviale et différente à chaque appel', () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });
});
