/**
 * One renderer per collection-list region, binding Sanity data into the
 * VERBATIM Webflow item markup dumped by `npm run seams -- --dump`.
 *
 * A CARD BELONGS TO A TEMPLATE, NOT A COLLECTION. The same tour appears as
 * several different cards on this site — `.tour-card.services` on a category
 * page, `.vertical-container.services-page` on area and tag pages,
 * `.square-container` in a related-tours strip — and reusing one across
 * templates adds markup to a page that Webflow never put there. So the
 * renderers are keyed by `<template>.<list index>`, which is how the seams were
 * dumped, rather than by content type.
 *
 * None of this markup is typed out by hand. Each renderer loads its own frozen
 * fragment and replaces values in place, so Webflow's generated grid ids,
 * `data-ix` animation hooks and class soup all survive untouched.
 *
 * Built by a FACTORY taking the seam resolver, so the whole layer runs under
 * plain Node against the real fragments — see `seam-store.ts`.
 */
import {setText, setHtml, setAttr, setBackground, removeEl, hasSeam, seamCount} from './seams.ts';
import {imageUrl, type TourCard, type ReviewCard, type ImageRef} from './cms.ts';
import type {SeamResolver} from './seam-store.ts';

/** Join rendered items; an empty list renders as nothing, not as a sample item. */
const join = (items: string[]) => items.join('\n');

/**
 * The templates that use the `.vertical-container.services-page` card.
 *
 * Four regions share this exact card — the area and tag templates, the `/tours`
 * index and `/great-walks`. Listing them as a union keeps the reuse honest: a
 * card is shared only where Webflow actually shares it, and adding a name here
 * is a deliberate claim that the markup matches.
 */
export type VerticalCardSeam = 'tpl-area.0' | 'tpl-tag.0' | 'tours.0' | 'great-walks.0';

/**
 * A review date, in the form Webflow rendered: "November 24, 2024".
 *
 * Formatted explicitly rather than with `toLocaleDateString`, whose output
 * depends on the runtime's locale data — and the Worker's is not the one this
 * was written against.
 */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A value safe to drop inside a single-quoted JS string inside a `<script>`.
 *
 * HTML entities rather than backslashes, because the live site uses entities —
 * these strings are assigned through `innerHTML`, which decodes them. It is
 * also the form that cannot escape: no quote, no angle bracket and no `&`
 * survives, so neither the string nor the `</script>` can be broken out of.
 */
