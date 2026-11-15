/**
 * Extract published Webflow pages into verbatim HTML fragments + a manifest.
 *
 *   node migration-scripts/extract-webflow-page.mjs              # every page in pages.config.mjs
 *   node migration-scripts/extract-webflow-page.mjs about contact
 *
 * Handles two kinds of target, both listed in pages.config.mjs:
 *   PAGES      a real published page; the slug is its route.
 *   TEMPLATES  a Webflow collection template, extracted from one sample item.
 *              It has no route of its own — the furniture, runtime chunk and
 *              data-wf-page are what we want — so its manifest entry is flagged
 *              `template: true` and consumed by a hand-written route.
 *
 * Runs in two passes. Pass 1 fetches and parses every page; pass 2 works out
 * what is genuinely shared and writes the fragments. The two-pass shape matters
 * for the head: pages both add and omit nodes relative to each other, so
 * "shared" can only be decided once every page is in hand.
 *
 * Per page it writes:
 *   src/html/main.<slug>.html        body between nav and footer, verbatim
 *   src/html/head-extra.<slug>.html  head nodes unique to this page (if any)
 *
 * Shared, written once and verified byte-identical across every page:
 *   src/html/nav.html  src/html/footer.html  src/html/head-custom.html
 *
 * And collectively:
 *   src/data/pages.json              manifest consumed by the routes, including
 *                                    the asset list for fetch-webflow-assets
 *
 * THE BODY IS NEVER RECONSTRUCTED. The whole <body> is kept and the nav/footer
 * subtrees are punched out in place, leaving <!--wf:nav--> / <!--wf:footer-->
 * markers. Webflow sites commonly nest the nav INSIDE the page's hero section,
 * so slicing the body at a fixed offset would take the hero with it. Check
 * where the nav actually sits before assuming otherwise.
 *
 * LAYOUT: `WEB` assumes the Astro app sits in `web/`. In a single-package repo,
 * point it at ROOT instead.
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAGES, TEMPLATES, SHELL } from './pages.config.mjs';
import { WEBFLOW_SOURCE } from './lib/project.mjs';
import { userAgent } from './lib/ua.mjs';
import { scanSpans, findSpan } from './lib/html.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');
const HTML_DIR = join(WEB, 'src/html');
const DATA_DIR = join(WEB, 'src/data');
const ORIGIN = WEBFLOW_SOURCE;

/** A slug becomes a filename: `/` separators would be directories. */
const fileFor = (slug) => String(slug).replace(/\//g, '__');

/**
 * Placeholder for the current page's Webflow page id inside a SHARED fragment.
 * The route substitutes the real id from the manifest's `wfPage`.
 */
export const WF_PAGE_MARKER = '__WF_PAGE_ID__';

const exists = (p) => access(p).then(() => true, () => false);

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'");

// Span scanning and class matching are shared with migration-scripts/cms-seams.mjs.
// They used to be duplicated in both, and the two drifted — see the long note
// in migration-scripts/lib/html.mjs about why `\bfooter\b` found the wrong element.

/**
 * Remove Webflow's active-link markers so one nav serves every page.
 *
 * Some links carry `class="w--current"` and nothing else, so the attribute is
 * dropped once empty — otherwise fragments differ by a stray `class=""` and the
 * byte-identical check fails for a reason nobody would guess.
 */
const stripCurrent = (html) =>
  html
    .replace(/ aria-current="page"/g, '')
    .replace(/\s*\bw--current\b/g, '')
    .replace(/ class="\s*"/g, '')
    // Webflow stamps the CURRENT page's id onto every <form> on the page,
    // including the forms inside the nav and the footer. That one attribute
    // makes the shell page-specific and nothing else does — on this site the
    // nav fragments were otherwise byte-identical at 43735 bytes each.
    //
    // Replaced with a marker rather than deleted, so the route can put the real
    // id back and the rendered output stays byte-identical to Webflow's. Same
    // class of problem as `w--current` above: page state living inside shared
    // furniture.
    .replace(/data-wf-page-id="[^"]*"/g, `data-wf-page-id="${WF_PAGE_MARKER}"`);

/**
 * Resolve a shell spec to ONE contiguous byte range.
 *
 * A spec is either `{tag, cls}` or an ARRAY of them. The array form exists
 * because a Webflow shell is frequently not one element: this site's footer is
 * three sibling divs (`.subscribe`, `.footer`, `.copyright-section`) and its
 * header is four (`.site-bar`, `.brand-section`, `.alert-bar`,
 * `.navigation-bar`) inside an unclassed wrapper that has no class to match.
 *
 * For an array, the range runs from the FIRST matched part's start to the LAST
 * matched part's end, rather than concatenating the subtrees — that keeps the
 * whitespace between them byte-identical, which matters because the extractor
 * then asserts the shared fragment is identical across every page.
 *
 * MISSING PARTS ARE NORMAL and must not fail. Footer composition varies by
 * template here: `/area/*` has no `.copyright-section`, `/reviews/*` and
 * `/news/*` have no `.subscribe`. The range simply adapts to what is present.
 *
 * Taking a range rather than the common ancestor also means an unclassed
 * wrapper around the parts stays in `main` as `<div><!--wf:nav--></div>`, which
 * is balanced and harmless — and avoids the trap that the outermost ancestor of
 * the nav on a `/tour/*` page is `.page-wrapper`, which contains the entire
 * page including the footer.
 */
function findShell(spans, spec) {
  const parts = (Array.isArray(spec) ? spec : [spec])
    .map((p) => findSpan(spans, p.tag, p.cls))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  if (parts.length === 0) return undefined;
  return { start: parts[0].start, end: parts[parts.length - 1].end };
}

const describeShell = (spec) =>
  (Array.isArray(spec) ? spec : [spec]).map((p) => `${p.tag}.${p.cls}`).join(' / ');

function meta(head, key) {
  const attr = key.startsWith('og:') ? 'property' : 'name';
  const a = new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"`, 'i').exec(head);
  const b = new RegExp(`<meta[^>]*content="([^"]*)"[^>]*${attr}="${key}"`, 'i').exec(head);
  const v = a?.[1] ?? b?.[1];
  return v ? decode(v) : undefined;
}

/**
 * Split a head fragment into top-level nodes — comments, <script>/<style>
 * blocks, and void tags. Comparing whole nodes is what lets shared-vs-page-
 * specific head code be worked out reliably; character diffing is not stable
 * once more than a couple of pages are involved.
 */
function tokenizeHead(html) {
  const nodes = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      const stop = end === -1 ? html.length : end + 3;
      nodes.push(html.slice(lt, stop));
      i = stop;
      continue;
    }

    const tag = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 40))?.[1]?.toLowerCase();
    if (!tag) { i = lt + 1; continue; }

    if (tag === 'script' || tag === 'style' || tag === 'title') {
      const close = `</${tag}>`;
      const end = html.indexOf(close, lt);
      const stop = end === -1 ? html.length : end + close.length;
      nodes.push(html.slice(lt, stop));
      i = stop;
      continue;
    }

    const gt = html.indexOf('>', lt);
    const stop = gt === -1 ? html.length : gt + 1;
    nodes.push(html.slice(lt, stop));
    i = stop;
  }
  return nodes.map((n) => n.trim()).filter(Boolean);
}

