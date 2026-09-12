import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpicySessionStore, type SpicyRpcCaller } from '../src/providers/spicy/session-store.js';
import type { SpicyRpcResult } from '../src/providers/spicy/client.js';

const CONFIG = { pingIntervalMs: 1000, minPingIntervalMs: 500, sessionTtlSeconds: 10, refreshAtTtlFraction: 0.5 };

function ok(data: unknown): SpicyRpcResult {
  return { httpStatus: 200, data };
}

describe('SpicySessionStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('crée une session au démarrage (createSession), puis ping périodiquement', async () => {
    const calls: string[] = [];
    const rpc: SpicyRpcCaller = vi.fn(async (op) => {
      calls.push(op);
      if (op === 'pingConfig') return ok(CONFIG);
      if (op === 'createSession') return ok({ tk: 'tk-1' });
      if (op === 'ping') return ok({});
      return ok({});
    });

    const store = new SpicySessionStore(rpc);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.isAlive()).toBe(true);
    expect(calls).toContain('createSession');

    calls.length = 0;
    await vi.advanceTimersByTimeAsync(CONFIG.pingIntervalMs);
    expect(calls).toEqual(['ping']);

    store.stop();
  });

  it('appelle refreshSession une fois le seuil de TTL atteint, et met à jour le tk', async () => {
    const rpc: SpicyRpcCaller = vi.fn(async (op) => {
      if (op === 'pingConfig') return ok(CONFIG);
      if (op === 'createSession') return ok({ tk: 'tk-1' });
      if (op === 'refreshSession') return ok({ tk: 'tk-2' });
      return ok({});
    });

    const store = new SpicySessionStore(rpc);
    store.start();
    await vi.advanceTimersByTimeAsync(0); // createSession

    // Seuil de refresh : refreshAtTtlFraction (0.5) * ttl (10s) = 5s après createSession.
    await vi.advanceTimersByTimeAsync(CONFIG.pingIntervalMs * 6);

    expect(rpc).toHaveBeenCalledWith('refreshSession', expect.objectContaining({ tk: 'tk-1' }));
    expect(store.isAlive()).toBe(true);
    store.stop();
  });

  it('recrée une session (createSession) après un ping en 403 (session morte côté serveur)', async () => {
    let pingCount = 0;
    const rpc: SpicyRpcCaller = vi.fn(async (op) => {
      if (op === 'pingConfig') return ok(CONFIG);
      if (op === 'createSession') return ok({ tk: 'tk-1' });
      if (op === 'ping') {
        pingCount++;
        return { httpStatus: 403, data: null };
      }
      return ok({});
    });

    const store = new SpicySessionStore(rpc);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.isAlive()).toBe(true);

    await vi.advanceTimersByTimeAsync(CONFIG.pingIntervalMs); // ping → 403 → tk effacé
    expect(pingCount).toBe(1);
    expect(store.isAlive()).toBe(false);

    await vi.advanceTimersByTimeAsync(CONFIG.pingIntervalMs); // prochain tick → createSession
    expect(store.isAlive()).toBe(true);
    store.stop();
  });

  it('se dégrade silencieusement si createSession échoue (rejette), et retente au prochain tick', async () => {
    let attempt = 0;
    const rpc: SpicyRpcCaller = vi.fn(async (op) => {
      if (op === 'pingConfig') return ok(CONFIG);
      if (op === 'createSession') {
        attempt++;
        if (attempt === 1) throw new Error('network down');
        return ok({ tk: 'tk-1' });
      }
      return ok({});
    });

    const store = new SpicySessionStore(rpc);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.isAlive()).toBe(false);

    await vi.advanceTimersByTimeAsync(CONFIG.pingIntervalMs);
    expect(store.isAlive()).toBe(true);
    store.stop();
  });

  it('stop() arrête la maintenance en tâche de fond', async () => {
    const rpc: SpicyRpcCaller = vi.fn(async (op) => {
      if (op === 'pingConfig') return ok(CONFIG);
      if (op === 'createSession') return ok({ tk: 'tk-1' });
      return ok({});
    });

    const store = new SpicySessionStore(rpc);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    store.stop();

    const callsBefore = (rpc as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(CONFIG.pingIntervalMs * 5);
    expect((rpc as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });
});
