import { CloseIcon } from './icons.js';
import type { ToastsApi } from './use-toasts.js';

/** Bandeaux transitoires, empilés en bas de l'écran, jamais bloquants. */
export function Toasts({ toasts, dismiss }: Pick<ToastsApi, 'toasts' | 'dismiss'>) {
  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <span>{toast.message}</span>
          <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Fermer">
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
