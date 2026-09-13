# Constats d'exploration — API KPoe / LyricsPlus et composant `am-lyrics`

Relevés le 2026-09-12 avec `scripts/probe-kpoe.ts` contre les instances réelles,
et par lecture du code de `@uimaxbai/am-lyrics` v1.6.3 (`github.com/binimum/am-lyrics`).

**La spec de départ était tirée d'une issue GitHub non vérifiée. Elle est fausse sur
plusieurs points structurants.** Ce document fait foi à la place.

---

## 1. Instances amont : 1 sur 5 est vivante

| Base URL | État | Détail |
|---|---|---|
| `https://lyricsplus.binimum.org` | **VIVANTE** | 120–600 ms, CORS `*` |
| `https://lyricsplus.atomix.one` | morte | 503, et certificat TLS invalide |
| `https://lyricsplus-seven.vercel.app` | morte | 402 `DEPLOYMENT_DISABLED` |
| `https://lyricsplus.prjktla.workers.dev` | morte | 429 permanent (quota workers.dev épuisé) |
| `https://lyrics-plus-backend.vercel.app` | morte | 402 `DEPLOYMENT_DISABLED` |

La liste de la spec est en réalité celle codée en dur dans `am-lyrics`
(`KPOE_SERVERS`, `src/AmLyrics.ts:52`), atomix.one en plus. Le composant tire
3 serveurs au hasard puis retombe explicitement sur binimum — qui est donc
aujourd'hui le seul chemin fonctionnel, pour lui comme pour nous.

> **Conséquence** : le basculement multi-instances reste utile comme filet, mais il ne
> protège de rien aujourd'hui. La vraie protection, c'est le cache.

## 2. Rate limiting amont : 2 requêtes / 10 s

Non documenté dans la spec, et bien plus sévère qu'attendu.

- Limite applicative : `{"error":"Too Many Requests","message":"... (2 requests per 10 seconds allowed)"}`, en-tête `retry-after` en secondes.
- Au-delà, un WAF Cloudflare prend le relais (**erreur 1015**) et bannit l'IP plusieurs minutes. Le corps n'est alors plus du JSON applicatif.

Un premier run espacé de 700 ms a fait bannir l'IP au bout de 5 requêtes. Le script
final espace à 6 s et respecte `retry-after`.

> **Conséquence** : le backend doit sérialiser ses appels amont avec sa propre file
> (≥ 5 s entre deux requêtes), traiter 429 à part du 404, et ne jamais retenter en rafale.

## 3. `source` : liste de priorité, mais les noms de la spec sont faux

La sémantique annoncée est bonne (liste de priorité, premier succès gagne), mais **les
noms de sources de la spec ne sont pas reconnus** et sont silencieusement retirés de la liste.

Noms réellement reconnus, lus dans `processingTime.sourcesStatus` : **`qapple`, `qq`, `deezer`**,
plus `musixmatch-word` et `musixmatch`.
Noms de la spec **non reconnus** : `apple`, `lyricsplus`, `spotify`.

Quand la liste filtrée devient vide, le service retombe sur sa chaîne par défaut
`qapple, qq, deezer`. D'où ce comportement, vérifié sur *Bohemian Rhapsody* :

| `source` envoyé | Résultat |
|---|---|
| *(absent)* | 200, `Word`, qApple, 73 lignes |
| `apple,musixmatch-word,lyricsplus,musixmatch,spotify` ← **la valeur de la spec** | **404** — filtré à `["musixmatch-word","musixmatch"]`, deux sources HS sur cette instance |
| `apple` / `lyricsplus` / `spotify` / `inexistant` | 200 qApple (nom ignoré → défaut) |
| `musixmatch-word` seul | 404 |
| `musixmatch-word,qapple` | 200 qApple (repli dans la liste) |

> **Conséquence : ne pas envoyer `source` du tout.** La valeur préconisée par la spec est
> activement nuisible — elle transforme en 404 des morceaux qui remontent sans elle.

## 4. `Word` vs `Line` dépend du morceau, pas de la source

La spec affirme que seules `apple` et `musixmatch-word` renvoient du mot à mot. Faux :
**la même source `qApple` renvoie `Word` ou `Line` selon le morceau.**

- `Word` : Bohemian Rhapsody (73 l.), Blinding Lights (35 l.), Levels (6 l.), Alors on danse (63 l.)
- `Line` : Non je ne regrette rien (28 l.), Get Lucky (114 l., deux chanteurs `v1`/`v2`)

