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

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="row row--switch">
      <span className="row__label">{label}</span>
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
            <div className="group">
              <div className="row">
                <span className="row__label">Taille du texte</span>
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
              <Switch label="Mode immersif" checked={settings.immersive} onChange={() => toggle('immersive')} />
            </div>
          </section>

          <section className="settings__section">
            <h3>Ambiance</h3>
            <div className="group">
              <Switch label="Fond animé" checked={settings.ambient} onChange={() => toggle('ambient')} />
              <Switch label="Accent depuis la pochette" checked={settings.accentFromArtwork} onChange={() => toggle('accentFromArtwork')} />
            </div>
            <p className="settings__footnote">Le fond reprend la pochette du morceau, floutée et animée en continu.</p>
          </section>

          <section className="settings__section">
            <div className="group">
              <Switch label="Panneau de debug" checked={settings.showDebug} onChange={() => toggle('showDebug')} />
              <button type="button" className="row row--action" onClick={onShowShortcuts}>
                <span className="row__label">Raccourcis clavier</span>
                <KeyboardIcon />
              </button>
            </div>
          </section>

          <section className="settings__section">
            <div className="group">
              <button type="button" className="row row--action row--danger" onClick={onLogout}>
                <span className="row__label">Déconnexion</span>
                <LogoutIcon />
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
