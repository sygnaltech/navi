/**
 * Assert the HTML -> Portable Text converter against this site's fixtures.
 *
 *   node migration-scripts/sanity/test-converter.mjs
 *
 * FIXTURES ARE PER SITE AND YOU MUST CREATE THEM. Put verbatim excerpts of real
 * Webflow fields in `migration/fixtures/*.html`, choosing each one because it
 * contains something the naive conversion gets wrong. From real corpora that
 * has meant: a list nested inside a list item, `&nbsp;` runs, U+200C spacer
 * paragraphs, `<br>` stacks, `id=""` on every element, an internal link written
 * as `http://apex-no-www/...`, and a `<strong>` wrapping a whole heading.
 *
 * THE CENTRAL ASSERTION IS NO TEXT LOSS. Every non-whitespace character that
 * was in the HTML must still be in the Portable Text. That is the property that
 * actually matters for the client's published wording, and it is the one a
 * converter silently breaks. Structure assertions come second.
 *
 * The checks below are fixture-DRIVEN rather than fixture-named, so they work
 * on any site's corpus. Add site-specific assertions at the bottom as you find
 * cases worth pinning — a converter bug you fixed once deserves a test so it
 * cannot come back on the next site.
 *
 * Exits non-zero on failure so it can gate the ingest.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toPortableText, portableTextToPlain } from './html-to-portable-text.mjs';
import { INTERNAL_LINK } from '../lib/project.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = join(ROOT, 'migration/fixtures');

let failures = 0;
const fail = (name, msg) => {
  console.error(`FAIL  ${name}`);
  console.error(`      ${msg}`);
  failures++;
};
const pass = (name, note = '') => console.log(`ok    ${name}${note ? `  ${note}` : ''}`);
const check = (name, cond, msg) => (cond ? pass(name) : fail(name, msg));

/** Visible characters, order preserved, all whitespace and spacers removed. */
const signature = (s) =>
  s
    .replace(/‌/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&zwnj;|&zwj;/g, '')
    // ZWSP, ZWNJ, ZWJ and the BOM — invisible spacers the editor leaves behind,
    // dropped on both sides so a comparison is about the author's characters.
    .replace(/[​-‍﻿]/g, '')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, '');

const htmlText = (html) => signature(html.replace(/<[^>]+>/g, ''));

// ---------------------------------------------------------------------------
// 1. No text loss, on every fixture
// ---------------------------------------------------------------------------

if (!existsSync(FIXTURES)) {
  console.error(`\nNo migration/fixtures/ directory.`);
  console.error(`Create it and add verbatim excerpts of this site's Webflow rich-text fields.`);
  console.error(`Without fixtures the converter is untested, and §4 of the migration is not done.\n`);
  process.exit(1);
}

const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.html')).sort();
if (files.length === 0) {
  console.error('\nNo fixtures found in migration/fixtures/ — see the note at the top of this file.\n');
  process.exit(1);
}

const converted = {};

for (const file of files) {
  const html = readFileSync(join(FIXTURES, file), 'utf8');
  const warnings = [];
  const blocks = toPortableText(html, { onWarn: (w) => warnings.push(w) });
  converted[file] = blocks;

  const before = htmlText(html);
  const after = signature(portableTextToPlain(blocks));

  if (before !== after) {
    // Report the first divergence rather than two walls of text.
    let i = 0;
    while (i < before.length && before[i] === after[i]) i++;
    fail(
      `${file} — text preserved`,
      `diverges at char ${i}\n        html: …${before.slice(Math.max(0, i - 40), i + 40)}\n        ptxt: …${after.slice(Math.max(0, i - 40), i + 40)}`,
    );
  } else {
    pass(`${file} — text preserved`, `${blocks.length} blocks, ${before.length} chars`);
  }
  for (const w of warnings) console.log(`      warn: ${w}`);
}

const all = Object.values(converted).flat();
const blocksOf = (pred) => all.filter(pred);

// ---------------------------------------------------------------------------
// 2. Structure — asserted only where the corpus exercises the case
// ---------------------------------------------------------------------------
// Each of these fires when a fixture contains the relevant construct, so the
// suite grows stronger as fixtures are added and never fails for absence.

const sourceAll = files.map((f) => readFileSync(join(FIXTURES, f), 'utf8')).join('\n');

if (/<li[^>]*>[\s\S]*?<(ul|ol)\b/i.test(sourceAll)) {
  const levels = blocksOf((x) => x.listItem).map((x) => x.level);
  check(
    'nested list produces level 2',
    levels.includes(1) && levels.includes(2),
    `expected levels 1 and 2, got [${[...new Set(levels)].join(', ')}]`,
  );
}

