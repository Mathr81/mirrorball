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
 * Panneau de debug : drift instantané, rate courant, RTT, source/type des
 * paroles — nécessaire pour régler les seuils de l'horloge en conditions
 * réelles. Masqué par défaut, il s'active dans les réglages (ou avec « D »).
 */
export function DebugPanel({ debug, track, lyrics }: Props) {
  const [health, setHealth] = useState<unknown>(undefined);
  const [healthOpen, setHealthOpen] = useState(false);

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch(new URL('/api/health', API_BASE_URL));
      setHealth(await res.json());
    } catch {
      setHealth({ error: 'unreachable' });
    }
  }, []);

  useEffect(() => {
    if (healthOpen) void refreshHealth();
  }, [healthOpen, refreshHealth]);

  return (
    <div className="debug">
      <p className="debug__title">Debug</p>
      <dl className="debug__grid">
        <dt>Drift</dt>
        <dd>{debug.driftMs.toFixed(0)} ms</dd>
        <dt>Rate</dt>
        <dd>{debug.rate.toFixed(3)}</dd>
        <dt>RTT</dt>
        <dd>{debug.rttMs.toFixed(0)} ms</dd>
        <dt>Piste</dt>
        <dd className="debug__truncate">{track ? `${track.name} — ${track.artists.join(', ')}` : '—'}</dd>
        <dt>Paroles</dt>
        <dd>
          {lyrics.status}
          {lyrics.data ? ` (${lyrics.data.provider}, ${lyrics.data.sync}${lyrics.data.cached ? ', cache' : ''})` : ''}
        </dd>
      </dl>
      {lyrics.attempts.length > 0 && (
        <ul className="debug__attempts">
          {lyrics.attempts.map((a, i) => (
            <li key={i}>
              <span>{a.provider}</span>
              {a.outcome} · {a.ms}ms{a.queuedMs !== undefined ? ` · file ${a.queuedMs}ms` : ''}
            </li>
          ))}
        </ul>
      )}
      <div className="debug__actions">
        <button type="button" className="debug__button" onClick={() => setHealthOpen((open) => !open)}>
          {healthOpen ? 'Masquer /api/health' : 'Voir /api/health'}
        </button>
        {healthOpen && (
          <button type="button" className="debug__button" onClick={() => void refreshHealth()}>
            Rafraîchir
          </button>
        )}
      </div>
      {healthOpen && <pre className="debug__health">{health ? JSON.stringify(health, null, 2) : 'chargement…'}</pre>}
    </div>
  );
}
