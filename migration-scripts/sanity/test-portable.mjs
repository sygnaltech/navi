/**
 * Assert the Portable Text -> HTML serializer.
 *
 *   node --experimental-strip-types migration-scripts/sanity/test-portable.mjs
 *
 * Runs the real pipeline end to end on the real fixtures: Webflow HTML ->
 * Portable Text -> HTML. The second conversion is the one under test, but
 * testing it on converter output rather than hand-written blocks is the point —
 * it is the combination that ships, and a mismatch between the two stages is
 * exactly the bug that would otherwise reach a page.
 *
 * The serializer is TypeScript, so this imports it through Node's type
 * stripping (Node 22+). If that ever breaks, the assertions matter more than
 * the mechanism: port them into a .test.ts and run via vitest.
 *
 * Fixture-DRIVEN, like test-converter.mjs — the per-fixture round-trip runs on
 * whatever is in migration/fixtures/, and the structural checks fire only where
 * the corpus exercises the case.
 *
 * PATH: the serializer is assumed at web/src/lib/portable.ts. In a
 * single-package repo it is src/lib/portable.ts.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toPortableText } from './html-to-portable-text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = join(ROOT, 'migration/fixtures');

const { renderPortableText } = await import('../../web/src/lib/portable.ts');

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    console.error(`FAIL  ${name}`);
    if (detail) console.error(`      ${detail}`);
    failures++;
  }
};

const visible = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    // ZWSP, ZWNJ, ZWJ and the BOM — invisible spacers, dropped on both sides.
    .replace(/[​-‍﻿]/g, '')
    .replace(/&zwnj;|&zwj;/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, '')
    .trim();

const sourceText = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/‌/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&zwnj;|&zwj;/g, '')
    .replace(/[​-‍﻿]/g, '')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, '')
    .trim();

if (!existsSync(FIXTURES)) {
  console.error('\nNo migration/fixtures/ — see the note in migration-scripts/sanity/test-converter.mjs.\n');
  process.exit(1);
}

const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.html')).sort();
if (files.length === 0) {
  console.error('\nNo fixtures in migration/fixtures/.\n');
  process.exit(1);
}

const rendered = {};
for (const file of files) {
  const html = readFileSync(join(FIXTURES, file), 'utf8');
  const out = renderPortableText(toPortableText(html));
  rendered[file] = out;

  check(
    `${file} — round-trips without losing text`,
    visible(out) === sourceText(html),
    `source ${sourceText(html).length} chars, rendered ${visible(out).length}`,
  );
}

const sourceAll = files.map((f) => readFileSync(join(FIXTURES, f), 'utf8')).join('\n');
const outAll = Object.values(rendered).join('\n');

// --- structure, where the corpus exercises it ------------------------------

/**
 * A figure must come back as Webflow's OWN figure markup.
 *
 * `.w-richtext-figure-type-*` and `.w-richtext-align-*` are what the ported
 * stylesheet targets — they are the whole difference between a photograph
 * floated beside the text and one across the column, and nothing else sets it.
 * An image renders only when a resolver is supplied, so this round-trip passes
 * one; without it the block is skipped, which is the behaviour the routes had
 * before figures were carried at all.
 */
const withImages = Object.fromEntries(
  files.map((f) => [
    f,
    renderPortableText(toPortableText(readFileSync(join(FIXTURES, f), 'utf8')), {
      imageUrl: (b) => `https://cdn.example/${b.asset?._ref ?? 'x'}`,
    }),
  ]),
);
const outWithImages = Object.values(withImages).join('\n');

if (/data-rt-type="video"/i.test(sourceAll)) {
  check(
    'a video figure renders as a Webflow video figure',
    /class="w-richtext-figure-type-video w-richtext-align-[a-z]+"/.test(outAll) &&
      /<iframe src="http/.test(outAll),
    'no video figure in the output',
  );
}