`type` se lit donc par réponse. Les deux chemins doivent marcher de bout en bout, comme prévu.

## 5. `album` et `duration` sont des filtres stricts — et cassent les recherches

C'est le constat le plus important pour l'architecture.

**`duration` est comparée avec une tolérance d'environ ±5 s :**

| durée envoyée (réelle 354) | résultat |
|---|---|
| 354 (exacte) | 200 |
| 357 (+3 s) | 200 |
| 346 (−8 s) | **404** |
| 384 (+30 s) | **404** |
| *absente* | **200** |

**`album` est comparé de façon tout aussi stricte**, sur *Alors on danse* :

| paramètres | résultat |
|---|---|
| titre + artiste + album `Cheese` + durée | **404** |
| titre + artiste + durée | **200**, `Word`, 63 lignes |
| titre + artiste | **200**, `Word`, 63 lignes |

Spotify et Apple ne s'accordent ni sur le nom d'album ni sur la durée : Bohemian Rhapsody
est renvoyé avec `album: "Greatest Hits I, II & III"` alors qu'on demandait
*A Night at the Opera*. Envoyer les métadonnées Spotify telles quelles **réduit** le taux de
succès au lieu de l'améliorer.

> **Conséquence** : il faut une cascade de tentatives dégradant les critères, et non une
> requête unique. Voir la proposition d'architecture. Coûteux vu le rate limit de 2 req/10 s :
> raison de plus pour mettre le cache devant.

Taux de succès observé sur l'échantillon de 12 : 6/12 avec album+durée, et plusieurs de ces
échecs remontent en retirant album et durée.

## 6. `isrc` et `platformId` existent — et sont ignorés par la spec

Le message d'erreur 400 le révèle :

```
{"error":"Missing required parameters: (title and artist) or isrc or platformId"}
```

Une recherche par **ISRC** est un identifiant exact, immunisé contre les écarts de titre,
d'album et de durée décrits ci-dessus. Or l'API Spotify expose `item.external_ids.isrc`
sur `/v1/tracks/{id}` — et les réponses KPoe portent elles aussi `metadata.isrc`
(ex. `GBUM71029604` pour Bohemian Rhapsody), ce qui permet de recouper.

**Piste à valider en priorité** : si la recherche par ISRC fonctionne, elle remplace
avantageusement toute la cascade titre/artiste/album/durée. Non encore testée.

## 7. Forme réelle des réponses

Vérifiée sur l'ensemble des fixtures collectées (1170 lignes, 6211 syllabes).

```
type          "Word" | "Line"
cached        booléen (l'amont a déjà son propre cache)
KpoeTools     version de l'outil, ex. "1.7-1-ConvertTTMLtoJSON-DOMParser"
metadata      source, title, artist, album, isrc, language, totalDuration ("5:54.320"),
              songWriters[], agents{}, songParts[]
lyrics[]      time, duration, text, syllabus[], element{}, translation?, transliteration?
  element     { key: "L1", singer: "v1", songPartIndex: 0 }
  syllabus[]  { time, duration, text, isBackground? }
```

Écarts par rapport à la spec :

- `metadata.source` vaut **`"qApple"`**, pas `"Apple"`.
- `metadata.songParts[]` est `{name, time, duration}` — la spec oubliait **`name`**.
- `element` est `{key, singer, songPartIndex}` — la spec annonçait `element.songPart`,
  qui **n'existe pas**. Le nom de section se résout via `metadata.songParts[songPartIndex].name`.
  *(Le composant lui-même lit `entry.element?.songPart` dans `convertKPoeLyrics` : chez lui
  ce champ est donc toujours `undefined`. Bug amont, à ne pas reproduire.)*
- `element.key` (`"L1"`, `"L2"`…) n'était pas mentionné : il est pourtant **indispensable**,
  c'est la clé qui relie une ligne à sa translittération en TTML (voir §8).
- `syllabus[]` porte **`isBackground`** (337 occurrences) — non mentionné, et c'est ce qui
  distingue les chœurs. Il n'y a **pas** de champ `part` : le groupement en mots est porté
  par les espaces de fin dans `text` (`"Is "`, `"this "`).
- `transliteration` n'est pas `{lang, text}` mais `{lang, text, syllabus[]}` — elle est
  elle-même synchronisée mot à mot.
