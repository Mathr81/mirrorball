import { useEffect, useRef } from 'react';
import type { LyricsSize, SettingsApi } from '../settings/use-settings.js';
import { CloseIcon, KeyboardIcon, LogoutIcon } from '../ui/icons.js';

interface Props extends SettingsApi {
  open: boolean;
  onClose: () => void;
  onShowShortcuts: () => void;
  onLogout: () => void;
}

const SIZES: Array<{ value: LyricsSize; label: string }> = [
  { value: 'sm', label: 'Petit' },
  { value: 'md', label: 'Moyen' },
  { value: 'lg', label: 'Grand' },
];

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: () => void; label: string; hint?: string }) {
  return (
    <label className="field field--switch">
      <span className="field__text">
        <span className="field__label">{label}</span>
        {hint && <span className="field__hint">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

/** Tiroir de réglages : tout ce qui change l'apparence, plus la déconnexion. */
export function SettingsPanel({ open, onClose, onShowShortcuts, onLogout, settings, update, toggle }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <>
      <div className={`scrim${open ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={`settings${open ? ' is-open' : ''}`}
        role="dialog"
        aria-label="Réglages"
        aria-modal="false"
        /* Fermé, le tiroir reste dans le DOM pour l'animation de sortie : c'est
           `visibility: hidden` (CSS) qui le sort de l'ordre de tabulation. */
        tabIndex={-1}
      >
        <header className="settings__header">
          <h2>Réglages</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer les réglages">
            <CloseIcon />
          </button>
        </header>

        <div className="settings__body">
          <section className="settings__section">
            <h3>Paroles</h3>
            <div className="field">
              <span className="field__label">Taille du texte</span>
              <div className="segmented" role="group" aria-label="Taille du texte des paroles">
                {SIZES.map((size) => (
                  <button
                    key={size.value}
                    type="button"
                    className={`segmented__option${settings.lyricsSize === size.value ? ' is-active' : ''}`}
                    aria-pressed={settings.lyricsSize === size.value}
                    onClick={() => update({ lyricsSize: size.value })}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settings__section">
            <h3>Ambiance</h3>
            <Switch
              label="Fond animé"
              hint="Halos colorés dérivés de la pochette"
              checked={settings.ambient}
              onChange={() => toggle('ambient')}
            />
            <Switch
              label="Accent depuis la pochette"
              hint="Sinon, un blanc neutre"
              checked={settings.accentFromArtwork}
              onChange={() => toggle('accentFromArtwork')}
            />
            <Switch
              label="Mode immersif"
              hint="Les paroles occupent tout l'écran"
              checked={settings.immersive}
              onChange={() => toggle('immersive')}
            />
          </section>

          <section className="settings__section">
            <h3>Avancé</h3>
            <Switch
              label="Panneau de debug"
              hint="Dérive de l'horloge, RTT, fournisseurs"
              checked={settings.showDebug}
              onChange={() => toggle('showDebug')}
            />
            <button type="button" className="button button--ghost" onClick={onShowShortcuts}>
              <KeyboardIcon />
              Raccourcis clavier
            </button>
          </section>

          <section className="settings__section">
            <button type="button" className="button button--ghost button--danger" onClick={onLogout}>
              <LogoutIcon />
              Déconnexion
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
