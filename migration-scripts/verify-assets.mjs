/**
 * Compare every LINK and every IMAGE on each page to the live Webflow page.
 *
 *   node migration-scripts/verify-assets.mjs --base http://localhost:4322
 *   node migration-scripts/verify-assets.mjs --base <url> /tour/matakana-saturday
 *
 * WHY THIS EXISTS ALONGSIDE verify-port.mjs
 *
 * `verify-port.mjs` compares visible TEXT and the `<body>` TAG COUNT, and says
 * so in its own header. That makes it blind to attribute VALUES — and a region
 * bound to the wrong collection keeps the sample's heading, so the text
 * matches, the tag count matches, and the page passes with the wrong picture
 * behind it and the wrong URL under it.
 *
 * That is not hypothetical. The home page hero shipped bound to `special`
 * instead of `featured`, rendering a 728x90 affiliate banner stretched across
 * the page under a heading that still read correctly, and `verify-port` called
 * the page structurally identical. See AUDIT.hd.
 *
 * HOW IMAGES ARE COMPARED
 *
 * Not by URL — ours are Sanity CDN hashes and the live ones are Webflow CDN
 * filenames, so no two ever match. They are compared by ORIGINAL FILENAME,
 * which the Sanity import preserved on each asset: the asset list is fetched
 * once and every `cdn.sanity.io` URL resolved back through it to the Webflow
 * file it came from.
 *
 * Four differences between the two sides are NOT findings and are normalised
 * away, or they bury the ones that are: the extension (Webflow serves a `.webp`
 * variant of a `.jpg` original), percent-encoding, the punctuation the asset
 * localiser rewrites, and the 24-hex fileId a Webflow re-upload prepends.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ROOT } from './lib/env.mjs';
import { userAgent } from './lib/ua.mjs';
import { query } from './sanity/verify-lib.mjs';
import {
  linkAllowanceFor,
  linkPatternsFor,
  imageAllowanceFor,
} from './divergences.config.mjs';

const manifest = JSON.parse(await readFile(join(ROOT, 'web/src/data/pages.json'), 'utf8'));
const LIVE = manifest.extractedFrom;

const args = process.argv.slice(2);
const FLAGS_WITH_VALUES = new Set(['--base']);
const base = args[args.indexOf('--base') + 1];
if (!args.includes('--base') || !base || base.startsWith('--')) {
  console.error('\n--base <url> is required: this check needs a running server.\n');
  process.exit(1);
}
const only = args.filter(
  (a, i) => !a.startsWith('--') && !FLAGS_WITH_VALUES.has(args[i - 1]),
);
const UA = userAgent('verify-assets');

// ── the Sanity asset map ────────────────────────────────────────────────────
const byHash = new Map();
for (const asset of await query('*[_type == "sanity.imageAsset"]{_id, originalFilename}')) {
  const m = /^image-([0-9a-f]{40})-/.exec(asset._id);
  if (m) byHash.set(m[1], asset.originalFilename);
}

// ── extraction ──────────────────────────────────────────────────────────────
const bodyOf = (html) => {
  const i = html.indexOf('<body');
  const j = html.lastIndexOf('</body>');
  return i < 0 ? html : html.slice(i, j < 0 ? html.length : j);
};

const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** A link, comparable across the two sites: same-origin links become paths. */
function normLink(href) {
  let h = decode(href).trim();
  if (!h) return null;
  if (h.startsWith('#') || h.startsWith('mailto:') || h.startsWith('tel:')) return h;
  h = h.replace(/^https?:\/\/(www\.)?[^/]*tournewzealand\.com/i, '');
  h = h.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, '');
  return h || '/';
}

