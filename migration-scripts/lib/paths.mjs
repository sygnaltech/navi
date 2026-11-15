/**
 * Where the Astro app and its build output are, resolved once.
 *
 * WHY `DIST` IS NOT JUST `web/dist`. `@astrojs/cloudflare` changed its output
 * layout: it used to write the site to `dist/` with a `_worker.js` beside it,
 * and from v14 it writes the site to `dist/client/` and the server bundle to
 * `dist/server/` (empty when every route prerenders). Three scripts hardcoded
 * the old path and all three reported "run npm run build first" against a build
 * that had just succeeded — a failure that reads as a missing step rather than
 * a stale path.
 *
 * So probe for the client directory and fall back to the flat one, rather than
 * pinning either. Both layouts then work and a future move is one edit here.
 */
import {existsSync} from 'node:fs';
import {join} from 'node:path';

import {ROOT} from './env.mjs';

export const WEB = join(ROOT, 'web');

const CLIENT = join(WEB, 'dist/client');

/** The directory holding the built site: `web/dist/client`, or `web/dist`. */
export const DIST = existsSync(CLIENT) ? CLIENT : join(WEB, 'dist');

export {ROOT};
