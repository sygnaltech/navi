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
 *   1  testimonials (single)      the most recent review of this tour
 *   2  testimonials (strip)       up to three reviews of this tour
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
  removeEl,
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

  // ── the five lists ───────────────────────────────────────────────────────
  const photoItems = cards.tourPhotos(tour.photos ?? []);
  body = setListItems(body, 0, photoItems);
  // The gallery is a Webflow REPEATER list, so it also ships an encoded copy of
  // its item markup for the runtime to render from. Left alone, that copy keeps
  // the sample tour's photograph and a client-side render shows it everywhere.
  body = setRepeaterTemplate(body, 0, photoItems.split('\n')[0] || undefined);

  body = setListItems(body, 1, cards.reviewCards((tour.reviews ?? []).slice(0, 1), 'tpl-tour.1'));
  body = setListItems(body, 2, cards.reviewCards((tour.reviews ?? []).slice(0, 3), 'tpl-tour.2'));
  body = setListItems(body, 3, cards.pickUpOptions(shell.pickUps, 'tpl-tour.3'));
  body = setListItems(body, 4, cards.tourCardSquare(tour.related ?? []));

  return body;
}
