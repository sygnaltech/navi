/**
 * Worker-side redirects, and the 404 page.
 *
 * `public/_redirects` is handled by Cloudflare's ASSET layer, which Cloudflare
 * documents as not applying to Worker-served requests — and on this site every
 * route is Worker-served, because everything renders on demand. So the asset
 * file alone would never fire. Both are generated from the same array in
 * `migration-scripts/redirects.config.mjs`, so they cannot disagree.
 *
 * The 404 body is the ported Webflow 404 page when there is one, and a plain
 * response otherwise.
 *
 * > The not-found substitution must GUARD ON THE RESPONSE ALREADY HAVING A
 * > BODY. On the reference migration it fired during the prerender of the 404
 * > page itself and wrote `dist/404.html` as the nine bytes of its own fallback
 * > string. Nothing here prerenders, but the guard is kept: it costs one
 * > condition and the failure is silent.
 */
import type {MiddlewareHandler} from 'astro';

import {REDIRECTS, STATUS} from '../../migration-scripts/redirects.config.mjs';

const BY_PATH = new Map<string, string>(REDIRECTS.map((r: {from: string; to: string}) => [r.from, r.to]));

export const onRequest: MiddlewareHandler = async (context, next) => {
  const {pathname, search} = new URL(context.request.url);

  // Trailing slashes are normalised before matching: Webflow served
  // extensionless URLs and both forms are in the wild on inbound links.
  const target = BY_PATH.get(pathname.replace(/\/+$/, '') || '/');
  if (target) {
    return new Response(null, {
      status: STATUS,
      // The query string is carried over. Webflow's legacy tour URLs were
      // `/tours/tour?id=<uuid>`, and dropping the query on a 301 would lose the
      // only information in them.
      headers: {location: `${target}${search}`},
    });
  }

  const response = await next();

  if (response.status === 404) {
    const body = await response.clone().text();
    // Already has something to show — leave it alone.
    if (body.trim().length > 0) return response;

    return new Response('Not found', {
      status: 404,
      headers: {'content-type': 'text/plain; charset=utf-8'},
    });
  }

  return response;
};
