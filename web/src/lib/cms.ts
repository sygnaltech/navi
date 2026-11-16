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
 * THERE ARE TWO TESTIMONIAL REGIONS AND THEY ASK DIFFERENT QUESTIONS.
 *
 *   `tourReviews`  the reviews that REFERENCE this tour, at most two. Webflow
 *                  omits the whole region when there are none, which is why it
 *                  is absent on 20 of the 29 tour pages — that absence is the
 *                  correct rendering, not a gap. Counted on the live pages:
 *                  `hobbiton-waitomo-caves-tour-1-day` has four referencing
 *                  reviews and shows two, `west-auckland-winery-tour` has two
 *                  and shows both, `matakana-saturday` has none and the region
 *                  is not in its markup at all.
 *
 *   `reviews`      the site-wide strip below it, three of the eleven, with no
 *                  relation to this tour. `/tour/matakana-saturday` shows three
 *                  reviews, none of which references it.
 *
 * An earlier version read the first region as site-wide too and bound it to the
 * newest review — so the same quote appeared twice on every tour page, once in
 * each region, and the pages Webflow leaves blank got a testimonial they should
 * not have.
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
  title, nameDetail, brief, naviCode, tourAidCode, island,
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
  "tourReviews": *[_type == "review" && references(^._id)]|order(date desc)[0...2]{${REVIEW_CARD}},
  "reviews": *[_type == "review"]|order(date desc){${REVIEW_CARD}}
}`;

export const TOUR_SLUGS_QUERY = `*[_type == "tour" && defined(slug.current)].slug.current`;

export type Tour = {
  slug: string;
  title: string;
  nameDetail?: string;
  brief?: string;
  naviCode: string;
  /** The booking system's code for this tour. 16 of the 29 set it. */
  tourAidCode?: string;
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
  /** Reviews that reference this tour, at most two. Often empty — see above. */
  tourReviews?: ReviewCard[];
  reviews?: ReviewCard[];
};

export const getTour = (slug: string) => client.fetch<Tour | null>(TOUR_QUERY, {slug});

// ── the shared shell ───────────────────────────────────────────────────────

/**
 * Everything the nav and footer need.
 *
 * Fetched for EVERY page, including the ported static ones, because the shell's
 * nine collection lists are part of why the whole site renders on demand.
 *
 * `homepageHeroes` is the homepage hero, and it comes from `featured` — NOT
 * from `special`. Both collections carry a homepage image and a homepage link,
 * which is how an earlier version of this query came to drive the hero from
 * `special.homepageBanner`: the only special with that flag set is a 2020
 * affiliate ad whose "hero image" is a 728x90 banner, so the homepage rendered
 * a stretched advert behind the heading and linked it off-site.
 *
 * The live rule is the one Webflow's collection list uses: enabled, inside its
 * date window, ordered by `pos`. Today that resolves to exactly one of the four
 * `featured` items; the other three are either drafts or expired. The template
 * repeats per item, so a second live one is a second hero, as on Webflow.
 */
export const SHELL_QUERY = `{
  "categories": *[_type == "tourCategory"]|order(seq asc){"slug": slug.current, name, brief, featured, seq, "thumb": thumb${IMAGE}, "hero": hero${IMAGE}},
  "areas": *[_type == "area"]|order(name asc){"slug": slug.current, name, title, "island": island->slug.current},
  "tags": *[_type == "tag"]|order(seq asc){"slug": slug.current, name, title, groupTitle, color},
  "tours": *[_type == "tour"]|order(seq asc, title asc){${TOUR_CARD}},
  "pickUps": *[_type == "pickUp"]|order(title asc){"slug": slug.current, title, address, latitude, longitude},
  "reviews": *[_type == "review"]|order(date desc){${REVIEW_CARD}},
  "news": *[_type == "news"]|order(date desc){"slug": slug.current, title, summary, "mainImage": mainImage${IMAGE}},
  "homepageHeroes": *[_type == "featured" && enabled == true
    && (!defined(startDate) || startDate <= now())
    && (!defined(endDate) || endDate >= now())]|order(pos asc){
    "slug": slug.current, title, subtitle,
    "heroImage": heroImage${IMAGE},
    link
  }
}`;

export type AreaLink = {slug: string; name: string; title: string; island?: string | null};

export type Shell = {
  categories: Array<{
    slug: string;
    name: string;
    brief: string;
    featured?: boolean;
    seq?: number;
    /** The small card image. Two of the eleven categories have only a `hero`. */
    thumb: ImageRef;
    hero: ImageRef;
  }>;
  areas: AreaLink[];
  tags: Array<{slug: string; name: string; title: string; groupTitle?: string; color?: string}>;
  tours: TourCard[];
  pickUps: Array<{slug: string; title: string; address: string; latitude: string; longitude: string}>;
  reviews: ReviewCard[];
  news: Array<{slug: string; title: string; summary?: string; mainImage: ImageRef}>;
  homepageHeroes: Array<{
    slug: string;
    title: string;
    subtitle?: string | null;
    heroImage: ImageRef;
    link: string;
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
