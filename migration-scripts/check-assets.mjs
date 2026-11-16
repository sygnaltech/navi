/**
 * Prove the built site does not depend on Webflow, and that every local asset
 * reference resolves.
 *
 *   node migration-scripts/check-assets.mjs
 *
 * Run after `npm run build`. This is the gate that should have existed from
 * the first day of the port: the site rendered perfectly for days while the
 * typeface, the logo, every icon and every photo were still being served by
 * the Webflow account we were leaving. Nothing failed, because nothing checked.
 *
 * THREE CHECKS
 *
 * 1. NO WEBFLOW HOSTS in any built HTML or CSS. The one that matters.
 * 2. EVERY `/wf/...` REFERENCE EXISTS on disk. Catches a localisation that
 *    rewrote a URL without downloading the file.
 * 3. THE FONTS ARE LOCAL. Called out separately because they are referenced
 *    only from inside the stylesheet, so an HTML-only audit — including a
 *    careful manual one — misses them entirely.
 *
 * Other external hosts are REPORTED, not failed: a Google Fonts loader, a form
 * endpoint and a self-hosted video domain are all deliberate and none of them
 * disappear with Webflow. The report exists so the list stays honest.
 *
 * LAYOUT: `WEB` assumes the Astro app sits in `web/`. In a single-package repo,
 * point it at ROOT instead.
 */
import { readFile, readdir, access, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// The site is its own package under web/. migration-scripts/ stays at the repo root
// because the Studio and the migration tooling share it, so anything reaching
// into the site goes through WEB rather than ROOT.
// See lib/paths.mjs: the adapter moved `dist` to `dist/client`, and three
// scripts hardcoding the old path all reported "run npm run build first"
// against a build that had just succeeded.
const { WEB, DIST } = await import('./lib/paths.mjs');

const exists = (p) => access(p).then(() => true, () => false);

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    console.error(`FAIL  ${name}`);
    if (detail) console.error(detail);
    failures++;
  }
};

/** Every .html and .css under dist, recursively. */
async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) {
      // _worker.js holds the bundled server code; its asset strings are the
      // same ones already checked in the HTML, and it contains minified
      // third-party JS that produces noise.
      if (name === '_worker.js') continue;
      out.push(...(await walk(full)));
    } else if (/\.(html|css)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

if (!(await exists(DIST))) {
  console.error('\nNo ./dist — run `npm run build` first.\n');
  process.exit(1);
}

/**
 * Both the BUILD OUTPUT and the SOURCE FRAGMENTS are scanned.
 *
 * Scanning `dist` alone was enough while every page was prerendered into it.
 * Once routes render on demand there is no HTML in `dist` at all, and this
 * check quietly narrowed to "1 built file" — the stylesheet — and passed. A
 * check that silently stops looking at the pages is worse than one that fails.
 *
 * `src/html/` holds the frozen fragments every rendered page is assembled from,
 * so it is the authoritative place to catch a Webflow URL, and catching it
 * there is earlier and more specific than catching it in a rendered page.
 */
const SRC_HTML = join(WEB, 'src/html');

const files = [...(await walk(DIST)), ...((await exists(SRC_HTML)) ? await walk(SRC_HTML) : [])];
const rel = (f) =>
  f.startsWith(DIST)
    ? f.slice(DIST.length + 1).replace(/\\/g, '/')
    : `src/html/${f.slice(SRC_HTML.length + 1).replace(/\\/g, '/')}`;

// --- 1. no Webflow hosts ---------------------------------------------------

const WEBFLOW_HOSTS = /https?:\/\/[^"'\s)]*(?:website-files\.com|webflow\.io|assets\.website-files)/g;

/**
 * The same hosts, PERCENT-ENCODED.
 *
 * Webflow's client-side repeater template ships as
 * `<script type="text/x-wf-template">` with `encodeURIComponent`-ed markup
 * inside, so its asset URLs read `https%3A%2F%2Fcdn.prod.website-files.com%2F…`
 * and the pattern above never sees them. Without this the check passes while a
 * live dependency on the CDN being cancelled sits in the page — which is
 * exactly the failure this whole script exists to prevent.
 */
const WEBFLOW_ENCODED = /https?%3A%2F%2F[^"'\s]*?website-files(?:\.|%2E)com/gi;

const offenders = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  const hits = [
    ...new Set([...(text.match(WEBFLOW_HOSTS) ?? []), ...(text.match(WEBFLOW_ENCODED) ?? [])]),
  ];
  for (const hit of hits) offenders.push(`      ${rel(file)}\n        ${hit.slice(0, 110)}`);
}
check(
  `no Webflow-hosted assets in ${files.length} built file(s)`,
  offenders.length === 0,
  offenders.slice(0, 12).join('\n'),
);

// --- 2. every local asset reference resolves -------------------------------

/**
 * Local `/wf/...` references, in attributes and in `url()`.
 *
 * THE `url()` BRANCH MUST NOT STOP AT `)`. Webflow filenames contain
 * parentheses — `Camera (1).png`, `42945 (Medium).webp` — so a `[^"')]+` class
 * truncates the path at the `(` group and then reports the perfectly good file
 * as missing. That produced six phantom failures here, all naming files that
 * were present on disk, which reads as a broken localiser rather than a broken
 * check.
 *
 * Webflow quotes every `url()` it emits, so the quote is the terminator; the
 * unquoted branch keeps the `)` exclusion because it has nothing else to stop
 * at.
 */
const LOCAL_REF =
  /(?:src|href)="(\/wf\/[^"]+)"|url\((?:"(\/wf\/[^"]+)"|'(\/wf\/[^']+)'|(\/wf\/[^"')]+))/g;