const jsLiteral = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export function reviewDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // UTC, because the stored value is a date rather than a moment — reading it
  // in a local zone shifts it a day either side of midnight.
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function makeCards(seam: SeamResolver) {
  /**
   * The duration chip, shared by three card shapes.
   *
   * Its colour is a `background-color` the editor sets per tag, so it is bound
   * rather than left as the sample's. A tour with no tag has the chip removed
   * entirely — an empty chip renders as a coloured stub.
   */
  function bindTag(html: string, tour: TourCard): string {
    if (!tour.tag) return hasSeam(html, 'link-block-11') ? removeEl(html, 'link-block-11') : html;
    let out = setAttr(html, 'link-block-11', 'href', `/tag/${tour.tag.slug}`);
    if (tour.tag.color) out = setAttr(out, 'tag-button', 'style', `background-color:${tour.tag.color}`);
    return setText(out, 'tag-item', tour.tag.title);
  }

  /**
   * `.tour-card.services` — the card on a category page.
   *
   * It carries the SAME name badge as the vertical card: a second, link-less
   * `.tag-button` after the tag chip. It was never bound here, so all eleven
   * category pages published the sample tour's badge on every card — a
   * sentence about small-group tours, stamped on tours it was not written for.
   * See `tourCardVertical` for why the badge is bound before the chip.
   */
  const tourCardServices = (tours: TourCard[]) =>
    join(
      tours.map((tour) => {
        let html = seam('tpl-tourCategory.1');
        // `.item-category` repeats the title and is what the page's MixItUp
        // filter reads, so it carries the title rather than the category name
        // its class implies.
        html = setText(html, 'item-category', tour.title);
        html = setBackground(html, 'vertical-box', imageUrl(tour.hero, 800));
        html = setText(html, 'title-big', tour.title);
        html = setText(html, 'paragraph-medium', tour.brief ?? '');
        html = setAttr(html, 'underline-block', 'href', `/tour/${tour.slug}`);
        html = setAttr(html, 'rounded-button', 'href', `/tour/${tour.slug}`);
        // THE BADGE IS BOUND BEFORE THE CHIP, and the order is load-bearing
        // for the same reason it is on the vertical card below. Here the badge
        // is the SECOND bare `.tag-button` — it has no `display-only` class to
        // name it — so it is addressed by index, and that index only holds
        // while `bindTag` has not yet removed the chip.
        if (seamCount(html, 'tag-button') > 1) {
          html = tour.nameDetail
            ? setText(html, 'tag-item', tour.nameDetail, 1)
            : removeEl(html, 'tag-button', 1);
        }
        return bindTag(html, tour);
      }),
    );

  /**
   * `.vertical-container.services-page` — the card on area and tag pages.
   *
   * The seam carries a second, link-less `.tag-button.display-only` holding the
   * tour's name badge. It must be REMOVED when a tour has no badge, or every
   * card shows the sample tour's.
   */
  const tourCardVertical = (tours: TourCard[], template: VerticalCardSeam) =>
    join(
      tours.map((tour) => {
        let html = seam(template);
        html = setBackground(html, 'vertical-box', imageUrl(tour.hero, 800));
        html = setText(html, 'title-big', tour.title);
        html = setText(html, 'paragraph-medium', tour.brief ?? '');
        html = setAttr(html, 'underline-block', 'href', `/tour/${tour.slug}`);
        html = setAttr(html, 'rounded-button', 'href', `/tour/${tour.slug}`);

        // THE BADGE IS BOUND BEFORE THE CHIP, and the order is load-bearing.
        //
        // `.tag-item` appears twice in this card: once inside the tag chip and
        // once inside the link-less `.tag-button.display-only` that holds the
        // tour's name badge. The badge is therefore index 1 — but only while
        // the chip is still there. `bindTag` REMOVES the chip for a tour with
        // no tag, after which the badge becomes index 0 and binding index 1
        // throws "seam tag-item #1 not found".
        //
        // Two of the 15 areas have such a tour, so doing this the other way
        // round failed on exactly those pages and nowhere else.
        if (hasSeam(html, 'display-only')) {
          html = tour.nameDetail
            ? setText(html, 'tag-item', tour.nameDetail, 1)
            : removeEl(html, 'display-only');
        }

        return bindTag(html, tour);
      }),
    );

  /** `.square-container` — the related-tours strip on a tour page. */
  const tourCardSquare = (tours: TourCard[]) =>
    join(
      tours.map((tour) => {
        let html = seam('tpl-tour.4');
        html = setBackground(html, 'square-container', imageUrl(tour.hero, 600));
        html = setAttr(html, 'w-inline-block', 'href', `/tour/${tour.slug}`);
        // `.title-link.yellow` is the STATIC word "Tour", not the tour's tag —
        // every live related card says "Tour" regardless of what the tour is
        // tagged. Binding `tag.name` into it put "1 Day" where live says
        // "Tour" on every related card on the site.
        html = setText(html, 'heading-3', tour.title);
        return html;
      }),
    );

  /** `.sidebar-tour-photo` — the tour page's lightbox gallery. */
  const tourPhotos = (photos: ImageRef[]) =>
    join(
      photos.map((photo) => {
        let html = seam('tpl-tour.0');
        html = setAttr(html, 'sidebar-tour-photo', 'src', imageUrl(photo, 400));
        html = setAttr(html, 'sidebar-tour-photo', 'alt', photo?.alt ?? '');
        // The lightbox reads the FULL-SIZE url out of the adjacent w-json
        // script. Binding only the <img> gives a gallery that opens thumbnails.
        html = setHtml(
          html,
          'w-json',
          JSON.stringify({items: [{url: imageUrl(photo, 1600), type: 'image'}], group: 'photo'}),
        );
        return html;
      }),
    );

  /** `.testimonails_list-item-wrapper` — a review card. Several lists use this. */
  const reviewCards = (
    reviews: ReviewCard[],
    template: 'tpl-tour.1' | 'tpl-tour.2' | 'reviews.0',
  ) =>
    join(
      reviews.map((review) => {
        let html = seam(template);
        html = setAttr(html, 'testimonials_list-item', 'href', `/reviews/${review.slug}`);

        /**
         * WHICH EXTRACT depends on where the card appears, and the two fields
         * hold different text.
         *
         * `generalBrief` is the site-wide extract and is set on all 11 reviews;
         * `brief` is a tour-specific one set on 9. The reviews INDEX renders
         * `generalBrief`, the tour pages render `brief`. Using one everywhere
         * put the wrong quote on `/reviews` for every review that has both —
         * eight missing lines, all of them real client wording.
         */
        const extract =
          template === 'reviews.0' ? review.generalBrief : review.brief ?? review.generalBrief;

        // `.text-part` ×3: an opening quote glyph, the text, a closing glyph.
        html = setText(html, 'text-part', extract, 1);
        html = setAttr(html, 'stars-inner', 'rating', String(review.rating));
        if (hasSeam(html, 'client-name')) html = setText(html, 'client-name', review.title);

        // `.client-job-position` holds the reviewer's location, and on the
        // reviews INDEX there is a SECOND one holding the date. The card on a
        // tour page has only the first — so the count decides, not existence.
        const positions = seamCount(html, 'client-job-position');
        if (positions > 0) {
          html = setText(html, 'client-job-position', review.where ?? review.from ?? '');
        }
        if (positions > 1) {
          html = setText(html, 'client-job-position', reviewDate(review.date), 1);
        }
        return html;
      }),
    );

  /** A pick-up option in the booking form's Finsweet select. */
  const pickUpOptions = (
    pickUps: Array<{title: string; address: string}>,
    template: 'tpl-tour.3' | 'booking.0' | 'pick-up.0',
  ) =>
    join(
      pickUps.map((pickUp) => {
        let html = seam(template);
        html = setText(html, 'booking-form-label-note', pickUp.address);
        // The value element carries no class of its own, only the Finsweet
        // attribute, so it is addressed by that.
        html = html.replace(
          /(<div fs-cmsselect-element="text-value">)[\s\S]*?(<\/div>)/,
          (_m, open, close) => `${open}${pickUp.title}${close}`,
        );
        return html;
      }),
    );

  /**
   * `.filter-button` — the chips across the top of a category page.
   *
   * They are the TAGS — "Half-day Tours", "1 Day Tours", "2 Day Tours",
   * "Multi-Day Tours" — not the categories. The sample seam gives it away: its
   * label is "Half-day Tours" and its colour is `hsla(41 …)`, which is the
   * `half-day` tag's own `color`. Bound to the eleven categories instead, as an
   * earlier version was, the row rendered eleven identically-coloured chips
   * naming the thing the page is already filtered to.
   *
   * The label is `groupTitle` ("Half-day Tours"), which is a third field
   * distinct from both `name` ("Half-day") and `title` ("Half-day Tour").
   *
   * `data-filter` stays at the seam's literal "all" because that is what every
   * chip carries on the live site — Webflow emits the same static value on all
   * four, so the MixItUp filter shows everything whichever chip is clicked.
   * Writing the tag slug here would be a behaviour change, not a port: the
   * cards carry no tag to match it against, so it would filter every card out.
   * The live defect is recorded in REVIEW.hd rather than silently fixed.
   */
  const filterButtons = (tags: Array<{slug: string; groupTitle?: string; color?: string}>) =>
    join(
      tags.map((tag) => {
        let html = seam('tpl-tourCategory.0');
        html = setText(html, 'filter-button', tag.groupTitle ?? '');
        if (tag.color) html = setAttr(html, 'filter-button', 'style', `background-color:${tag.color}`);
        return html;
      }),
    );

  /**
   * The tour `<option>` list on `/agents` and `/booking`.
   *
   * The only collection list on this site that is JAVASCRIPT rather than
   * markup: Webflow repeats an HTML embed once per tour, and each copy is a
   * `<script>` that appends one `<option>` to `#tour1` on DOM ready. So the
   * binding is a string substitution inside generated JS, and the two values
   * are rewritten in place rather than the block being rebuilt — the rest of
   * it, commented-out lines included, is Webflow's and stays as it is.
   *
   * `value` is `naviCode` ("MATA-SAT", "ROT"), which is what the booking system
   * receives, NOT `tourAidCode` — they differ on several tours (`KUPE` vs
   * `KUPE-EN`) and a wrong code is a booking against the wrong tour.
   *
   * The label is HTML-ESCAPED, because the live site escapes it: it is assigned
   * through `innerHTML`, so `&#39;` and `&amp;` are decoded by the browser on
   * assignment. Escaping also means a title can never close the `<script>` or
   * break out of the quoted string.
   */
  const tourOptions = (tours: TourCard[], template: 'agents.0' | 'booking.0') =>
    join(
      tours.map((tour) =>
        seam(template)
          .replace(/opt\.value = '[^']*';/, `opt.value = '${jsLiteral(tour.naviCode ?? '')}';`)
          .replace(/opt\.innerHTML = '[^']*';/, `opt.innerHTML = '${jsLiteral(tour.title)}';`),
      ),
    );

  return {
    tourOptions,
    tourCardServices,
    tourCardVertical,
    tourCardSquare,
    tourPhotos,
    reviewCards,
    pickUpOptions,
    filterButtons,
  };
}

export type Cards = ReturnType<typeof makeCards>;