/**
 * Head nodes that are page-level DATA rather than furniture. They are lifted
 * into the manifest and re-emitted by BaseLayout from those values, so they
 * must not also land in a head fragment or every page would carry two titles.
 */
const isPageData = (node) =>
  /^<title/i.test(node) ||
  /^<meta[^>]*\b(charset|name="viewport"|name="generator"|name="description"|name="twitter:(title|description|card)"|property="og:(title|description|type)")/i.test(node);

/**
 * Head nodes that exist only to serve Webflow and must not survive the port.
 *
 * A `<link rel="preconnect">` to Webflow's CDN carries no path, so the asset
 * localiser — which matches a host followed by `/` — never sees it, and it
 * sails through to every built page. `assets:check` then fails all 23 of them
 * on a bare `https://cdn.prod.website-files.com` with nothing to rewrite,
 * which looks like an unlocalised asset and is in fact a dead handshake with a
 * host we are leaving.
 */
const isWebflowOnly = (node) =>
  /rel="(?:preconnect|dns-prefetch)"/i.test(node) && /website-files\.com|webflow\.com/i.test(node);

// ---------------------------------------------------------------------------
// Asset rewriting
// ---------------------------------------------------------------------------

/**
 * Webflow asset URLs that become local files under public/wf/.
 *
 * Only CSS and JS. Images and fonts are handled later by
 * localise-webflow-assets.mjs — see the note at the top of
 * fetch-webflow-assets.mjs.
 */
