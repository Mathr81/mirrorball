import type { MiddlewareHandler } from 'hono';

/**
 * `sp_dc` ne doit jamais atteindre le navigateur : ni dans un corps de
 * réponse, ni dans un header. Cette garde inspecte chaque réponse sortante
 * et la remplace par une 500 opaque si la valeur configurée y apparaît,
 * plutôt que de compter uniquement sur la discipline du code applicatif.
 */
export function spDcLeakGuard(spDc: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (!spDc) return;

    const headerLeak = [...c.res.headers.values()].some((v) => v.includes(spDc));
    const bodyText = await c.res.clone().text().catch(() => '');
    if (headerLeak || bodyText.includes(spDc)) {
      c.res = new Response(JSON.stringify({ error: 'internal_error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  };
}
