# Proposition d'architecture — arborescence & contrat d'API

Rédigé après la phase d'exploration KPoe (`docs/kpoe-findings.md`) et lecture de
la spec Spicy Lyrics (`docs/spicy-lyrics-api.md`, fournie séparément). Ce
document sert de base à validation avant écriture du code applicatif — rien
n'est encore implémenté au-delà du script de sondage déjà commité.

Les deux docs de référence contredisent la spec de départ sur des points
structurants ; ce qui suit en tient compte. Les écarts par rapport à la
demande initiale sont signalés explicitement (⚠️), avec la raison.

---

## 1. Arborescence

```
mirrorball/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts                 # bootstrap Hono, garde sp_dc au démarrage
│   │   │   ├── routes/
│   │   │   │   ├── lyrics.ts             # GET /api/lyrics
│   │   │   │   └── health.ts             # GET /api/health
│   │   │   ├── ir/
│   │   │   │   ├── types.ts              # LyricsDoc, Line, Voice, Syllable
│   │   │   │   └── ttml-emitter.ts       # IR -> TTML, dialecte am-lyrics uniquement
│   │   │   ├── providers/
│   │   │   │   ├── provider.ts           # interface commune Provider
│   │   │   │   ├── spicy/
│   │   │   │   │   ├── client.ts         # POST /query, session, circuit breaker transport
│   │   │   │   │   ├── objpack.ts        # port de SLObjPack (unpack), gardes anti-prototype
│   │   │   │   │   ├── totp.ts           # minting token web-player à partir de sp_dc
│   │   │   │   │   ├── session-store.ts  # session mutualisée unique (tk, ttl, ping)
│   │   │   │   │   └── to-ir.ts          # Static/Line/Syllable -> LyricsDoc
│   │   │   │   ├── kpoe/
│   │   │   │   │   ├── client.ts         # file d'attente sérialisée, ≥5s entre requêtes
│   │   │   │   │   ├── query-cascade.ts  # isrc -> titre+artiste+durée -> titre+artiste
│   │   │   │   │   ├── instance-health.ts# état des 5 base URLs, re-probe périodique
│   │   │   │   │   └── to-ir.ts          # Word/Line -> LyricsDoc
│   │   │   │   └── lrclib/
│   │   │   │       ├── client.ts
│   │   │   │       └── to-ir.ts          # LRC -> LyricsDoc (sync: line)
│   │   │   ├── orchestrator/
│   │   │   │   └── resolve-lyrics.ts     # politique "meilleur dans le budget", attempts[]
│   │   │   ├── cache/
│   │   │   │   ├── db.ts                 # better-sqlite3, migrations
│   │   │   │   ├── schema.sql
│   │   │   │   └── repository.ts         # par provider + best-result, négatif, dédup
│   │   │   └── config/
│   │   │       └── env.ts                # lecture/validation des variables d'env
│   │   └── test/
│   │       ├── fixtures/                 # déjà peuplé (sondage KPoe)
│   │       ├── ttml-emitter.spec.ts
│   │       ├── kpoe-to-ir.spec.ts
│   │       ├── spicy-objpack.spec.ts
│   │       └── kpoe.integration.spec.ts  # marqué @network, exclu par défaut
│   └── web/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app/
│       │   │   ├── App.tsx
│       │   │   └── layout/               # pochette+contrôles gauche, paroles droite
│       │   ├── auth/
│       │   │   ├── pkce.ts               # code_verifier, code_challenge
│       │   │   ├── callback.ts           # page de retour, résiliente au reload (iPad)
│       │   │   └── token-store.ts        # localStorage, refresh
│       │   ├── playback/
│       │   │   ├── poller.ts             # /me/player/currently-playing, RTT, Retry-After
│       │   │   ├── virtual-clock.ts      # horloge rAF, snap/converge, tests en temps simulé
│       │   │   └── use-playback-clock.ts # hook React
│       │   ├── lyrics/
│       │   │   ├── lyrics-client.ts      # appelle /api/lyrics, cache SW en tête
│       │   │   └── AmLyricsPanel.tsx     # wrapper @uimaxbai/am-lyrics/react
│       │   ├── debug/
│       │   │   └── DebugPanel.tsx        # drift, rate, RTT, attempts[], /api/health
│       │   └── pwa/
│       │       ├── wake-lock.ts
│       │       └── register-sw.ts
│       ├── public/
│       │   └── manifest.webmanifest
│       ├── sw/
│       │   └── service-worker.ts         # shell + SWR sur /api/lyrics
│       ├── test/
│       │   └── virtual-clock.spec.ts
│       ├── index.html
│       ├── vite.config.ts
│       └── vitest.config.ts
├── docs/
│   ├── kpoe-findings.md          (existant)
│   ├── spicy-lyrics-api.md       (existant)
│   └── architecture-proposal.md  (ce document)
├── scripts/
│   └── probe-kpoe.ts             (existant)
├── pnpm-workspace.yaml
├── package.json
├── .env.example
└── README.md
```

