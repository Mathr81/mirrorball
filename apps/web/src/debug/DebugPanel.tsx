import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../lyrics/lyrics-client.js';
import type { LyricsState } from '../lyrics/use-lyrics.js';
import type { CurrentlyPlaying } from '../playback/spotify-api.js';

interface Props {
  debug: { driftMs: number; rate: number; rttMs: number };
  track: CurrentlyPlaying | undefined;
  lyrics: LyricsState;
}

/**
 * Panneau de debug demandé par la tâche : drift instantané, rate courant,
 * RTT, source/type des paroles — nécessaire pour régler les seuils de
 * l'horloge en conditions réelles.
 */
export function DebugPanel({ debug, track, lyrics }: Props) {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<unknown>(undefined);

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch(new URL('/api/health', API_BASE_URL));
      setHealth(await res.json());
    } catch {
      setHealth({ error: 'unreachable' });
    }
  }, []);

  useEffect(() => {
    if (open) void refreshHealth();
  }, [open, refreshHealth]);

  return (
    <div className="debug-panel">
      <button type="button" className="debug-panel__toggle" onClick={() => setOpen((o) => !o)}>
        {open ? 'Debug ▲' : 'Debug ▼'}
      </button>
      {open && (
        <div className="debug-panel__content">
          <dl>
            <dt>Drift</dt>
            <dd>{debug.driftMs.toFixed(0)} ms</dd>
            <dt>Rate</dt>
            <dd>{debug.rate.toFixed(3)}</dd>
            <dt>RTT</dt>
            <dd>{debug.rttMs.toFixed(0)} ms</dd>
            <dt>Piste</dt>
            <dd>{track ? `${track.name} — ${track.artists.join(', ')}` : '—'}</dd>
            <dt>Paroles</dt>
            <dd>
              {lyrics.status}
              {lyrics.data ? ` (${lyrics.data.provider}, ${lyrics.data.sync}${lyrics.data.cached ? ', cache' : ''})` : ''}
            </dd>
          </dl>
          {lyrics.attempts.length > 0 && (
            <ul className="debug-panel__attempts">
              {lyrics.attempts.map((a, i) => (
                <li key={i}>
                  {a.provider}: {a.outcome} ({a.ms}ms{a.queuedMs !== undefined ? `, file ${a.queuedMs}ms` : ''})
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => void refreshHealth()}>
            Rafraîchir /api/health
          </button>
          <pre className="debug-panel__health">{health ? JSON.stringify(health, null, 2) : 'chargement…'}</pre>
        </div>
      )}
    </div>
  );
}