/** An image, reduced to the part of its filename that identifies the picture. */
function normImage(url) {
  const u = decode(url).trim();
  if (!u) return null;
  if (u.startsWith('data:')) return 'data:';
  const sanity = /cdn\.sanity\.io\/images\/[^/]+\/[^/]+\/([0-9a-f]{40})-/.exec(u);
  let file = sanity
    ? (byHash.get(sanity[1]) ?? `sanity:unmapped:${sanity[1].slice(0, 8)}`)
    : (u.split('?')[0].split('/').pop() ?? u);
  for (let i = 0; i < 3; i += 1) {
    let next;
    try {
      next = decodeURIComponent(file);
    } catch {
      break;
    }
    if (next === file) break;
    file = next;
  }
  file = file.toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '');
  while (/^[0-9a-f]{24}_/.test(file)) file = file.slice(25);
  return file.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function extract(html) {
  const b = bodyOf(html);
  return {
    links: [...b.matchAll(/<a\b[^>]*\shref="([^"]*)"/gi)].map((m) => normLink(m[1])).filter(Boolean),
    images: [
      ...[...b.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/gi)].map((m) => m[1]),
      // The quoted forms must be matched up to their CLOSING QUOTE rather than
      // the first ")": several Webflow filenames contain literal parentheses —
      // "…cropped (2) (Medium).webp" — and a lazy [^)]+ truncates them into a
      // name that matches nothing on the other side. The unquoted form must
      // also exclude "&", or it re-matches the entity-quoted one (there is no
      // literal quote character inside `&quot;…&quot;`) and every background
      // image is counted twice.
      ...[...b.matchAll(/background-image:\s*url\(&quot;(.*?)&quot;\)/gi)].map((m) => m[1]),
      ...[...b.matchAll(/background-image:\s*url\(["']([^"']+)["']\)/gi)].map((m) => m[1]),
      ...[...b.matchAll(/background-image:\s*url\(([^"'()&]+)\)/gi)].map((m) => m[1]),
    ]
      .map(normImage)
      .filter(Boolean),
  };
}

/** Multiset difference, so a value that appears twice on one side shows up. */
function diff(live, ours) {
  const tally = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
  const a = tally(live);
  const b = tally(ours);
  const missing = [];
  const extra = [];
  for (const [k, n] of a) if (n - (b.get(k) ?? 0) > 0) missing.push([k, n - (b.get(k) ?? 0)]);
  for (const [k, n] of b) if (n - (a.get(k) ?? 0) > 0) extra.push([k, n - (a.get(k) ?? 0)]);
  return { missing, extra };
}

const get = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
};

// ── the pages ───────────────────────────────────────────────────────────────
// Carried as [key, path] because the divergence config is keyed the way
// verify-port keys it: the manifest slug for a ported page, the path for a
// collection route.
const paths = [];
for (const [slug, page] of Object.entries(manifest.pages)) {
  if (!page.template) paths.push([slug, page.path]);
}
/**
 * Every collection route too, not one sample each.
 *
 * The mis-bindings this looks for are per TEMPLATE, but which one is wrong only
 * shows on a document whose fields differ: the area map was identical to live
 * on the sample page and the wrong map on the other fourteen.
 */
for (const [type, prefix] of [
  ['tour', '/tour'],
  ['tourCategory', '/tours'],
  ['area', '/area'],
  ['tag', '/tag'],
  ['review', '/reviews'],
  ['news', '/news'],
]) {
  const slugs = await query(`*[_type == "${type}" && defined(slug.current)].slug.current`);
  for (const slug of slugs.sort()) paths.push([`${prefix}/${slug}`, `${prefix}/${slug}`]);
}

const targets = only.length > 0 ? paths.filter(([, p]) => only.includes(p)) : paths;
if (targets.length === 0) {
  console.error(`\nNo pages matched: ${only.join(' ')}\n`);
  process.exit(1);
}

console.log();
let failed = 0;
for (const [key, path] of targets) {
  let live;
  let ours;
  try {
    [live, ours] = await Promise.all([get(LIVE + path), get(base + path)]);
  } catch (e) {
    console.error(`ERR   ${path}  ${e.message}`);
    failed += 1;
    continue;
  }
  /**
   * Declared differences are subtracted here, not tolerated by the comparison
   * itself — so this cannot hide anything but the specific values named in
   * `divergences.config.mjs`. They apply to BOTH sides: the randomised
   * testimonial selection puts different `/reviews/<slug>` links on each.
   */
  const allowedLinks = linkAllowanceFor(key);
  const linkPatterns = linkPatternsFor(key);
  const allowedImages = imageAllowanceFor(key);
  const keepLink = ([value]) =>
    !allowedLinks.has(value) && !linkPatterns.some((re) => re.test(value));
  const keepImage = ([value]) => !allowedImages.has(value);

  const L = extract(live);
  const O = extract(ours);
  const links = diff(L.links, O.links);
  const images = diff(L.images, O.images);
  links.missing = links.missing.filter(keepLink);
  links.extra = links.extra.filter(keepLink);
  images.missing = images.missing.filter(keepImage);
  images.extra = images.extra.filter(keepImage);
  const n =
    links.missing.length + links.extra.length + images.missing.length + images.extra.length;
  if (n === 0) {
    console.log(`ok    ${path.padEnd(48)} ${L.links.length} link(s), ${L.images.length} image(s)`);
    continue;
  }
  failed += 1;
  console.log(
    `FAIL  ${path.padEnd(48)} links ${O.links.length}/${L.links.length}  ` +
      `images ${O.images.length}/${L.images.length}`,
  );
  const show = (label, rows) => {
    for (const [value, count] of rows.slice(0, 10)) {
      console.log(`        ${label} ${count > 1 ? `x${count} ` : ''}${value}`);
    }
    if (rows.length > 10) console.log(`        …and ${rows.length - 10} more`);
  };
  if (links.missing.length) show('link  only live:', links.missing);
  if (links.extra.length) show('link  only ours:', links.extra);
  if (images.missing.length) show('image only live:', images.missing);
  if (images.extra.length) show('image only ours:', images.extra);
}

console.log();
if (failed) {
  console.error(`${targets.length - failed}/${targets.length} page(s) with identical links and images\n`);
  process.exit(1);
}
console.log(`${targets.length}/${targets.length} page(s) with identical links and images\n`);
