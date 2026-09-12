import { totp } from './totp.js';

export interface WebPlayerTokenConfig {
  /** Secret TOTP en hex, propre au compte/à la version du web player. Tourne côté Spotify. */
  secretHex: string;
  /** Version du secret, telle qu'attendue par l'endpoint (paramètre `totpVer`). */
  version: string;
}

/**
 * ⚠️ MÉCANISME REVERSE-ENGINEERED, NON VÉRIFIÉ EMPIRIQUEMENT DANS CET ENVIRONNEMENT.
 *
 * docs/spicy-lyrics-api.md §9.2 décrit le principe (reproduire le TOTP du web
 * player Spotify à partir du cookie `sp_dc` pour obtenir un token qui débloque
 * les paroles synchronisées) sans donner le detail exact de l'appel HTTP — ni
 * le secret, ni sa version, ni les noms de paramètres actuels de l'endpoint,
 * qui évoluent au gré des rotations côté Spotify. Cette implémentation suit
 * le schéma le plus communément documenté par la communauté (deux TOTP —
 * horloge locale et horloge serveur — envoyés en paramètres à
 * `open.spotify.com/get_access_token`), mais n'a pas pu être testée contre
 * l'API réelle ici (pas de `sp_dc` ni de token Spotify disponibles dans cet
 * environnement). À valider contre un vrai compte avant mise en production ;
 * en cas d'échec (secret périmé, format de réponse changé...), la fonction
 * renvoie `undefined` plutôt que de lever — le provider Spicy dégrade alors
 * vers `Static`, conformément à l'exigence du projet.
 *
 * Le secret n'est délibérément pas codé en dur ici : c'est une valeur externe
 * qui tourne côté Spotify (cf. `SPICY_TOTP_SECRET_HEX` dans .env.example).
 * Sans configuration, cette fonction ne tente même pas d'appel réseau.
 */
export async function mintWebPlayerToken(spDc: string, config: WebPlayerTokenConfig | undefined): Promise<string | undefined> {
  if (!config) return undefined;

  try {
    const secret = Buffer.from(config.secretHex, 'hex');
    const serverTimeSec = await fetchServerTimeSec();
    const localCode = totp(secret, Date.now());
    const serverCode = totp(secret, serverTimeSec * 1000);

    const url = new URL('https://open.spotify.com/get_access_token');
    url.searchParams.set('reason', 'transport');
    url.searchParams.set('productType', 'web-player');
    url.searchParams.set('totp', localCode);
    url.searchParams.set('totpServer', serverCode);
    url.searchParams.set('totpVer', config.version);

    const res = await fetch(url, { headers: { cookie: `sp_dc=${spDc}` } });
    if (!res.ok) return undefined;

    const body = (await res.json()) as { accessToken?: string };
    return body.accessToken;
  } catch {
    return undefined;
  }
}

async function fetchServerTimeSec(): Promise<number> {
  const res = await fetch('https://open.spotify.com/server-time');
  const body = (await res.json()) as { serverTime: number };
  return body.serverTime;
}
