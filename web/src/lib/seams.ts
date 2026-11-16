/**
 * Bind Sanity content into a frozen Webflow collection template.
 *
 * The templates in `src/html/main.tpl-*.html` are VERBATIM Webflow output,
 * carrying one sample item's content. These helpers replace that content in
 * place, by CSS class, leaving every tag, attribute and generated id untouched.
 *
 * EVERY HELPER THROWS WHEN ITS HANDLE IS MISSING. That is the whole design, and
 * it is not defensiveness. A silent fallback publishes the SAMPLE ITEM's content
 * on every page — and the structural verifier cannot catch it, because the
 * frozen markup is identical to the live page's. A template that stops matching
 * after a Webflow class rename must break the build, loudly, at the seam.
 */

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

type Span = {tag: string; attrs: string; open: string; start: number; end: number; inner: [number, number]};

/**
 * Every balanced element span, by start offset.
 *
 * Shares its reasoning with `migration-scripts/lib/html.mjs`: Webflow's output
 * is regular enough that a parser would be a dependency for one job, and class
 * matching must compare whole whitespace-delimited tokens — `\bfooter\b` also
 * matches `class="footer-header"`, because `-` is a word boundary.
 */
function scan(src: string): Span[] {
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  const stack: Array<Omit<Span, 'end' | 'inner'> & {afterOpen: number}> = [];
  const spans: Span[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(src)) !== null) {
    const [full, closing, rawTag, attrs] = m;
    const tag = rawTag.toLowerCase();

    // VOID AND SELF-CLOSING ELEMENTS ARE RECORDED, with an empty inner range.
    //
    // Skipping them — which is what the migration scripts' own scanner does,
    // because it only ever needs balanced subtrees — makes `setAttr` unable to
    // touch an `<img>` or an `<input>`. That is not an edge case here: binding
    // an image per item is the single most important thing these helpers do,
    // and the failure mode is a thrown "seam not found" for a class that is
    // plainly in the markup.
    //
    // `setText`/`setHtml` against one still fails, correctly — a void element
    // has no content to replace.
    if (VOID.has(tag) || attrs.endsWith('/')) {
      if (!closing) {
        const after = m.index + full.length;
        spans.push({
          tag,
          attrs,
          open: full,
          start: m.index,
          end: after,
          inner: [after, after],
        });
      }
      continue;
    }

    if (!closing) {
      stack.push({tag, attrs, open: full, start: m.index, afterOpen: m.index + full.length});
      continue;
    }
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].tag !== tag) continue;
      const open = stack[i];
      spans.push({
        tag: open.tag,
        attrs: open.attrs,
        open: open.open,
        start: open.start,
        end: m.index + full.length,
        inner: [open.afterOpen, m.index],
      });
      stack.length = i;
      break;
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

const hasClass = (attrs: string, cls: string) =>
  (/class="([^"]*)"/.exec(attrs)?.[1] ?? '').split(/\s+/).includes(cls);

/** The nth (default: outermost first) span carrying `cls`. */
function find(html: string, cls: string, nth = 0): Span {
  const matches = scan(html).filter((s) => hasClass(s.attrs, cls));
  const hit = matches[nth];
  if (!hit) {
    throw new Error(
      `seam "${cls}"${nth ? ` #${nth}` : ''} not found in the template. ` +
        'The frozen Webflow markup changed, or the class was renamed — ' +
        'fix the seam rather than letting the sample item publish on every page.',
    );
  }
  return hit;
}

const splice = (html: string, [from, to]: [number, number], value: string) =>
  html.slice(0, from) + value + html.slice(to);

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * `w-dyn-bind-empty` — Webflow's marker for "this bound field has no value".
 *
 * IT IS NOT DECORATIVE. The site's stylesheet carries
 * `.w-dyn-hide, .w-dyn-bind-empty, .w-condition-invisible { display: none
 * !important }`, so an element that keeps the class is INVISIBLE no matter what
 * is written into it.
 *
 * That makes it a trap for a port that freezes one sample item per template:
 * whether the class is present depends on whether the SAMPLE's field happened
 * to be empty. The tour card on three templates was extracted from a tour with
 * no `brief`, so every card on `/tours`, `/tours/<category>` and `/tag/<slug>`
 * had the right text written into an element the browser never drew — a bug
 * with no symptom in the HTML and no symptom in a text diff of the HTML.
 *
 * So the class is maintained here rather than at the call sites: writing a
 * value removes it, writing nothing adds it. That is exactly what Webflow does,
 * and doing it centrally means a seam cannot acquire the bug by being
 * re-extracted from a different sample.
 */
