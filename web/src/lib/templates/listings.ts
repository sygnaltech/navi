/**
 * The four listing templates: tour category, area, tag, and the review and news
 * detail pages.
 *
 * All pure functions, like `tour.ts`, so `npm run test:templates` can render
 * every page offline and assert that each got its OWN images. That check is the
 * reason this layer is shaped as functions rather than living in the routes.
 *
 * Each binder asserts its collection-list count up front. A region appearing or
 * disappearing on re-extraction shifts every index after it, and the result is
 * content in the wrong region — which renders perfectly and is wrong.
 */
import {
  setText,
  setHtml,
  setAttr,
  setBackground,
  setListItems,
  removeEl,
  countLists,
  hasSeam,
} from '../seams.ts';
import {imageUrl, html as toHtml, type Shell} from '../cms.ts';
import type {Cards} from '../cards.ts';
import type {Block} from '../portable.ts';
import type {ImageRef, TourCard, ReviewCard} from '../cms.ts';

// ── tour category — /tours/<slug> ──────────────────────────────────────────

export type CategoryPage = {
  slug: string;
  name: string;
  brief: string;
  briefText?: string;
  body?: Block[];
  hero: ImageRef;
  tours: TourCard[];
};

export const CATEGORY_LISTS = 2;

/**
 * `/tours/<slug>` — 11 pages.
 *
 *   0  the filter chips across the top   every category
 *   1  the tour cards                    the tours in THIS category
 */
export function bindCategory(
  template: string,
  category: CategoryPage,
  shell: Shell,
  cards: Cards,
): string {
  assertLists(template, CATEGORY_LISTS, 'tpl-tourCategory');

  let body = template;
  body = setBackground(body, 'hero-medium', imageUrl(category.hero, 1920));
  body = setText(body, 'heading-1', category.name);

  // The hero subtitle and the intro paragraph are separate optional fields —
  // `brief` is the one-liner that also appears in the nav, `briefText` is the
  // page's own intro. Emptying rather than leaving them shows the sample's.
  body = setText(body, 'subtitle', category.brief);
  if (hasSeam(body, 'paragraph-5')) {
    body = setText(body, 'paragraph-5', category.briefText ?? '');
  }
  if (hasSeam(body, 'rich-text-block')) {
    body = setHtml(body, 'rich-text-block', toHtml(category.body));
  }

  body = setListItems(body, 0, cards.filterButtons(shell.categories));
  body = setListItems(body, 1, cards.tourCardServices(category.tours));
  return body;
}

// ── area — /area/<slug> ────────────────────────────────────────────────────

export type AreaPage = {
  slug: string;
  name: string;
  title: string;
  brief?: string;
  body?: Block[];
  hero: ImageRef;
  map: ImageRef;
  tours: TourCard[];
};

export const AREA_LISTS = 1;

/** `/area/<slug>` — 15 pages. One list: the tours in this area. */
export function bindArea(template: string, area: AreaPage, _shell: Shell, cards: Cards): string {
  assertLists(template, AREA_LISTS, 'tpl-area');

  let body = template;
  body = setBackground(body, 'hero-medium', imageUrl(area.hero, 1920));
  // The page heading is `title` ("Tours in Queenstown"), NOT `name`
  // ("Queenstown & Wanaka") — they are different fields with different content
  // on every one of the 15 areas.
  body = setText(body, 'heading-1', area.title);
  body = setText(body, 'subtitle', area.brief ?? '');
  body = setHtml(body, 'rich-text-block', toHtml(area.body));
  body = setListItems(body, 0, cards.tourCardVertical(area.tours, 'tpl-area.0'));
  return body;
}

// ── tag — /tag/<slug> ──────────────────────────────────────────────────────

export type TagPage = {
  slug: string;
  name: string;
  title: string;
  hero: ImageRef;
  tours: TourCard[];
};

export const TAG_LISTS = 1;

/** `/tag/<slug>` — 4 pages. One list: the tours with this duration. */
export function bindTag(template: string, tag: TagPage, _shell: Shell, cards: Cards): string {
  assertLists(template, TAG_LISTS, 'tpl-tag');

  let body = template;
  body = setBackground(body, 'hero-medium', imageUrl(tag.hero, 1920));
  body = setText(body, 'heading-1', tag.title);
  body = setListItems(body, 0, cards.tourCardVertical(tag.tours, 'tpl-tag.0'));
  return body;
}

// ── review — /reviews/<slug> ───────────────────────────────────────────────

export type ReviewPage = ReviewCard & {
  where?: string;
  date: string;
  body?: Block[];
};

/**
 * `/reviews/<slug>` — 11 pages. No collection lists of its own.
 *
 * NO `hasSeam` GUARDS on the required fields, deliberately. An earlier version
 * guarded every binding, and because the detail template uses `.review-sig`
 * rather than the `.client-name` / `.client-job-position` of the review CARD,
 * every guard was false and the function bound nothing at all — returning the
 * sample review on all 11 pages without raising a thing. Guarding a seam makes
 * it optional, which is precisely what a required field must not be.
 */
export function bindReview(template: string, review: ReviewPage): string {
  assertLists(template, 0, 'tpl-review');

  let body = template;
  // `.review-sig` ×2: the reviewer's name, then where they are from.
  body = setText(body, 'review-sig', review.title);
  body = setText(body, 'review-sig', review.where ?? review.from ?? '', 1);
  body = setHtml(body, 'body-content', toHtml(review.body));
  return body;
}

// ── news — /news/<slug> ────────────────────────────────────────────────────

export type NewsPage = {
  slug: string;
  title: string;
  date: string;
  summary?: string;
  mainImage: ImageRef;
  body?: Block[];
};

/**
 * `/news/<slug>` — 1 page. No collection lists of its own.
 *
 * Required fields are bound unguarded, for the reason in `bindReview`. This
 * template has no `.tour-hero-container`, unlike the tour template, so only the
 * one hero background exists to bind.
 */
export function bindNews(template: string, news: NewsPage): string {
  assertLists(template, 0, 'tpl-news');

  let body = template;
  body = setBackground(body, 'tour-hero-section', imageUrl(news.mainImage, 1920));
  body = setText(body, 'heading-8', news.title);
  body = setText(body, 'subtitle', news.summary ?? '');
  body = setHtml(body, 'body-content', toHtml(news.body));
  return body;
}

function assertLists(template: string, expected: number, name: string): void {
  const found = countLists(template);
  if (found !== expected) {
    throw new Error(
      `${name} has ${found} collection lists, expected ${expected}. ` +
        'Re-run `npm run seams` and re-check the indices in src/lib/templates/listings.ts.',
    );
  }
}

export {removeEl};
