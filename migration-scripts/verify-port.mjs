/**
 * Structurally diff every built page against the live Webflow page.
 *
 *   node migration-scripts/verify-port.mjs                # every page in the manifest
 *   node migration-scripts/verify-port.mjs about privacy  # just these slugs
 *
 * Run after `npm run build`. Reads ./dist, fetches the live equivalents, and
 * compares two things that are invariant under the port:
 *
 *   TEXT     every visible line of text on the live page must appear on ours
 *   TAGS     the number of element open-tags in <body> must match exactly
 *
 * WHY NOT A BYTE DIFF
 *
 * Because the port deliberately changes bytes: asset URLs are rewritten to
 * /wf/*, `integrity` and `crossorigin` are dropped with them, and the head is
 * re-emitted in BaseLayout's order rather than Webflow's. A byte diff would be
 * red on every page forever and would therefore be ignored, which is worse than
 * no check at all.
 *
 * Text-and-tag-count is the strongest comparison that is still clean when the
 * port is correct. It catches the failures that actually happen: a dropped
 * section, a nav that did not substitute, a list that came back empty, a
 * double-escaped entity (it caught exactly that on the first run — three page
 * titles rendering a literal "&amp;").
 *
 * WHAT IT CANNOT CATCH: CSS, layout, and anything JavaScript builds at runtime.
 * A page can pass this and still look wrong. Open it in a browser too.
 *
 * LAYOUT: `WEB` assumes the Astro app sits in `web/`. In a single-package repo,
 * point it at ROOT instead.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CMS_PAGES } from './pages.config.mjs';
import {
  tagAllowanceFor,
  textAllowanceFor,
  textPatternsFor,
  resolveTextFrom,
} from './divergences.config.mjs';
import { userAgent } from './lib/ua.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// WEB and DIST come from lib/paths.mjs so the three scripts that read the build
// output cannot disagree about where it is — see the note there about the
// adapter moving `dist` to `dist/client`.
const { WEB, DIST } = await import('./lib/paths.mjs');

const manifest = JSON.parse(await readFile(join(WEB, 'src/data/pages.json'), 'utf8'));
const ORIGIN = manifest.extractedFrom;

const args = process.argv.slice(2);

/**
 * CMS pages are SKIPPED by default.
 *
 * Their lists now come from Sanity, and the live page lists whatever Webflow
 * had — which is the thing being deliberately replaced. Comparing them does not
 * measure the port's fidelity, it measures how much the content changed, and on
 * any given site a handful of legitimate changes show up: an editorial date
 * rendered instead of a Webflow system timestamp, a corrected `tel:` href, a
 * slug-collision URL replaced with a clean one.
 *
 * Left in by default, those become noise that trains everyone to ignore a red
 * line. `--cms` includes them anyway, for eyeballing a diff on purpose.
 */
const includeCms = args.includes('--cms');
/**
 * Page slugs are the bare arguments — minus any flag VALUE.
 *
 * `--base <url>` takes a value, and without excluding it the URL is read as a
 * page slug: `npm run verify -- --base http://localhost:4322` reported
 * "No pages matched: http://localhost:4322" rather than verifying anything.
 */
const FLAGS_WITH_VALUES = new Set(['--base', '--env-dir']);
const only = args.filter(
  (a, i) => !a.startsWith('--') && !FLAGS_WITH_VALUES.has(args[i - 1]),
);

/** Visible text lines, with <script>/<style> contents removed first. */
/**
 * Decode the entity forms that differ between generators but render the same.
 *
 * REQUIRED, not a nicety. Webflow writes an apostrophe as `&#x27;` and Astro
 * writes `&#39;` — the same character, two spellings, and a comparison of
 * visible TEXT must not see a difference. Without this, every page whose
 * copy contains an apostrophe, a quote or an ampersand reports as a failed
 * port: on this site `/great-walks` failed on its own title while its tag
 * counts matched exactly, 596 to 596.
 *
 * Numeric forms are decoded generically, so `&#8217;` and `&#x2019;` collapse
 * too.
 */
const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Last: an encoded `&amp;#39;` must not become an apostrophe on the way.
    .replace(/&amp;/g, '&');

