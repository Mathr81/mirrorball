import { useEffect, useState, type CSSProperties } from 'react';
import type { Palette } from '../color/palette.js';

interface Props {
  palette: Palette;
  /** Faux : fond strictement sombre, aucun halo ni animation (réglage « sobre »). */
  enabled: boolean;
}

interface LayerState {
  layers: [Palette, Palette];
  active: 0 | 1;
}

/**
 * Ambiance de fond dérivée de la pochette : trois halos très flous qui dérivent
 * lentement. Le changement de morceau ne peut pas être une bascule sèche de
 * couleurs — deux couches sont empilées, la nouvelle palette est peinte sur
 * celle du dessous puis les opacités se croisent.
 */
export function AmbientBackdrop({ palette, enabled }: Props) {
  const [state, setState] = useState<LayerState>({ layers: [palette, palette], active: 0 });

  useEffect(() => {
    setState((current) => {
      if (current.layers[current.active] === palette) return current;
      return current.active === 0
        ? { layers: [current.layers[0], palette], active: 1 }
        : { layers: [palette, current.layers[1]], active: 0 };
    });
  }, [palette]);

  return (
    <div className={`backdrop${enabled ? '' : ' backdrop--plain'}`} aria-hidden="true">
      {enabled &&
        state.layers.map((layer, index) => (
          <div
            key={index}
            className={`backdrop__layer${state.active === index ? ' is-active' : ''}`}
            style={
              {
                '--blob-1': layer.blobs[0],
                '--blob-2': layer.blobs[1],
                '--blob-3': layer.blobs[2],
              } as CSSProperties
            }
          >
            <span className="backdrop__blob backdrop__blob--a" />
            <span className="backdrop__blob backdrop__blob--b" />
            <span className="backdrop__blob backdrop__blob--c" />
          </div>
        ))}
      <div className="backdrop__vignette" />
      <div className="backdrop__grain" />
    </div>
  );
}