- `translation` existe aussi (57 lignes), jamais mentionnée.
- `processingTime.sourcesStatus` détaille l'état de chaque source, utile au debug.

Translittération confirmée sur IU — *LILAC* et BLACKPINK — *How You Like That* (`lang: "ko-Latn"`).

## 8. Ce que le composant lit vraiment du `ttml`

Lecture de `AmLyrics.parseTTML` (`src/AmLyrics.ts:3603`). **C'est ce parser qui définit le
dialecte à produire, pas la norme TTML.**

- **Le `ttml` court-circuite bien tout le réseau** (`src/AmLyrics.ts:2387`) : s'il parse et
  donne au moins une ligne, la méthode `return` avant tout fetch.
  *Piège* : si le TTML est invalide **ou donne zéro ligne**, l'exécution **retombe sur le
  chemin réseau** du composant. Ne jamais lui assigner un TTML vide ou douteux.
- Temps acceptés : `hh:mm:ss.mmm`, `mm:ss`, `ss`, et les formes `12.5s` / `500ms` / `1h`.
- `<p>` : `begin`, `end`, `itunes:key`, `ttm:agent`, `xml:lang`, `dir`.
- `<span begin end>` dans un `<p>` → syllabes. **Le groupement en mots vient de l'espace
  final** du texte du span (`part: !/\s$/.test(text)`), pas d'un attribut.
- `<span ttm:role="x-bg">` englobant des spans → chœurs. C'est là que va `isBackground`.
- Sections : `p.parentNode.getAttribute('itunes:songPart')` — **camelCase**.
  ⚠️ Le `generateTTML()` du même composant écrit `itunes:song-part` (kebab-case), que son
  propre parser ne relit pas. Incohérence interne : suivre le **parser**, pas l'export.
- Agents : `<ttm:agent xml:id="v1" type="person">`, lus par nom qualifié littéral.
  `type` pilote l'alignement gauche/droite des lignes — détail complet en §11.
- Translittération : `<transliteration><text for="L1"><span begin…>…</span></text></transliteration>`,
  où `for` doit valoir l'`itunes:key` du `<p>`. **Ce n'est pas `ttm:role="x-roman"`**
  comme le supposait la spec. Si le nombre de spans correspond, la romanisation est
  animée syllabe par syllabe.
- Traduction : `<translation><text for="L1">…</text></translation>`, même mécanisme de clé.
- `<songwriter>` alimente le pied de page.

## 9. `isrc` confirmé — contourne entièrement les filtres §5 (test dédié)

Suite au constat #6 (non testé à l'époque), sondage dédié (phase H,
`scripts/probe-kpoe.ts H`) contre l'instance vivante :

| Cas | Paramètres | Résultat |
|---|---|---|
| isrc seul | `isrc=GBUM71029604` | **200**, `Word`, qApple, 73 lignes — Bohemian Rhapsody, sans `title`/`artist` |
| isrc + title/artist absurdes | `isrc=GBUM71029604&title=Zzqxv...&artist=Nobody...` | **200**, identique — l'isrc prime, le titre/artiste faux est ignoré |
| isrc + duration très éloignée | `isrc=GBUM71029604&duration=1` (réelle 354) | **200**, identique — **l'isrc bypasse le filtre de durée** du constat #5 |
| isrc d'un morceau qui échouait avec album+duration | `isrc=FRZ116000530` (Piaf) | **200**, `Line`, 28 lignes — remonte sans qu'il ait fallu retirer album/duration |
| isrc syntaxiquement valide mais inexistant | `isrc=ZZZZZ0000000` | **404** propre, `searchedSources: ["qapple","qq"]` |

