/**
 * PER-SITE. The Webflow → Sanity field map for www.tournewzealand.com.
 *
 * Read from the LIVE CMS on 2026-11-14 via
 * `node migration-scripts/webflow/list-collections.mjs --fields`.
 *
 * Read this alongside the Sanity schema: this file says where every Sanity
 * field comes from; the schema says what it means. A field that appears in one
 * and not the other is a bug in whichever was edited last.
 *
 * STATE: the facts below (site, buckets, collection ids) are read off the API
 * and complete. `EXCLUDED`, `DEAD_FIELDS`, `FIELD_MAP`, `EXPECTED` and
 * `RICH_TEXT_FIELDS` are authored from the raw dump — `npm run wf:pull` first,
 * then read `migration/raw/`. They are deliberately empty rather than guessed,
 * because a content model inferred from rendered pages is substantially wrong
 * every time.
 *
 * WHY THIS FILE GETS LONG
 *
 * Because most of the work of a migration is deciding what NOT to carry. A
 * Webflow CMS that has been live for years usually holds several generations of
 * content in the same collections, and all of it is "populated". Say what is
 * excluded and why, here, where it is testable.
 */

/**
 * The Webflow site, and the CDN buckets its assets live in.
 *
 * `SITE_ID` is the `data-wf-site` attribute in the live page source; the pull
 * records it in migration/raw/_meta.json so a later reader can tell which
 * Webflow site a dump came from without trusting the folder it sits in.
 *
 * TWO BUCKETS, not one. This site's assets are split: static/design assets sit
 * under the site id, CMS-uploaded images under a second bucket. 529 of the 609
 * archived asset URLs are in the second. `ASSETS_ID` is the CMS one, since that
 * is the one that matters when auditing what the CMS still points at.
 */
export const SITE_ID = '59f0db6e0aad1d00010940db';
export const ASSETS_ID = '59f0db6e0aad1d0001094110';
export const STATIC_ASSETS_ID = '59f0db6e0aad1d00010940db';

/**
 * Collection name -> Webflow collection id. All thirteen on the site.
 *
 * The name is what `wf:pull` writes to migration/raw/<name>.json and what the
 * converter loads, so it is the camelCase singular of the intended document
 * type rather than Webflow's own slug, which is inconsistent here (`tour` and
 * `tours` are two different collections; `loc` is Pick-Ups).
 *
 * SEVEN OF THESE ARE INVISIBLE IN WEBFLOW'S OWN manifest.json, which lists only
 * the six collections that have a detail template. Everything else appears only
 * inside a list on another page — and is exactly the kind that gets missed.
 */
export const COLLECTIONS = {
  tour: '59f151be8464770001a3cb6b', // Tours — detail template /tour/<slug>
  tourCategory: '59f152308464770001a3cc31', // Tour Categories — /tours/<slug>
  area: '5ba1d0899e3d9f19d8d8cec8', // Areas — /area/<slug>
  tag: '59f0db6e0aad1d0001094163', // Tags — /tag/<slug>
  review: '674e681457d5f259f4b250a2', // Reviews — /reviews/<slug>
  news: '6747e3edf32b8fbebe2bf5e9', // News — /news/<slug>
  island: '5c463dd1d9d64ad4622a9425', // Islands — no template
  pickUp: '664c1b2236cf8154529e0af4', // Pick-Ups (slug `loc`) — no template
  faq: '6845d55820faf18c2b7e4376', // FAQs — no template
  special: '5a3094ed4a2f7d0001956b4c', // Specials — no template
  featured: '5ed5cb5a2e00bf22e877d66a', // Featureds — no template
  alert: '674e78f4bb25a48ff629acd4', // Alerts — no template
  cancellationPolicy: '664fe6c35327623ad59caf78', // Cancellation Policies — no template
};

/**
 * What does NOT come across, and why.
 *
 * Rules are functions of a raw Webflow item so they are testable and so
 * `sanity:convert --report` can say exactly which items each one dropped.
 * Prefer a rule over a hand-listed set of ids: a list goes stale the moment
 * somebody adds an item in Webflow, and goes stale silently.
 */
