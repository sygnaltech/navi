/**
 * Reviews, news, pick-up points, specials and homepage features.
 *
 * Three Webflow collections are NOT represented here at all, and the omission
 * is a decision rather than an oversight:
 *
 *   faqs                   0 items. The `/faq` page's content is static HTML.
 *   alerts                 1 item, unpublished. The `.alert-bar` in the shell
 *                          renders nothing.
 *   cancellation-policy    1 item, unpublished. Per-tour policies live on the
 *                          tour itself.
 *
 * They are named in migration-scripts/webflow/collections.mjs so the converter
 * asserts their document count is zero rather than quietly importing them if
 * someone populates them in Webflow later.
 */

/** A TripAdvisor review — `/reviews/<slug>`. 11 live items. */
export const review = {
  name: 'review',
  title: 'Review',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Reviewer',
      type: 'string',
      validation: (R) => R.required(),
      description: 'The reviewer’s display name, as it appears on the review.',
    },
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (R) => R.required(),
      description: 'The URL is /reviews/<slug>.',
    },
    {name: 'from', title: 'From', type: 'string', description: 'Where the reviewer is from.'},
    {name: 'where', title: 'Reviewed at', type: 'string'},
    {name: 'date', title: 'Date', type: 'datetime', validation: (R) => R.required()},
    {
      name: 'rating',
      title: 'Rating',
      type: 'number',
      validation: (R) => R.required().min(1).max(5),
    },
    {
      name: 'brief',
      title: 'Tour-page extract',
      type: 'text',
      rows: 3,
      description: 'Shown on the tour pages this review is attached to.',
    },
    {
      name: 'generalBrief',
      title: 'General extract',
      type: 'text',
      rows: 3,
      description: 'Shown on the reviews index and across tour pages. Set on every review.',
      validation: (R) => R.required(),
    },
    {name: 'body', title: 'Full review', type: 'richText', validation: (R) => R.required()},
    {
      name: 'link',
      title: 'Source URL',
      type: 'url',
      description: 'The review on TripAdvisor.',
      validation: (R) => R.required(),
    },
    {
      name: 'tours',
      title: 'Tours',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'tour'}]}],
      description: 'Which tours this review is shown on.',
    },
  ],
  orderings: [{title: 'Newest first', name: 'date', by: [{field: 'date', direction: 'desc'}]}],
  preview: {select: {title: 'title', subtitle: 'generalBrief'}},
};

/** A news post — `/news/<slug>`. 1 live item. */
export const news = {
  name: 'news',
  title: 'News post',
  type: 'document',
  fields: [
    {name: 'title', title: 'Title', type: 'string', validation: (R) => R.required()},
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (R) => R.required(),
      description: 'The URL is /news/<slug>.',
    },
    {name: 'date', title: 'Date', type: 'datetime', validation: (R) => R.required()},
    {name: 'summary', title: 'Summary', type: 'text', rows: 3},
    {name: 'mainImage', title: 'Main image', type: 'image', options: {hotspot: true}},
    {name: 'body', title: 'Body', type: 'richText'},
    {name: 'featured', title: 'Featured', type: 'boolean', initialValue: false},
  ],
  orderings: [{title: 'Newest first', name: 'date', by: [{field: 'date', direction: 'desc'}]}],
  preview: {select: {title: 'title', subtitle: 'summary', media: 'mainImage'}},
};

/**
 * A pick-up point. 5 live items, no page of its own — listed on `/pick-up`.
 *
 * Latitude and longitude are kept as STRINGS because that is how Webflow stored
 * them, and parsing them to numbers here would be the migration quietly
 * changing data it was asked to move. Converting them to a Sanity `geopoint` is
 * a sensible follow-up, done deliberately and verified against the map.
 */
export const pickUp = {
  name: 'pickUp',
  title: 'Pick-up point',
  type: 'document',
  fields: [
    {name: 'title', title: 'Name', type: 'string', validation: (R) => R.required()},
    {name: 'slug', title: 'Slug', type: 'slug', options: {source: 'title'}, validation: (R) => R.required()},
    {name: 'address', title: 'Address', type: 'text', rows: 2, validation: (R) => R.required()},
    {name: 'latitude', title: 'Latitude', type: 'string', validation: (R) => R.required()},
    {name: 'longitude', title: 'Longitude', type: 'string', validation: (R) => R.required()},
  ],
  preview: {select: {title: 'title', subtitle: 'address'}},
};

/**
 * A special offer. 5 live items, no page of its own.
 *
 * One is the homepage banner (the three `homepage*` fields); the rest surface
 * only in the `/sitemap` listing. Webflow's `pos` ordering field is empty on
 * all five, so there is no order to carry.
 */
export const special = {
  name: 'special',
  title: 'Special offer',
  type: 'document',
  fields: [
    {name: 'name', title: 'Internal name', type: 'string', validation: (R) => R.required()},
    {name: 'title', title: 'Headline', type: 'string', validation: (R) => R.required()},
    {name: 'slug', title: 'Slug', type: 'slug', options: {source: 'name'}, validation: (R) => R.required()},
    {name: 'details', title: 'Details', type: 'text', rows: 3, validation: (R) => R.required()},
    {name: 'body', title: 'Body', type: 'richText'},
    {name: 'startDate', title: 'Starts', type: 'datetime', validation: (R) => R.required()},
    {name: 'endDate', title: 'Ends', type: 'datetime', validation: (R) => R.required()},
    {name: 'homepageBanner', title: 'Show as the homepage banner', type: 'boolean', initialValue: false},
    {name: 'homepageHeroImage', title: 'Homepage image', type: 'image', options: {hotspot: true}},
    {name: 'homepageLink', title: 'Homepage link', type: 'url'},
  ],
  orderings: [{title: 'Ends soonest', name: 'endDate', by: [{field: 'endDate', direction: 'asc'}]}],
  preview: {select: {title: 'title', subtitle: 'name'}},
};

/** A homepage feature card. 2 live items. */
export const featured = {
  name: 'featured',
  title: 'Homepage feature',
  type: 'document',
  fields: [
    {name: 'name', title: 'Internal name', type: 'string', validation: (R) => R.required()},
    {name: 'title', title: 'Headline', type: 'string', validation: (R) => R.required()},
    {name: 'slug', title: 'Slug', type: 'slug', options: {source: 'name'}, validation: (R) => R.required()},
    {name: 'subtitle', title: 'Subtitle', type: 'string'},
    {name: 'heroImage', title: 'Image', type: 'image', options: {hotspot: true}, validation: (R) => R.required()},
    {name: 'link', title: 'Link', type: 'url', validation: (R) => R.required()},
    {name: 'body', title: 'Article', type: 'richText'},
    {name: 'pos', title: 'Position', type: 'number', validation: (R) => R.required()},
    {name: 'enabled', title: 'Enabled', type: 'boolean', initialValue: false},
    {name: 'startDate', title: 'Starts', type: 'datetime'},
    {name: 'endDate', title: 'Ends', type: 'datetime'},
  ],
  orderings: [{title: 'Position', name: 'pos', by: [{field: 'pos', direction: 'asc'}]}],
  preview: {select: {title: 'title', subtitle: 'name', media: 'heroImage'}},
};
