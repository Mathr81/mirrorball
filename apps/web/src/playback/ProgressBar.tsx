import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { formatTime } from '../ui/format.js';

interface Props {
  positionMs: number;
  durationMs: number;
  disabled: boolean;
  /** Durée restante à droite plutôt que durée totale. */
  showRemaining: boolean;
  onToggleRemaining: () => void;
  onSeek: (positionMs: number) => void;
}

/** Pas du déplacement au clavier — aligné sur les raccourcis globaux ←/→. */
const KEY_STEP_MS = 5000;
/** Au-delà, on considère que Spotify n'a pas confirmé le déplacement et on relâche l'affichage optimiste. */
const PENDING_TIMEOUT_MS = 2500;
const PENDING_TOLERANCE_MS = 1500;

/**
 * Barre de progression scrutable. Pendant le glissement — et jusqu'à ce que le
 * poller confirme la nouvelle position — c'est la valeur locale qui s'affiche :
 * sinon la tête de lecture reviendrait en arrière une fraction de seconde
 * après le relâchement, le temps de l'aller-retour avec Spotify.
 */
export function ProgressBar({ positionMs, durationMs, disabled, showRemaining, onToggleRemaining, onSeek }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [pending, setPending] = useState<{ value: number; at: number } | null>(null);

  useEffect(() => {
    if (!pending) return;
    if (Math.abs(positionMs - pending.value) < PENDING_TOLERANCE_MS) setPending(null);
  }, [positionMs, pending]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(null), PENDING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const value = drag ?? pending?.value ?? positionMs;
  const ratio = durationMs > 0 ? Math.min(1, Math.max(0, value / durationMs)) : 0;

  const positionFromEvent = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * durationMs;
    },
    [durationMs],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || durationMs <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag(positionFromEvent(event.clientX));
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    setDrag(positionFromEvent(event.clientX));
  };

  const commit = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const target = positionFromEvent(event.clientX);
    setDrag(null);
    setPending({ value: target, at: Date.now() });
    onSeek(target);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled || durationMs <= 0) return;
    const target =
      event.key === 'ArrowLeft'
        ? value - KEY_STEP_MS
        : event.key === 'ArrowRight'
          ? value + KEY_STEP_MS
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? durationMs
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    const clamped = Math.min(durationMs, Math.max(0, target));
    setPending({ value: clamped, at: Date.now() });
    onSeek(clamped);
  };

  return (
    <div className={`progress${disabled ? ' progress--disabled' : ''}${drag !== null ? ' progress--dragging' : ''}`}>
      <div
        ref={trackRef}
        className="progress__track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Position dans le morceau"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(value / 1000)}
        aria-valuetext={formatTime(value)}
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={commit}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={handleKeyDown}
      >
        <div className="progress__fill" style={{ width: `${ratio * 100}%` }} />
        <div className="progress__thumb" style={{ left: `${ratio * 100}%` }} />
      </div>
      <div className="progress__times">
        <span className="progress__time">{formatTime(value)}</span>
        <button
          type="button"
          className="progress__time progress__time--button"
          onClick={onToggleRemaining}
          title={showRemaining ? 'Afficher la durée totale' : 'Afficher la durée restante'}
        >
          {showRemaining ? `-${formatTime(Math.max(0, durationMs - value))}` : formatTime(durationMs)}
        </button>
      </div>
    </div>
  );
}
