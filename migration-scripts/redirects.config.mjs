/**
 * PER-SITE. Permanent redirects, as `from -> to`.
 *
 * Every entry is a URL that was live on the Webflow site and is deliberately
 * not being carried across. A migration that promises byte-identical URLs still
 * needs this file, because "byte-identical" is a goal and not a law.
 *
 * ONE LIST, TWO CONSUMERS. `gen-redirects.mjs` writes `web/public/_redirects`
 * from this (handled by Cloudflare's asset layer), and the Worker reads the
 * same array as a fallback for anything that reaches it. Cloudflare documents
 * `_redirects` as not applying to Worker-served requests, and every route on
 * this site IS Worker-served, so the Worker path is the one that actually runs
 * here — but both are covered rather than depending on where that boundary
 * falls.
 *
 * WHAT WEBFLOW HAD. `manifest.json` declared 19 redirects. Eleven are carried
 * below. The other eight pointed at tour URLs that now 404 — `/cosplay`,
 * `/gallery/cosplay`, `/matakana`, `/waipoua`, `/tour/gs16anr-gs48s` and three
 * `/tours/tour?id=…` entries — and were DROPPED on instruction rather than
 * carried as redirects to a 404. They are recorded in REVIEW.hd so the decision
 * is findable if any of them still attracts traffic.
 *
 * `from` must be an absolute path with no query string and no trailing slash.
 * 301 is the only status used: these are permanent, and a 302 would tell Google
 * to keep the old URL in the index.
 */
export const REDIRECTS = [
  // ── still valid: the target resolves ──────────────────────────────────────
  {
    from: '/hobbiton',
    to: '/tour/hobbiton-waitomo-caves-tour-1-day',
    why: 'Webflow redirect, target still live',
  },
  {
    from: '/best-price',
    to: '/why',
    why: 'Webflow redirect, target still live',
  },
  {
    from: '/gallery',
    to: '/tours',
    why: 'Webflow redirect, target still live',
  },
  {
    from: '/booking2',
    to: '/booking',
    why: 'Webflow redirect, target still live',
  },
  {
    from: '/booking/thankyou',
    to: '/booking',
    why: 'Webflow redirect, target still live',
  },
  {
    from: '/area/matamata',
    to: '/area/hobbiton-and-waikato',
    why: 'Webflow redirect, target still live',
  },

  // ── Webflow's own query-string URLs ───────────────────────────────────────
  // These were `/tours/tour?id=<uuid>` on the old site. The query string is
  // stripped before matching, so they are declared by PATH and the five whose
  // targets are still live all collapse onto the same `from`. Only one can be
  // declared, so the path is pointed at the tours index instead of guessing
  // which tour a visitor wanted — a 301 to the wrong tour is worse than a 301
  // to the list.
  {
    from: '/tours/tour',
    to: '/tours',
    why: "Webflow's legacy query-string tour URLs; the id cannot be matched in _redirects",
  },

  // ── decided during this migration ────────────────────────────────────────
  {
    from: '/search',
    to: '/tours',
    why:
      'Webflow site search has no equivalent after cut-over and the page is not ported. ' +
      'Dropped on instruction — but the search FORM is still in the shared nav on every ' +
      'page and posts here, so this keeps a submitted search landing somewhere useful ' +
      'instead of on a 404. See REVIEW.hd.',
  },
];

export const STATUS = 301;

/** Map lookup for the Worker-side fallback. */
const BY_PATH = new Map(REDIRECTS.map((r) => [r.from, r.to]));

export const redirectFor = (pathname) => BY_PATH.get(pathname.replace(/\/+$/, '') || '/') ?? null;
