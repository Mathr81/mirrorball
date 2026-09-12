/**
 * `sync: 'static'` n'a aucune synchro exploitable par am-lyrics — on affiche
 * ce cas dans notre propre UI en texte simple plutôt que via le composant
 * (docs/architecture-proposal.md §2). Le TTML émis pour ce cas est un `<p>`
 * par ligne sans span (cf. apps/api/src/ir/ttml-emitter.ts) : on récupère
 * juste le texte de chaque `<p>`, dans l'ordre.
 */
export function extractStaticLines(ttml: string): string[] {
  const doc = new DOMParser().parseFromString(ttml, 'application/xml');
  return [...doc.getElementsByTagName('p')].map((p) => p.textContent?.trim() ?? '').filter((t) => t.length > 0);
}
