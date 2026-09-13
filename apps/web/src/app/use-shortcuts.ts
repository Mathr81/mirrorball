import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  togglePlay: () => void;
  seekBy: (deltaMs: number) => void;
  next: () => void;
  previous: () => void;
  toggleImmersive: () => void;
  toggleDebug: () => void;
  toggleHelp: () => void;
  escape: () => void;
}

const SEEK_STEP_MS = 5000;

/**
 * Raccourcis globaux. Ignore tout ce qui part d'un champ de saisie ou porte un
 * modificateur, pour ne jamais voler un raccourci du navigateur.
 *
 * `enabled` ne concerne que les raccourcis d'action : Échap reste actif en
 * permanence, puisque c'est précisément ce qui referme le panneau qui a
 * désactivé les autres.
 */
export function useShortcuts(handlers: ShortcutHandlers, enabled: boolean): void {
  // Le lecteur se re-rend à chaque frame (horloge interpolée) : les handlers
  // passent par une ref pour ne pas ré-abonner l'écouteur 60 fois par seconde.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;

      const handlers = handlersRef.current;
      if (event.key === 'Escape') {
        handlers.escape();
        return;
      }
      if (!enabled) return;

      switch (event.key) {
        case ' ':
        case 'Spacebar':
          event.preventDefault();
          handlers.togglePlay();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          handlers.seekBy(-SEEK_STEP_MS);
          break;
        case 'ArrowRight':
          event.preventDefault();
          handlers.seekBy(SEEK_STEP_MS);
          break;
        case 'n':
        case 'N':
          handlers.next();
          break;
        case 'p':
        case 'P':
          handlers.previous();
          break;
        case 'f':
        case 'F':
          handlers.toggleImmersive();
          break;
        case 'd':
        case 'D':
          handlers.toggleDebug();
          break;
        case '?':
          handlers.toggleHelp();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
