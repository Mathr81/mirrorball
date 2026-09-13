import { CloseIcon } from '../ui/icons.js';

const SHORTCUTS: Array<[string, string]> = [
  ['Espace', 'Lecture / pause'],
  ['← / →', 'Reculer / avancer de 5 s'],
  ['P / N', 'Morceau précédent / suivant'],
  ['F', 'Mode immersif'],
  ['D', 'Panneau de debug'],
  ['?', 'Cette aide'],
  ['Échap', 'Fermer les panneaux'],
];

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="overlay" role="dialog" aria-label="Raccourcis clavier" onClick={onClose}>
      <div className="overlay__card" onClick={(event) => event.stopPropagation()}>
        <header className="overlay__header">
          <h2>Raccourcis</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
            <CloseIcon />
          </button>
        </header>
        <dl className="shortcuts">
          {SHORTCUTS.map(([keys, label]) => (
            <div className="shortcuts__row" key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
