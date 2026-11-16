/**
 * Bind one tour into the frozen `/tour/<slug>` template.
 *
 * A PURE FUNCTION of (template HTML, tour, shell, cards) so it can be exercised
 * offline against the real fragments and the real dataset. That matters more
 * here than anywhere else in the port: the mistake most likely to ship is text
 * binding correctly while every page shows the SAME image, and it looks perfect
 * until you diff the pictures. A function that returns a string can be asserted
 * on; a route cannot, without a server.
 *
 * THE FIVE COLLECTION LISTS, in template order — asserted, because a silent
 * reorder would bind reviews into the photo gallery:
 *
 *   0  sidebar photo gallery      this tour's photos
 *   1  testimonials (this tour)   up to two reviews that reference this tour,
 *                                and the whole region is removed when none do
 *   2  testimonials (strip)       three reviews, site-wide, unrelated to it
 *   3  pick-up points             options for the booking form's select
 *   4  related tours              this tour's related tours
 */
import {
  setText,
  setHtml,
  setAttr,
  setBackground,
  setListItems,
  setRepeaterTemplate,
  getEmbedSrc,
  setEmbedSrc,
  removeEl,
  removeEnclosing,
  countLists,
  hasSeam,
  seamCount,
} from '../seams.ts';
import {imageUrl, html as toHtml, type Shell, type Tour} from '../cms.ts';
import type {Cards} from '../cards.ts';

export const TOUR_LISTS = 5;

