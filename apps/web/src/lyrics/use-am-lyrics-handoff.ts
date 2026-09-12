import { useEffect, useState } from 'react';

type Phase = 'mount' | 'ttml-applied' | 'clock-fed';

/**
 * Contournement d'un bug constaté empiriquement dans @uimaxbai/am-lyrics
 * v1.6.3 : son `connectedCallback` appelle `fetchLyrics()` de façon
 * synchrone dès la connexion au DOM, AVANT que React (via @lit/react) n'ait
 * eu l'occasion de poser la propriété `ttml` — ce premier appel voit donc
 * toujours un `ttml` vide et échoue silencieusement (« No lyrics found »).
 * Le seul autre déclencheur de `fetchLyrics()`, dans `updated()`, est
 * gardé par `!changedProperties.has('currentTime')` — or `currentTime`
 * apparaît TOUJOURS dans les `changedProperties` de la toute première mise
 * à jour Lit d'une instance neuve (propriété à accesseur), qu'on la passe
 * ou non. Résultat : passer `ttml` et `currentTime` ensemble dès le
 * montage bloque `fetchLyrics()` indéfiniment pour cette instance.
 *
 * Contournement en trois temps, un `requestAnimationFrame` chacun : on
 * monte avec `ttml=''` (laisse passer, sans effet, le premier cycle Lit qui
 * porte le parasitage de `currentTime`) ; puis on pose le vrai `ttml` seul
 * (aucun autre changement dans ce commit → le garde-fou de `updated()`
 * laisse enfin passer `fetchLyrics()`) ; puis seulement alors on commence à
 * alimenter `currentTime` en continu. Vérifié empiriquement (Playwright)
 * avant/après ce correctif.
 */
export function useAmLyricsHandoff(trackId: string | undefined): { ttmlPhaseReady: boolean; feedClock: boolean } {
  const [phase, setPhase] = useState<Phase>('mount');

  useEffect(() => {
    setPhase('mount');
  }, [trackId]);

  useEffect(() => {
    if (phase !== 'mount') return;
    const id = requestAnimationFrame(() => setPhase('ttml-applied'));
    return () => cancelAnimationFrame(id);
  }, [phase, trackId]);

  useEffect(() => {
    if (phase !== 'ttml-applied') return;
    const id = requestAnimationFrame(() => setPhase('clock-fed'));
    return () => cancelAnimationFrame(id);
  }, [phase, trackId]);

  return { ttmlPhaseReady: phase !== 'mount', feedClock: phase === 'clock-fed' };
}
