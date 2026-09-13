import { useEffect, useState } from 'react';

const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Vrai après `delayMs` sans aucune interaction. Sert à effacer les commandes
 * flottantes pendant l'écoute (usage principal : l'iPad posé sur un support,
 * on ne veut voir que les paroles) — l'UI revient au premier geste.
 */
export function useIdle(delayMs: number, enabled: boolean): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIdle(false);
      return;
    }

    let timer = window.setTimeout(() => setIdle(true), delayMs);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), delayMs);
    };

    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, wake, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, wake);
    };
  }, [delayMs, enabled]);

  return idle;
}
