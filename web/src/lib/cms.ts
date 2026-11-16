/**
 * The site's GROQ queries, in one place.
 *
 * Every query projects EXPLICIT fields rather than returning whole documents.
 * A `*[_type == "tour"]` that drags every field across the wire is slower, and
 * worse, it hides what a page actually depends on — so a field rename breaks a
 * page with no clue which one.
 *
 * Images are projected as a ready-to-use URL rather than an asset reference, so
 * no route has to know about the URL builder. Each one asks for a specific
 * width: the frozen Webflow markup sizes these containers, and shipping a
 * 4000px original into a 400px card is the easiest performance mistake
 * available here.
 */
import {client, urlFor} from './sanity.ts';
import {renderPortableText, type Block} from './portable.ts';

/** Image projection: the asset plus the hotspot the Studio editors can set. */
const IMAGE = `{"ref": asset._ref, "alt": alt, "hotspot": hotspot, "crop": crop}`;

export type ImageRef = {
  ref?: string;
  alt?: string;
  hotspot?: {x: number; y: number};
  crop?: unknown;
} | null;

/**
 * An image URL at a given width, or '' when the field is empty.
 *
 * Returning '' rather than throwing is deliberate: a missing optional image is
 * a content state, and the route decides whether that is acceptable. A missing
 * REQUIRED image is caught by `npm run sanity:verify`, before it can reach a
 * page.
 */
export function imageUrl(image: ImageRef, width: number, height?: number): string {
  if (!image?.ref) return '';
  let builder = urlFor({_type: 'image', asset: {_ref: image.ref}, hotspot: image.hotspot} as never)
    .width(width)
    .auto('format')
    .fit('crop');
  if (height) builder = builder.height(height);
  return builder.url();
}

export const html = (blocks?: Block[] | null) => renderPortableText(blocks);

// ── shared fragments ───────────────────────────────────────────────────────

/** What a tour CARD needs, wherever it appears. */
const TOUR_CARD = `
  "slug": slug.current,
  "title": title,
  "brief": brief,
  "nameDetail": nameDetail,
  "hero": heroImage${IMAGE},
  "priceAdult": priceAdult,
  "island": island,
  "featured": featured,
  "tag": tag->{"slug": slug.current, "title": title, "name": name, "color": color},
  "categories": categories[]->{"slug": slug.current, "name": name},
  "areas": areas[]->{"slug": slug.current, "name": name}
`;

export type TourCard = {
  slug: string;
  title: string;
  brief?: string;
  nameDetail?: string;
  hero: ImageRef;
  priceAdult?: number;
  island?: string | null;
  featured?: boolean;
  tag?: {slug: string; title: string; name: string; color?: string} | null;
  categories?: Array<{slug: string; name: string}>;
  areas?: Array<{slug: string; name: string}>;
};

const REVIEW_CARD = `
  "slug": slug.current,
  "title": title,
  "from": from,
  "where": where,
  "date": date,
  "rating": rating,
  "brief": coalesce(brief, generalBrief),
  "generalBrief": generalBrief,
  "link": link
`;

export type ReviewCard = {
  slug: string;
  title: string;
  from?: string;
  /** Where the reviewer is from, shown on the card above the date. */
  where?: string;
  date?: string;
  rating: number;
  brief?: string;
  generalBrief: string;
  link: string;
};

// ── tour ───────────────────────────────────────────────────────────────────

/**
 * One tour, with everything its page renders.
 *
 * THE TESTIMONIAL STRIPS ARE SITE-WIDE, not this tour's own reviews — checked
 * against the live site rather than assumed. `/tour/matakana-saturday` shows
 * three reviews, none of which references that tour, and only 9 of the 11
 * reviews reference any tour at all. Filtering on the review's `tours` field,
 * which is the obvious reading of it, left 20 of the 29 tour pages with no
 * testimonials.
 *
 * Ordered newest-first. The live order matches none of date, name or slug:
 * Webflow randomises the list at PUBLISH time and bakes the result in, so it is
 * stable per publish and unreproducible. Newest-first is deterministic, means
 * something to a reader, and is driven by a field an editor controls. The
 * resulting difference in WHICH reviews appear is declared in
 * migration-scripts/divergences.config.mjs.
 *
 * (Comments stay outside the template literal: a backtick in a doc comment
 * inside one terminates the string, which fails as a parse error pointing at
 * the prose.)
 */
export const TOUR_QUERY = `*[_type == "tour" && slug.current == $slug][0]{
  "slug": slug.current,
  title, nameDetail, brief, naviCode, island,
  "hero": heroImage${IMAGE},
  "photos": photos[]${IMAGE},
  highlights, body,
  pricingSection, priceAdult, priceChild, priceNoteChild, pricingNotes,
  canPayOnline, hasSpecialCancellationPolicy, specialCancellationPolicy,
  "tag": tag->{"slug": slug.current, "title": title, "name": name, "color": color},
  "categories": categories[]->{"slug": slug.current, "name": name, "brief": brief},
  "areas": areas[]->{"slug": slug.current, "name": name, "title": title},
  "special": special->{"slug": slug.current, title, details},
  "related": relatedTours[]->{${TOUR_CARD}},
  "reviews": *[_type == "review"]|order(date desc){${REVIEW_CARD}}
}`;

export const TOUR_SLUGS_QUERY = `*[_type == "tour" && defined(slug.current)].slug.current`;

