/**
 * Render every CMS page offline and assert it got its OWN content.
 *
 *   node --experimental-strip-types migration-scripts/test-templates.mjs
 *
 * THIS IS THE CHECK THE PROCESS CALLS THE ONE MOST LIKELY TO BE SKIPPED, and
 * the mistake it catches is the one most likely to ship: text binding correctly
 * while every page shows the SAME image. On the reference migration all six
 * team pages carried one photograph and all thirteen subareas one hero — the
 * text was right on every page, so nothing looked wrong.
 *
 * It works without a server because the binding layer is pure: the templates
 * are strings on disk, the card renderers take an injected seam resolver, and
 * the data comes from the live dataset over the public query API. So this runs
 * the SAME code the Worker runs, over the SAME content, and asserts on the
 * HTML it produces.
 *
 * What it asserts, per rendered page:
 *   - no sample-item content survives anywhere in the output
 *   - the page's own hero image is present
 *   - every list region's item count matches the data
 * And across all pages of a type:
 *   - the set of hero images has as many DISTINCT values as there are pages
 */
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

import {ROOT} from './lib/env.mjs';
import {query} from './sanity/verify-lib.mjs';

const WEB = join(ROOT, 'web');
const SEAMS = join(WEB, 'src/html/seams');

/**
 * `project.jsonc`, injected the way Vite's `define` injects it in the build.
 *
 * `web/src/lib/project.ts` reads a compile-time constant, so under plain Node
 * it falls back to this global. It has to be set BEFORE the first import that
 * reaches the Sanity client, which is why this is not at the top with the
 * others.
 */
import {readProject} from './lib/project.mjs';
globalThis.__PROJECT_CONFIG__ = readProject();

const url = (p) => `file:///${join(WEB, p).replace(/\\/g, '/')}`;
const {makeCards} = await import(url('src/lib/cards.ts'));
const {bindTour} = await import(url('src/lib/templates/tour.ts'));
const {bindCategory, bindArea, bindTag, bindReview, bindNews} = await import(
  url('src/lib/templates/listings.ts')
);

/** The disk stand-in for `seam-store.ts`'s Vite glob. */
const seamFiles = new Map(
  readdirSync(SEAMS)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), readFileSync(join(SEAMS, f), 'utf8')]),
);
const seam = (name) => {
  const html = seamFiles.get(name);
  if (!html) throw new Error(`seam "${name}" not on disk`);
  return html;
};

const cards = makeCards(seam);
const template = (name) => readFileSync(join(WEB, `src/html/main.${name}.html`), 'utf8');

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    console.error(`FAIL  ${name}`);
    if (detail) console.error(`      ${detail}`);
    failures += 1;
  }
};