const EMPTY_MARKER = 'w-dyn-bind-empty';

function markEmpty(html: string, cls: string, nth: number, isEmpty: boolean): string {
  const span = find(html, cls, nth);
  const classes = (/class="([^"]*)"/.exec(span.open)?.[1] ?? '').split(/\s+/).filter(Boolean);
  if (classes.includes(EMPTY_MARKER) === isEmpty) return html;
  const next = isEmpty
    ? [...classes, EMPTY_MARKER]
    : classes.filter((c) => c !== EMPTY_MARKER);
  const open = span.open.replace(/class="[^"]*"/, `class="${next.join(' ')}"`);
  return html.slice(0, span.start) + open + html.slice(span.start + span.open.length);
}

/** Replace an element's text content. Escaped — content is data, not markup. */
export const setText = (html: string, cls: string, value: string, nth = 0): string => {
  const out = splice(html, find(html, cls, nth).inner, escape(value ?? ''));
  return markEmpty(out, cls, nth, (value ?? '').trim() === '');
};

/** Replace an element's inner HTML. For already-serialised Portable Text only. */
export const setHtml = (html: string, cls: string, value: string, nth = 0): string => {
  const out = splice(html, find(html, cls, nth).inner, value ?? '');
  return markEmpty(out, cls, nth, (value ?? '').trim() === '');
};

/** Replace an attribute on the element carrying `cls`. */
export function setAttr(html: string, cls: string, attr: string, value: string, nth = 0): string {
  const span = find(html, cls, nth);
  const open = span.open;
  const re = new RegExp(`\\s${attr}="[^"]*"`);
  const next = re.test(open)
    ? open.replace(re, ` ${attr}="${escape(value)}"`)
    : open.replace(/>$/, ` ${attr}="${escape(value)}">`);
  return html.slice(0, span.start) + next + html.slice(span.start + open.length);
}

/**
 * Replace the `value` of the `<input>` carrying `id`.
 *
 * ADDRESSED BY ID AND RESTRICTED TO `<input>`, which is the exception to this
 * file's class-by-class rule, and both halves of that are load-bearing.
 *
 * The booking form's payload is five hidden inputs that Webflow gave ids and no
 * classes at all, so `setAttr` has nothing to aim at. And the tour page carries
 * TWO elements with `id="tour"` — the visible "Tour Requested" row earlier in
 * the document, and the hidden input that the enquiry actually travels in.
 * Anything that matched on the id alone would find the `<div>` first and bind
 * the payload by adding a `value` attribute to an element that has never had
 * one, leaving the real input holding the sample tour's name.
 *
 * `escape` is applied to the value, so a title with an `&` or a `"` in it
 * cannot terminate the attribute.
 */
export function setInputValue(html: string, id: string, value: string): string {
  const span = scan(html).find(
    (s) => s.tag === 'input' && new RegExp(`\\sid="${id}"`).test(s.attrs),
  );
  if (!span) {
    throw new Error(
      `seam <input id="${id}"> not found in the template. The frozen Webflow ` +
        'markup changed — fix the seam rather than letting the sample item\'s ' +
        'form payload publish on every page.',
    );
  }
  const open = span.open;
  const attr = ` value="${escape(value ?? '')}"`;
  const next = /\svalue="[^"]*"/.test(open)
    ? open.replace(/\svalue="[^"]*"/, () => attr)
    : open.replace(/\s*\/?>$/, (end) => `${attr}${end}`);
  return html.slice(0, span.start) + next + html.slice(span.start + open.length);
}

/**
 * Replace a CSS background-image URL.
 *
 * Webflow writes these as `style="background-image:url(&quot;…&quot;)"`, with
 * the quotes ENTITY-ENCODED because the whole thing lives in an attribute. The
 * replacement has to match that form exactly or the declaration is malformed
 * and the image silently does not load.
 */
