// @ts-check
import {defineConfig} from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

import project from '../config/read-project.mjs';

// `output: 'server'` — EVERY page renders on demand, deliberately.
//
// The requirement is that a publish in the Studio is live immediately. That
// rules out prerendering, and it rules it out for the WHOLE site rather than
// just the collection routes: the shared nav and footer contain nine Sanity
// collection lists, so a prerendered "static" page would still carry a frozen
// menu of tours. There is no page on this site whose content is entirely
// independent of the dataset.
//
// The ported page bodies are still frozen Webflow HTML — rendering one is a
// string splice, not a template evaluation — so the per-request cost is the
// Sanity query, which is why the read client caches rather than the page.
//
// `/wf/*`, `/_astro/*` and the other files in `public/` stay ordinary static
// assets and never reach the Worker.
//
// THIS DECIDES `not_found_handling` IN BOTH WRANGLER CONFIGS. With routes
// rendering on demand, the setting must be ABSENT: it is answered by the asset
// layer before the Worker runs, and an on-demand route is by definition a path
// with no matching file, so it would intercept exactly the routes the Worker
// exists to render.
export default defineConfig({
  site: project.webflow.source,
  output: 'server',
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
