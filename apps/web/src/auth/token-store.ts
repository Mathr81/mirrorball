export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Timestamp epoch ms. */
  expiresAt: number;
}

interface PendingPkce {
  codeVerifier: string;
  state: string;
}

const TOKENS_KEY = 'mirrorball.spotify.tokens';
const PENDING_PKCE_KEY = 'mirrorball.spotify.pending-pkce';

/**
 * `localStorage`, pas juste la mémoire : en standalone iOS, la redirection
 * vers accounts.spotify.com peut revenir après un rechargement complet de
 * l'app (cf. docs de la tâche, point de vigilance OAuth PWA), qui viderait
 * n'importe quel état en mémoire.
 */
export function getStoredTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

export function setStoredTokens(tokens: StoredTokens): void {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // Repli silencieux : l'utilisateur devra simplement se reconnecter plus souvent.
  }
}

export function clearStoredTokens(): void {
  try {
    localStorage.removeItem(TOKENS_KEY);
  } catch {
    // ignore
  }
}

export function setPendingPkce(pending: PendingPkce): void {
  try {
    localStorage.setItem(PENDING_PKCE_KEY, JSON.stringify(pending));
  } catch {
    // ignore
  }
}

export function getPendingPkce(): PendingPkce | null {
  try {
    const raw = localStorage.getItem(PENDING_PKCE_KEY);
    return raw ? (JSON.parse(raw) as PendingPkce) : null;
  } catch {
    return null;
  }
}

export function clearPendingPkce(): void {
  try {
    localStorage.removeItem(PENDING_PKCE_KEY);
  } catch {
    // ignore
  }
}