export const EXCLUDED = {
  /**
   * Collections excluded WHOLESALE — never loaded by the converter at all.
   *
   * All three are empty shells rather than content:
   *
   *   faq                  0 items. There IS a `/faq` page, and its content is
   *                        static HTML — the collection was never used.
   *   alert                1 item, unpublished. The `.alert-bar` block in the
   *                        shared shell renders nothing on every page.
   *   cancellationPolicy   1 item, unpublished. Per-tour policies live on the
   *                        tour itself (`specialCancellationPolicy`).
   *
   * Named here, rather than just omitted, so the omission is on the record and
   * `verify.mjs` can assert the resulting document count is zero — which turns
   * "somebody populated it in Webflow later" into a failing check rather than a
   * silent import.
   */
  collections: ['faq', 'alert', 'cancellationPolicy'],

  /**
   * One rule per partially-excluded collection, named `<collection>Rule`.
   *
   * `isArchived` and `isDraft` are Webflow's own flags and the only honest test
   * for "not live". Matching on a slug or a title would encode today's content
   * and break silently when it changes.
   *
   * The tour collection is where this earns its keep: 73 of its 102 items are
   * archived or draft — 71% of the collection — and every one of them is
   * populated enough to import cleanly if nothing stopped it.
   */
  notLive: (item) => item.isArchived || item.isDraft,
};

/**
 * Fields that are POPULATED in Webflow and deliberately not published.
 *
 * Documentation, not code — but write it down. These are the fields a
 * field-by-field importer would have shipped.
 */
export const DEAD_FIELDS = {
  'tour.pricing-section-intro-text':
    'Populated on 4 live tours and rendered on NO page on the site — confirmed by ' +
    'searching all 94 archived pages for each value. Two of the four are visibly ' +
    'stale: "This rate is applied till end of SEP 2025" and "☆From Sep to Mar 2025". ' +
    'Importing it would publish expired pricing notes.',
  'tour.halal': 'Switch, false on every live item. Wired to nothing.',
  'area.featured': 'Switch, false on all 15 live areas.',
  'area.seq': 'Empty on all 15 live areas — the collection has no working order field.',
  'tag.description': 'Empty on all 4 live tags.',
  'tag.text': 'Rich text, empty on all 4 live tags.',
  'special.pos': 'Empty on all 5 live specials — no order to carry.',
};

/**
 * Webflow field key -> Sanity field, per collection.
 *
 * Documentation for the loops in convert.mjs, kept beside the exclusions so one
 * file answers "where did this field come from". Webflow's keys are slugified
 * and frequently NOT what the field is called in the editor — this site has
 * `featured-2`, `name-detail`, `brief-text`, `general-brief`.
 *
 * `name` AND `title` are both carried wherever both exist. They are not
 * duplicates: they differ on every live area, tag and special — `name` is the
 * short label used in cards and navigation, `title` is the page heading
 * ("Hawke's bay" vs "Tours in Hawke's bay").
 */