Pas de `packages/` partagé pour l'instant : l'IR et le contrat HTTP suffisent
comme frontière entre `api` et `web`, un partage de types ferait plus de
cérémonie que de valeur pour deux apps.

---

## 2. Contrat HTTP

### `GET /api/lyrics`

```
GET /api/lyrics?trackId=<spotify_id>&title=&artist=&album=&duration=&isrc=
Authorization: Bearer <spotify_access_token>   (transmis tel quel, jamais stocké)
```

- `trackId` requis. Le reste est transmis quand disponible (`isrc` en
  particulier, cf. §5 — c'est la clé qui rend la cascade KPoe fiable).
- ⚠️ `album` est accepté par le contrat mais **jamais transmis à KPoe** :
  finding #5, il ne fait que casser des recherches qui aboutissent sans lui.
  Conservé côté route uniquement pour du logging/debug.

Réponse `200` :

```jsonc
{
  "ttml": "<tt ...>",
  "sync": "syllable",              // "syllable" | "line" | "static"
  "provider": "spicy:aml",         // voir §5 pour la liste exacte des valeurs possibles
  "cached": true,
  "matched": { "title": "...", "artist": "...", "provider": "kpoe", "score": "isrc-exact" },
  "attempts": [
    { "provider": "spicy", "outcome": "line", "ms": 340 },
    { "provider": "kpoe", "outcome": "syllable", "ms": 1820, "queuedMs": 4200 }
  ]
}
```

- `sync: "static"` → `ttml` est quand même renvoyé (un seul `<p>` par ligne,
  sans span, cf. finding #8 : « pas de span/ligne vide » sinon am-lyrics
  retombe sur son propre réseau). Le front sait qu'il doit afficher ce cas
  dans son propre composant texte plutôt que de compter sur le rendu karaoké
  d'am-lyrics — décision produit, pas contrainte technique du composant.
- `attempts[].queuedMs` : ajouté par rapport à la spec d'origine, pour
  distinguer le temps réellement passé en file d'attente KPoe (rate limit
  2 req/10 s) du temps de traitement amont — utile en debug pour comprendre
  pourquoi une résolution KPoe prend plusieurs secondes.

Réponse `404` :

```jsonc
{ "error": "no_lyrics_found", "attempts": [ /* même forme */ ] }
```

### `GET /api/health`

```jsonc
{
  "providers": {
    "spicy": {
      "available": true,
      "circuitOpen": false,
      "sessionAlive": true,
      "spDcConfigured": true
    },
    "kpoe": {
      "available": true,
      "circuitOpen": false,
      "instances": [
        { "url": "https://lyricsplus.binimum.org", "alive": true, "latencyMs": 180 },
        { "url": "https://lyricsplus.atomix.one", "alive": false, "reason": "tls" },
        { "url": "https://lyricsplus-seven.vercel.app", "alive": false, "reason": "402" },
        { "url": "https://lyricsplus.prjktla.workers.dev", "alive": false, "reason": "429" },
        { "url": "https://lyrics-plus-backend.vercel.app", "alive": false, "reason": "402" }
      ],
      "queueDepth": 0,
      "nextSlotInMs": 0
    },
    "lrclib": { "available": true }
  }
}
```

`instances[]` reflète l'état constaté (1 instance vivante sur 5 aujourd'hui,
finding #1) et se met à jour via un re-sondage périodique en arrière-plan
(pas à chaque requête `/api/lyrics`, pour ne pas cramer le budget de 2 req/10 s
sur du health-check).

---

## 3. IR `LyricsDoc` — ajustements proposés

L'interface de la spec de départ reste la base. Deux ajouts, motivés par les
constats :