const ASSET_RE =
  /https:\/\/(?:cdn\.prod\.website-files\.com|d3e54v103j8qbb\.cloudfront\.net)\/[^"')\s]+?\.(?:css|js)(?:\?[^"')\s]*)?/g;

/** Local path for an asset URL: public/wf/<kind>/<basename>. */
function localFor(url) {
  const clean = url.split('?')[0];
  const base = decodeURIComponent(clean.split('/').pop());
  const kind = base.endsWith('.css') ? 'css' : 'js';
  return `${kind}/${base}`;
}

/**
 * Rewrite asset URLs to local paths and record them.
 *
 * `integrity` is stripped at the same time. A subresource-integrity hash is
 * computed over the bytes Webflow served; the file is byte-identical once
 * fetched, but the attribute refers to a cross-origin URL that no longer
 * applies, and a stale hash is a silently blocked script. Removing it is the
 * correct move, not a shortcut. `crossorigin` goes with it for the same reason.
 */
function localiseAssets(html, assets) {
  let out = html.replace(ASSET_RE, (url) => {
    const local = localFor(url);
    assets.set(url, local);
    return `/wf/${local}`;
  });
  out = out.replace(/\s+integrity="[^"]*"/g, '').replace(/\s+crossorigin="[^"]*"/g, '');
  return out;
}

// ---------------------------------------------------------------------------
// Pass 1 — fetch and parse
// ---------------------------------------------------------------------------

const only = process.argv.slice(2);

const targets = [
  ...Object.entries(PAGES).map(([slug, path]) => ({ slug, path, template: false })),
  ...Object.entries(TEMPLATES).map(([slug, path]) => ({ slug, path, template: true })),
].filter((t) => only.length === 0 || only.includes(t.slug));

if (targets.length === 0) {
  console.error(`\nNo targets matched: ${only.join(' ')}\n`);
  process.exit(1);
}

const assets = new Map();
const parsed = [];

for (const target of targets) {
  const url = `${ORIGIN}${target.path === '/' ? '' : target.path}`;
  const res = await fetch(url, { headers: { 'user-agent': userAgent('port') } });
  if (!res.ok) {
    console.error(`FAIL  ${res.status}  ${url}`);
    process.exitCode = 1;
    continue;
  }
  const raw = await res.text();

  const htmlTag = /<html([^>]*)>/i.exec(raw)?.[1] ?? '';
  const wfPage = /data-wf-page="([^"]*)"/.exec(htmlTag)?.[1];
  const lang = /\blang="([^"]*)"/.exec(htmlTag)?.[1] ?? 'en';

  const headStart = raw.indexOf('>', raw.indexOf('<head')) + 1;
  const head = raw.slice(headStart, raw.indexOf('</head>'));

  const bodyStart = raw.indexOf('>', raw.indexOf('<body')) + 1;
  const body = raw.slice(bodyStart, raw.lastIndexOf('</body>'));

  /**
   * The `<body>` tag's own attributes, which are PAGE-SPECIFIC and load-bearing.
   *
   * Easy to assume they are constant and they are not: this site has three
   * variants across 94 pages — bare, `data-ix="full-opacity-on-load"`, and one
   * page carrying `order="payment"` that its own JS dispatches on. Hardcoding
   * one variant in the layout would add an IX2 opacity animation to the 69
   * pages that do not have it — and IX2 animates opacity FROM 0, so those
   * pages would render blank if the runtime ever failed — while silently
   * dropping the attribute the payment flow depends on.
   */
  const bodyAttrs = Object.fromEntries(
    [...(/<body([^>]*)>/i.exec(raw)?.[1] ?? '').matchAll(/([a-zA-Z_:][\w:.-]*)(?:="([^"]*)")?/g)]
      .filter((m) => m[1])
      .map((m) => [m[1], m[2] ?? '']),
  );

  const spans = scanSpans(body);
  const nav = findShell(spans, SHELL.nav);
  const footer = findShell(spans, SHELL.footer);

  if (!nav) console.error(`WARN  ${target.path}: no ${describeShell(SHELL.nav)} found`);
  if (!footer) console.error(`WARN  ${target.path}: no ${describeShell(SHELL.footer)} found`);

  // Keep the WHOLE body and punch out the shell subtrees, rather than slicing
  // between them — the nav is frequently nested inside the hero section.
  const cuts = [];
  if (nav) cuts.push({ ...nav, marker: '<!--wf:nav-->' });
  if (footer) cuts.push({ ...footer, marker: '<!--wf:footer-->' });
  cuts.sort((a, b) => a.start - b.start);

  let main = '';
  let cursor = 0;
  for (const cut of cuts) {
    main += body.slice(cursor, cut.start) + cut.marker;
    cursor = cut.end;
  }
  main += body.slice(cursor);

  parsed.push({
    slug: target.slug,
    path: target.path,
    template: target.template,
    wfPage,
    lang,
    bodyAttrs,
    // DECODED, like the metas below. The manifest holds real text, not HTML —
    // Astro escapes on output, so storing `&amp;` here yields `&amp;amp;` in
    // the <title> and the reader sees a literal "&amp;".
    title: decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]?.trim() ?? '') || undefined,
    description: meta(head, 'description'),
    ogTitle: meta(head, 'og:title'),
    ogDescription: meta(head, 'og:description'),
    shell: nav && footer ? 'full' : nav ? 'nav' : 'bare',
    _main: localiseAssets(main, assets),
    _nav: nav ? localiseAssets(stripCurrent(body.slice(nav.start, nav.end)), assets) : undefined,
    _footer: footer ? localiseAssets(stripCurrent(body.slice(footer.start, footer.end)), assets) : undefined,
    _headNodes: tokenizeHead(head)
      .filter((n) => !isPageData(n) && !isWebflowOnly(n))
      .map((n) => localiseAssets(n, assets)),
  });

  console.log(`get   ${target.path}${target.template ? '  (template)' : ''}`);
}

