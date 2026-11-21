/**
 * Compare the served sitemap and pages against the live Webflow URL inventory.
 *
 *   node migration-scripts/check-sitemap.mjs
 *
 * Run after `npm run build`. Three checks, in order of what they would catch:
 *
 * 1. EVERY LIVE URL IS STILL LISTED. A URL that silently leaves the sitemap
 *    stops being recrawled, and nothing on the site looks broken — this is the
 *    failure that would be found months later in Search Console.
 *
 * 2. EVERY LISTED URL SERVES A PAGE WITH ITS OWN CANONICAL.
 *
 * 3. NOTHING EXTRA, except what we chose. Deliberate differences are declared
 *    in redirects.config.mjs rather than tolerated, so a NEW difference fails
 *    even though an expected one does not.
 */
import { JSDOM } from 'jsdom';

import { REDIRECTS, SITEMAP_ADDITIONS } from './redirects.config.mjs';
import { WEBFLOW_SOURCE } from './lib/project.mjs';
import { userAgent } from './lib/ua.mjs';

const ORIGIN = WEBFLOW_SOURCE;

/** Pull the paths out of a sitemap XML string. */
const paths = (xml) =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim().replace(ORIGIN, '').replace(/\/$/, ''))
    .map((p) => p || '/');

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    console.error(`FAIL  ${name}`);
    if (detail) console.error(`      ${detail}`);
    failures++;
  }
};

/**
 * OUR SITEMAP IS RENDERED ON DEMAND, so it has to be FETCHED, not read.
 *
 * `/sitemap.xml` is an Astro route backed by the dataset — which is the point,
 * because a publish should be in the sitemap immediately. That stopped
 * `dist/sitemap.xml` existing, and this check went on reading it and failing
 * with "run `npm run build` first" no matter how many times you had. Since it
 * is a step of `npm run preflight`, preflight could not go green at all.
 *
 *   node migration-scripts/check-sitemap.mjs --base http://localhost:4322
 */
const baseArg = process.argv.indexOf('--base');
// `VERIFY_BASE` is the same thing by another route — see verify-port.mjs.
const base = baseArg === -1 ? (process.env.VERIFY_BASE ?? null) : process.argv[baseArg + 1];
if (!base || base.startsWith('--')) {
  console.error('\n--base <url> is required: the sitemap renders on demand, so this needs a');
  console.error('running server. e.g. --base http://localhost:4322\n');
  process.exit(1);
}

const builtRes = await fetch(`${base.replace(/\/$/, '')}/sitemap.xml`, {
  headers: { 'user-agent': userAgent('sitemap-check') },
});
if (!builtRes.ok) {
  console.error(`\nCould not fetch ${base}/sitemap.xml: HTTP ${builtRes.status}\n`);
  process.exit(1);
}
const builtXml = await builtRes.text();

const liveRes = await fetch(`${ORIGIN}/sitemap.xml`, {
  headers: { 'user-agent': userAgent('sitemap-check') },
});
if (!liveRes.ok) {
  console.error(`\nCould not fetch the live sitemap: HTTP ${liveRes.status}\n`);
  process.exit(1);
}

const built = paths(builtXml);
const live = paths(await liveRes.text());

/**
 * URLs the live sitemap has that ours deliberately does not, and why.
 *
 * Only the redirect sources: a 301'd URL must NOT be in the new sitemap, or
 * the canonical becomes ambiguous and Google is told to crawl a redirect.
 */
const intentionallyDropped = new Map(REDIRECTS.map((r) => [r.from, `301 -> ${r.to}`]));

/**
 * URLs we add that the live sitemap does not have: a redirect's destination,
 * plus the pages Webflow's own sitemap had simply gone stale on.
 */
const intentionallyAdded = new Map([
  ...REDIRECTS.map((r) => [r.to.replace(/\/$/, '') || '/', `replaces ${r.from}`]),
  ...SITEMAP_ADDITIONS,
]);

// --- 1. nothing lost -------------------------------------------------------

const missing = live.filter((p) => !built.includes(p) && !intentionallyDropped.has(p));
check(
  `all ${live.length} live URLs still listed`,
  missing.length === 0,
  missing.map((p) => `missing: ${p}`).join('\n      '),
);

for (const [path, why] of intentionallyDropped) {
  if (!live.includes(path)) continue;
  check(`dropped on purpose: ${path} (${why})`, !built.includes(path), 'it is still in our sitemap');
}

// --- 2. nothing listed that is not built -----------------------------------

/**
 * ASKED OF THE SERVER, not of `./dist`.
 *
 * Nothing but static assets is in `dist` any more — every page is rendered by
 * the Worker — so "is there a file behind this entry?" has become "does this
 * URL answer 200?". That is a stronger question anyway: it catches a route
 * that throws as well as one that was never built.
 */
const unbuilt = [];
const invalidCanonicals = [];
for (const path of built) {
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    redirect: 'manual',
    headers: { 'user-agent': userAgent('sitemap-check') },
  });
  if (res.status !== 200) {
    unbuilt.push(`${path} -> HTTP ${res.status}`);
    await res.body?.cancel();
    continue;
  }

  const dom = new JSDOM(await res.text());
  const links = dom.window.document.head.querySelectorAll('link[rel~="canonical" i]');
  const hrefs = Array.from(links, (link) => link.getAttribute('href'));
  dom.window.close();

  const expected = new URL(path, ORIGIN).href;
  if (hrefs.length !== 1 || hrefs[0] !== expected) {
    invalidCanonicals.push(`${path} -> ${JSON.stringify(hrefs)} (expected ${expected})`);
  }
}
check(
  `all ${built.length} listed URLs answer 200`,
  unbuilt.length === 0,
  unbuilt.join('\n      '),
);
check(
  'each served page has one production self-canonical',
  unbuilt.length === 0 && invalidCanonicals.length === 0,
  invalidCanonicals.join('\n      '),
);

// --- 3. nothing unexpected added -------------------------------------------

const added = built.filter((p) => !live.includes(p) && !intentionallyAdded.has(p));
check(
  'no unexpected additions',
  added.length === 0,
  added.map((p) => `extra: ${p}`).join('\n      '),
);

for (const [path, why] of intentionallyAdded) {
  check(`added on purpose: ${path} (${why})`, built.includes(path), 'it is NOT in our sitemap');
}

// --- shape -----------------------------------------------------------------

check('/404 is not listed', !built.includes('/404'), '/404 answers 200 and must never be indexed');
check('no duplicate entries', new Set(built).size === built.length, 'a URL is listed twice');
check(
  'well-formed and namespaced',
  builtXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>') &&
    builtXml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'),
);

// Served, not built — `robots.txt` is an Astro route like the sitemap.
const robotsRes = await fetch(`${base.replace(/\/$/, '')}/robots.txt`, {
  headers: { 'user-agent': userAgent('sitemap-check') },
});
const robots = robotsRes.ok ? await robotsRes.text() : null;
check('robots.txt is served', robots !== null, `HTTP ${robotsRes.status}`);
check(
  'robots.txt points at the sitemap',
  Boolean(robots?.includes(`Sitemap: ${ORIGIN}/sitemap.xml`)),
  'a crawler has no other way to find it',
);

console.log(`\nlive ${live.length} URLs, built ${built.length}`);
if (failures) {
  console.error(`${failures} check(s) failed\n`);
  process.exit(1);
}
console.log('sitemap ok\n');