export const FIELD_MAP = {
  tour: {
    name: 'title',
    slug: 'slug.current',
    'name-detail': 'nameDetail',
    brief: 'brief',
    'hero-image': 'heroImage',
    photos: 'photos',
    highlights: 'highlights',
    text: 'body',
    'pricing-section': 'pricingSection',
    'price-adult': 'priceAdult',
    'price-child': 'priceChild',
    'price-note-child': 'priceNoteChild',
    'pricing-section-notes': 'pricingNotes',
    'can-pay-online': 'canPayOnline',
    'has-special-cancellation-policy': 'hasSpecialCancellationPolicy',
    'special-cancellation-policy': 'specialCancellationPolicy',
    categories: 'categories[] -> tourCategory',
    areas: 'areas[] -> area',
    tag: 'tag -> tag',
    'related-tours': 'relatedTours[] -> tour',
    special: 'special -> special',
    island: 'island (Option id resolved to north|south)',
    'navi-code': 'naviCode',
    'tour-aid-code': 'tourAidCode',
    seq: 'seq',
    'featured-2': 'featured',
    'lead-value-usd': 'leadValueUsd',
  },
  tourCategory: {
    name: 'name',
    slug: 'slug.current',
    brief: 'brief',
    'brief-text': 'briefText',
    text: 'body',
    hero: 'hero',
    thumb: 'thumb',
    seq: 'seq',
    featured: 'featured',
  },
  area: {
    name: 'name',
    title: 'title',
    slug: 'slug.current',
    brief: 'brief',
    text: 'body',
    hero: 'hero',
    map: 'map',
    island: 'island -> island',
  },
  tag: {
    name: 'name',
    title: 'title',
    slug: 'slug.current',
    'group-title': 'groupTitle',
    color: 'color',
    seq: 'seq',
    hero: 'hero',
  },
  island: {name: 'name', slug: 'slug.current'},
  review: {
    name: 'title',
    slug: 'slug.current',
    from: 'from',
    where: 'where',
    date: 'date',
    rating: 'rating',
    brief: 'brief',
    'general-brief': 'generalBrief',
    full: 'body',
    link: 'link',
    tours: 'tours[] -> tour',
  },
  news: {
    name: 'title',
    slug: 'slug.current',
    date: 'date',
    'post-summary': 'summary',
    'main-image': 'mainImage',
    'post-body': 'body',
    featured: 'featured',
  },
  pickUp: {
    name: 'title',
    slug: 'slug.current',
    address: 'address',
    latitude: 'latitude',
    longitude: 'longitude',
  },
  special: {
    name: 'name',
    title: 'title',
    slug: 'slug.current',
    details: 'details',
    text: 'body',
    'promotion-start-date': 'startDate',
    'promotion-end-date': 'endDate',
    'homepage-banner': 'homepageBanner',
    'homepage-hero-image': 'homepageHeroImage',
    'homepage-link': 'homepageLink',
  },
  featured: {
    name: 'name',
    title: 'title',
    slug: 'slug.current',
    subtitle: 'subtitle',
    'hero-image': 'heroImage',
    link: 'link',
    article: 'body',
    pos: 'pos',
    enabled: 'enabled',
    'start-date': 'startDate',
    'end-date': 'endDate',
  },
};

/**
 * Expected LIVE document count per type, after exclusions.
 *
 * Both the converter and the dataset verifier assert against this, so it is the
 * number that makes a silent half-import impossible.
 *
 * Reconciles to the URL inventory in PROGRESS.hd: the six types with a detail
 * template account for 71 of the 94 live pages (29 + 11 + 15 + 4 + 11 + 1), and
 * the remaining 23 are the home page, 20 static pages, `/data/llms` — plus the
 * four types below that have no page of their own.
 *
 * The three wholesale-excluded collections are asserted at zero.
 */
export const EXPECTED = {
  tour: 29,
  tourCategory: 11,
  area: 15,
  tag: 4,
  island: 2,
  review: 11,
  news: 1,
  pickUp: 5,
  special: 5,
  featured: 2,
};

/**
 * Rich-text fields, as `<collection>.<field>`.
 *
 * The verifier compares each of these character for character against the
 * source HTML. Listing them means adding a rich-text field cannot quietly
 * escape that comparison.
 *
 * `tour.pricing-section-intro-text` is absent on purpose — see DEAD_FIELDS.
 */
export const RICH_TEXT_FIELDS = [
  'tour.highlights',
  'tour.text',
  'tour.pricing-section-notes',
  'tour.special-cancellation-policy',
  'tourCategory.text',
  'area.text',
  'review.full',
  'news.post-body',
  'special.text',
  'featured.article',
];

/**
 * Webflow Option fields, as `<collection>.<field>` -> id -> readable value.
 *
 * An Option field stores an OPAQUE ID, not the label — `tour.island` is
 * `bf6dc55d11c94d89a0275d447553843d`, which imports perfectly and means nothing
 * to anyone. The ids come from the collection schema's own `validations.options`
 * and are recorded here so the converter can resolve them.
 */
export const OPTIONS = {
  'tour.island': {
    bf6dc55d11c94d89a0275d447553843d: 'north',
    efa308d6ab5bc448e31a0e68ae337085: 'south',
  },
};