function textLines(html) {
  const stripped = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '\n');
  return stripped
    .split('\n')
    .map((l) => decodeEntities(l).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Element open-tags inside <body>. */
function bodyTags(html) {
  const i = html.indexOf('<body');
  const body = i === -1 ? html : html.slice(i);
  return body.match(/<[a-zA-Z][\w-]*/g) ?? [];
}

/** `/` -> index.html, `/about` -> about.html. Matches build.format: 'file'. */
const distFileFor = (path) => (path === '/' ? 'index.html' : `${path.replace(/^\//, '')}.html`);

const skipped = [];
const targets = Object.entries(manifest.pages).filter(([slug, page]) => {
  if (page.template) return false;
  if (only.length > 0) return only.includes(slug);
  if (CMS_PAGES.has(slug) && !includeCms) {
    skipped.push(slug);
    return false;
  }
  return true;
});

/**
 * COLLECTION PAGES, fetched from the dataset.
 *
 * `--routes` adds every document's page to the run: 71 of this site's 94 pages
 * are collection routes and the verifier never looked at a single one of them,
 * because the manifest only knows about the one sample item per template. A
 * check that covers 23% of the site and reports "22/22" is the kind of green
 * that hides things.
 *
 * Each page is compared to its own live equivalent, so a difference is a
 * binding bug rather than a difference in content.
 */
const includeRoutes = args.includes('--routes');

if (includeRoutes) {
  const {query} = await import('./sanity/verify-lib.mjs');
  const ROUTED = [
    ['tour', '/tour', 'tpl-tour'],
    ['tourCategory', '/tours', 'tpl-tourCategory'],
    ['area', '/area', 'tpl-area'],
    ['tag', '/tag', 'tpl-tag'],
    ['review', '/reviews', 'tpl-review'],
    ['news', '/news', 'tpl-news'],
  ];

  for (const [type, base, template] of ROUTED) {
    const slugs = await query(`*[_type == "${type}" && defined(slug.current)].slug.current`);
    for (const slug of slugs.sort()) {
      if (only.length > 0 && !only.includes(`${base}/${slug}`)) continue;
      targets.push([
        `${base}/${slug}`,
        {...manifest.pages[template], path: `${base}/${slug}`, template: false},
      ]);
    }
  }
}

/**
 * Dataset-derived text allowances, resolved once.
 *
 * Only reaches the network when a divergence actually declares a query, so a
 * site with none stays offline.
 */
let derivedText = new Set();
try {
  const {query} = await import('./sanity/verify-lib.mjs');
  derivedText = await resolveTextFrom(query);
} catch {
  // No dataset reachable — the declared allowances simply do not apply.
}

if (targets.length === 0) {
  console.error(`\nNo pages matched: ${only.join(' ')}\n`);
  process.exit(1);
}

let failed = 0;
const rows = [];

/**
 * Where OUR copy of a page comes from.
 *
 * Reading `dist` only works for a PRERENDERED site. Once routes render on
 * demand there are no built HTML files at all, and this check reported
 * "run npm run build first" for all 22 pages against a build that had just
 * succeeded — which reads as a missing step rather than an architectural one.
 *
 *   npm run verify                        read ./dist (prerendered sites)
 *   npm run verify -- --base http://…     fetch from a running server
 *
 * The base form is also what makes this usable as the Phase 3 audit tool: point
 * it at the dev server or the *.workers.dev URL and it diffs the real responses
 * against the live site.
 */
const baseIndex = process.argv.indexOf('--base');
const BASE = baseIndex === -1 ? null : process.argv[baseIndex + 1]?.replace(/\/+$/, '');
if (baseIndex !== -1 && !BASE) {
  console.error('\n--base needs a URL, e.g. --base http://localhost:4321\n');
  process.exit(1);
}

const ourCopy = async (page) => {
  if (!BASE) return readFile(join(DIST, distFileFor(page.path)), 'utf8').catch(() => null);
  const res = await fetch(`${BASE}${page.path === '/' ? '' : page.path}`, {
    headers: {'user-agent': userAgent('verify')},
  });
  return res.ok ? res.text() : null;
};

for (const [slug, page] of targets) {
  const built = await ourCopy(page);
  if (built === null) {
    rows.push({
      slug,
      verdict: BASE ? 'NO RESPONSE' : 'NOT BUILT',
      notes: [
        BASE
          ? `${BASE}${page.path} did not answer`
          : 'no built file — this site renders on demand, so use: npm run verify -- --base <url>',
      ],
    });
    failed++;
    continue;
  }

  const url = `${ORIGIN}${page.path === '/' ? '' : page.path}`;
  const res = await fetch(url, { headers: { 'user-agent': userAgent('verify') } });
  if (!res.ok) {
    rows.push({ slug, verdict: `HTTP ${res.status}`, notes: [url] });
    failed++;
    continue;
  }
  const live = await res.text();

  const ours = new Set(textLines(built));

  /**
   * DECLARED divergences are subtracted before comparing.
   *
   * A handful of differences from the live site are deliberate — the live nav
   * lists a tour that is archived in Webflow, and one dead `<script>` tag was
   * removed. Each is declared in `divergences.config.mjs` with the number of
   * `<body>` tags it accounts for and the reason. Anything left over still
   * fails, so this cannot hide a regression; it only stops the check being
   * permanently red for reasons someone already decided.
   */
  const allowedText = textAllowanceFor(slug);
  const allowedPatterns = textPatternsFor(slug);
  const allowedTags = tagAllowanceFor(slug);

  const missing = textLines(live).filter(
    (l) =>
      !ours.has(l) &&
      !allowedText.has(l) &&
      !derivedText.has(l) &&
      !allowedPatterns.some((re) => re.test(l)),
  );
  const tagsOurs = bodyTags(built).length;
  const tagsLive = bodyTags(live).length;
  const tagGap = tagsLive - tagsOurs - allowedTags;

  const notes = [];
  for (const m of missing.slice(0, 5)) notes.push(`missing text: ${m.slice(0, 90)}`);
  if (missing.length > 5) notes.push(`…and ${missing.length - 5} more missing lines`);
  if (tagGap !== 0) {
    notes.push(
      `body tags ${tagsOurs} vs ${tagsLive} live` +
        (allowedTags ? ` (${allowedTags} declared, ${tagGap} unexplained)` : ''),
    );
  }

  const ok = missing.length === 0 && tagGap === 0;
  if (!ok) failed++;
  rows.push({
    slug,
    verdict: ok ? 'ok' : 'DIFF',
    tags: `${tagsOurs}/${tagsLive}`,
    notes,
  });
}

console.log();
for (const r of rows) {
  console.log(`${r.verdict === 'ok' ? 'ok  ' : 'FAIL'}  ${r.slug.padEnd(24)} ${r.tags ?? ''}`);
  for (const n of r.notes) console.log(`        ${n}`);
}

console.log(
  `\n${targets.length - failed}/${targets.length} page(s) structurally identical to ${ORIGIN}`,
);
if (skipped.length) {
  console.log(
    `      skipped ${skipped.length} CMS page(s): ${skipped.join(', ')} — their lists come from Sanity now (--cms to include)`,
  );
}
console.log();
process.exit(failed === 0 ? 0 : 1);