if (parsed.length === 0) process.exit(1);

// ---------------------------------------------------------------------------
// Pass 2 — decide what is shared, then write
// ---------------------------------------------------------------------------

await mkdir(HTML_DIR, { recursive: true });
await mkdir(DATA_DIR, { recursive: true });

const full = only.length === 0;

/**
 * Shared nav/footer.
 *
 * On a FULL extract the first page's copy becomes the shared file and every
 * other page is checked against it. On a PARTIAL extract the existing shared
 * file is the reference. Either way a mismatch is a hard failure: silently
 * forking the nav is the kind of bug nobody notices for a month.
 *
 * THE COMPARISON IGNORES WHITESPACE ENTIRELY, deliberately. Webflow indents by
 * nesting depth, so a template whose shell sits one level deeper inside a page
 * wrapper emits the identical furniture with every line shifted — 994 bytes of
 * extra indentation on this site's `/tour/*` template against an otherwise
 * byte-identical 43735-byte nav. Failing on that would fork the shell over
 * whitespace.
 *
 * ALL whitespace, not just the runs between tags: the shell here contains an
 * embedded `<style>` block, and the indentation inside its CSS shifts with the
 * nesting depth too. A `>\s+<` collapse looks like it should be enough and is
 * not — it leaves the style block's own leading whitespace in place and the
 * comparison still fails, 21349 bytes in, with the two sides looking identical
 * on screen.
 *
 * Safe because the structural verifier compares visible text and `<body>` tag
 * counts rather than bytes — the port deliberately changes bytes anyway — and
 * no shell element has whitespace-significant content. A difference in anything
 * that renders still fails. This normalises the COMPARISON only; what gets
 * written is the fragment verbatim.
 */
