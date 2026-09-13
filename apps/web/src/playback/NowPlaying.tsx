import type { Settings } from '../settings/use-settings.js';
import { DiscIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '../ui/icons.js';
import { ProgressBar } from './ProgressBar.js';
import type { CurrentlyPlaying } from './spotify-api.js';
import type { TransportCommand } from './use-playback-clock.js';

interface Props {
  track: CurrentlyPlaying | undefined;
  currentTimeMs: number;
  isPlaying: boolean;
  pending: TransportCommand | undefined;
  settings: Settings;
  onToggleRemaining: () => void;
  onSeek: (positionMs: number) => void;
  onCommand: (command: TransportCommand) => void;
}

/** Artistes et album sur une seule ligne, comme la vue « en cours de lecture » d'Apple Music. */
function subtitle(track: CurrentlyPlaying | undefined): string {
  if (!track) return '';
  const artists = track.artists.join(', ');
  return track.albumName && track.albumName !== track.name ? `${artists} — ${track.albumName}` : artists;
}

/**
 * Volet « lecture en cours » : pochette, métadonnées, progression scrutable et
 * transport. Tout ce qui pilote réellement Spotify est ici — le reste de
 * l'écran est consacré aux paroles.
 */
export function NowPlaying({ track, currentTimeMs, isPlaying, pending, settings, onToggleRemaining, onSeek, onCommand }: Props) {
  const busy = pending !== undefined;
  const disabled = !track;

  return (
    <div className="now-playing">
      <div className="now-playing__art">
        {track?.albumImageUrl ? (
          <img
            className="now-playing__cover"
            /* Remonte le morceau sur la clé : la pochette se fond au lieu d'apparaître d'un coup. */
            key={track.albumImageUrl}
            src={track.albumImageUrl}
            alt={`Pochette de ${track.albumName}`}
            draggable={false}
          />
        ) : (
          <div className="now-playing__cover now-playing__cover--empty">
            <DiscIcon className="now-playing__cover-icon" />
          </div>
        )}
      </div>

      <div className="now-playing__meta">
        <h1 className="now-playing__title" title={track?.name ?? ''}>
          {track?.name ?? 'Aucune lecture en cours'}
        </h1>
        <p className="now-playing__artists" title={subtitle(track)}>
          {track ? subtitle(track) : 'Lance un morceau sur Spotify'}
        </p>
      </div>

      <ProgressBar
        positionMs={track ? currentTimeMs : 0}
        durationMs={track?.durationMs ?? 0}
        disabled={disabled}
        showRemaining={settings.showRemaining}
        onToggleRemaining={onToggleRemaining}
        onSeek={onSeek}
      />

      <div className="transport">
        <button
          type="button"
          className="transport__button"
          onClick={() => onCommand('previous')}
          disabled={disabled || busy}
          aria-label="Morceau précédent"
          title="Morceau précédent (P)"
        >
          <PreviousIcon />
        </button>
        <button
          type="button"
          className="transport__button transport__button--primary"
          onClick={() => onCommand(isPlaying ? 'pause' : 'play')}
          disabled={disabled}
          aria-label={isPlaying ? 'Mettre en pause' : 'Reprendre la lecture'}
          title={`${isPlaying ? 'Pause' : 'Lecture'} (Espace)`}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className="transport__button"
          onClick={() => onCommand('next')}
          disabled={disabled || busy}
          aria-label="Morceau suivant"
          title="Morceau suivant (N)"
        >
          <NextIcon />
        </button>
      </div>
    </div>
  );
}
