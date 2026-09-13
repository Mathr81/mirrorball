import { useCallback, useRef, useState } from 'react';

export type ToastTone = 'info' | 'warn' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const VISIBLE_MS = 5000;

export interface ToastsApi {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

/**
 * Messages transitoires (perte de réseau, commande refusée par Spotify…).
 * Un même message déjà affiché est simplement prolongé : un poller qui échoue
 * en boucle ne doit pas empiler dix bandeaux identiques.
 */
export function useToasts(): ToastsApi {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<ToastsApi['push']>(
    (message, tone = 'info') => {
      let id = -1;
      setToasts((current) => {
        const existing = current.find((toast) => toast.message === message);
        if (existing) {
          id = existing.id;
          return current;
        }
        id = nextId.current;
        nextId.current += 1;
        return [...current, { id, message, tone }];
      });

      if (id < 0) return;
      const previous = timers.current.get(id);
      if (previous !== undefined) window.clearTimeout(previous);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), VISIBLE_MS),
      );
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}
