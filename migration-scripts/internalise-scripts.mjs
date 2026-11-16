/**
 * Bring the site's OWN externally-hosted assets in-house.
 *
 *   node migration-scripts/internalise-scripts.mjs
 *   node migration-scripts/internalise-scripts.mjs --dry-run
 *
 * The ported pages load a surprising amount of JavaScript from places nobody
 * should depend on in production. None of it is Webflow's, so `assets:check`
 * passes while it is all still external — it survives the cut-over and then
 * fails whenever CodePen or a GitHub tag does.
 *
 * WHAT IS BROUGHT IN, and why each is ours to take:
 *
 *   engine        `cdn.jsdelivr.net/gh/sygnaltech/navi@<tag>` — this site's own
 *                 SSE bundle. The source is in this repo at `engine/`, and
 *                 `engine/dist/index.js` is byte-identical to the deployed tag,
 *                 so it is COPIED rather than downloaded.
 *   webflow-util  two `sygnaltech/webflow-util` builds and `webflow-mixitup`.
 *   navi-art      an SVG from `gh/memetican/navi-art`.
 *   pen / pen2    two CodePen pens under `codepen.io/memetican`.
 *   checkout      a script on a `deployed.codepen.website` subdomain.
 *   payment       ditto — and ALREADY 404 on the live site.
 *
 * WHAT IS DELIBERATELY LEFT EXTERNAL: genuine third-party libraries on public
 * CDNs — jQuery, jQuery UI, MixItUp, Finsweet attributes, the jQuery
 * form-validator, Google's webfont loader, GTM. Vendoring those is a separate
 * decision with its own testing, and they do not die with the Webflow account.
 *
 * `dev-src` / `dev-src2` attributes are stripped at the same time: they point at
 * `localhost:3000` so a developer can run the engine locally against the live
 * site, and in a built page they only tell a reader the script might come from
 * somewhere else.
 */
