// @ts-check
import {defineConfig} from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

import project from '../config/read-project.mjs';

// `output: 'static'` is the DEFAULT for every route — the ported Webflow pages
// are prerendered and written to ./dist as HTML.
//
// The adapter is what lets individual routes opt OUT of that with
// `export const prerender = false`, which is how Sanity-driven routes can be
// rendered per request so publishing in the Studio is live immediately rather
// than waiting for the next build. Whether any route here does that decides
// the `not_found_handling` setting in wrangler.prod.jsonc — see the note there.
//
// Requests hit Cloudflare's static assets first and only reach the Worker when
// no built file matches, so a prerendered page never pays for the Worker.
export default defineConfig({
  site: project.webflow.source,
  output: 'static',
  adapter: cloudflare(),
  build: {
    // Webflow serves extensionless URLs (/contact, not /contact/). Match that
    // so ported pages keep byte-identical paths and no redirects are needed.
    format: 'file',
  },
  devToolbar: {enabled: false},

  vite: {
    // project.jsonc resolved ONCE, here, and injected as a compile-time
    // constant. This file runs in plain Node and is never bundled, so the
    // filesystem read is safe here and nowhere else — see the long note in
    // src/lib/project.ts for the prerender failure this avoids.
    define: {
      __PROJECT_CONFIG__: JSON.stringify(project),
    },

    // The site lives in web/ but .env stays at the REPO ROOT, because the
    // migration scripts read the same file (migration-scripts/lib/env.mjs
    // resolves it from the root) and SANITY_DATASET has to mean one thing in
    // both. Without this, Vite would look for web/.env, find nothing, and the
    // build would succeed while every query read the wrong dataset.
    //
    // This must stay aligned with the deploy guard: the guard scans the root
    // env files when called without `--env-dir`, which is how package.json
    // calls it.
    envDir: '..',
  },
});