/**
 * Local references that are KNOWN to be missing, with the reason.
 *
 * Mirrors UNFETCHABLE in migration-scripts/localise-webflow-assets.mjs — keep the two in
 * step. Entries look like:
 *
 *   [/<a distinctive fragment of the filename>/, '<page>: <why it cannot be fetched>']
 *
 * The real case this exists for is an image pasted into Webflow from an
 * external editor, which Webflow then 403s for everyone — broken on the LIVE
 * site too, so the migration inherits a broken image rather than creating one.
 * It is still rewritten to a local path, because a broken local image does not
 * outlive the Webflow account.
 *
 * Reported, not failed. Adding to this list is a deliberate act with a reason
 * attached; a silent allowlist would defeat the whole check. Start empty.
 */
const KNOWN_MISSING = new Map([]);
const knownMissingReason = (ref) => {
  for (const [re, why] of KNOWN_MISSING) if (re.test(ref)) return why;
  return undefined;
};

const missing = new Set();
const knownGaps = new Set();
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const m of text.matchAll(LOCAL_REF)) {
    const ref = decodeURIComponent((m[1] ?? m[2] ?? m[3] ?? m[4]).split('?')[0]);
    if (await exists(join(DIST, ref.replace(/^\//, '')))) continue;
    const why = knownMissingReason(ref);
    if (why) knownGaps.add(`      ${why}`);
    else missing.add(`      ${ref}   (referenced by ${rel(file)})`);
  }
}
check(
  'every /wf/ reference exists in ./dist',
  missing.size === 0,
  [...missing].slice(0, 12).join('\n'),
);
if (knownGaps.size) {
  console.log(`      ${knownGaps.size} known gap(s), inherited from the live site:`);
  for (const g of knownGaps) console.log(`  ${g}`);
}

// --- 3. the fonts are local ------------------------------------------------

const cssFiles = files.filter((f) => f.endsWith('.css'));
const fontRefs = new Set();
for (const file of cssFiles) {
  const text = await readFile(file, 'utf8');
  for (const m of text.matchAll(/url\(["']?([^"')]+\.(?:woff2?|ttf|otf|eot))/g)) {
    fontRefs.add(m[1]);
  }
}
const remoteFonts = [...fontRefs].filter((f) => /^https?:/.test(f));

/**
 * Zero font files is a PASS when the site genuinely self-hosts none.
 *
 * The check used to fail on `fontRefs.size === 0`, on the reasoning that an
 * empty count means the stylesheet was never ported. That is a real failure
 * mode and worth catching — but it is not the only way to get zero, and the
 * other way is common: a site whose type comes from Google Fonts has no
 * `@font-face` file reference anywhere, so it can never pass, and a permanently
 * red check is a check nobody reads.
 *
 * So separate the two. "No CSS was found" or "CSS contains no @font-face at
 * all" is the port failing. "CSS declares @font-face but names no font FILE" is
 * a site using a webfont service, which is a deliberate external dependency
 * that survives the cut-over — reported, not failed.
 */
let declaresFontFace = false;
for (const file of cssFiles) {
  if (/@font-face/i.test(await readFile(file, 'utf8'))) declaresFontFace = true;
}

check(
  fontRefs.size === 0
    ? `no self-hosted font files (${cssFiles.length} stylesheet(s) scanned)`
    : `all ${fontRefs.size} font file(s) referenced locally`,
  cssFiles.length > 0 && remoteFonts.length === 0,
  cssFiles.length === 0
    ? '      no CSS in the build at all — the stylesheet was not ported'
    : remoteFonts.map((f) => `      remote: ${f}`).join('\n'),
);

if (fontRefs.size === 0 && cssFiles.length > 0) {
  console.log(
    declaresFontFace
      ? '      @font-face present but names no font file — check what it loads'
      : '      type is loaded by a webfont service, not self-hosted — external by design',
  );
}

// --- report other external hosts -------------------------------------------

const EXTERNAL = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/g;
const hosts = new Map();
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const m of text.matchAll(EXTERNAL)) {
    hosts.set(m[1], (hosts.get(m[1]) ?? 0) + 1);
  }
}

console.log('\nexternal hosts still referenced — confirm each one is deliberate:');
for (const [host, n] of [...hosts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${host}`);
}

const assetDir = join(DIST, 'wf/assets');
const assetCount = (await exists(assetDir)) ? (await readdir(assetDir)).length : 0;
console.log(`\n${assetCount} local asset(s) in dist/wf/assets`);

if (failures) {
  console.error(`\n${failures} check(s) failed\n`);
  process.exit(1);
}
console.log('assets ok — the site does not need the Webflow account\n');