export function setBackground(html: string, cls: string, url: string, nth = 0): string {
  return setAttr(html, cls, 'style', `background-image:url("${url}")`, nth)
    .replace(
      `style="background-image:url(&quot;${escape(url)}&quot;)"`,
      `style="background-image:url(&quot;${url}&quot;)"`,
    );
}

/**
 * Replace the `src` of the first `<img>` INSIDE the element carrying `cls`.
 *
 * For the images Webflow left unclassed. The area template's region map is one:
 *
 *     <div class="w-col w-col-2"><img width="161" alt="" src="…"></div>
 *
 * The class is on the column, not on the image, so `setAttr` has nothing to aim
 * at — and an unbindable image is not an image that stays blank, it is the
 * sample page's image frozen onto all 15 areas. Addressing the wrapper and
 * rewriting only the `src` leaves the rest of the tag — `width`, `alt` — as
 * Webflow emitted it.
 */
const srcRe = (tag: string) => new RegExp(`(<${tag}\\b[^>]*?\\ssrc=")([^"]*)(")`, 'i');

function childSrc(html: string, cls: string, tag: string, nth: number): [Span, string, string] {
  const span = find(html, cls, nth);
  const inner = html.slice(span.inner[0], span.inner[1]);
  const m = srcRe(tag).exec(inner);
  if (!m) {
    throw new Error(
      `seam "${cls}" has no <${tag} src> inside it. The frozen Webflow markup ` +
        'changed — fix the seam rather than letting the sample page publish ' +
        'on every page.',
    );
  }
  return [span, inner, m[2]];
}

export function setImageSrc(html: string, cls: string, url: string, nth = 0): string {
  const [span, inner] = childSrc(html, cls, 'img', nth);
  return splice(html, span.inner, inner.replace(srcRe('img'), `$1${escape(url)}$3`));
}

/**
 * The same, for an `<iframe>` inside an embed wrapper — plus a reader, because
 * the only embed on this site is a third-party booking calendar whose base URL
 * belongs in the frozen markup rather than in a string literal here. Read it,
 * swap the one query parameter that varies, write it back.
 */
export const getEmbedSrc = (html: string, cls: string, nth = 0): string =>
  childSrc(html, cls, 'iframe', nth)[2];

export function setEmbedSrc(html: string, cls: string, url: string, nth = 0): string {
  const [span, inner] = childSrc(html, cls, 'iframe', nth);
  return splice(html, span.inner, inner.replace(srcRe('iframe'), `$1${escape(url)}$3`));
}

/** Remove the element carrying `cls` entirely — for sections a document omits. */
export function removeEl(html: string, cls: string, nth = 0): string {
  const span = find(html, cls, nth);
  return html.slice(0, span.start) + html.slice(span.end);
}

/**
 * Remove the element that ENCLOSES the one carrying `cls`.
 *
 * For a conditional region whose own wrapper Webflow left unclassed, or gave a
 * class that repeats elsewhere in the template. Both happen on the tour page:
 *
 *   - the booking calendar is an anonymous `<div>` holding a label and an
 *     embed. Nothing names it, so it is named by its contents:
 *     `removeEnclosing(body, 'code-embed')`.
 *   - the related-tours section is `.content-section.less-top-padding
 *     .less-bottom-padding`, and BOTH of those modifiers also sit on the
 *     booking-form section above it. The list inside it is unique, so the
 *     section is reached from there: `removeEnclosing(body, 'justify-start',
 *     'content-section')`.
 *
 * `upTo` picks the innermost ancestor carrying that class rather than the
 * immediate parent, so the nesting depth between the two can change without
 * this silently removing the wrong element — it throws instead.
 */
export function removeEnclosing(html: string, cls: string, upTo?: string, nth = 0): string {
  const child = find(html, cls, nth);
  const ancestors = scan(html).filter((s) => s.start < child.start && s.end > child.end);
  const target = upTo
    ? ancestors.filter((s) => hasClass(s.attrs, upTo)).pop()
    : ancestors[ancestors.length - 1];
  if (!target) {
    throw new Error(
      `seam "${cls}" has no enclosing ${upTo ? `"${upTo}"` : 'element'} — ` +
        'the frozen Webflow markup changed.',
    );
  }
  return html.slice(0, target.start) + html.slice(target.end);
}

