/**
 * Every local path to a localised Webflow asset, named in ONE place.
 *
 * WHY THIS MODULE EXISTS. `npm run localise:assets` rewrites Webflow URLs in
 * `src/html/` and in the ported CSS. It does NOT rewrite `.astro` files, so any
 * asset URL transcribed into a component by hand keeps pointing at Webflow and
 * survives every check that only reads the ported pages. On the reference
 * migration that was 105 arrow icons in the CMS card components: the ported
 * pages came out clean and the components were still loading from the account
 * being cancelled.
 *
 * So: no `.astro` file may contain an asset URL. It imports from here, and
 * `npm run assets:check` has one module to point at.
 *
 * Paths are under `/wf/`, which is what the localiser writes into
 * `web/public/wf/`.
 */
export const WF = '/wf';

/** Filled in as components are transcribed. One entry per asset a component needs. */
export const assets = {} as const satisfies Record<string, string>;
