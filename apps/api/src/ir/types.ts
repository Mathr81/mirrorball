/**
 * Représentation intermédiaire commune aux trois fournisseurs de paroles.
 * Un seul émetteur (`ttml-emitter.ts`) la traduit vers le dialecte TTML
 * attendu par le parser de @uimaxbai/am-lyrics — voir docs/kpoe-findings.md §8.
 */

export interface Syllable {
  text: string;
  startMs: number;
  endMs: number;
  /** true si cette syllabe se colle à la suivante, sans espace (même mot). */
  partOfWord: boolean;
  roman?: string;
}

export interface Voice {
  startMs: number;
  endMs: number;
  /** Vide pour une ligne sans synchro mot-à-mot (sync: 'line' | 'static'). */
  syllables: Syllable[];
}

export interface Line {
  /** L1, L2… généré par l'IR, jamais repris de la source. */
  key: string;
  startMs: number;
  endMs: number;
  text: string;
  lead: Voice;
  background: Voice[];
  /**
   * Id brut du chanteur, tel qu'il doit être émis en `ttm:agent` sur le `<p>`.
   * Pas limité à "v1"/"v2" : KPoe fournit aussi "v1000"/"v2000" (voix de
   * groupe/autres) — voir `LyricsDoc.agentTypes`. Le parser am-lyrics compare
   * cet id d'une ligne à l'autre pour décider de l'alternance gauche/droite
   * (calculateLineAlignments) ; le réduire à "v1"/"v2" ferait perdre cette
   * information au lieu de simplement l'ignorer.
   */
  agent: string;
  oppositeAligned: boolean;
  roman?: { text: string; syllables?: Syllable[] };
  /** Traduction (changement de langue), distincte de la romanisation. */
  translation?: string;
  sectionIndex?: number;
}

export interface Section {
  name?: string;
  startMs: number;
  endMs: number;
}

export interface LyricsDoc {
  sync: 'syllable' | 'line' | 'static';
  lines: Line[];
  sections: Section[];
  songWriters: string[];
  provider: string;
  /**
   * Type déclaré par la source pour chaque id d'agent rencontré dans `lines`
   * (`person` | `group` | `other` chez KPoe, cf. `metadata.agents`). Sert à
   * émettre `<ttm:agent type="...">` : le parser am-lyrics s'en sert pour
   * distinguer un choeur de groupe (toujours aligné à gauche) d'un duo qui
   * alterne. Absent (Spicy/LRCLIB, un seul agent "v1") ou id manquant ⇒
   * l'émetteur retombe sur "person", le même défaut que le parser applique
   * à un id qu'il ne connaît pas.
   */
  agentTypes?: Record<string, string>;
}