const collapse = (html) => html.replace(/\s+/g, ' ').trim();

for (const [label, key, file] of [
  ['nav', '_nav', 'nav.html'],
  ['footer', '_footer', 'footer.html'],
]) {
  const group = parsed.filter((p) => p[key]);
  if (group.length === 0) continue;

  const dest = join(HTML_DIR, file);
  const existing = full ? null : await readFile(dest, 'utf8').catch(() => null);
  const reference = existing ?? group[0][key];

  for (const p of group) {
    if (collapse(p[key]) !== collapse(reference)) {
      console.error(`\n${p.path}: ${label} differs from the shared ${file}.`);
      console.error(`Run a full extract (npm run extract) to re-derive it.\n`);
      process.exit(1);
    }
  }
  if (!existing) await writeFile(dest, reference, 'utf8');
}

/**
 * Shared head furniture: every node present on EVERY page extracted. Anything
 * else is page-specific and goes to head-extra.<slug>.html.
 *
 * Intersection rather than union, because a node only belongs in the shared
 * file if omitting it from one page would be wrong.
 */
let shared;
if (full) {
  const counts = new Map();
  for (const p of parsed) for (const n of new Set(p._headNodes)) counts.set(n, (counts.get(n) ?? 0) + 1);
  shared = parsed[0]._headNodes.filter((n) => counts.get(n) === parsed.length);
  await writeFile(join(HTML_DIR, 'head-custom.html'), shared.join('\n'), 'utf8');
} else {
  const existing = await readFile(join(HTML_DIR, 'head-custom.html'), 'utf8').catch(() => '');
  shared = tokenizeHead(existing);
}
const sharedSet = new Set(shared);

for (const p of parsed) {
  await writeFile(join(HTML_DIR, `main.${fileFor(p.slug)}.html`), p._main, 'utf8');

  const extra = p._headNodes.filter((n) => !sharedSet.has(n));
  const extraPath = join(HTML_DIR, `head-extra.${fileFor(p.slug)}.html`);
  if (extra.length) await writeFile(extraPath, extra.join('\n'), 'utf8');
  p.headExtra = extra.length > 0;
}

// Manifest. On a partial extract, merge over what is already there.
const manifestPath = join(DATA_DIR, 'pages.json');
const prior = (await exists(manifestPath))
  ? JSON.parse(await readFile(manifestPath, 'utf8'))
  : { pages: {}, assets: {} };

const manifest = {
  extractedFrom: ORIGIN,
  pages: { ...prior.pages },
  assets: { ...prior.assets, ...Object.fromEntries(assets) },
};

for (const p of parsed) {
  const { _main, _nav, _footer, _headNodes, slug, ...entry } = p;
  manifest.pages[slug] = entry;
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(
  `\nok    ${parsed.length} page(s), ${Object.keys(manifest.assets).length} asset(s) referenced`,
);
console.log(`      next: npm run fetch:assets`);