/** Is there an element with this class? For optional seams only. */
export const hasSeam = (html: string, cls: string): boolean =>
  scan(html).some((s) => hasClass(s.attrs, cls));

/**
 * How many elements carry this class.
 *
 * Needed wherever a seam is addressed by index, because `hasSeam` answers the
 * wrong question: the review card on a TOUR page has one
 * `.client-job-position` (the reviewer's location) and the card on the reviews
 * INDEX has two (location, then date). `hasSeam` is true for both, so binding
 * index 1 unconditionally threw on all 29 tour pages.
 */
export const seamCount = (html: string, cls: string): number =>
  scan(html).filter((s) => hasClass(s.attrs, cls)).length;

/**
 * Replace the items of the nth collection list.
 *
 * Takes the `w-dyn-items` container's CONTENTS and nothing else, so the
 * wrapper's and the container's opening tags — which carry Webflow's generated
 * `#w-node-*` grid placement ids — are re-emitted verbatim. Those ids repeat on
 * every rendered item, which is invalid HTML and exactly what the CSS targets;
 * making them unique breaks the layout.
 */
export function setListItems(html: string, listIndex: number, itemsHtml: string): string {
  const wrappers = scan(html).filter((s) => hasClass(s.attrs, 'w-dyn-list'));
  const wrapper = wrappers[listIndex];
  if (!wrapper) {
    throw new Error(
      `collection list #${listIndex} not found (template has ${wrappers.length}). ` +
        'Re-run `npm run seams` — the list order changed.',
    );
  }
  const region = html.slice(wrapper.start, wrapper.end);
  const items = scan(region).find((s) => hasClass(s.attrs, 'w-dyn-items'));
  if (!items) {
    throw new Error(`collection list #${listIndex} has no .w-dyn-items container`);
  }
  const rebuilt = splice(region, items.inner, itemsHtml);
  return html.slice(0, wrapper.start) + rebuilt + html.slice(wrapper.end);
}

/** How many collection lists the template has. Asserted by the routes. */
export const countLists = (html: string): number =>
  scan(html).filter((s) => hasClass(s.attrs, 'w-dyn-list')).length;

/**
 * The first `.w-dyn-item` subtree inside the nth collection list, verbatim.
 *
 * BALANCED BY CONSTRUCTION, which a regex cannot be. An earlier version of the
 * nav binder extracted this row with
 * `/<div[^>]*class="[^"]*w-dyn-item[^"]*"[\s\S]*?<\/div>\s*<\/div>/` — lazy, so
 * it stopped at the FIRST `</div></div>` and returned a truncated, unbalanced
 * fragment for any row with nested markup. Injecting dozens of copies of that
 * corrupted the document: the span scanner then mis-paired tags, the nav's list
 * count collapsed from 9 to 5, and the Worker died with
 * "collection list #5 not found (template has 5)" — a message that points at
 * the list indices and not at the real cause.
 *
 * Use this for any list whose rows are not a single flat element.
 */
export function firstItem(html: string, listIndex: number): string {
  const spans = scan(html);
  const wrapper = spans.filter((s) => hasClass(s.attrs, 'w-dyn-list'))[listIndex];
  if (!wrapper) throw new Error(`collection list #${listIndex} not found`);

  const row = spans.find(
    (s) => s.start > wrapper.start && s.end <= wrapper.end && hasClass(s.attrs, 'w-dyn-item'),
  );
  if (!row) {
    throw new Error(
      `collection list #${listIndex} has no .w-dyn-item to use as a row template. ` +
        'Webflow omits an empty list\'s items entirely, so this list may have had none at ' +
        'extraction time — bind it conditionally.',
    );
  }
  return html.slice(row.start, row.end);
}

/**
 * The RICHEST `.w-dyn-item` row inside the nth list — the one with the most
 * elements.
 *
 * PICK THE ROW BY COUNTING, NOT BY POSITION. This is the same trap the process
 * documents for choosing a sample ITEM, one level down: Webflow omits an empty
 * optional block from a row entirely, so a thin first row silently hides a
 * region of the row template.
 *
 * It bit exactly that way here. The nav's South Island list begins with a tour
 * that has no price, so its row carries no `.div-block-23` price block — and
 * using the first row as the template meant NO south tour could ever show a
 * price, while the north list (whose first row has one) was fine. The symptom
 * was two missing numbers in a 560-line text diff.
 */