> **Conclusion : l'isrc n'est pas juste « une clé de plus », c'est la clé qui rend
> caduque toute la cascade de dégradation du constat #5.** Quand l'ISRC est
> disponible (Spotify l'expose sur `item.external_ids.isrc`), il doit être
> envoyé **seul**, sans `title`/`artist`/`album`/`duration` — les ajouter ne
> peut qu'introduire du bruit sans bénéfice constaté. La cascade
> titre/artiste/durée ne reste utile qu'en repli, quand Spotify ne fournit pas
> d'ISRC pour la piste (cas rare mais existant, ex. certains contenus locaux).
>
> Note secondaire : sur le 404 isrc inexistant, `searchedSources` ne liste que
> `qapple, qq` — pas `deezer`, contrairement à la chaîne par défaut du
> constat #3. Sans incidence sur l'architecture (le comportement observé
> reste « best-effort sur les sources vivantes de l'instance »), mais à garder
> en tête si `deezer` doit un jour être vérifié spécifiquement.

## 10. Autres points relevés sur le composant

- Les presets responsives sont des **`@container (max-width: 519px)` / `@container (min-width: 900px)`**
  (`src/AmLyrics.ts:1892`, `1908`), avec `container-type: inline-size` sur l'hôte.
  Ils dépendent donc de la **largeur du panneau paroles**, pas de celle de l'écran.
  L'hypothèse « iPad en paysage → preset large » est à vérifier sur le panneau réel.
- `duration = -1` ne fait pas que stopper : il **remet aussi `currentTime` à 0**
  (`src/AmLyrics.ts:4389`). À n'utiliser qu'au changement de morceau, **jamais sur pause**,
  sous peine de renvoyer l'affichage au début du titre.
- `line-click` émet `{ detail: { timestamp } }` en ms, `bubbles` + `composed`.
  Le wrapper React le mappe sur `onLineClick`.
- Le composant embarque d'autres chemins réseau (Genius, lrclib, unison,
  `lyrics-api.binimum.org`, `/v1/songlist/search`). Tous sont court-circuités dès lors
  qu'on ne fournit que `ttml` et `currentTime`, conformément à la contrainte du projet.

## 11. `calculateLineAlignments` — l'algorithme réel derrière `ttm:agent type`

Lecture de `AmLyrics.calculateLineAlignments` (`src/AmLyrics.ts`, appelée avec
`(lineSingers, agentTypes)` où `lineSingers[i]` = `ttm:agent` brut du `<p>` de la
ligne *i*, et `agentTypes` = `{xml:id → type}` construit depuis `<ttm:agent>` dans
`<head><metadata>`) :

```js
lineSingers.forEach((singerId, i) => {
  let type = agentTypes[singerId];
  if (!type) {
    if (singerId === 'v1000') type = 'group';
    else if (singerId === 'v2000') type = 'other';
    else type = 'person';
  }
  if (type === 'group') {
    side = 'start';                       // toujours à gauche, n'affecte pas l'alternance
  } else {
    if (lastPersonSingerId === null) side = (type === 'other') ? 'end' : 'start'; // 1ère ligne
    else if (singerId !== lastPersonSingerId) currentSideIsLeft = !currentSideIsLeft; // alternance
    side = currentSideIsLeft ? 'start' : 'end';
    lastPersonSingerId = singerId;
  }
});
// puis : si ≥85% des lignes assignées sont 'end', on inverse tout le résultat.
```

Points essentiels, non documentés par la spec de départ :

- **Ce qui pilote l'alignement, c'est l'identité de `ttm:agent` ligne à ligne, pas
  seulement `type`.** Deux lignes avec le même `ttm:agent` restent du même côté ;
  un changement d'id fait basculer le côté (sauf pour `type: "group"`, toujours à
  gauche, qui ne dérange pas l'alternance des autres lignes).
- **`v1000`/`v2000` ont un statut spécial même sans `<ttm:agent type="…">` déclaré** :
  fallback câblé en dur sur `group`/`other` respectivement. Tout autre id sans
  `type` déclaré retombe sur `person`.
- **Conséquence pour l'émetteur TTML (`ttml-emitter.ts`)** : réduire `Line.agent` à
  un id binaire `'v1'`/`'v2'` (ancien comportement, corrigé) supprime cette
  information avant même que le parser la voie — un chœur de groupe (`v1000`,
  `metadata.agents.v1000.type === "group"` chez KPoe, cf. §7) dégénère alors en
  simple alternance de duo. Il faut : (1) conserver l'id brut du chanteur dans
  `Line.agent`, identique à `element.singer` ; (2) déclarer le vrai `type` par id
  dans `<ttm:agent xml:id type>`, repris de `metadata.agents[id].type` (KPoe le
  fournit directement — voir fixture `badbunny-dtmf.json`, `v1000: group`,
  `v2000: other`, `v1: person`). Spicy/LRCLIB n'ont qu'un seul agent implicite
  (`'v1'`, jamais de `type` à déclarer) : aucun changement de comportement pour eux.