```ts
interface Line {
  key: string;
  startMs: number; endMs: number; text: string;
  lead: Voice;
  background: Voice[];
  agent: string;               // ⚠️ AJUSTÉ — voir ci-dessous, plus limité à 'v1' | 'v2'
  oppositeAligned: boolean;
  roman?: { text: string; syllables?: Syllable[] };
  translation?: string;        // ⚠️ AJOUT — voir ci-dessous
  sectionIndex?: number;
}

interface LyricsDoc {
  // … champs déjà en place …
  agentTypes?: Record<string, string>;  // ⚠️ AJOUT — voir ci-dessous
}
```

- **`translation?: string`** — validé, à ajouter à l'IR. Absent de la spec d'origine. KPoe renvoie un
  champ `translation` distinct de `transliteration` sur 57 lignes de
  l'échantillon (finding #7), et le parser am-lyrics sait le lire via
  `<translation><text for="Lx">` avec le même mécanisme de clé que la
  romanisation (finding #8). Sans ce champ dans l'IR, cette donnée serait
  perdue silencieusement pour toute source qui la fournit. Spicy Lyrics n'a
  pas de traduction (seulement de la romanisation, cf. spec Spicy §6.6) donc
  ce champ restera `undefined` pour les lignes issues de Spicy — cohérent
  avec le caractère optionnel.
- **`agent: string` + `LyricsDoc.agentTypes?: Record<string, string>`** — ajusté depuis
  `'v1' | 'v2'`. KPoe fournit des id au-delà de ces deux valeurs (`v1000`,
  `v2000`, voix de groupe/autres, cf. `metadata.agents` et son champ `type`).
  Le parser am-lyrics compare cet id précis ligne à ligne pour décider de
  l'alignement gauche/droite (`calculateLineAlignments`), et lit le `type`
  déclaré dans `<ttm:agent xml:id="…" type="…">` pour distinguer un choeur de
  groupe (toujours à gauche) d'un duo qui alterne (`person`/`other`, avec un
  défaut `person` pour tout id sans `type` explicite — même défaut appliqué
  ici quand `agentTypes` ne couvre pas un id). Réduire l'IR à deux agents
  binaires ferait dégénérer tout choeur de groupe en simple alternance de
  duo. Spicy/LRCLIB n'ont qu'un seul agent implicite (`'v1'`, `agentTypes`
  absent) — cohérent avec l'existant.
- `oppositeAligned` existait déjà dans la spec ; confirmé par la spec Spicy
  (`OppositeAligned` sur `LyricsLineData`/`LineData`, §6.2/6.3). Pour KPoe, il
  n'y a pas de signal équivalent documenté dans les fixtures — l'IR mettra
  `false` par défaut pour les lignes KPoe plutôt que d'inférer quoi que ce
  soit depuis l'alternance de `singer`, qui n'a pas la même sémantique.