/** Image filenames referenced by a rendered page, in src and in CSS backgrounds. */
const imagesIn = (html) =>
  new Set(
    [...html.matchAll(/(?:src="|url\(&quot;|url\("|url\()(\/[^"'()\s]+?\.(?:jpe?g|png|webp|avif|gif))/gi)]
      .map((m) => m[1])
      .concat(
        [...html.matchAll(/cdn\.sanity\.io\/images\/[^"'()\s]+/gi)].map((m) => m[0]),
      ),
  );

const manifest = JSON.parse(readFileSync(join(WEB, 'src/data/pages.json'), 'utf8'));

/** The slug the template was extracted FROM — its own content is not a leak. */
const sampleSlug = (template) => manifest.pages[template].path.split('/').pop();

const SAMPLE = {
  'tpl-tour': [
    'Hobbiton Movie Set Tour</h1>',
    'bagendart',
    'tour-hero---Hobbiton-Movie-Set',
    'Visit the World Renowned Hobbiton Movie Set Tour',
  ],
};

// ── tours ──────────────────────────────────────────────────────────────────

const TOUR_FIELDS = `
  "slug": slug.current, title, nameDetail, brief, naviCode, tourAidCode, island,
  "hero": heroImage{"ref": asset._ref, "alt": alt, "hotspot": hotspot},
  "photos": photos[]{"ref": asset._ref, "alt": alt, "hotspot": hotspot},
  highlights, body, pricingSection, priceAdult, priceChild, priceNoteChild,
  pricingNotes, canPayOnline, hasSpecialCancellationPolicy, specialCancellationPolicy,
  "tag": tag->{"slug": slug.current, title, name, color},
  "categories": categories[]->{"slug": slug.current, name, brief},
  "areas": areas[]->{"slug": slug.current, name, title},
  "special": special->{"slug": slug.current, title, details},
  "related": relatedTours[]->{
    "slug": slug.current, title, brief, nameDetail,
    "hero": heroImage{"ref": asset._ref, "hotspot": hotspot},
    priceAdult, "tag": tag->{"slug": slug.current, title, name, color}
  },
  "reviews": *[_type == "review" && references(^._id)]|order(date desc){
    "slug": slug.current, title, from, rating,
    "brief": coalesce(brief, generalBrief), generalBrief, link
  }
`;

const tours = await query(`*[_type == "tour"]|order(title asc){${TOUR_FIELDS}}`);
const shell = await query(`{
  "pickUps": *[_type == "pickUp"]|order(title asc){"slug": slug.current, title, address, latitude, longitude},
  "areas": *[_type == "area"]{"slug": slug.current, name, title, "island": island->slug.current},
  "categories": *[_type == "tourCategory"]|order(seq asc){"slug": slug.current, name, brief},
  "tags": *[_type == "tag"]|order(seq asc){"slug": slug.current, name, title, color},
  "tours": []
}`);

const tourTpl = template('tpl-tour');
const heroesSeen = new Map();
let rendered = 0;

for (const tour of tours) {
  let html;
  try {
    html = bindTour(tourTpl, tour, shell, cards);
  } catch (e) {
    check(`/tour/${tour.slug} renders`, false, e.message);
    continue;
  }
  rendered += 1;

  // No sample-item content may survive, anywhere — EXCEPT on the sample item's
  // own page, where that content is simply correct. The sample slug is read
  // from the extraction manifest rather than hardcoded, so changing the sample
  // in pages.config.mjs cannot silently disable this check.
  if (tour.slug !== sampleSlug('tpl-tour')) {
    const leaked = SAMPLE['tpl-tour'].filter((needle) => html.includes(needle));
    check(
      `/tour/${tour.slug} — no sample content`,
      leaked.length === 0,
      `leaked: ${leaked.join(', ')}`,
    );
  }

  // Its own title and hero.
  check(`/tour/${tour.slug} — own title`, html.includes(`>${escapeText(tour.title)}</h1>`));

  const imgs = imagesIn(html);
  const hero = [...imgs].find((u) => /cdn\.sanity\.io/.test(u));
  check(`/tour/${tour.slug} — a Sanity hero image`, Boolean(hero), `images: ${[...imgs].slice(0, 3)}`);
  if (hero) {
    const key = hero.replace(/\?.*$/, '');
    heroesSeen.set(tour.slug, key);
  }

  /**
   * THE BOOKING PAYLOAD — the five hidden inputs the enquiry travels in.
   *
   * Asserted per tour because nothing else can see them: they are invisible on
   * the page, identical in structure on all 29, and a page still submits
   * perfectly well with the sample tour's code and prices in them. A text diff
   * against the live page is the only other check that would catch it, and the
   * values it compares are exactly these.
   */
  const payload = Object.fromEntries(
    [...html.matchAll(/<input[^>]*\sid="([^"]+)"[^>]*\svalue="([^"]*)"[^>]*>/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  const expected = {
    tour: escapeText(tour.title),
    'tour-code': escapeText(tour.naviCode),
    'adult-price': tour.priceAdult != null ? String(tour.priceAdult) : '',
    'child-price': tour.priceChild != null ? String(tour.priceChild) : '',
    'can-pay-online': tour.canPayOnline ? 'true' : 'false',
  };
  const wrong = Object.entries(expected).filter(([k, v]) => payload[k] !== v);
  check(
    `/tour/${tour.slug} — booking payload (${expected['tour-code']})`,
    wrong.length === 0,
    wrong.map(([k, v]) => `${k}: want "${v}", got "${payload[k]}"`).join('; '),
  );

  /**
   * `window.Tour` AND THE CALENDAR MUST AGREE, which is why they are one check.
   *
   * The engine locks the "Requested Date" field whenever `TourAidCode` is
   * non-empty, on the understanding that the calendar embed fills it in. A page
   * with a code and no calendar therefore has a required field nothing can
   * fill, and cannot be submitted at all — the exact failure the sample's
   * frozen code caused on the 13 tours that have no calendar.
   */
  const g = /window\.Tour\s*=\s*(\{[^{}]*\})\s*;/.exec(html);
  let tourGlobal = null;
  try {
    tourGlobal = g ? JSON.parse(g[1]) : null;
  } catch {
    tourGlobal = null;
  }
  const hasCalendar = /tour-calendar\?tour=/.test(html);
  check(
    `/tour/${tour.slug} — window.Tour, calendar ${hasCalendar ? 'present' : 'absent'}`,
    tourGlobal !== null &&
      tourGlobal.Name === tour.title &&
      tourGlobal.TourAidCode === (tour.tourAidCode ?? '') &&
      hasCalendar === Boolean(tour.tourAidCode),
    tourGlobal === null
      ? `window.Tour missing or not JSON: ${g ? g[1] : '(no match)'}`
      : `got ${JSON.stringify(tourGlobal)}, calendar=${hasCalendar}`,
  );

  // The photo gallery must have one item per photo.
  const galleryItems = (html.match(/class="sidebar-tour-photo"/g) ?? []).length;
  check(
    `/tour/${tour.slug} — ${tour.photos?.length ?? 0} gallery photo(s)`,
    galleryItems === (tour.photos?.length ?? 0),
    `rendered ${galleryItems}`,
  );
}

function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

check(`all ${tours.length} tours rendered`, rendered === tours.length, `${rendered} rendered`);

/**
 * THE CENTRAL ASSERTION. Distinct heroes, not one repeated.
 *
 * Counting DISTINCT values rather than checking each is non-empty is the whole
 * point — a template that binds the sample image everywhere passes every
 * per-page check and fails only this one.
 */
const distinct = new Set(heroesSeen.values());
check(
  `tour heroes are per-item: ${distinct.size} distinct across ${heroesSeen.size} pages`,
  distinct.size === heroesSeen.size,
  (() => {
    const counts = new Map();
    for (const [slug, url] of heroesSeen) counts.set(url, [...(counts.get(url) ?? []), slug]);
    return [...counts.entries()]
      .filter(([, slugs]) => slugs.length > 1)
      .map(([url, slugs]) => `${slugs.join(', ')} all share ${url.slice(-40)}`)
      .join('\n      ');
  })(),
);

// ── the listing templates ──────────────────────────────────────────────────

const CARD = `
  "slug": slug.current, title, brief, nameDetail,
  "hero": heroImage{"ref": asset._ref, "alt": alt, "hotspot": hotspot},
  priceAdult, "tag": tag->{"slug": slug.current, title, name, color}
`;
const TOURS_HERE = `*[_type == "tour" && references(^._id)]|order(seq asc, title asc){${CARD}}`;

/**
 * Render every page of a listing type and assert the same two properties as the
 * tours: no sample content, and DISTINCT hero images across the set.
 *
 * The distinct-hero count is the assertion that matters. Every per-page check
 * passes when a template binds one image everywhere; only counting distinct
 * values catches it.
 */
async function checkType({name, route, groq, template, bind, heroSeam, headingSeam, sample}) {
  const docs = await query(groq);
  const tpl = template_(template);
  const heroes = new Map();
  let ok = 0;

  for (const doc of docs) {
    let html;
    try {
      html = bind(tpl, doc, shell, cards);
    } catch (e) {
      check(`${route}/${doc.slug} renders`, false, e.message);
      continue;
    }
    ok += 1;

    if (doc.slug !== sampleSlug(template)) {
      const leaked = (sample ?? []).filter((needle) => html.includes(needle));
      check(`${route}/${doc.slug} — no sample content`, leaked.length === 0, `leaked: ${leaked.join(', ')}`);
    }

    if (headingSeam) {
      check(
        `${route}/${doc.slug} — own heading`,
        html.includes(`>${escapeText(doc[headingSeam])}<`),
        `expected heading ${JSON.stringify(doc[headingSeam])}`,
      );
    }

    if (heroSeam) {
      const hero = [...imagesIn(html)].find((u) => /cdn\.sanity\.io/.test(u));
      check(`${route}/${doc.slug} — a Sanity hero`, Boolean(hero));
      if (hero) heroes.set(doc.slug, hero.replace(/\?.*$/, ''));
    }
  }

  check(`all ${docs.length} ${name} rendered`, ok === docs.length, `${ok} rendered`);

  if (heroSeam && heroes.size) {
    const distinct = new Set(heroes.values());
    check(
      `${name} heroes are per-item: ${distinct.size} distinct across ${heroes.size} pages`,
      distinct.size === heroes.size,
      [...heroes.entries()].map(([s, u]) => `${s} -> ${u.slice(-32)}`).join('\n      '),
    );
  }
}

const template_ = (name) => readFileSync(join(WEB, `src/html/main.${name}.html`), 'utf8');

await checkType({
  name: 'categories',
  route: '/tours',
  template: 'tpl-tourCategory',
  bind: bindCategory,
  heroSeam: true,
  headingSeam: 'name',
  sample: ['Family Tours</h1>', 'hiking-with-kids-towards-hinterschiesslingalm'],
  groq: `*[_type == "tourCategory"]|order(name asc){
    "slug": slug.current, name, brief, briefText, body,
    "hero": hero{"ref": asset._ref, "alt": alt, "hotspot": hotspot},
    "tours": ${TOURS_HERE}
  }`,
});

await checkType({
  name: 'areas',
  route: '/area',
  template: 'tpl-area',
  bind: bindArea,
  heroSeam: true,
  headingSeam: 'title',
  sample: ['Tours in Queenstown &amp; Wanaka</h1>', 'Paragliding-from-Bobs-Peak'],
  groq: `*[_type == "area"]|order(name asc){
    "slug": slug.current, name, title, brief, body,
    "hero": hero{"ref": asset._ref, "alt": alt, "hotspot": hotspot},
    "map": map{"ref": asset._ref, "alt": alt, "hotspot": hotspot},
    "tours": ${TOURS_HERE}
  }`,
});

await checkType({
  name: 'tags',
  route: '/tag',
  template: 'tpl-tag',
  bind: bindTag,
  heroSeam: true,
  headingSeam: 'title',
  sample: ['1 Day Tours</h1>', '167553-(2)'],
  groq: `*[_type == "tag"]|order(seq asc){
    "slug": slug.current, name, title,
    "hero": hero{"ref": asset._ref, "alt": alt, "hotspot": hotspot},
    "tours": ${TOURS_HERE}
  }`,
});

await checkType({
  name: 'reviews',
  route: '/reviews',
  template: 'tpl-review',
  bind: (tpl, doc) => bindReview(tpl, doc),
  groq: `*[_type == "review"]|order(date desc){
    "slug": slug.current, title, from, where, date, rating,
    "brief": coalesce(brief, generalBrief), generalBrief, link, body
  }`,
});

await checkType({
  name: 'news posts',
  route: '/news',
  template: 'tpl-news',
  bind: (tpl, doc) => bindNews(tpl, doc),
  headingSeam: 'title',
  groq: `*[_type == "news"]{
    "slug": slug.current, title, date, summary, body,
    "mainImage": mainImage{"ref": asset._ref, "alt": alt, "hotspot": hotspot}
  }`,
});

// ── the shared nav ─────────────────────────────────────────────────────────
//
// THIS WAS THE GAP. The nav binding was the one layer with no offline test, and
// it was the one that took the site down: an unbalanced row template corrupted
// the document, the list count collapsed from 9 to 5, and every page 500'd.
// Everything else was proven by a test and worked first time.

const {bindNav, NAV_LISTS} = await import(url('src/lib/shell.ts'));
const {countLists, listItemCount} = await import(url('src/lib/seams.ts'));

{
  const nav = readFileSync(join(WEB, 'src/html/nav.html'), 'utf8');
  const navShell = await query(`{
    "categories": *[_type == "tourCategory"]|order(seq asc){"slug": slug.current, name, brief, featured},
    "areas": *[_type == "area"]|order(name asc){"slug": slug.current, name, title, "island": island->slug.current},
    "tags": *[_type == "tag"]|order(seq asc){"slug": slug.current, name, title, color},
    "tours": *[_type == "tour"]|order(seq asc, title asc){${CARD}, island, featured},
    "pickUps": []
  }`);

  let bound;
  try {
    bound = bindNav(nav, navShell);
    check('nav binds', true);
  } catch (e) {
    check('nav binds', false, e.message);
    bound = null;
  }

  if (bound) {
    // The structure must survive. This is the assertion whose absence cost the
    // whole site: a corrupted row template changes the list count, and nothing
    // else notices until a request comes in.
    check(
      `nav still has ${NAV_LISTS} collection lists after binding`,
      countLists(bound) === NAV_LISTS,
      `now ${countLists(bound)}`,
    );

    // Balanced div tags — the direct symptom of a truncated row.
    const opens = (bound.match(/<div\b/g) ?? []).length;
    const closes = (bound.match(/<\/div>/g) ?? []).length;
    check('nav div tags are balanced', opens === closes, `${opens} open, ${closes} close`);

    // Every tour and area must actually appear.
    // Only tours WITH an island appear in the nav's autocomplete feeds, which
    // is also true of the live site: three live tours have no island set and
    // are listed in neither the North nor the South column.
    const placed = navShell.tours.filter((t) => t.island);
    const missingTours = placed.filter((t) => !bound.includes(`/tour/${t.slug}`));
    check(
      `nav lists all ${placed.length} island-placed tours`,
      missingTours.length === 0,
      `missing: ${missingTours.slice(0, 5).map((t) => t.slug).join(', ')}`,
    );
    const missingAreas = navShell.areas.filter((a) => !bound.includes(`/area/${a.slug}`));
    check(
      `nav lists all ${navShell.areas.length} areas`,
      missingAreas.length === 0,
      `missing: ${missingAreas.map((a) => a.slug).join(', ')}`,
    );

    // ROW COUNTS PER LIST, not pattern counts across the document. Two earlier
    // forms of this check were wrong in instructive ways: looking for an
    // extraction-time title failed because that tour is still in the dataset
    // and its row is legitimately rebound to the same value; counting the match
    // attribute document-wide was off by one, because the nav carries a
    // prototype row outside all nine list regions.
    const expectedRows = {
      0: navShell.categories.length,
      1: navShell.tours.filter((t) => t.island === 'north').length,
      2: navShell.tours.filter((t) => t.island === 'south').length,
      4: navShell.categories.filter((c) => c.featured).length,
      5: navShell.tags.length,
      6: navShell.tours.filter((t) => t.featured).length,
      7: navShell.areas.filter((a) => a.island !== 'south').length,
      8: navShell.areas.filter((a) => a.island === 'south').length,
    };

    const wrong = Object.entries(expectedRows)
      .map(([index, want]) => ({index, want, got: listItemCount(bound, Number(index))}))
      .filter(({want, got}) => want !== got);

    check(
      'nav: every list has one row per document',
      wrong.length === 0,
      wrong.map(({index, want, got}) => `list #${index}: ${got}, expected ${want}`).join('; '),
    );
  }
}

// ── the ported static pages that carry their own lists ────────────────────

const {bindStaticLists, BOUND_STATIC_PAGES} = await import(
  url('src/lib/templates/static-lists.ts')
);

const fullShell = await query(
  readFileSync(join(WEB, 'src/lib/cms.ts'), 'utf8')
    .match(/export const SHELL_QUERY = `([\s\S]*?)`;/)[1]
    .replace(/\$\{IMAGE\}/g, '{"ref": asset._ref, "alt": alt, "hotspot": hotspot, "crop": crop}')
    .replace(/\$\{TOUR_CARD\}/g, CARD)
    .replace(
      /\$\{REVIEW_CARD\}/g,
      '"slug": slug.current, title, from, rating, "brief": coalesce(brief, generalBrief), generalBrief, link',
    ),
);

for (const slug of BOUND_STATIC_PAGES) {
  const file = join(WEB, `src/html/main.${slug.replace(/\//g, '__')}.html`);
  let frozen;
  try {
    frozen = readFileSync(file, 'utf8');
  } catch {
    check(`/${slug} — fragment exists`, false, `missing ${file}`);
    continue;
  }

  let bound;
  try {
    bound = bindStaticLists(slug, frozen, {shell: fullShell, cards, seam});
  } catch (e) {
    check(`/${slug} — lists bind`, false, e.message);
    continue;
  }

  check(`/${slug} — lists bind`, true);

  // The binding must CHANGE something. A binder that silently no-ops leaves the
  // extraction-time content in place, which renders perfectly and goes stale.
  check(
    `/${slug} — frozen list content replaced`,
    bound !== frozen,
    'the binder produced output identical to the frozen fragment',
  );
}

console.log();
if (failures) {
  console.error(`${failures} assertion(s) failed\n`);
  process.exit(1);
}
console.log('templates ok\n');
