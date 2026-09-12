/**
 * ⚠️ EN SUSPENS — décodeur SLObjPack non porté.
 *
 * docs/spicy-lyrics-api.md §5 demande explicitement de réutiliser
 * `src/utils/objpack.ts` du dépôt de référence plutôt que de réimplémenter
 * ce format columnar custom (avec ses gardes anti-pollution de prototype).
 * Ce dépôt n'est pas disponible dans cette session — sans son code ni accès
 * à du vrai trafic Spicy Lyrics pour vérifier empiriquement la sémantique
 * exacte des opcodes (la description textuelle du §5 est insuffisante pour
 * garantir un décodeur fidèle : ordre des enfants dans le flux, référencement
 * des clés d'objet, etc.), le réimplémenter à l'aveugle risquerait de produire
 * un décodeur qui compile et « marche » sur des fixtures qu'on aurait
 * soi-même inventées, sans aucune garantie de correspondre au vrai format.
 *
 * Décision actée avec l'utilisateur (2026-09-12) : lui fournir le dépôt de
 * référence (ou le fichier lui-même) avant de porter ce module. En attendant,
 * `unpack` lève explicitement — le provider Spicy capture cette erreur comme
 * une panne normale et dégrade vers KPoe/LRCLIB, jamais de crash ni d'erreur
 * remontée à l'UI (cf. providers/spicy/index.ts).
 */
export class ObjPackNotImplementedError extends Error {
  constructor() {
    super('SLObjPack.unpack: décodeur non porté (dépôt de référence manquant, voir commentaire de tête de fichier)');
  }
}

export type PackedPayload = [Array<string | number | boolean | null>, number[]];

export class SLObjPack {
  unpack(_payload: PackedPayload): unknown {
    throw new ObjPackNotImplementedError();
  }
}