export type Tour = {
  slug: string;
  title: string;
  nameDetail?: string;
  brief?: string;
  naviCode: string;
  island?: string;
  hero: ImageRef;
  photos?: ImageRef[];
  highlights?: Block[];
  body?: Block[];
  pricingSection?: boolean;
  priceAdult?: number;
  priceChild?: number;
  priceNoteChild?: string;
  pricingNotes?: Block[];
  canPayOnline?: boolean;
  hasSpecialCancellationPolicy?: boolean;
  specialCancellationPolicy?: Block[];
  tag?: TourCard['tag'];
  categories?: Array<{slug: string; name: string; brief?: string}>;
  areas?: Array<{slug: string; name: string; title: string}>;
  special?: {slug: string; title: string; details: string} | null;
  related?: TourCard[];
  reviews?: ReviewCard[];
};

export const getTour = (slug: string) => client.fetch<Tour | null>(TOUR_QUERY, {slug});

// ── the shared shell ───────────────────────────────────────────────────────

/**
 * Everything the nav and footer need.
 *
 * Fetched for EVERY page, including the ported static ones, because the shell's
 * nine collection lists are part of why the whole site renders on demand.
 */
export const SHELL_QUERY = `{
  "categories": *[_type == "tourCategory"]|order(seq asc){"slug": slug.current, name, brief, featured, "thumb": thumb${IMAGE}},
  "areas": *[_type == "area"]|order(name asc){"slug": slug.current, name, title, "island": island->slug.current},
  "tags": *[_type == "tag"]|order(seq asc){"slug": slug.current, name, title, groupTitle, color},
  "tours": *[_type == "tour"]|order(seq asc, title asc){${TOUR_CARD}},
  "pickUps": *[_type == "pickUp"]|order(title asc){"slug": slug.current, title, address, latitude, longitude},
  "reviews": *[_type == "review"]|order(date desc){${REVIEW_CARD}},
  "news": *[_type == "news"]|order(date desc){"slug": slug.current, title, summary, "mainImage": mainImage${IMAGE}},
  "homepageSpecials": *[_type == "special" && homepageBanner == true]{
    "slug": slug.current, title, details,
    "heroImage": homepageHeroImage${IMAGE},
    "link": homepageLink
  }
}`;

export type AreaLink = {slug: string; name: string; title: string; island?: string | null};

export type Shell = {
  categories: Array<{slug: string; name: string; brief: string; featured?: boolean; thumb: ImageRef}>;
  areas: AreaLink[];
  tags: Array<{slug: string; name: string; title: string; groupTitle?: string; color?: string}>;
  tours: TourCard[];
  pickUps: Array<{slug: string; title: string; address: string; latitude: string; longitude: string}>;
  reviews: ReviewCard[];
  news: Array<{slug: string; title: string; summary?: string; mainImage: ImageRef}>;
  homepageSpecials: Array<{
    slug: string;
    title: string;
    details: string;
    heroImage: ImageRef;
    link?: string;
  }>;
};

/**
 * Areas grouped by island, for the nav's two separate dropdown columns.
 *
 * The nav has a North Island list and a South Island list as DISTINCT regions,
 * so the split has to happen here rather than being left to CSS. An area with
 * no island reference would otherwise silently disappear from both — so it goes
 * in the north column, which is where the unplaced ones sat on the live site.
 */
export const areasByIsland = (areas: AreaLink[]) => ({
  north: areas.filter((a) => a.island !== 'south'),
  south: areas.filter((a) => a.island === 'south'),
});

export const getShell = () => client.fetch<Shell>(SHELL_QUERY);

// ── the listing pages ──────────────────────────────────────────────────────

/**
 * `references(^._id)` is how each listing finds its tours.
 *
 * It matches a reference from ANY field, which is what is wanted here — a tour
 * belongs to a category through `categories[]` and to an area through
 * `areas[]`, and asking per-field would mean a query per relationship that has
 * to be kept in step with the schema.
 *
 * Ordered by `seq` then title, matching the tour collection's own ordering, so
 * a tour appears in the same relative position on every listing it is on.
 */
const TOURS_HERE = `*[_type == "tour" && references(^._id)]|order(seq asc, title asc){${TOUR_CARD}}`;

export const CATEGORY_QUERY = `*[_type == "tourCategory" && slug.current == $slug][0]{
  "slug": slug.current, name, brief, briefText, body,
  "hero": hero${IMAGE},
  "tours": ${TOURS_HERE}
}`;

export const AREA_QUERY = `*[_type == "area" && slug.current == $slug][0]{
  "slug": slug.current, name, title, brief, body,
  "hero": hero${IMAGE},
  "map": map${IMAGE},
  "tours": ${TOURS_HERE}
}`;

export const TAG_QUERY = `*[_type == "tag" && slug.current == $slug][0]{
  "slug": slug.current, name, title,
  "hero": hero${IMAGE},
  "tours": ${TOURS_HERE}
}`;

export const REVIEW_QUERY = `*[_type == "review" && slug.current == $slug][0]{
  ${REVIEW_CARD}, where, date, body
}`;

export const NEWS_QUERY = `*[_type == "news" && slug.current == $slug][0]{
  "slug": slug.current, title, date, summary, body,
  "mainImage": mainImage${IMAGE}
}`;

export const getCategory = (slug: string) => client.fetch(CATEGORY_QUERY, {slug});
export const getArea = (slug: string) => client.fetch(AREA_QUERY, {slug});
export const getTag = (slug: string) => client.fetch(TAG_QUERY, {slug});
export const getReview = (slug: string) => client.fetch(REVIEW_QUERY, {slug});
export const getNews = (slug: string) => client.fetch(NEWS_QUERY, {slug});
