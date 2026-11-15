/**
 * PER-SITE. Every published Webflow page being ported, as `slug: path`.
 *
 * The slug becomes the Astro route (and the name of its extracted HTML
 * fragment), so it must match the published path exactly — Webflow serves
 * extensionless URLs and we keep them byte-identical. No redirects, no
 * trailing-slash change, nothing for Google to re-crawl.
 *
 * THIS FILE IS THE §1 INVENTORY IN CODE, reconciled against the live CMS rather
 * than the sitemap, because this site's sitemap is wrong in both directions —
 * it lists a URL that 404s and omits four live pages:
 *
 *    1  home
 *   20  static pages            (21 live, less /search — see below)
 *    1  /data/llms              (live, absent from the sitemap)
 *   29  tour items
 *   11  tour category items
 *   15  area items
 *    4  tag items
 *   11  review items
 *    1  news item
 *   ---
 *   94  live pages
 *
 * Excluded deliberately:
 *
 *   - The six `/test/*` pages named in Webflow's manifest.json. Password
 *     protected, answer 401.
 *   - `/search`. Webflow's search TEMPLATE renders a reduced shell — three
 *     collection lists instead of nine, 31014 bytes of nav against 43735
 *     everywhere else — so porting it would fork the shared nav for a page
 *     whose function does not survive the migration at all: Webflow's search
 *     engine has no equivalent after cut-over. Its replacement is a
 *     purpose-built page that will use the standard shell. Until then `/search`
 *     is a redirect, not a port.
 */
export const PAGES = {
  // Home is handled by its own src/pages/index.astro rather than a generated
  // route, because it carries three CMS lists of its own.
  home: '/',

  about: '/about',
  agents: '/agents',
  booking: '/booking',
  contact: '/contact',
  'custom-tours': '/custom-tours',
  faq: '/faq',
  'great-walks': '/great-walks',
  map: '/map',
  payment: '/payment',
  'pick-up': '/pick-up',
  portfolio: '/portfolio',
  privacy: '/privacy',
  qualmark: '/qualmark',
  reviews: '/reviews',
  sitemap: '/sitemap',
  store: '/store',
  terms: '/terms',
  thanks: '/thanks',
  tours: '/tours',
  why: '/why',

  // A machine-readable summary page for LLM crawlers. No nav and no footer at
  // all, so the extractor reports it as `bare` — that is correct, not a miss.
  'data/llms': '/data/llms',
};

/**
 * Pages whose content comes from Sanity rather than the port, so the structural
 * verifier skips them by default.
 *
 * Every page on this site carries the shell's nine collection lists, but the
 * shell is extracted once and verified separately. These are the pages with
 * lists of their OWN — identified by list count above the 9-list shell
 * baseline, not by judgement.
 *
 * `npm run verify -- --cms` includes them for a deliberate look.
 */
export const CMS_PAGES = new Set([
  'home', // +3 lists
  'sitemap', // +3 — lists every tour, area, category and special
  'map', // +2
  'tours', // +1, 31 extra items
  'agents', // +1, 31 extra items
  'booking', // +1, 31 extra items
  'reviews', // +1
  'portfolio', // +1
  'great-walks', // +1
  'pick-up', // +1
]);

/**
 * Webflow collection TEMPLATES, extracted from one sample item each.
 *
 * PICKED BY COUNTING LISTS, NOT BY JUDGEMENT — Webflow omits an empty
 * collection list from the rendered HTML entirely, so a thin item silently
 * hides whole regions of its own template. Where several items tied on list
 * count, the tie was broken on populated field count, which maximises how much
 * of the template renders.
 *
 *   tour            14 lists / 103 items, 23 of 29 fields populated
 *   tourCategory    11 lists / 106 items,  9 of  9
 *   area            10 lists /  88 items,  8 of 10
 *   tag             10 lists /  94 items,  7 of  9
 *   review           9 lists /  80 items, 11 of 11
 *   news             the only live item
 *
 * Keys are prefixed `tpl-` because a collection's template and its landing page
 * share a name — `/tours` is a page, `/tours/<slug>` is a template — and an
 * unprefixed key makes them collide, silently overwriting one page's extracted
 * HTML with the other's.
 */
export const TEMPLATES = {
  'tpl-tour': '/tour/hobbiton-movie-set-tour-1-day',
  'tpl-tourCategory': '/tours/family-tours',
  'tpl-area': '/area/queenstown',
  'tpl-tag': '/tag/1-day',
  'tpl-review': '/reviews/sumeet-g',
  'tpl-news': '/news/10-coolest-things-auckland',
};

/**
 * The shared shell, by CSS class. The extractor punches these subtrees out of
 * each page body and leaves a marker in their place, so one nav and one footer
 * serve every page.
 *
 * BOTH ARE ARRAYS, and on this site they have to be.
 *
 * The header is four sibling blocks — a language switcher, the logo band, an
 * alert bar and the nav proper — inside a wrapper `div` that carries NO CLASS,
 * so there is nothing to match on the wrapper itself. Naming the four parts
 * takes the contiguous range covering them and leaves the wrapper in place as
 * `<div><!--wf:nav--></div>`, which is balanced and harmless. Matching a common
 * ancestor instead would be wrong: on a `/tour/*` page the outermost ancestor
 * of the nav is `.page-wrapper`, which contains the entire page.
 *
 * THE FOOTER IS ONLY `.footer`, and that is a finding rather than a
 * simplification. The page bottom looks like three sibling blocks —
 * `.subscribe`, `.footer`, `.copyright-section` — but they are not invariant:
 *
 *   - `/area/*` has no `.copyright-section`
 *   - `/reviews/*` and `/news/*` have no `.subscribe`
 *   - `/about` has `.footer` BEFORE `.subscribe`, i.e. the two are swapped, so
 *     `.subscribe` sits between `.footer` and `.copyright-section` and no
 *     contiguous range can cover the footer without dragging it in
 *
 * So `.subscribe` and `.copyright-section` stay in each page's body, duplicated
 * per page exactly as Webflow itself ships them. Only what is genuinely shared
 * belongs in the shared fragment; forcing them in would fork the footer over a
 * difference that is real.
 *
 * `.footer` is matched as a whole class token, which is why it finds the real
 * footer and not the `.footer-header` nested inside it.
 */
export const SHELL = {
  nav: [
    { tag: 'div', cls: 'site-bar' },
    { tag: 'div', cls: 'brand-section' },
    { tag: 'div', cls: 'alert-bar' },
    { tag: 'div', cls: 'navigation-bar' },
  ],
  footer: { tag: 'div', cls: 'footer' },
};
