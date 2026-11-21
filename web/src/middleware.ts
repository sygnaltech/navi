/**
 * Worker-side redirects, and the 404 page.
 *
 * `public/_redirects` is handled by Cloudflare's ASSET layer, which Cloudflare
 * documents as not applying to Worker-served requests — and on this site every
 * route is Worker-served, because everything renders on demand. So the asset
 * file alone would never fire. Both are generated from the same array in
 * `migration-scripts/redirects.config.mjs`, so they cannot disagree.
 *
 * Missing page routes render the site’s 404 page at the requested URL.
 */
import type {MiddlewareHandler} from 'astro';

import {REDIRECTS, STATUS} from '../../migration-scripts/redirects.config.mjs';

const BY_PATH = new Map<string, string>(REDIRECTS.map((r: {from: string; to: string}) => [r.from, r.to]));

export const onRequest: MiddlewareHandler = async (context, next) => {
  const {pathname, search} = new URL(context.request.url);
  const path = pathname.replace(/\/+$/, '') || '/';

  // Trailing slashes are normalised before matching: Webflow served
  // extensionless URLs and both forms are in the wild on inbound links.
  const target = BY_PATH.get(path);
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

  if (response.status !== 404 || path === '/404' || response.body !== null) return response;

  const {method, headers} = context.request;
  const accept = headers.get('accept');
  const isPageRequest =
    (method === 'GET' || method === 'HEAD') &&
    !path.startsWith('/api/') &&
    (accept?.includes('text/html') ||
      ((!accept || accept === '*/*') && !/\.[^/]+$/.test(path)));
  if (isPageRequest) {
    return context.rewrite('/404');
  }

  return new Response(method === 'HEAD' ? null : 'Not found', {
    status: 404,
    headers: {'content-type': 'text/plain; charset=utf-8'},
  });
};
