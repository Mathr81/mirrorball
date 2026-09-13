import { useCallback, useEffect, useState } from 'react';

export type LyricsSize = 'sm' | 'md' | 'lg';

export interface Settings {
  /** Échelle de la typographie des paroles. */
  lyricsSize: LyricsSize;
  /** Halos animés dérivés de la pochette (désactivable pour un fond strictement noir). */
  ambient: boolean;
  /** Accent repris de la pochette, sinon blanc neutre. */
  accentFromArtwork: boolean;
  /** Mode immersif : le volet « lecture en cours » s'efface, les paroles prennent tout l'écran. */
  immersive: boolean;
  /** Panneau de debug (drift/rate/RTT) — masqué par défaut. */
  showDebug: boolean;
  /** Durée restante plutôt que durée totale à droite de la barre de progression. */
  showRemaining: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lyricsSize: 'md',
  ambient: true,
  accentFromArtwork: true,
  immersive: false,
  showDebug: false,
  showRemaining: false,
};

const STORAGE_KEY = 'mirrorball:settings:v1';

function read(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return sanitize(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Les réglages persistés peuvent dater d'une version antérieure : chaque champ est revalidé, jamais fait confiance en bloc. */
export function sanitize(value: unknown): Settings {
  if (typeof value !== 'object' || value === null) return DEFAULT_SETTINGS;
  const input = value as Record<string, unknown>;
  const bool = (key: keyof Settings): boolean =>
    typeof input[key] === 'boolean' ? (input[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean);

  return {
    lyricsSize: input.lyricsSize === 'sm' || input.lyricsSize === 'md' || input.lyricsSize === 'lg' ? input.lyricsSize : DEFAULT_SETTINGS.lyricsSize,
    ambient: bool('ambient'),
    accentFromArtwork: bool('accentFromArtwork'),
    immersive: bool('immersive'),
    showDebug: bool('showDebug'),
    showRemaining: bool('showRemaining'),
  };
}

export interface SettingsApi {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  toggle: (key: 'ambient' | 'accentFromArtwork' | 'immersive' | 'showDebug' | 'showRemaining') => void;
}

export function useSettings(): SettingsApi {
  const [settings, setSettings] = useState<Settings>(read);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Mode privé / quota : les réglages restent valables pour la session.
    }
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const toggle = useCallback<SettingsApi['toggle']>((key) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  return { settings, update, toggle };
}
