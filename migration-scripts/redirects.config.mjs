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
 * below unchanged. The other eight pointed at tour URLs that now 404 —
 * `/cosplay`, `/gallery/cosplay`, `/matakana`, `/waipoua`,
 * `/tour/gs16anr-gs48s` and three `/tours/tour?id=…` entries. Carrying those
 * verbatim would be a 301 to a 404, so they are RE-POINTED at `/tours` on
 * instruction. One more URL joins them: the dead `…kuirau-park-footbath…`
 * entry that the live sitemap lists and the live site 404s.
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

  // ── dead Webflow redirects, re-pointed on instruction ────────────────────
  // Each of these was a live Webflow redirect whose TARGET has since been
  // deleted, so carrying it verbatim would have been a 301 to a 404. They were
  // dropped at first and are now pointed at the tours index instead: the old
  // URLs may still attract traffic, and a visitor who asked for a tour that no
  // longer exists is better served by the list than by a 404. Guessing a
  // replacement tour would be worse than either.
  {
    from: '/cosplay',
    to: '/tours',
    why: 'Webflow redirect to /tour/hobbiton-cosplay-tour-1-day, which no longer exists',
  },
  {
    from: '/gallery/cosplay',
    to: '/tours',
    why: 'Webflow redirect to /tour/hobbiton-cosplay-tour-1-day, which no longer exists',
  },
  {
    from: '/matakana',
    to: '/tours',
    why: 'Webflow redirect to /tour/matakana-market-and-winery-tour-1-day, which no longer exists',
  },
  {
    from: '/waipoua',
    to: '/tours',
    why: 'Webflow redirect to /tour/waipoua-forest-giant-kauri-coast, which no longer exists',
  },
  {
    from: '/tour/gs16anr-gs48s',
    to: '/tours',
    why: 'Webflow redirect to /tour/hobbiton-rotorua-waitomo-tour, which no longer exists',
  },
  {
    from: '/tour/hobbiton-rotorua-tour-kuirau-park-footbath-experience',
    to: '/tours',
    why:
      'listed in the live sitemap and 404 on the live site. Re-pointed rather than left ' +
      'as a 404, on instruction — see REVIEW.hd.',
  },

  // ── decided during this migration ────────────────────────────────────────
  {
    from: '/tour/queenstown-frans-josef-christchurch-bus-train-4-day-tour-copy',
    to: '/tours/',
    why: 'The old public Queenstown–Christchurch tour is no longer listed. See final audit item 17.',
  },
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

/**
 * URLs OUR sitemap lists that Webflow's did not — because Webflow's was stale.
 *
 * All five answer 200 on the live site today and are simply absent from the
 * live `/sitemap.xml`, which Webflow last regenerated at some earlier publish.
 * Ours is derived from the dataset at request time, so it cannot drift that way
 * — which is the dynamic site being more correct than the one it replaces, the
 * same class of staleness as the archived tour frozen into the live nav.
 *
 * Declared rather than tolerated: a NEW unexpected addition still fails.
 */
export const SITEMAP_ADDITIONS = new Map([
  ['/data/llms', 'ported page, never in the live sitemap'],
  ['/tour/black-water-rafting-tour-1-day', 'live 200, absent from the live sitemap'],
  ['/tour/rotorua-express-tour', 'live 200, absent from the live sitemap'],
  ['/tours/half-day', 'live 200, absent from the live sitemap'],
  ['/tours/transfers', 'live 200, absent from the live sitemap'],
]);

/** Map lookup for the Worker-side fallback. */
const BY_PATH = new Map(REDIRECTS.map((r) => [r.from, r.to]));

export const redirectFor = (pathname) => BY_PATH.get(pathname.replace(/\/+$/, '') || '/') ?? null;
