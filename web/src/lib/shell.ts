/**
 * Bind the dataset into the shared nav.
 *
 * The nav carries NINE collection lists — it is the single most CMS-driven
 * region on the site, and the reason every page renders on demand rather than
 * only the collection routes. A prerendered "static" page would still ship a
 * frozen menu of tours.
 *
 * The footer has none; it is pure markup and passes through untouched.
 *
 * ROWS ARE EXTRACTED WITH THE SPAN SCANNER, never a regex. The first version of
 * this file pulled each row out with a lazy regex, which returned an unbalanced
 * fragment for the autocomplete rows (they wrap a link around nested divs and
 * an inline SVG). Injecting dozens of copies corrupted the document, the list
 * count collapsed from 9 to 5, and the Worker died on
 * "collection list #5 not found (template has 5)" — which points at the
 * indices and not at the cause. `firstItem` is balanced by construction.
 */
import {setText, setAttr, setListItems, countLists, richestItem, hasItems, hasSeam, removeEl} from './seams.ts';
import {areasByIsland, type Shell} from './cms.ts';

export const NAV_LISTS = 9;

/**
 * Webflow's autocomplete rows carry the searchable string in an attribute,
 * which the `webflow-util` autocomplete script reads. Binding the visible text
 * and forgetting the attribute gives a menu that looks right and cannot be
 * searched.
 */
const setMatch = (html: string, value: string) =>
  html.replace(/wfu-autocomplete-match="[^"]*"/, `wfu-autocomplete-match="${escapeAttr(value)}"`);

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * One autocomplete row: `.find_list-item` wrapping `.find_list-link`.
 *
 * TWO ROW SHAPES, and they differ in where the label lives. A TOUR row holds it
 * in a bare `<div>` with no class; a CATEGORY row has an icon and holds it in
 * `.text-block-12`. Handling only the bare-div case left all eleven category
 * rows labelled with the sample's text, which showed up as four category names
 * missing from the page entirely — the other seven happened to appear in the
 * Tours dropdown as well, which is what made it look like a partial failure.
 */
function autocompleteRow(row: string, href: string, label: string, price?: number): string {
  let html = setAttr(row, 'find_list-link', 'href', href);
  html = setMatch(html, label);
  html = hasSeam(html, 'text-block-12')
    ? setText(html, 'text-block-12', label)
    : html.replace(/(<div>)[^<]*(<\/div>)/, `$1${escapeText(label)}$2`);

  // The row carries an optional price block — `.find_list-currency-code` NZD,
  // a `$`, and the amount in `.text-block-11`. Only 15 of 29 tours have a
  // price, and the live markup OMITS the whole block for the rest, so it has to
  // be removed rather than left showing the sample tour's number.
  if (!hasSeam(html, 'text-block-11')) return html;
  if (price == null) return removeEl(html, 'div-block-23');
  return setText(html, 'text-block-11', String(price));
}

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One `.dropdown-link` row — a flat `<a>` with its text directly inside. */
function dropdownRow(row: string, href: string, label: string): string {
  return setText(setAttr(row, 'dropdown-link', 'href', href), 'dropdown-link', label);
}

export function bindNav(navHtml: string, shell: Shell): string {
  if (countLists(navHtml) !== NAV_LISTS) {
    throw new Error(
      `the shared nav has ${countLists(navHtml)} collection lists, expected ${NAV_LISTS}. ` +
        'Re-run `npm run extract` and re-check the indices in src/lib/shell.ts.',
    );
  }

  const areas = areasByIsland(shell.areas);
  let html = navHtml;

  /**
   * Bind one list, taking its row template from the CURRENT html.
   *
   * The count is re-asserted after every list, because a bad row template
   * corrupts the structure and the next index would then silently address the
   * wrong region. Failing at the seam that broke it is the whole point.
   */
  const bind = (index: number, rows: (row: string) => string) => {
    if (!hasItems(html, index)) return; // an empty list at extraction time
    const next = setListItems(html, index, rows(richestItem(html, index)));
    const after = countLists(next);
    if (after !== NAV_LISTS) {
      throw new Error(
        `binding nav list #${index} changed the list count from ${NAV_LISTS} to ${after}. ` +
          'The row template is almost certainly unbalanced.',
      );
    }
    html = next;
  };

  /**
   * EACH LIST IS FILTERED, and the filters were derived from the live item
   * counts rather than guessed. Binding every list with "all of them" produced
   * a nav ~200 tags larger than the live site's and the structural verifier
   * failed all 22 pages at once:
   *
   *   list 0   11 items  every category
   *   list 1   12 items  NORTH ISLAND tours — there is a heading above it
   *   list 2   15 items  SOUTH ISLAND tours
   *   list 4    7 items  FEATURED categories, not all 11
   *   list 5    4 items  every tag
   *   list 6    8 items  FEATURED tours, not all 29
   *   list 7    8 items  north areas
   *   list 8    7 items  south areas
   *
   * Each number matches a field in the dataset exactly, which is what makes
   * them filters rather than Webflow item limits.
   */
  const north = shell.tours.filter((t) => t.island === 'north');
  const south = shell.tours.filter((t) => t.island === 'south');
  const featuredTours = shell.tours.filter((t) => t.featured);
  const featuredCategories = shell.categories.filter((c) => c.featured);

  // 0–2: the three autocomplete feeds behind the nav's search box.
  bind(0, (row) =>
    shell.categories.map((c) => autocompleteRow(row, `/tours/${c.slug}`, c.name)).join(''),
  );
  bind(1, (row) =>
    north.map((t) => autocompleteRow(row, `/tour/${t.slug}`, t.title, t.priceAdult)).join(''),
  );
  bind(2, (row) =>
    south.map((t) => autocompleteRow(row, `/tour/${t.slug}`, t.title, t.priceAdult)).join(''),
  );

  // 3 is an EMPTY region. Webflow omits a collection list with no items from
  // the rendered HTML entirely and emits only its `.w-dyn-empty` state, so
  // there is no row to copy and nothing to bind. `hasItems` skips it.

  // 4: the "Tours" dropdown — FEATURED categories.
  bind(4, (row) =>
    featuredCategories.map((c) => dropdownRow(row, `/tours/${c.slug}`, c.name)).join(''),
  );

  // 5: durations — tags.
  bind(5, (row) => shell.tags.map((t) => dropdownRow(row, `/tag/${t.slug}`, t.groupTitle ?? t.title)).join(''));

  // 6: FEATURED tours.
  bind(6, (row) => featuredTours.map((t) => dropdownRow(row, `/tour/${t.slug}`, t.title)).join(''));

  // 7 and 8: areas, North Island then South Island. Two separate regions, so
  // the split is data rather than CSS.
  bind(7, (row) => areas.north.map((a) => dropdownRow(row, `/area/${a.slug}`, a.name)).join(''));
  bind(8, (row) => areas.south.map((a) => dropdownRow(row, `/area/${a.slug}`, a.name)).join(''));

  return html;
}

/** Mark the current page's nav link, the way Webflow does. */
export function markCurrent(navHtml: string, path: string): string {
  if (!path || path === '/') return navHtml;
  return navHtml.replace(
    new RegExp(`(<a[^>]*href="${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*class=")([^"]*)(")`),
    (_m, before, classes, after) => `${before}${classes} w--current${after} aria-current="page"`,
  );
}