export function richestItem(html: string, listIndex: number): string {
  const spans = scan(html);
  const wrapper = spans.filter((s) => hasClass(s.attrs, 'w-dyn-list'))[listIndex];
  if (!wrapper) throw new Error(`collection list #${listIndex} not found`);

  const rows = spans.filter(
    (s) => s.start > wrapper.start && s.end <= wrapper.end && hasClass(s.attrs, 'w-dyn-item'),
  );
  if (rows.length === 0) {
    throw new Error(
      `collection list #${listIndex} has no .w-dyn-item to use as a row template. ` +
        "Webflow omits an empty list's items entirely, so this list may have had " +
        'none at extraction time — bind it conditionally.',
    );
  }

  const score = (row: Span) => (html.slice(row.start, row.end).match(/<[a-zA-Z]/g) ?? []).length;
  const best = rows.reduce((a, b) => (score(b) > score(a) ? b : a), rows[0]);
  return html.slice(best.start, best.end);
}

/** Does this list have any item row to use as a template? */
export function hasItems(html: string, listIndex: number): boolean {
  try {
    firstItem(html, listIndex);
    return true;
  } catch {
    return false;
  }
}

/**
 * How many item rows the nth collection list currently holds.
 *
 * For assertions. Counting a pattern across the WHOLE document instead gives
 * the wrong answer: this site's nav carries one `wfu-autocomplete-match` row
 * outside all nine list regions — a prototype beside the search box — so a
 * document-wide count is always one more than the rows actually bound, and
 * encoding that as a magic `+1` in a test hides the next real discrepancy.
 */
export function listItemCount(html: string, listIndex: number): number {
  const spans = scan(html);
  const wrapper = spans.filter((s) => hasClass(s.attrs, 'w-dyn-list'))[listIndex];
  if (!wrapper) throw new Error(`collection list #${listIndex} not found`);
  return spans.filter(
    (s) => s.start > wrapper.start && s.end <= wrapper.end && hasClass(s.attrs, 'w-dyn-item'),
  ).length;
}

/**
 * Rebind Webflow's CLIENT-SIDE repeater template for a list, or drop it.
 *
 * A Webflow repeater list ships a second copy of its item markup in
 * `<script type="text/x-wf-template">`, `encodeURIComponent`-ed, for the
 * runtime to render from. Binding only `.w-dyn-items` leaves that copy holding
 * the SAMPLE item — so a client-side render puts the sample tour's photograph
 * on all 29 tour pages, and the server-rendered HTML looks perfect in view-source
 * while the browser shows something else.
 *
 * It is also where a percent-encoded Webflow CDN URL hides from both the asset
 * localiser and `assets:check`, which scan for `https://`.
 *
 * Pass the first bound item to keep the mechanism working with real content, or
 * nothing to remove the script when the list is empty.
 */
export function setRepeaterTemplate(html: string, listIndex: number, itemHtml?: string): string {
  const wrappers = scan(html).filter((s) => hasClass(s.attrs, 'w-dyn-list'));
  const wrapper = wrappers[listIndex];
  if (!wrapper) throw new Error(`collection list #${listIndex} not found`);

  const region = html.slice(wrapper.start, wrapper.end);
  const re = /<script type="text\/x-wf-template"[^>]*>[\s\S]*?<\/script>/;
  const found = re.exec(region);
  // Not every list has one — only Webflow "repeater" lists do.
  if (!found) return html;

  const rebuilt = itemHtml
    ? region.replace(re, found[0].replace(/>[\s\S]*?<\/script>/, `>${encodeURIComponent(itemHtml)}</script>`))
    : region.replace(re, '');

  return html.slice(0, wrapper.start) + rebuilt + html.slice(wrapper.end);
}

/**
 * Webflow's empty-state: hide the list and show `.w-dyn-empty` instead.
 *
 * Webflow omits an empty collection list from rendered HTML entirely, so a
 * template extracted from a sample item that had none is missing that whole
 * region. Where the sample DID have items and a document has none, the list
 * must be emptied rather than left showing the sample's.
 */
export const emptyList = (html: string, listIndex: number): string =>
  setListItems(html, listIndex, '');
