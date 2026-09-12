# API Spicy Lyrics — Documentation d'intégration

> Reverse-engineered à partir du client officiel (`spicy-lyrics-web`, forks de
> l'extension Spicetify "Spicy Lyrics" par Spikerko). Ce document décrit le
> protocole tel qu'observé côté client — l'API elle-même n'a pas de schéma
> public (pas d'OpenAPI/GraphQL doc).

## 1. Vue d'ensemble

- Service : `https://api.spicylyrics.org` (hébergé par le projet Spicy Lyrics,
  pas self-hostable).
- Protocole : un unique endpoint RPC batché en `POST /query`, façon GraphQL —
  un tableau de `queries`, chacune avec une `operation` et des `variables`.
- Pas de versioning dans l'URL. Le client s'identifie via un header
  `SpicyLyrics-Version` + `client.version` dans le body, qui doit correspondre
  à une version "connue" de l'API (sinon risque de rejet).
- Format de réponse : une enveloppe JSON contenant, par query, un
  `httpStatus` **applicatif** (peut différer du status HTTP de la requête
  elle-même) + des données encodées dans un format compact custom appelé
  **SLObjPack**.

⚠️ **Conditions d'usage** citées dans la réponse de l'API elle-même :
> "Access is granted solely for personal, individual use through official
> Spicy Lyrics clients or their public forks of official repositories."

À garder en tête avant d'intégrer ce service dans un projet tiers.

---

## 2. Requête HTTP

```
POST https://api.spicylyrics.org/query
Content-Type: application/json
Accept: */*
SpicyLyrics-Version: 6.3.12
X-mode: 2
SpicyLyrics-WebAuth: Bearer <access_token_spotify>
```

### Body

```jsonc
{
  "queries": [
    {
      "operationId": "0",              // optionnel ; sinon matché par index
      "operation": "lyrics",           // voir §4 pour la liste des opérations
      "variables": {
        "id": "<spotify_track_id>",    // id de piste Spotify (sans le préfixe spotify:track:)
        "auth": "SpicyLyrics-WebAuth"  // nom du header qui porte le token
      }
    }
  ],
  "client": { "version": "6.3.12" }
}
```

Plusieurs `queries` peuvent être envoyées dans un seul POST (batch), chacune
avec son propre `operationId`.

### Headers requis mais non settable depuis un navigateur

L'API attend en plus des headers "forbidden" côté `fetch()` navigateur :

```
Origin: https://xpui.app.spotify.com
Referer: https://xpui.app.spotify.com/
User-Agent: <UA type client Spotify desktop>
```

Sans ces headers (ou avec un CORS non permissif sur votre origine), l'appel
direct depuis un navigateur peut être rejeté. **Solution : passer par un
proxy backend** qui les injecte côté serveur. C'est ce que fait le worker
Cloudflare fourni dans ce repo (`web/proxy/worker.js`) — cf. §8.

---

## 3. Enveloppe de réponse

```jsonc
{
  "queries": [
    {
      "operationId": "0",
      "operation": "lyrics",
      "result": {
        "httpStatus": 200,   // statut APPLICATIF (200 / 404 / 503 / ...)
        "data": [...],       // payload SLObjPack (voir §5), ou objet de session
        "format": "json"     // "json" | "text"
      }
    }
  ]
}
```

**Important** : le status HTTP de la réponse `/query` elle-même est presque
toujours 200, même en cas d'absence de paroles ou de requête en attente. Le
vrai statut est `result.httpStatus` :

| `result.httpStatus` | Signification |
|---|---|
| `200` | OK, `data` contient les paroles / la donnée de session |
| `404` | Pas de paroles trouvées pour ce morceau |
| `503` | Requête mise en file d'attente côté serveur — il faut re-poller (pas une erreur transport) |
| autre | Erreur applicative |

Le statut **transport** (HTTP) de la requête POST est lui utile pour détecter
un vrai problème réseau/rate-limit : `403, 408, 425, 429, 500, 502, 503, 504`
sont les codes qui méritent un vrai backoff (voir §7).

---

## 4. Opérations disponibles

| `operation` | Rôle | `variables` |
|---|---|---|
| `lyrics` | Récupérer les paroles d'un morceau | `{ id, auth }` |
| `createSession` | Ouvrir une session | `{}` (auth via header) |
| `refreshSession` | Renouveler une session avant expiration | `{ tk }` |
| `ping` | Heartbeat de maintien de session | `{ tk }` |
| `pingConfig` | Récupérer les paramètres de session (intervalles, TTL) | `{}` |

### Modèle de session

Depuis une certaine version de l'API, un client est censé :
1. Appeler `createSession` → reçoit un token `tk`.
2. Appeler `ping` périodiquement (intervalle donné par `pingConfig`) pour
   garder la session active.
3. Appeler `refreshSession` avant expiration du TTL (`sessionTtlSeconds *
   refreshAtTtlFraction`), qui renvoie un nouveau `tk`.

Le trafic qui ne maintient pas de session est **rate-limité**. Réponse de
`pingConfig` :

```jsonc
{
  "pingIntervalMs": 300000,
  "minPingIntervalMs": 240000,
  "sessionTtlSeconds": 3600,
  "refreshAtTtlFraction": 0.8
}
```

`ping`/`refreshSession` renvoient `httpStatus: 403` si la session est morte
(il faut alors relancer un `createSession`).

**Recommandation d'intégration** : si plusieurs clients/onglets/appareils
partagent le même backend, mutualisez une seule session côté serveur plutôt
que d'en ouvrir une par client — sinon N clients = N sessions = N fois plus
de trafic, ce qui déclenche le rate-limit plus vite (voir §8, c'est
exactement ce que fait le proxy fourni ici).

---

## 5. Encodage du payload — SLObjPack

`result.data` pour l'opération `lyrics` n'est **pas du JSON brut** : c'est un
format columnar compact, `SLObjPack`, conçu pour réduire la taille des
tableaux d'objets homogènes (lignes/syllabes qui partagent les mêmes clés).

```ts
type JSONPrimitive = string | number | boolean | null;
type PackedPayload = [JSONPrimitive[], number[]];
// [0] = table de valeurs uniques (dédupliquées)
// [1] = flux d'opcodes qui reconstruit la structure à partir de cette table
```

Opcodes (valeurs négatives réservées dans le flux) : objet (`-1`), tableau
générique (`-2`), "schema array" — tableau d'objets homogènes partageant les
mêmes clés, pour éviter de répéter les noms de clés (`-3`), tableau/objet
vide (`-4`/`-6`), tableau à un seul élément (`-5`).

Le décodeur intègre des limites de sécurité (profondeur, taille des
tableaux/objets, nombre d'opérations de décodage) et bloque explicitement les
clés `__proto__`, `constructor`, `prototype` pour éviter la pollution de
prototype — à reproduire si vous réimplémentez un unpacker.

**Pour intégrer sans réécrire le format** : réutilisez directement
l'implémentation TypeScript de ce repo, `src/utils/objpack.ts` (classe
`SLObjPack`, méthode `.unpack(payload)`), qui est indépendante du reste du
code Spicetify.

```ts
import { SLObjPack } from "./objpack.ts";
const packer = new SLObjPack();
const lyrics = packer.unpack(result.data);
```

---

## 6. Structure des paroles décompressées

Une fois `unpack()` appliqué, l'objet renvoyé est discriminé par `Type`.

### Champs communs

| Champ | Type | Description |
|---|---|---|
| `Type` | `"Static" \| "Line" \| "Syllable"` | mode de synchro |
| `source` | `"spt" \| "aml" \| "spl" \| "ldb"` | provider d'origine (voir §6.4) |
| `StartTime` | `number` | horodatage du premier événement lyrique (pour afficher un "interlude" avant les premières paroles) |
| `SongWriters` | `string[]` (optionnel) | crédits auteurs/compositeurs |
| `classes` | `string` (optionnel) | classe CSS custom fournie par le serveur |
| `styles` | `Record<string,string>` (optionnel) | styles inline custom fournis par le serveur |
| `TTMLUploadMetadata` | objet (optionnel, si `source === "spl"`) | attribution communautaire, voir §6.5 |

Il n'y a **aucune métadonnée de morceau** dans la réponse (pas de titre,
artiste, album, durée, ISRC) — seul l'ID Spotify est envoyé en requête ; le
reste doit venir de l'API Spotify elle-même côté intégrateur.

### 6.1 `Type: "Static"` — texte brut, non synchronisé

```ts
interface StaticLyricsData {
  Type: "Static";
  Lines: Array<{
    Text: string;
    TransliteratedText?: string;   // romanisation, si fournie par l'API
  }>;
  offline?: boolean;
  classes?: string;
  styles?: Record<string, string>;
  source?: "spt" | "spl" | "aml";
}
```

### 6.2 `Type: "Line"` — synchronisation ligne par ligne

```ts
interface LyricsLineData {
  Text: string;
  StartTime: number;
  EndTime: number;
  TransliteratedText?: string;
  OppositeAligned?: boolean;     // ligne "duo" alignée à l'opposé (ex. chant à deux voix)
}
interface LyricsData {
  Type: "Line";
  Content: LyricsLineData[];
  StartTime: number;
  SongWriters?: string[];
  source?: "spt" | "spl" | "aml";
  classes?: string;
  styles?: Record<string, string>;
}
```

### 6.3 `Type: "Syllable"` — synchronisation mot/syllabe (karaoké type Apple Music)

```ts
interface SyllableData {
  Text: string;
  TransliteratedText?: string;
  StartTime: number;
  EndTime: number;
  IsPartOfWord?: boolean;   // vrai si cette syllabe se colle à la suivante (pas d'espace, même mot)
}
interface LeadData {
  StartTime: number;
  EndTime: number;
  Syllables: SyllableData[];   // voix principale
}
interface BackgroundData {
  StartTime: number;
  EndTime: number;
  Syllables: SyllableData[];   // voix(s) de fond / adlibs
}
interface LineData {
  Lead: LeadData;
  Background?: BackgroundData[];
  OppositeAligned?: boolean;
}
interface LyricsData {
  Type: "Syllable";
  Content: LineData[];
  StartTime: number;
  SongWriters?: string[];
  source?: "spt" | "spl" | "aml";
  classes?: string;
  styles?: Record<string, string>;
}
```

Notes d'implémentation observées côté renderer :
- `StartTime`/`EndTime` sont exprimés dans une unité convertie ensuite via une
  fonction `ConvertTime()` côté client (proche de la milliseconde) — à
  valider empiriquement selon votre pipeline.
- `IsPartOfWord` sert à regrouper visuellement des syllabes en un seul "mot"
  (pas d'espace inséré entre elles).

### 6.4 Table des providers (`source`)

| Code | Provider |
|---|---|
| `spt` | Spotify |
| `aml` | Apple Music |
| `spl` | Spicy Lyrics (upload communautaire, format TTML) |
| `ldb` | "Local DB" — uniquement côté client (paroles importées localement par l'utilisateur), jamais renvoyé par le serveur |

L'API agrège donc plusieurs sources en interne et indique laquelle a
finalement répondu.

### 6.5 `TTMLUploadMetadata` (uniquement quand `source === "spl"`)

```ts
interface TTMLUploadMetadata {
  Maker?: { id: string; username: string; avatar?: string };
  Uploader?: { id: string; username: string; avatar?: string };
}
```
Sert à afficher "Made by @user" / "Uploaded by @user", avec un lien vers
`https://spicylyrics.org/uid/<id>`.

### 6.6 Romanisation / traduction

- L'API **peut** fournir `TransliteratedText` déjà calculé par ligne/syllabe.
- **Aucune traduction** (changement de langue du texte) n'existe côté API —
  uniquement de la romanisation (translittération dans le même alphabet
  latin, ex. japonais → rōmaji).
- Si `TransliteratedText` est absent, le client d'origine génère sa propre
  romanisation localement (Kuroshiro pour le japonais, `pinyin` pour le
  chinois, `aromanize` pour le coréen, `cyrillic-romanization`, etc.) — ce
  n'est **pas** une fonctionnalité de l'API, à réimplémenter côté client si
  besoin.

---

## 7. Résilience côté client (recommandé pour toute intégration)

Le client de référence applique un **circuit breaker** dédié, distinct du
retry sur 503 applicatif :

- Codes déclenchant l'ouverture du disjoncteur (niveau transport) :
  `403, 408, 425, 429, 500, 502, 503, 504`.
- Seuil : 2 échecs consécutifs avant ouverture.
- Palier de backoff croissant : `120s → 300s → 900s → 1800s` (avec jitter
  0.5×–1.5×), qui redescend au premier palier après 1h de calme.
- Respecte le header `Retry-After` s'il est présent.
- État persisté (localStorage / équivalent) pour survivre à un redémarrage
  de l'app côté utilisateur.
- Une requête "probe" utilisateur (ex. l'utilisateur change de morceau) est
  autorisée à passer même disjoncteur ouvert, au maximum une fois toutes les
  30s, pour à la fois servir l'utilisateur actif et faire office de health
  check.

Séparément, un **503 dans l'enveloppe** (`result.httpStatus === 503`, pas le
status HTTP transport) signifie "requête mise en file" côté serveur — à
traiter par un retry avec backoff doux (ex. 2s → ×1.5 → plafond 10s), **sans**
faire réagir le circuit breaker transport.

---

## 8. CORS et proxy (obligatoire pour un frontend navigateur)

Un appel direct `fetch()` depuis un navigateur se heurte à deux problèmes :
1. Les headers `Origin`, `Referer`, `User-Agent` attendus par l'API sont
   "forbidden headers" que le JS ne peut pas définir.
2. L'API ne renvoie pas forcément de headers CORS permissifs pour votre
   origine.

**Solution** : un petit proxy backend (Cloudflare Worker, fonction
serverless, ou service Node classique) qui :
- reçoit la requête du frontend,
- l'enrichit avec `Origin: https://xpui.app.spotify.com`, `Referer:
  https://xpui.app.spotify.com/`, un `User-Agent` type client Spotify
  desktop, et le header `SpicyLyrics-Version`,
- forward vers `https://api.spicylyrics.org/query`,
- ajoute des headers CORS permissifs pour la réponse.

Une implémentation complète existe déjà dans ce repo :
`web/proxy/worker.js` (Cloudflare Worker) et sa version portable
`web/server/server.mjs` (Node pur, sans dépendance à Cloudflare). Elle gère
en plus :
- **la mutualisation de session** : une seule session upstream partagée pour
  tous les clients connectés (via Durable Object ou équivalent en mémoire),
  pour éviter que N appareils = N sessions = rate-limit,
- **le cache d'edge** : 7 jours pour les paroles trouvées, 1h pour les 404
  confirmés, jamais pour les 503,
- **le coalescing** : les requêtes concurrentes pour le même morceau sont
  fusionnées en un seul appel upstream,
- **la détection de blocage WAF Cloudflare** de l'API elle-même (page HTML
  de challenge au lieu d'une réponse JSON), signalée via un header custom
  `X-Spicy-Upstream: blocked`.

---

## 9. Authentification

Deux niveaux distincts :

### 9.1 Token utilisateur (obligatoire, paroles non synchronisées)

Un token OAuth Spotify de l'utilisateur final (scope de lecture standard),
envoyé via un header **custom** (pas `Authorization`) :

```
SpicyLyrics-WebAuth: Bearer <spotify_access_token>
```

et référencé dans le body par `variables.auth: "SpicyLyrics-WebAuth"`. Sans
token valide → `no-auth`/`401`.

### 9.2 Paroles synchronisées (mot/syllabe) — limitation importante

Les paroles **synchronisées** viennent d'un endpoint interne Spotify qui
n'accepte que le **client token officiel du web player Spotify** — un token
OAuth d'appli tierce (le seul qu'un site web puisse obtenir légalement) ne
débloque que le texte **non synchronisé**.

Pour obtenir la synchro, le proxy de référence peut fabriquer ce token
côté serveur à partir du cookie `sp_dc` du compte Spotify de l'opérateur du
proxy (jamais transmis au navigateur), en reproduisant le mécanisme TOTP
(RFC 6238) utilisé par le web player Spotify lui-même pour appeler
`/api/token`. Voir `web/proxy/worker.js` (fonctions de minting TOTP) et
`web/README.md` section "Synced lyrics" pour le détail complet — c'est une
astuce technique non triviale et à la merci des rotations de secret côté
Spotify.

**Si vous n'avez pas ce mécanisme**, votre intégration ne recevra que des
paroles `Type: "Static"` (texte brut), jamais `Line`/`Syllable`.

---

## 10. Exemple `curl`

```bash
curl -s -X POST https://api.spicylyrics.org/query \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://xpui.app.spotify.com' \
  -H 'Referer: https://xpui.app.spotify.com/' \
  -H 'SpicyLyrics-Version: 6.3.12' \
  -H 'X-mode: 2' \
  -H 'SpicyLyrics-WebAuth: Bearer <token>' \
  -d '{
    "queries": [
      { "operationId": "0", "operation": "lyrics", "variables": { "id": "<track_id>", "auth": "SpicyLyrics-WebAuth" } }
    ],
    "client": { "version": "6.3.12" }
  }'
```

## 11. Exemple minimal côté client (TypeScript)

```ts
import { SLObjPack } from "./objpack.ts"; // réutiliser le fichier de ce repo

const LYRICS_API = "https://your-proxy.example.com"; // proxy CORS, pas l'API directement
const CLIENT_VERSION = "6.3.12";
const packer = new SLObjPack();

async function fetchLyrics(trackId: string, accessToken: string) {
  const res = await fetch(`${LYRICS_API}/query`, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
      "SpicyLyrics-Version": CLIENT_VERSION,
      "X-mode": "2",
      "SpicyLyrics-WebAuth": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      queries: [{ operation: "lyrics", variables: { id: trackId, auth: "SpicyLyrics-WebAuth" } }],
      client: { version: CLIENT_VERSION },
    }),
  });

  const json = await res.json();
  const result = json.queries?.[0]?.result;
  if (!result) throw new Error("no result");
  if (result.httpStatus === 503) throw new Error("queued, retry later");
  if (result.httpStatus === 404) return null; // pas de paroles
  if (result.httpStatus !== 200) throw new Error(`api error ${result.httpStatus}`);

  return packer.unpack(result.data); // -> StaticLyricsData | LineLyricsData | SyllableLyricsData
}
```

---

## 12. Fichiers de référence dans ce repo (pour aller plus loin)

| Sujet | Fichier |
|---|---|
| Client requête (extension) | `src/utils/API/Query.ts` |
| Client requête (web standalone) | `web/src/lyrics/fetch.ts` |
| Gestion de session | `web/src/lyrics/session.ts`, `src/utils/SessionManager/*` |
| Format SLObjPack (pack/unpack) | `src/utils/objpack.ts` |
| Rendu paroles statiques | `src/utils/Lyrics/Applyer/Static.ts` |
| Rendu paroles ligne | `src/utils/Lyrics/Applyer/Synced/Line.ts` |
| Rendu paroles syllabe | `src/utils/Lyrics/Applyer/Synced/Syllable.ts` |
| Provider / crédits | `src/utils/Lyrics/Applyer/Credits/ApplyProvider.ts`, `ApplyIsByCommunity.tsx` |
| Romanisation locale | `src/utils/Lyrics/ProcessLyrics.ts` |
| Circuit breaker | `src/utils/API/CircuitBreaker.ts` |
| Retry sur 503 applicatif | `src/utils/Lyrics/LyricsQueueRetry.ts` |
| Proxy CORS/session (Cloudflare) | `web/proxy/worker.js` |
| Proxy CORS/session (Node) | `web/server/server.mjs` |
| Doc proxy détaillée | `web/README.md` |
