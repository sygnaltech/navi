/**
 * PER-SITE. Ways the port deliberately DIFFERS from the live Webflow site.
 *
 * The structural verifier compares our pages to the live ones and expects them
 * to match. A handful of differences are intentional, and they have to be
 * declared here rather than tolerated silently — a check that is permanently
 * red is a check nobody reads, and one that is quietly loosened is worse.
 *
 * Each entry says WHAT differs, HOW MANY `<body>` tags it accounts for, which
 * pages it applies to, and WHY. The verifier subtracts them and still fails on
 * anything left over, so this cannot hide a real regression — only the specific
 * differences named below.
 *
 * `tags` is the count of element open-tags the difference accounts for. Get it
 * wrong and the check fails, which is the point.
 */
export const DIVERGENCES = [
  {
    /**
     * The live nav lists a tour that no longer exists.
     *
     * `queenstown-frans-josef-christchurch-bus-train-4-day-tour-copy` is
     * ARCHIVED in Webflow, but the published pages were rendered before it was
     * archived, so its row is frozen into the live nav on all 94 pages. Our nav
     * is built from the dataset at request time, so it correctly omits it.
     *
     * This is the dynamic site being more correct than the one it replaces, and
     * it is exactly the class of staleness that on-demand rendering removes.
     */
    text: ['Queenstown - Franz Josef - Christchurch, Bus & Train multi-day tour'],
    tags: 3,
    // Every page EXCEPT the ones with no nav. `/data/llms` is a bare data page
    // with no shell at all, so the allowance would be subtracted from a page
    // that never had the row — turning an exact match into a -3 failure.
    pages: '*',
    exceptPages: ['data/llms'],
    why: 'the live nav is stale: it lists a tour that is archived in Webflow',
  },
  {
    /**
     * `/tours` lists the archived tour as a full card, not just a nav row.
     *
     * Same stale live content as above, but the tour index renders it as a
     * `.vertical-container` card — its own badge, brief and button — so it
     * accounts for far more than the three nav tags.
     */
    text: [
      '☆Runs 7days a week!( from Oct 2024) ☆',
      'An unparalleled travel experience in the South Island.',
    ],
    tags: 15,
    pages: ['tours'],
    why: 'the live /tours index lists a tour that is archived in Webflow',
  },
  {
    /**
     * The dead payment script tag was removed.
     *
     * `/payment` loaded `…deployed.codepen.website/scripts/payment.js`, which
     * 302s to a CodePen app URL that answers 404 — so the live page makes a
     * failed request on every view. Carrying the tag forward would have
     * preserved tag parity by preserving a broken request.
     */
    text: [],
    tags: 1,
    pages: ['payment'],
    why: 'removed a <script> tag that was already 404 on the live site (see REVIEW.hd)',
  },
  {
    /**
     * WHICH reviews a tour page shows differs, because the live order is not
     * reproducible.
     *
     * The testimonial strips are site-wide rather than filtered to the tour —
     * verified by checking the live pages, where `/tour/matakana-saturday`
     * shows three reviews that do not reference it. But the live ORDER matches
     * none of date, rating, name or slug: Webflow randomises the list when the
     * site is published and bakes the result into each page, so it is stable
     * per publish and cannot be derived.
     *
     * Ours orders newest-first, which is deterministic and editor-controlled.
     * The COUNTS match exactly — one review in the first strip, three in the
     * second — so the structure is identical and only the selection differs.
     *
     * `textPattern` rather than fixed strings: the quotes and reviewer names
     * vary per page, and listing all eleven reviews' text would be a copy of
     * the dataset in a config file.
     */
    text: [],
    /**
     * Allowed text is DERIVED FROM THE DATASET, not enumerated.
     *
     * Each query's string results become allowed lines. Listing the reviewers
     * by hand was wrong within minutes: the list said "Zheng Shu Qiao" and the
     * rendered name is "正樹 橋". Deriving it means the allowance follows the
     * content and cannot silently go stale — and because it only ever allows
     * text that IS in the dataset, it still cannot mask a missing section.
     */
    textFrom: [
      '*[_type == "review"].generalBrief',
      '*[_type == "review"].brief',
      '*[_type == "review"].title',
      '*[_type == "review"].from',
      '*[_type == "review"].where',
    ],
    textPattern: [
      // The date line on a testimonial card.
      /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}$/,
    ],
    tags: 0,
    pages: '*',
    why: 'the live testimonial order is randomised at publish time and cannot be reproduced',
  },
];

/** Declared divergences applying to one page, by slug. */
export const divergencesFor = (slug) =>
  DIVERGENCES.filter(
    (d) =>
      !(d.exceptPages ?? []).includes(slug) && (d.pages === '*' || d.pages.includes(slug)),
  );

/** Total `<body>` tag allowance for a page: live tags minus ours. */
export const tagAllowanceFor = (slug) =>
  divergencesFor(slug).reduce((total, d) => total + d.tags, 0);

/** Text lines present on live that this page deliberately does not render. */
export const textAllowanceFor = (slug) =>
  new Set(divergencesFor(slug).flatMap((d) => d.text ?? []));

/**
 * Patterns for text whose CONTENT varies but whose presence is expected.
 *
 * Only for differences that cannot be enumerated — the testimonial selection,
 * where listing every review's wording would put a copy of the dataset in a
 * config file and go stale the next time one is edited.
 */
export const textPatternsFor = (slug) =>
  divergencesFor(slug).flatMap((d) => d.textPattern ?? []);

/**
 * Allowed text derived from the dataset, resolved once per run.
 *
 * Takes the `query` function rather than importing it, so this config stays a
 * plain data module with no network of its own.
 */
export async function resolveTextFrom(query) {
  const queries = [...new Set(DIVERGENCES.flatMap((d) => d.textFrom ?? []))];
  const allowed = new Set();
  for (const groq of queries) {
    const values = await query(groq);
    for (const value of [].concat(values ?? [])) {
      if (typeof value !== 'string') continue;
      // Compared against the verifier's normalised lines.
      const line = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (line) allowed.add(line);
    }
  }
  return allowed;
}