export function bindTour(template: string, tour: Tour, shell: Shell, cards: Cards): string {
  if (countLists(template) !== TOUR_LISTS) {
    throw new Error(
      `tpl-tour has ${countLists(template)} collection lists, expected ${TOUR_LISTS}. ` +
        'Re-run `npm run seams` and re-check the indices in src/lib/templates/tour.ts.',
    );
  }

  let body = template;

  // ── hero ─────────────────────────────────────────────────────────────────
  // TWO elements carry the hero as a CSS background — `.tour-hero-section` and,
  // nested inside it, `.tour-hero-container` which provides the blurred inset.
  // Binding only one leaves this tour's hero sitting on the sample tour's
  // backdrop, which looks like a design detail rather than a bug.
  //
  // Found by grepping the template for the sample filename, not by reading the
  // markup: an earlier version of this bound `.div-block-26` instead, which has
  // no background at all, so the call "succeeded" by adding a style attribute
  // to an element that never had one while the real second hero stayed the
  // sample's on all 29 pages.
  const hero = imageUrl(tour.hero, 1920);
  body = setBackground(body, 'tour-hero-section', hero);
  body = setBackground(body, 'tour-hero-container', hero);
  body = setText(body, 'heading-1', tour.title);

  /**
   * TWO `.subtitle` elements in the hero, holding different fields.
   *
   * `[0]` sits in `.hero-tag` and is the duration tag; `[1]` sits in
   * `.hero-subtitle` and is the tour's own name badge — "5 Days",
   * "☆New Tour☆". Binding only the first leaves the sample tour's badge on
   * every page, which reads as a detail of the design rather than a bug.
   *
   * The badge is bound BEFORE the chip is removed, for the same reason as the
   * area card: removing `.hero-tag` reindexes `.subtitle`.
   */
  if (seamCount(body, 'subtitle') > 1) {
    body = tour.nameDetail
      ? setText(body, 'subtitle', tour.nameDetail, 1)
      : removeEl(body, 'hero-subtitle');
  }

  if (tour.tag) {
    body = setText(body, 'subtitle', tour.tag.title);
    if (tour.tag.color) {
      body = setAttr(body, 'hero-tag', 'style', `background-color:${tour.tag.color}`);
    }
  } else if (hasSeam(body, 'hero-tag')) {
    body = removeEl(body, 'hero-tag');
  }

  // ── price ────────────────────────────────────────────────────────────────
  // Only 15 of 29 tours set an adult price, so the block has to GO when there
  // is none rather than show the sample tour's 425.
  if (tour.priceAdult != null) {
    body = setText(body, 'hero-price-amount', String(tour.priceAdult));
    body = setText(body, 'hero-price-for', 'NZ$');
  } else if (hasSeam(body, 'hero-price')) {
    body = removeEl(body, 'hero-price');
  }

  // ── prose ────────────────────────────────────────────────────────────────
  // Serialised into Webflow's own `.w-richtext` wrapper, so the ported
  // stylesheet styles CMS prose with no new CSS.
  // ONLY `.body-content` [0]. [1] is the static "Booking" conditions block —
  // "A minimum of 2 adults must be attending…" — which is template copy, not a
  // field. Writing highlights into it deleted that block from all 29 pages.
  body = setHtml(body, 'body-content', toHtml(tour.body));

  /**
   * `.white-rich-text` IS NOT BOUND, and must not be.
   *
   * Both occurrences are STATIC template copy about how booking and payment
   * work — "When you enquire about a tour, we will contact you to verify…".
   * An earlier version wrote `pricingNotes` into the first and the cancellation
   * policy into the second, which silently deleted that copy from all 29 tour
   * pages. The class name reads like a CMS field and is not one.
   *
   * KNOWN GAP — THREE FIELDS HAVE NOWHERE TO RENDER: `highlights`,
   * `pricingNotes` and `specialCancellationPolicy`.
   *
   * Webflow omits a conditional region ENTIRELY when its condition is off, so
   * a region missing from the sample item is missing from the frozen template
   * for every page. The sample (`hobbiton-movie-set-tour-1-day`) has no
   * highlights and `pricingSection` false, so neither region exists here.
   *
   * And no single tour can supply all of them: `rotorua-one-day-tour` has the
   * pricing section, `black-water-rafting-tour-1-day` has the cancellation
   * policy, and neither has both. So "pick the sample that renders the most"
   * is NOT sufficient when a collection's conditional regions are mutually
   * exclusive across items — the template has to be assembled from more than
   * one sample. Tracked in PROGRESS-OVERVIEW.hd.
   */

  // ── the booking form ─────────────────────────────────────────────────────
  /**
   * `#tour.tour-info` IS THE VALUE THE ENQUIRY ARRIVES WITH.
   *
   * It is the "Tour Requested" row of the form that posts to navi.co.nz, and
   * unbound it carried the SAMPLE tour's name — so an enquiry sent from any of
   * the 29 tour pages said "Hobbiton Movie Set Tour". The form survived the
   * port untouched and still submitted; what it submitted was wrong.
   */
  body = setText(body, 'tour-info', tour.title);

  /**
   * The booking-calendar embed, and the region around it.
   *
   * It is conditional on `tourAidCode` — 16 of the 29 tours set one, and
   * Webflow drops the label and the embed together on the other 13, so the
   * whole anonymous `<div>` goes rather than just the iframe.
   *
   * The URL is read back out of the markup and only its `tour=` parameter
   * swapped, so the third-party endpoint stays owned by the frozen page rather
   * than being rebuilt from a string literal here.
   */
  if (hasSeam(body, 'code-embed')) {
    if (tour.tourAidCode) {
      const src = getEmbedSrc(body, 'code-embed');
      body = setEmbedSrc(
        body,
        'code-embed',
        src.replace(/([?&]tour=)[^&]*/, `$1${encodeURIComponent(tour.tourAidCode)}`),
      );
    } else {
      body = removeEnclosing(body, 'code-embed');
    }
  }

  /**
   * "Pick-Up Location" — the CBD hotel select — is on NORTH ISLAND tours only.
   *
   * Checked against all 29 live pages, not inferred: `island === 'north'`
   * predicts its presence on every one of them, including the three tours whose
   * island is unset, where it is absent. The label says "these hotels in the
   * Auckland CBD", so the condition also makes sense — a Queenstown tour has
   * no Auckland pick-up to offer.
   *
   * There are exactly two `<select>`s in the form, and the pick-up one is the
   * second; its wrapping `<div>` carries no class, so it is reached through the
   * select. The hidden collection list that Finsweet populates the select FROM
   * is elsewhere in the page and stays either way, as it does on the live site.
   */
  if (tour.island !== 'north' && seamCount(body, 'w-select') === 2) {
    body = removeEnclosing(body, 'w-select', undefined, 1);
  }

  // ── the five lists ───────────────────────────────────────────────────────
  const photoItems = cards.tourPhotos(tour.photos ?? []);
  body = setListItems(body, 0, photoItems);
  // The gallery is a Webflow REPEATER list, so it also ships an encoded copy of
  // its item markup for the runtime to render from. Left alone, that copy keeps
  // the sample tour's photograph and a client-side render shows it everywhere.
  body = setRepeaterTemplate(body, 0, photoItems.split('\n')[0] || undefined);

  const ownReviews = tour.tourReviews ?? [];
  body = setListItems(body, 1, cards.reviewCards(ownReviews, 'tpl-tour.1'));

  // The site-wide strip skips whatever the region above it already used. Both
  // regions draw from the same eleven reviews, so without this the same quote
  // can appear twice on one page — which it did, and which no live page does:
  // on all five tour pages checked, the strip and the region above it are
  // disjoint.
  const shown = new Set(ownReviews.map((r) => r.slug));
  const strip = (tour.reviews ?? []).filter((r) => !shown.has(r.slug)).slice(0, 3);
  body = setListItems(body, 2, cards.reviewCards(strip, 'tpl-tour.2'));
  body = setListItems(body, 3, cards.pickUpOptions(shell.pickUps, 'tpl-tour.3'));
  body = setListItems(body, 4, cards.tourCardSquare(tour.related ?? []));

  /**
   * No reviews reference this tour — 20 of the 29 tour pages. Webflow keeps
   * the OUTER `.testimonials_list-wrapper` and empties it completely:
   *
   *     <div class="testimonials_list-wrapper w-dyn-list"></div>
   *
   * so the `role="list"` goes and the wrapper stays. Removing the wrapper too
   * is one `<div>` short on two thirds of the tour pages; leaving the empty
   * `role="list"` in place is one too many.
   *
   * Last, after every `setListItems`, because removing a list renumbers the
   * ones after it.
   */
  if (ownReviews.length === 0) body = removeEl(body, 'testimonials_list', 0);

  /**
   * "Related Tours" is a conditional section, heading and all.
   *
   * `routeburn-track-day-walk` is the case that makes it obvious: it HAS a
   * related tour in Webflow, that tour is archived, and the live page carries
   * no section at all. So the condition is "at least one related tour that
   * still exists", which is exactly what an empty `related` means here — the
   * archived one is not in the dataset to dereference.
   */
  if ((tour.related ?? []).length === 0 && hasSeam(body, 'justify-start')) {
    body = removeEnclosing(body, 'justify-start', 'content-section');
  }

  return body;
}
