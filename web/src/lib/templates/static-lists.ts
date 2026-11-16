/**
 * Bind the collection lists that sit on the PORTED STATIC pages.
 *
 * Ten of the 22 ported pages carry lists of their own, on top of the nine in
 * the shared nav. Left frozen they render the content they had at extraction
 * time — correct today, stale the moment anyone publishes — which is exactly
 * what "100% dynamic" rules out.
 *
 * Keyed by page slug, and a page with no entry is passed through untouched. The
 * seam names match the dumps (`<page>.<list index>`), so adding a list to a
 * Webflow page means re-running `npm run seams` and adding a case here.
 *
 * Every binder is a pure function, so `test:templates` renders these offline
 * alongside the collection routes.
 */
import {setText, setHtml, setAttr, setBackground, setListItems, countLists, hasSeam, removeEl} from '../seams.ts';
import {imageUrl, type Shell, type TourCard} from '../cms.ts';
import type {Cards} from '../cards.ts';
import type {SeamResolver} from '../seam-store.ts';

type Ctx = {shell: Shell; cards: Cards; seam: SeamResolver};

/**
 * `/tours` and `/great-walks` use the SAME card as the area and tag templates,
 * so they use the same renderer rather than a near-copy of it.
 *
 * An earlier version of this file had its own `verticalCards` helper that
 * omitted the `.tag-button.display-only` badge, and the badge is where each
 * tour's duration lives — "5 Days", "3 Days". The result was four missing
 * strings on `/great-walks` and nothing else wrong, which is exactly how a
 * near-duplicate card renderer fails.
 */

const BINDERS: Record<string, (body: string, ctx: Ctx) => string> = {
  /**
   * Home — three lists:
   *   0  the hero carousel      the special flagged as the homepage banner
   *   1  the category selector  every tour category
   *   2  the news strip         news posts
   */
  home(body, {shell, seam}) {
    let out = body;

    // The hero is driven by a `special`, not a tour. Only one of the five
    // specials sets `homepageBanner`, so an empty result must empty the list
    // rather than leave the sample's hero in place.
    const banner = shell.homepageSpecials ?? [];
    out = setListItems(
      out,
      0,
      banner
        .map((special) => {
          let html = seam('home.0');
          html = setBackground(html, 'hero-section', imageUrl(special.heroImage, 1920));
          if (hasSeam(html, 'w-inline-block')) {
            html = setAttr(html, 'w-inline-block', 'href', special.link ?? '/tours');
          }
          return html;
        })
        .join('\n'),
    );

    /**
     * The category selector: the first FOUR featured categories, by `seq`.
     *
     * Live renders four of the eleven — `hobbiton`, `nature`, `auckland-tours`,
     * `walking-hiking-tours`, which are seq 1 to 4 of the seven featured ones.
     * So it is the featured filter plus a limit, not a filter of its own.
     *
     * `.selection-item-title` is the STATIC label "TOUR SELECTION", not a
     * field. Binding the category name into it — which an earlier version did —
     * silently deletes that label from all four cards, and the only symptom is
     * three missing lines in a text diff.
     */
    out = setListItems(
      out,
      1,
      shell.categories
        .filter((category) => category.featured)
        .slice(0, 4)
        .map((category) => {
          let html = seam('home.1');
          html = setAttr(html, 'selection-item-link', 'href', `/tours/${category.slug}`);
          html = setBackground(html, 'selection-item-bgimage', imageUrl(category.thumb, 600));
          html = setText(html, 'title-small', category.name);
          if (hasSeam(html, 'subtitle')) html = setText(html, 'subtitle', category.brief ?? '');
          return html;
        })
        .join('\n'),
    );

    out = setListItems(
      out,
      2,
      (shell.news ?? [])
        .map((post) => {
          let html = seam('home.2');
          html = setAttr(html, 'vertical-box', 'href', `/news/${post.slug}`);
          html = setBackground(html, 'vertical-box', imageUrl(post.mainImage, 800));
          if (hasSeam(html, 'title-big')) html = setText(html, 'title-big', post.title);
          return html;
        })
        .join('\n'),
    );

    return out;
  },

  /** `/tours` — the index. One list: every tour. */
  tours(body, {shell, cards}) {
    return setListItems(body, 0, cards.tourCardVertical(shell.tours, 'tours.0'));
  },

  /** `/great-walks` — one list: the tours in the Great Walks category. */
  'great-walks'(body, {shell, cards}) {
    const walks = shell.tours.filter((t) =>
      (t.categories ?? []).some((c) => c.slug === 'great-walks'),
    );
    return setListItems(body, 0, cards.tourCardVertical(walks, 'great-walks.0'));
  },

  /** `/reviews` — one list: every review, newest first. */
  reviews(body, {shell, cards}) {
    return setListItems(body, 0, cards.reviewCards(shell.reviews ?? [], 'reviews.0'));
  },

  /** `/pick-up` — one list: the pick-up points. */
  'pick-up'(body, {shell, seam}) {
    return setListItems(
      body,
      0,
      shell.pickUps
        .map((pickUp) => {
          // The row is an `<h5>` plus a bare `<div>`, neither carrying a class,
          // so they are addressed positionally inside the row rather than by
          // seam — the only region on the site where that is necessary.
          return seam('pick-up.0')
            .replace(/<h5>[\s\S]*?<\/h5>/, `<h5>${escapeText(pickUp.title)}</h5>`)
            .replace(/(<\/h5>\s*<div>)[\s\S]*?(<\/div>)/, `$1${escapeText(pickUp.address)}$2`);
        })
        .join('\n'),
    );
  },

  /**
   * `/portfolio` — one list: the CATEGORIES, as big squares.
   *
   * Not tours, despite the page's name and the card's size. Every link in the
   * live page is `/tours/<slug>` and there are eleven of them — one per
   * category. An earlier version bound tours here and produced 159 extra tags.
   *
   * `.title.yellow` is the static label "PORTFOLIO", not a field.
   */
  portfolio(body, {shell, seam}) {
    return setListItems(
      body,
      0,
      shell.categories
        .map((category) => {
          let html = seam('portfolio.0');
          html = setBackground(html, 'big-square-container', imageUrl(category.thumb, 900));
          html = setText(html, 'title-big', category.name);
          html = setAttr(html, 'underline-block', 'href', `/tours/${category.slug}`);
          html = setAttr(html, 'button-round-hollow', 'href', `/tours/${category.slug}`);
          return html;
        })
        .join('\n'),
    );
  },
};

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Bind whatever lists this ported page has.
 *
 * Pages NOT handled here keep their frozen lists, and that is a deliberate,
 * narrow set:
 *
 *   /agents, /booking   their list is an inline `<script>` that builds a tour
 *                       `<select>` from the collection. Rebinding it means
 *                       rewriting generated JS, which is a separate job from
 *                       the markup port.
 *   /sitemap, /map      link indexes whose regions are not yet mapped.
 *
 * They are listed in PROGRESS-OVERVIEW.hd rather than left to be discovered.
 */
export function bindStaticLists(slug: string, body: string, ctx: Ctx): string {
  const binder = BINDERS[slug];
  if (!binder) return body;
  if (countLists(body) === 0) return body;
  return binder(body, ctx);
}

export const BOUND_STATIC_PAGES = Object.keys(BINDERS);