if (/<blockquote/i.test(sourceAll)) {
  check('blockquote preserved', all.some((x) => x.style === 'blockquote'), 'no blockquote emitted');
}

/**
 * FIGURES, which no other check in the suite can see.
 *
 * The text checks above compare the author's CHARACTERS, and a `<figure>`
 * contributes none — so an earlier converter dropped sixteen of them, across
 * fourteen tour descriptions, with every assertion green.
 */
if (/data-rt-type="image"/i.test(sourceAll)) {
  const images = all.filter((x) => x._type === 'image');
  check(
    'an image figure becomes an image block the importer will upload',
    images.length > 0 && images.every((x) => typeof x._sanityAsset === 'string'),
    `${images.length} image block(s), ${images.filter((x) => x._sanityAsset).length} with an asset`,
  );
}

if (/data-rt-type="video"/i.test(sourceAll)) {
  const videos = all.filter((x) => x._type === 'videoEmbed');
  check(
    'a video figure becomes a videoEmbed carrying BOTH urls',
    videos.length > 0 && videos.every((x) => x.url && x.embedUrl),
    `${videos.length} video block(s)`,
  );
}

if (/<br\b/i.test(sourceAll)) {
  check(
    '<br> becomes a newline inside one block, not separate blocks',
    all.some((x) => (x.children ?? []).some((c) => c.text.includes('\n'))),
    'line breaks were dropped',
  );
}

// ESCAPES, NOT LITERAL CHARACTERS. Both of these tests used to carry a literal
// U+00A0 and a literal U+200C in their source, and both characters were lost —
// replaced by an ordinary space and by nothing — somewhere in transit. The
// consequence is not a test that fails to fire: `/&nbsp;| /` matches any text
// containing a SPACE, and `.includes(' ')` is true of essentially all prose, so
// the assertion inverted to "fails on every site, always", reporting a
// converter bug that did not exist. Invisible characters must be written as
// escapes so a transcription cannot silently change what is being asserted.
const NBSP = ' '; // non-breaking space
const ZWNJ = '‌'; // zero-width non-joiner

if (new RegExp(`&nbsp;|${NBSP}`).test(sourceAll)) {
  check(
    'no literal nbsp survives',
    !portableTextToPlain(all).includes(NBSP),
    'U+00A0 still present; Webflow spacing was not normalised',
  );
}

if (new RegExp(`${ZWNJ}|&zwnj;`).test(sourceAll)) {
  check(
    'U+200C-only paragraph produced no empty block',
    !all.some((x) => x._type === 'block' && !portableTextToPlain([x]).trim()),
    'an empty block survived; it renders as an invisible, undeletable gap',
  );
}

if (/<(strong|b)\b/i.test(sourceAll)) {
  check(
    'strong marks survive',
    all.some((x) => (x.children ?? []).some((c) => c.marks?.includes('strong'))),
    'every bold run lost its mark',
  );
}

if (/href="mailto:/i.test(sourceAll)) {
  check(
    'mailto links left alone',
    blocksOf((x) => x.markDefs?.length).some((x) =>
      x.markDefs.some((d) => d.href?.startsWith('mailto:')),
    ),
    'a mailto href was rewritten or lost',
  );
}

// Internal absolute links must come out root-relative; see normaliseHref. The
// host list is derived from webflow.source in project.jsonc, so a miss here is
// usually a wrong source host rather than a converter bug.
{
  const hrefs = blocksOf((x) => x.markDefs?.length)
    .flatMap((x) => x.markDefs.map((d) => d.href))
    .filter(Boolean);
  const unrewritten = hrefs.filter((h) => INTERNAL_LINK.test(h));
  if (hrefs.length) {
    check(
      'internal links are root-relative, not absolute',
      unrewritten.length === 0,
      `still absolute: ${unrewritten.slice(0, 3).join(', ')} — check webflow.source in project.jsonc`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Determinism — keys must be stable across runs
// ---------------------------------------------------------------------------

{
  const html = readFileSync(join(FIXTURES, files[0]), 'utf8');
  const a = JSON.stringify(toPortableText(html));
  const b = JSON.stringify(toPortableText(html));
  check(
    'keys are deterministic across runs',
    a === b,
    'two conversions of the same input differ — every re-import would show a false diff',
  );
}

// ---------------------------------------------------------------------------
// 4. Site-specific assertions
// ---------------------------------------------------------------------------
// Add them here, keyed by fixture name, e.g.:
//
//   {
//     const b = converted['<fixture>.html'] ?? [];
//     check('<what it proves>', <condition>, '<what broke>');
//   }

console.log();
if (failures) {
  console.error(`${failures} assertion(s) failed\n`);
  process.exit(1);
}
console.log('converter ok\n');
