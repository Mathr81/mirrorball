import { useEffect, useRef } from 'react';

/**
 * Écran allumé pendant la lecture. Repli silencieux si l'API est absente
 * (cf. tâche) — pas de détection de support affichée à l'utilisateur.
 * Le verrou est automatiquement relâché par le navigateur quand l'onglet
 * devient invisible : on le redemande au retour si `active` est toujours vrai.
 */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Refus (économie d'énergie, non-secure context…) : dégradation silencieuse.
      }
    };

    void acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !sentinelRef.current) void acquire();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinelRef.current?.release();
      sentinelRef.current = null;
    };
  }, [active]);
}
