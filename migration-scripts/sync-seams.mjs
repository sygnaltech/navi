/**
 * Extract one item-row template per collection list, into the site.
 *
 *   node migration-scripts/sync-seams.mjs
 *
 * Writes `web/src/html/seams/<page>.<list index>.html` — the verbatim Webflow
 * markup for ONE item of that list, which the routes bind into. Binding into
 * real markup is far safer than transcribing each card into a component by
 * hand, which is how a card gets reused across two templates and quietly adds
 * markup to a page.
 *
 * THE RICHEST ROW, NOT THE FIRST. This is the same trap the process documents
 * for choosing a sample ITEM, one level down: Webflow omits an empty optional
 * block from a row entirely, so a thin first row silently hides a region of the
 * row template.
 *
 * It happened twice here. `/great-walks`'s first card belongs to the one tour
 * with no duration badge, so the dumped row had no `.tag-button.display-only`
 * and none of the five cards could ever show "5 Days". The nav's South Island
 * list begins with a tour that has no price, so no south tour could show one.
 * Both were four or five missing strings in a 596-line diff, and nothing else.
 *
 * So this reads the PORTED FRAGMENTS directly rather than copying
 * `npm run seams -- --dump` output, which emits the first row.
 */
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

import {ROOT} from './lib/env.mjs';
import {scanSpans, hasClass} from './lib/html.mjs';

const HTML_DIR = join(ROOT, 'web/src/html');
const OUT = join(HTML_DIR, 'seams');

/** Element open-tags in a slice — the "richness" score of a candidate row. */
const weight = (html) => (html.match(/<[a-zA-Z]/g) ?? []).length;

await mkdir(OUT, {recursive: true});

const files = (await readdir(HTML_DIR)).filter((f) => f.startsWith('main.') && f.endsWith('.html'));

let written = 0;
const report = [];

for (const file of files) {
  const page = file.replace(/^main\./, '').replace(/\.html$/, '');
  const html = await readFile(join(HTML_DIR, file), 'utf8');
  const spans = scanSpans(html);
  const lists = spans.filter((s) => hasClass(s.attrs, 'w-dyn-list'));

  for (const [index, wrapper] of lists.entries()) {
    const rows = spans.filter(
      (s) => s.start > wrapper.start && s.end <= wrapper.end && hasClass(s.attrs, 'w-dyn-item'),
    );
    // Webflow omits an empty list's items entirely — nothing to extract, and
    // the binder skips such a list rather than inventing a row.
    if (rows.length === 0) continue;

    const best = rows.reduce(
      (a, b) => (weight(html.slice(b.start, b.end)) > weight(html.slice(a.start, a.end)) ? b : a),
      rows[0],
    );
    const chosen = rows.indexOf(best);

    await writeFile(join(OUT, `${page}.${index}.html`), `${html.slice(best.start, best.end)}\n`, 'utf8');
    written += 1;
    if (chosen !== 0) {
      report.push(`${page}.${index}: row ${chosen} of ${rows.length} (richer than the first)`);
    }
  }
}

console.log(`\nok    ${written} seam template(s) -> web/src/html/seams/`);
if (report.length) {
  console.log('      a thin first row was skipped in:');
  for (const line of report) console.log(`        ${line}`);
}
console.log();
