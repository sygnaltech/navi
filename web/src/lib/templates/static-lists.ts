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
   *   0  the hero              the live `featured` item
   *   1  the category selector  every tour category
   *   2  the news strip         news posts
   */
  home(body, {shell, seam}) {
    let out = body;

    /**
     * The hero is a `featured`, not a `special` and not a tour — see the note
     * on SHELL_QUERY for how those two were confused and what it rendered.
     *
     * All four of the item's regions bind. Binding only the image and the link,
     * as an earlier version did, leaves the sample's headline frozen on the
     * page: the hero went on saying "Tour Hobbiton" over a different item's
     * image, which reads as correct and is the hardest kind of wrong to spot.
     *
     * An empty result must empty the list rather than leave the sample in
     * place, which is what `setListItems` with no items does.
     */
    out = setListItems(
      out,
      0,
      (shell.homepageHeroes ?? [])
        .map((hero) => {
          let html = seam('home.0');
          html = setBackground(html, 'hero-section', imageUrl(hero.heroImage, 1920));
          html = setAttr(html, 'hero-link-block', 'href', hero.link);
          html = setText(html, 'heading-1', hero.title);
          // `setText` maintains `w-dyn-bind-empty` on the subtitle for us —
          // the sample had none, and the class is what hides it.
          if (hasSeam(html, 'news-subheading')) {
            html = setText(html, 'news-subheading', hero.subtitle ?? '');
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
          // `thumb` here, `hero` on /portfolio — see the note there. All four
          // categories on this strip set both fields to the same image, so the
          // live page cannot tell them apart; `thumb` is the one this card's
          // size asks for, with `hero` behind it for a category that has none.
          html = setBackground(html, 'selection-item-bgimage', imageUrl(category.thumb ?? category.hero, 600));
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
   *
   * TWO THINGS THIS PAGE DOES DIFFERENTLY FROM EVERY OTHER CATEGORY LIST, both
   * read off the live page rather than assumed:
   *
   *   - The square shows `hero`, not `thumb`. The two differ on
   *     `school-educational-tours`, and `transfers` and `adventure-activities`
   *     have no `thumb` at all — so bound to `thumb` this page showed one wrong
   *     picture and two empty squares.
   *   - The order is `seq` DESCENDING, ties by name. That puts the four
   *     unranked categories (seq 100) first and Hobbiton last, which is the
   *     reverse of the nav's order on the same eleven documents.
   */
  portfolio(body, {shell, seam}) {
    const ordered = [...shell.categories].sort(
      (a, b) => (b.seq ?? 0) - (a.seq ?? 0) || a.name.localeCompare(b.name),
    );
    return setListItems(
      body,
      0,
      ordered
        .map((category) => {
          let html = seam('portfolio.0');
          html = setBackground(html, 'big-square-container', imageUrl(category.hero ?? category.thumb, 900));
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
