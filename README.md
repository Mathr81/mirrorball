# mirrorball

Lecteur de paroles synchronisées mot à mot, façon Apple Music, piloté par la
lecture en cours sur Spotify. Usage personnel.

Le front affiche les paroles du morceau en cours sur mon compte Spotify via
le web component [`@uimaxbai/am-lyrics`](https://github.com/binimum/am-lyrics),
alimenté par un backend qui interroge trois fournisseurs de paroles
(Spicy Lyrics, KPoe/LyricsPlus, LRCLIB) et normalise leurs résultats vers un
dialecte TTML commun.

Ciblé sur deux usages : navigateur desktop plein écran, et PWA installée sur
iPad en mode standalone.

## Architecture

```
apps/
├── api/   Hono + TypeScript, SQLite (better-sqlite3)
└── web/   Vite + React + TypeScript, SPA pure (pas de SSR)
```

Le backend suit `Provider → IR (LyricsDoc) → un seul émetteur TTML` : chaque
fournisseur produit une représentation intermédiaire commune
(`apps/api/src/ir/types.ts`), un seul émetteur (`ttml-emitter.ts`) la
traduit vers le dialecte exact attendu par le parser d'am-lyrics. Politique
de repli « le meilleur dans le budget » : `syllable` arrête la cascade
immédiatement, `line` répond tout de suite avec une amélioration KPoe
tentée en tâche de fond, `static` continue la cascade avant de répondre.

Les décisions d'architecture et les écarts constatés par rapport aux specs
d'origine (non officielles pour KPoe, reverse-engineered pour Spicy) sont
documentés dans `docs/` :

- [`docs/architecture-proposal.md`](docs/architecture-proposal.md) — contrat
  d'API, arborescence, décisions actées.
- [`docs/kpoe-findings.md`](docs/kpoe-findings.md) — sondage de l'API KPoe
  réelle : rate limits, sémantique de `source`, dialecte TTML du parser.
- [`docs/spicy-lyrics-api.md`](docs/spicy-lyrics-api.md) — spec Spicy Lyrics
  fournie séparément (reverse-engineered, non officielle).

### Limitations connues

- **Décodeur SLObjPack non porté** (`apps/api/src/providers/spicy/objpack.ts`) :
  la spec Spicy Lyrics demande de réutiliser l'implémentation d'un dépôt de
  référence plutôt que de la réimplémenter à l'aveugle depuis une
  description textuelle insuffisante. Le provider Spicy dégrade proprement
  (jamais de crash) vers KPoe/LRCLIB tant que ce module n'est pas porté.
- **Minting du token web-player Spicy non vérifié empiriquement**
  (`apps/api/src/providers/spicy/web-player-token.ts`) : implémenté selon le
  schéma le plus documenté publiquement, mais jamais testé contre l'API
  réelle (pas de compte Spotify/`sp_dc` disponible en développement). À
  valider avant de configurer `SP_DC` en production ; en cas d'échec, le
  service dégrade silencieusement vers `Static`.

## Prérequis

- Node.js ≥ 22
- pnpm (`corepack enable` ou `npm i -g pnpm`)

## Installation

```bash
git clone <ce-dépôt>
cd mirrorball
pnpm install
cp .env.example .env
```

Renseigne `.env` (voir les commentaires du fichier) :

- `VITE_SPOTIFY_CLIENT_ID` : ID d'une app créée sur le
  [dashboard développeur Spotify](https://developer.spotify.com/dashboard),
  avec `VITE_SPOTIFY_REDIRECT_URI` (par défaut `http://localhost:5173/callback`
  en dev) ajouté à ses Redirect URIs.
- `SP_DC` / `SPICY_TOTP_SECRET_HEX` / `SPICY_TOTP_VERSION` : optionnels, pour
  les paroles synchronisées via Spicy Lyrics (voir limitations ci-dessus).
  Sans eux, le service tourne en mode dégradé (KPoe + LRCLIB).

## Développement

Deux process, chacun dans son terminal :

```bash
pnpm dev:api   # http://localhost:8787
pnpm dev:web   # http://localhost:5173
```

`APP_ORIGIN` (env api) et `VITE_API_BASE_URL` (env web) doivent se
correspondre pour que le CORS entre les deux origines fonctionne.

## Tests

```bash
pnpm test          # tests unitaires des deux workspaces
pnpm typecheck      # TypeScript strict, sans émission
```

Un test d'intégration réseau (canari) tape la vraie instance KPoe vivante et
n'est pas inclus dans `pnpm test` :

```bash
pnpm --filter @mirrorball/api test:integration
```

Utile pour détecter si l'instance tombe ou si le format de réponse change —
à relancer ponctuellement, pas en CI systématique (rate limit KPoe sévère,
cf. `docs/kpoe-findings.md`).

## Build de production

```bash
pnpm build
```

Produit `apps/api/dist/` (Node) et `apps/web/dist/` (statique, avec service
worker PWA généré par `vite-plugin-pwa`).

## Docker

Le plus simple pour tout lancer d'un coup, en local ou sur un VPS :

```bash
cp .env.example .env
# renseigne .env comme pour l'installation manuelle (VITE_SPOTIFY_CLIENT_ID en particulier)
docker compose up --build
```

Deux services (voir `docker-compose.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`) :

- **`api`** : image Node multi-stage (les outils de compilation du module
  natif `better-sqlite3` restent dans l'étage de build, jamais dans l'image
  finale), expose `8787`, persiste le cache SQLite dans un volume nommé
  (`api-data`) — se reconstruit tout seul si perdu, aucune sauvegarde requise.
- **`web`** : build Vite servi par nginx (`apps/web/nginx.conf`, fallback SPA
  sur `index.html`), exposé sur `5173`. ⚠️ Les variables `VITE_*` sont figées
  dans le bundle **au moment du build de l'image** (`docker-compose.yml` les
  passe en `build.args`, lues depuis `.env`) — les changer nécessite de
  reconstruire l'image (`docker compose up --build`), pas seulement de
  redémarrer le conteneur.

Par défaut les deux services restent sur des origines séparées comme en dev
(CORS géré par `APP_ORIGIN`/`VITE_API_BASE_URL`, à garder cohérents dans
`.env`). Pour les servir sous un seul domaine en production, mets un reverse
proxy devant les deux (cf. section suivante) plutôt que d'exposer `5173`
directement.

Reconstruire après un changement de code : `docker compose up --build`.
Repartir d'un cache vide : `docker compose down -v`.

## Déploiement (VPS)

Deux options : Docker (ci-dessus, le plus simple — ajoute un reverse proxy
devant si tu veux un seul domaine public) ou un déploiement manuel des deux
process. Architecture cible pour ce second cas : `apps/api` tourne en
process Node persistant, le build statique d'`apps/web` est servi par un
reverse proxy qui route aussi les requêtes `/api/*` vers le process Node.

1. **Build sur le serveur** (ou build en CI puis déploiement des artefacts) :

   ```bash
   pnpm install --frozen-lockfile
   pnpm build
   ```

2. **Process API**, par exemple via systemd (`/etc/systemd/system/mirrorball-api.service`) :

   ```ini
   [Unit]
   Description=mirrorball API
   After=network.target

   [Service]
   WorkingDirectory=/opt/mirrorball/apps/api
   ExecStart=/usr/bin/node dist/index.js
   EnvironmentFile=/opt/mirrorball/.env
   Restart=on-failure
   User=mirrorball

   [Install]
   WantedBy=multi-user.target
   ```

   Le chemin `DB_PATH` (SQLite) doit pointer vers un répertoire persistant
   et accessible en écriture par l'utilisateur du service — le cache n'a pas
   besoin d'être sauvegardé (il se reconstruit tout seul), mais le perdre
   remet à zéro tout ce qui est mis en cache.

3. **Reverse proxy** (exemple nginx) :

   ```nginx
   server {
       listen 443 ssl http2;
       server_name mirrorball.example.com;

       root /opt/mirrorball/apps/web/dist;
       try_files $uri /index.html;

       location /api/ {
           proxy_pass http://127.0.0.1:8787;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

   Si front et API sont servis sous le même domaine via ce proxy (recommandé
   en prod, évite tout souci de CORS), aligne `VITE_API_BASE_URL` sur une
   URL relative ou sur le même domaine, et `APP_ORIGIN` sur l'URL publique
   du front.

4. **Redirect URI Spotify** : mets à jour l'app sur le dashboard développeur
   Spotify avec l'URL de callback publique (`https://mirrorball.example.com/callback`),
   et `VITE_SPOTIFY_REDIRECT_URI` en conséquence avant le build.

5. **HTTPS obligatoire** en production : le Screen Wake Lock, le service
   worker et `getUserMedia`-like APIs exigent un contexte sécurisé (seul
   `localhost` y échappe en dev).