- `provider` sur `LyricsDoc` prend une valeur par sous-source réelle et pas
  une valeur fixe par fournisseur : `spicy:spt` | `spicy:aml` | `spicy:spl`
  (Spicy agrège Spotify/Apple/upload communautaire en interne et l'indique
  via son propre champ `source`, spec Spicy §6.4) ; `kpoe:qapple` | `kpoe:qq`
  | `kpoe:deezer` | `kpoe:musixmatch` | `kpoe:musixmatch-word` (noms réels lus
  dans `processingTime.sourcesStatus`, finding #3 — pas `kpoe:qApple` en
  spec d'origine, qui n'est pas un nom renvoyé par l'API) ; `lrclib`.

`Syllable.partOfWord` se mappe directement sur `IsPartOfWord` (Spicy) et sur
l'absence d'espace final du texte de `syllabus[]` (KPoe, finding #8) — même
sémantique des deux côtés, un seul champ IR suffit.

---

## 4. Interface `Provider` commune

```ts
interface ProviderQuery {
  trackId: string;
  title?: string; artist?: string; durationSec?: number; isrc?: string;
  spotifyAccessToken?: string;   // transmis à Spicy uniquement, jamais stocké
}
interface ProviderResult {
  doc: LyricsDoc;
  ms: number;
  queuedMs?: number;
}
interface Provider {
  readonly name: 'spicy' | 'kpoe' | 'lrclib';
  fetch(query: ProviderQuery): Promise<ProviderResult | null>;  // null = pas trouvé
  health(): ProviderHealth;
}
```

`fetch` ne lève que sur une vraie panne infra (timeout réseau, 5xx transport) ;
un « pas de paroles » applicatif renvoie `null`, jamais une exception — ça
simplifie l'orchestrateur, qui n'a qu'un seul type d'erreur à traiter
séparément (panne vs absence).

---

## 5. Émetteur TTML — dialecte réel du parser (finding #8)

Un seul émetteur, `ir/ttml-emitter.ts`, produit exactement ce que
`AmLyrics.parseTTML` sait lire — pas un TTML « correct » dans l'absolu :

- `<p begin="hh:mm:ss.mmm" end="..." itunes:key="L1" ttm:agent="v1">`
- Groupement en mot porté par **l'espace final du texte du span**, jamais un
  attribut — `partOfWord: true` ⇒ pas d'espace final avant le prochain span
  du même mot.
- Chœurs : `<span ttm:role="x-bg">` enveloppant les spans de la voix de fond.
- Sections : `itunes:songPart` en **camelCase**, posé sur le **parent** du
  `<p>` (pas sur le `<p>` lui-même) — ⚠️ le générateur natif d'am-lyrics
  écrit `itunes:song-part` en kebab-case, que son propre parser ne relit pas ;
  on suit le parser, pas l'export, comme indiqué dans les findings.
- Romanisation : `<transliteration><text for="L1"><span begin end>…</span></text></transliteration>`,
  `for` = `itunes:key` du `<p>` visé — **pas** `ttm:role="x-roman"` comme le
  supposait la spec de départ.
- Traduction (nouveau, cf. §3) : même mécanisme, `<translation><text for="L1">…</text></translation>`.
- `<songwriter>` pour `songWriters[]`.
- Jamais de TTML vide ou invalide envoyé au composant (finding #8 : ça bascule
  le composant sur son propre réseau, qu'on veut précisément court-circuiter).
  En cas de doc `sync: 'static'`, on émet quand même un TTML minimal valide
  (un `<p>` par ligne sans span) pour rester cohérent, mais le front n'utilise
  pas le rendu karaoké d'am-lyrics dans ce cas (§2).

---

## 6. Cascade multi-source ajustée aux constats

Ordre inchangé (Spicy → KPoe → LRCLIB) mais la mécanique par fournisseur
change :

**Spicy** : requête unique par `trackId`, pas de matching flou. `httpStatus`
applicatif 503 ⇒ retry doux (2 s ×1.5, plafond 10 s), sans toucher le circuit
breaker transport. Circuit transport sur 403/408/425/429/500/502/503/504,
2 échecs consécutifs, paliers 120→300→900→1800 s + jitter (repris tel quel de
la spec Spicy §7).

**KPoe** — le point le plus contraint (finding #2, rate limit réel de
2 req/10 s avec bannissement WAF au-delà) :

1. File d'attente unique côté serveur, ≥5 s entre deux requêtes sortantes,
   partagée entre tous les utilisateurs (il n'y en a qu'un ici, mais la
   contrainte est structurante même pour un seul client si plusieurs onglets
   tournent).
2. **Jamais de paramètre `source`** (finding #3 : les noms de la spec ne sont
   pas reconnus et transforment des morceaux trouvables en 404).
3. **Jamais de paramètre `album`** (finding #5).
4. Cascade de tentatives dégradées, dans cet ordre, chacune consommant un
   slot de la file :
   - **`isrc` seul, sans aucun autre paramètre, si Spotify le fournit**
     (`item.external_ids.isrc`) — confirmé par sondage dédié (finding #9,
     phase H) : l'isrc court-circuite entièrement le matching flou, prime
     sur un `title`/`artist` faux, et **bypasse le filtre de durée** qui fait
     échouer des recherches par ailleurs correctes (finding #5). C'est donc
     le chemin par défaut chaque fois qu'il est disponible, pas un simple
     paramètre additionnel — ne pas envoyer `title`/`artist`/`duration` en
     même temps, aucun bénéfice constaté à le faire ;
   - sinon (piste locale sans ISRC, cas rare) `title` + `artist` + `duration`
     (tolérance ~±5 s constatée) ;
   - sinon `title` + `artist` seuls.
   Premier succès gagne, on ne tente pas la suite.
5. Un `429` applicatif respecte `retry-after` sans ouvrir le circuit ; un
   bannissement WAF (réponse non-JSON, HTML de challenge) ouvre un circuit
   long (≥10 min) et est identifié en `attempts[]` comme `outcome: "waf"` pas
   `"error"`, pour que le debug panel distingue les deux.
6. Un seul health-check périodique en tâche de fond ré-essaie les 4 instances
   mortes (toutes les ~30 min), pas à chaque requête utilisateur — sondER une
   URL morte à chaque `/api/lyrics` gaspillerait un slot de la file de
   `binimum.org` pour rien tant que les autres restent HS.

**Validé** : vu le coût d'une requête KPoe (file d'attente pouvant aller
jusqu'à plusieurs secondes), si Spicy renvoie déjà `line`, on répond
**immédiatement** au premier appel avec ce résultat `line`, et on lance la
tentative KPoe « amélioration mot-à-mot » en tâche de fond, sans faire
attendre l'utilisateur dessus. Si KPoe fait mieux, le cache est mis à jour
(table `lyrics_best`, §7) et servira au prochain poll / rechargement, plutôt
que d'ajouter la latence de la file d'attente KPoe à chaque premier
affichage.

**LRCLIB** : uniquement si aucune source précédente n'a fait mieux que
`static`. TTL de cache court (proposé : 24 h) pour laisser une chance à une
source mot-à-mot d'apparaître plus tard sur le même morceau.

---

## 7. Cache SQLite

```sql
CREATE TABLE lyrics_cache (
  provider   TEXT NOT NULL,         -- 'spicy:aml' | 'kpoe:qapple' | 'lrclib' | ...
  cache_key  TEXT NOT NULL,         -- trackId, ou clé normalisée titre/artiste/durée pour KPoe/LRCLIB
  sync       TEXT NOT NULL,         -- 'syllable' | 'line' | 'static'
  ttml       TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (provider, cache_key)
);

CREATE TABLE lyrics_negative (
  provider   TEXT NOT NULL,
  cache_key  TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (provider, cache_key)
);

CREATE TABLE lyrics_best (
  track_id   TEXT PRIMARY KEY,      -- ce que le front interroge en premier
  provider   TEXT NOT NULL,
  cache_key  TEXT NOT NULL,
  sync       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- Cache par provider (`lyrics_cache`), jamais par morceau seul — un miss KPoe
  ne force pas à re-sonder Spicy, conforme à la demande initiale.
- `lyrics_best` est l'indirection qui permet la mise à jour en tâche de fond
  du §6 : le front revoit un meilleur résultat au prochain appel sans qu'on
  ait dû le faire attendre au premier.
- TTL : 30 j sur les hits, 24 h sur le négatif (spec d'origine) ; 24 h
  spécifiquement sur les hits LRCLIB (§6, plus court que les autres).
- Dédoublonnage des requêtes concurrentes sur une même clé : une `Map<string,
  Promise<...>>` en mémoire par provider, purgée à la résolution — pas besoin
  de plus pour un usage mono-utilisateur.

---

## 8. Décisions actées

1. **Amélioration KPoe en tâche de fond après un `line` de Spicy** (§6) —
   **validé**. On répond immédiatement avec le `line` de Spicy, la tentative
   KPoe se fait en arrière-plan et met à jour `lyrics_best` si elle fait mieux.
2. **Ajout du champ `translation` à l'IR** (§3) — **validé**. `Line.translation?: string`,
   alimenté par KPoe quand présent, absent pour Spicy/LRCLIB.
3. **Recherche par `isrc` chez KPoe** — **fait**. Sondage dédié exécuté
   (`scripts/probe-kpoe.ts H`, finding #9 dans `docs/kpoe-findings.md`) :
   l'isrc bypasse entièrement le matching flou et le filtre de durée. La
   cascade §6 en tient déjà compte : isrc seul en priorité absolue quand
   disponible, sans autre paramètre.
4. **Conditions d'usage Spicy Lyrics** — **acté, on continue**. Usage
   strictement personnel et non redistribué ; le point reste documenté ici
   pour mémoire mais ne bloque pas l'implémentation du provider Spicy.
5. **Unité de temps Spicy** (`StartTime`/`EndTime`, spec Spicy §6.3) — reste
   à vérifier empiriquement, impossible à tester depuis cet environnement
   (il faut un token Spotify réel et un `trackId`). Ce sera le premier test
   écrit contre l'API réelle en phase d'implémentation du provider Spicy,
   avant d'écrire `spicy/to-ir.ts` — pas un blocage pour démarrer le reste.

Implémentation démarrée dans cet ordre : (a) scaffold monorepo pnpm, (b) IR
+ émetteur TTML avec tests sur les fixtures déjà collectées, (c) provider
KPoe (file d'attente, cascade isrc-first), (d) provider LRCLIB, (e) provider
Spicy (objpack, session, TOTP) — le plus incertain, dernier de la liste.