if (/data-rt-type="image"/i.test(sourceAll)) {
  check(
    'an image figure renders as a Webflow image figure, keeping its alignment',
    /class="w-richtext-figure-type-image w-richtext-align-[a-z]+"/.test(outWithImages),
    'no image figure in the output',
  );
  check(
    'an image block renders nothing when no resolver is supplied',
    !/w-richtext-figure-type-image/.test(outAll),
    'an unresolved image emitted markup with no src',
  );
}

if (/<li[^>]*>[\s\S]*?<(ul|ol)\b/i.test(sourceAll)) {
  check(
    'emits a nested list inside an <li>',
    // The nested list must open before its parent <li> closes. The previous
    // form of this assertion was `/<li>[^<]*<(ul|ol)\b/`, which additionally
    // demanded NO MARKUP between the two — so a correctly nested list failed
    // the moment its parent item contained a `<strong>`, which real content
    // always does. It reported "nesting was flattened" against output that was
    // nested exactly right.
    /<li>(?:(?!<\/li>)[\s\S])*?<(ul|ol)\b/.test(outAll),
    'nesting was flattened',
  );
}

if (/<blockquote/i.test(sourceAll)) {
  check('blockquote emitted', outAll.includes('<blockquote>'), 'no blockquote in the output');
}

if (/<h[1-6]\b/i.test(sourceAll)) {
  check('headings emitted', /<h[2-6]\b/.test(outAll), 'headings became paragraphs');
}

if (/<br\b/i.test(sourceAll)) {
  /**
   * A line break comes back as a `<br />`, not as a newline leaning on
   * `white-space: pre-line`.
   *
   * `pre-line` appears nowhere in the ported Webflow stylesheet, so an inline
   * style was carrying it — and a newline is one `<body>` tag short of the
   * live page on every break, which is invisible to a reader and visible to
   * every structural check.
   */
  const brs = (outAll.match(/<br \/>/g) ?? []).length;
  // A `<br>` inside a `<figcaption>` is editor noise — Webflow writes
  // `<figcaption><br>&zwj;</figcaption>` for an empty caption — and the
  // converter reduces such a caption to nothing. Count the prose only.
  const sourceBrs = (sourceAll.replace(/<figcaption>[\s\S]*?<\/figcaption>/gi, '').match(/<br\b/gi) ?? [])
    .length;
  check(
    'every <br> comes back as a <br>',
    brs === sourceBrs,
    `source has ${sourceBrs}, output has ${brs}`,
  );
  check(
    'no newline survives into the output',
    !/>[^<]*\n[^<]*</.test(outAll.replace(/\n(?=\s*<)/g, '')),
    'a raw newline would collapse to a space in the browser',
  );
}

if (/href="mailto:/i.test(sourceAll)) {
  check('mailto preserved', /href="mailto:/.test(outAll), 'mailto href lost');
}

check('no empty paragraphs', !/<p[^>]*><\/p>/.test(outAll), 'an empty <p> renders as a dead gap');

check(
  'no target without rel=noopener',
  !/target="_blank"(?![^>]*rel=)/.test(outAll),
  'a target=_blank without rel=noopener leaks window.opener',
);

// --- escaping and empty input, always ---------------------------------------

{
  // Content containing HTML must not become markup.
  const blocks = [
    {
      _type: 'block',
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', text: '<script>alert(1)</script> & "quoted"', marks: [] }],
    },
  ];
  const out = renderPortableText(blocks);
  check(
    'content is escaped, not injected',
    !out.includes('<script>') && out.includes('&lt;script&gt;') && out.includes('&amp;'),
    out,
  );
}

check('empty body renders nothing', renderPortableText([]) === '', 'expected an empty string');
check(
  'undefined body renders nothing',
  renderPortableText(undefined) === '',
  'expected an empty string',
);

{
  const html = readFileSync(join(FIXTURES, files[0]), 'utf8');
  const out = renderPortableText(toPortableText(html));
  const again = renderPortableText(toPortableText(html));
  check('serializer is deterministic', out === again, 'two renders of the same input differ');
}

console.log();
if (failures) {
  console.error(`${failures} assertion(s) failed\n`);
  process.exit(1);
}
console.log('serializer ok\n');
