import type { ReactNode } from 'react';

/**
 * Icônes inline (pas de dépendance ni de requête réseau) — toutes dessinées
 * sur une grille 24×24, trait de 1.75 pour rester lisibles une fois mises à
 * l'échelle sur les gros boutons tactiles de l'iPad.
 */
interface IconProps {
  className?: string | undefined;
}

function Svg({ children, className }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.52.86l11.14-6.86a1 1 0 0 0 0-1.72L9.52 4.28A1 1 0 0 0 8 5.14Z" fill="currentColor" />
    </Svg>
  );
}

export function PauseIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="6.5" y="4.5" width="4" height="15" rx="1.6" fill="currentColor" />
      <rect x="13.5" y="4.5" width="4" height="15" rx="1.6" fill="currentColor" />
    </Svg>
  );
}

export function PreviousIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="5" width="2.6" height="14" rx="1.3" fill="currentColor" />
      <path d="M20 6.6v10.8a1 1 0 0 1-1.53.85l-8.6-5.4a1 1 0 0 1 0-1.7l8.6-5.4A1 1 0 0 1 20 6.6Z" fill="currentColor" />
    </Svg>
  );
}

export function NextIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="17.4" y="5" width="2.6" height="14" rx="1.3" fill="currentColor" />
      <path d="M4 6.6v10.8a1 1 0 0 0 1.53.85l8.6-5.4a1 1 0 0 0 0-1.7l-8.6-5.4A1 1 0 0 0 4 6.6Z" fill="currentColor" />
    </Svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3.1" />
        <path d="M19.4 13.9a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10a1.7 1.7 0 0 0 1-1.56V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.56 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03Z" />
      </g>
    </Svg>
  );
}

export function ExpandIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4" />
      </g>
    </Svg>
  );
}

export function CollapseIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9h4a1 1 0 0 0 1-1V4M20 9h-4a1 1 0 0 1-1-1V4M4 15h4a1 1 0 0 1 1 1v4M20 15h-4a1 1 0 0 0-1 1v4" />
      </g>
    </Svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </Svg>
  );
}

export function DiscIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="8.4" />
        <circle cx="12" cy="12" r="2.6" />
        <path d="M12 3.6a8.4 8.4 0 0 1 0 16.8" strokeDasharray="2 3" strokeLinecap="round" opacity=".7" />
      </g>
    </Svg>
  );
}

export function OfflineIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3.5 21 21M8.6 15.4a4.8 4.8 0 0 1 4.9-1.1M5.2 11.6a9.6 9.6 0 0 1 3.4-2.1m4-.6a9.6 9.6 0 0 1 6.2 2.7M2 8.2A14.4 14.4 0 0 1 7 5.3m5-.7a14.4 14.4 0 0 1 10 3.6" />
        <circle cx="12" cy="18.8" r=".9" fill="currentColor" stroke="none" />
      </g>
    </Svg>
  );
}

export function SpotifyIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.59 14.43a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 1 1-.33-1.46c4.57-1.04 8.5-.59 11.66 1.34.35.22.46.68.25 1.03Zm1.22-2.72a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 1 1-.54-1.79c4.36-1.32 9.78-.68 13.49 1.6.44.27.58.85.31 1.28Zm.11-2.84C14.05 8.57 7.9 8.36 4.2 9.48a1.12 1.12 0 1 1-.65-2.15C7.8 6.04 14.6 6.29 19.05 8.93a1.12 1.12 0 1 1-1.14 1.94Z"
      />
    </Svg>
  );
}

export function KeyboardIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="2.6" y="6" width="18.8" height="12" rx="2.4" />
        <path d="M6.5 9.6h.01M10 9.6h.01M13.5 9.6h.01M17 9.6h.01M6.5 12.8h.01M10 12.8h.01M13.5 12.8h.01M17 12.8h.01M8.4 15.8h7.2" />
      </g>
    </Svg>
  );
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 8.2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6.5a2 2 0 0 0 2-2v-2.2M10 12h10m0 0-3-3m3 3-3 3" />
      </g>
    </Svg>
  );
}