import {execFile} from 'node:child_process';
import {mkdir, readdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {promisify} from 'node:util';

import {ROOT} from './lib/env.mjs';
import {userAgent} from './lib/ua.mjs';

const run = promisify(execFile);
const dryRun = process.argv.includes('--dry-run');

const HTML_DIR = join(ROOT, 'web/src/html');
const OUT_DIR = join(ROOT, 'web/public/engine');

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36';

/**
 * `match` is a pattern for the URL as it appears in the markup, so a version
 * bump in a jsDelivr tag still matches. `to` is the local path it becomes.
 *
 * `viaCurl` exists because CodePen's edge blocks Node's `fetch` outright — 403
 * regardless of headers, which is TLS/HTTP2 fingerprinting rather than anything
 * a header can fix. curl gets 200 from the same machine, so these go through
 * curl rather than being reported as dead scripts.
 */
const ASSETS = [
  {
    name: 'engine',
    match: String.raw`https://cdn\.jsdelivr\.net/gh/sygnaltech/navi@[^"']+`,
    to: '/engine/index.js',
    copyFrom: join(ROOT, 'engine/dist/index.js'),
  },
  {
    name: 'webflow-html',
    match: String.raw`https://cdn\.jsdelivr\.net/gh/sygnaltech/webflow-util@[^"']*?/dist/nocode/webflow-html\.js`,
    to: '/engine/webflow-html.js',
  },
  {
    name: 'webflow-form',
    match: String.raw`https://cdn\.jsdelivr\.net/gh/sygnaltech/webflow-util@[^"']*?/src/nocode/webflow-form\.js`,
    to: '/engine/webflow-form.js',
  },
  {
    name: 'webflow-mixitup',
    match: String.raw`https://cdn\.jsdelivr\.net/gh/sygnaltech/webflow-mixitup/dist/webflow-mixitup\.js`,
    to: '/engine/webflow-mixitup.js',
  },
  {
    name: 'navi-art',
    match: String.raw`https://cdn\.jsdelivr\.net/gh/memetican/navi-art/[^"']+`,
    to: '/engine/nz-linked.svg',
  },
  {
    name: 'pen-tour-order',
    match: String.raw`https://codepen\.io/memetican/pen/JjZPPwM/[^"']+`,
    to: '/engine/pen-tour-order.js',
    viaCurl: true,
  },
  {
    name: 'pen-2',
    match: String.raw`https://codepen\.io/memetican/pen/WNWPoJq/[^"']+`,
    to: '/engine/pen-2.js',
    viaCurl: true,
  },
  {
    name: 'checkout',
    match: String.raw`https://[0-9]+\.deployed\.codepen\.website/scripts/checkout\.js`,
    to: '/engine/checkout.js',
    viaCurl: true,
    removeIfMissing: true,
  },
  {
    name: 'payment',
    match: String.raw`https://[0-9]+\.deployed\.codepen\.website/scripts/payment\.js`,
    to: '/engine/payment.js',
    viaCurl: true,
    // ALREADY DEAD ON THE LIVE SITE: the URL 302s to
    // `epic-salad-terrier.codepen.app/scripts/payment.js`, which answers 404 —
    // so `/payment` loads nothing from it today. Nothing to internalise, and
    // the tag is removed rather than carried forward pointing at a 404.
    removeIfMissing: true,
  },
];

const files = (await readdir(HTML_DIR)).filter((f) => f.endsWith('.html'));

// --- what is actually referenced ---------------------------------------------

const found = [];
for (const asset of ASSETS) {
  const re = new RegExp(asset.match);
  const used = [];
  let url = null;
  for (const file of files) {
    const hit = re.exec(await readFile(join(HTML_DIR, file), 'utf8'));
    if (!hit) continue;
    url ??= hit[0];
    used.push(file);
  }
  if (used.length) found.push({asset, url, files: used});
}

if (found.length === 0) {
  console.log('\nok    no self-hosted-elsewhere assets left in src/html\n');
  process.exit(0);
}

console.log();
for (const {asset, url, files: used} of found) {
  console.log(`${asset.name.padEnd(16)} ${String(used.length).padStart(2)} file(s)  ${url.slice(0, 70)}`);
}

if (dryRun) {
  console.log('\n--dry-run: nothing downloaded, nothing rewritten\n');
  process.exit(0);
}

// --- fetch or copy -----------------------------------------------------------

await mkdir(OUT_DIR, {recursive: true});
console.log();

for (const {asset, url} of found) {
  const dest = join(OUT_DIR, asset.to.split('/').pop());

  if (asset.copyFrom) {
    await copyFile(asset.copyFrom, dest);
    console.log(`copy  ${asset.to}`);
    continue;
  }

  try {
    if (asset.viaCurl) {
      const {stdout} = await run('curl', [
        '-sSfL',
        '-A',
        BROWSER_UA,
        '--max-time',
        '30',
        url,
      ], {maxBuffer: 32 * 1024 * 1024});
      if (!stdout.trim()) throw new Error('empty body');
      await writeFile(dest, stdout, 'utf8');
    } else {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {'user-agent': userAgent('port')},
      });
      if (!res.ok) throw new Error(String(res.status));
      await writeFile(dest, await res.text(), 'utf8');
    }
    console.log(`get   ${asset.to}`);
  } catch (e) {
    if (asset.removeIfMissing) {
      asset.dead = true;
      console.log(`dead  ${asset.name} (${e.message}) — tag will be REMOVED, not carried forward`);
      continue;
    }
    console.error(`FAIL  ${asset.name}: ${e.message}  ${url}`);
    process.exitCode = 1;
  }
}

if (process.exitCode) {
  console.error('\nnothing rewritten — fix the failures first\n');
  process.exit(1);
}

// --- rewrite -----------------------------------------------------------------

let rewritten = 0;
for (const file of files) {
  const path = join(HTML_DIR, file);
  const text = await readFile(path, 'utf8');
  let next = text;

  for (const asset of ASSETS) {
    if (asset.dead) {
      // Remove the whole element, not just its src: a tag pointing at a 404 is
      // a failed request on every page view, and a later reader cannot tell it
      // was already broken before the migration.
      next = next.replace(
        new RegExp(`\\s*<script[^>]*src="${asset.match}"[^>]*>\\s*</script>`, 'g'),
        `\n<!-- removed: the ${asset.name} script was already 404 on the live Webflow site; see REVIEW.hd -->`,
      );
      continue;
    }
    next = next.replace(new RegExp(asset.match, 'g'), asset.to);
  }
  next = next.replace(/\s+dev-src2?="[^"]*"/g, '');

  if (next !== text) {
    await writeFile(path, next, 'utf8');
    rewritten += 1;
  }
}

console.log(`\nok    rewrote ${rewritten} file(s) — now served from /engine/\n`);
