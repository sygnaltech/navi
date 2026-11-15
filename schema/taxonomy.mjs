/**
 * The types tours are organised by: category, area, tag, island.
 *
 * `name` AND `title` are both carried on every one of these, and that is not
 * redundancy — they differ on every live item in the dataset:
 *
 *   area   name "Hawke's bay"   title "Tours in Hawke's bay"
 *   tag    name "1 Day"         title "1 Day Tour"
 *
 * `name` is the short label used in cards and navigation; `title` is the page
 * heading. Collapsing them would silently rewrite either every nav label or
 * every page heading.
 */

/** A tour category — `/tours/<slug>`. 11 live items. */
export const tourCategory = {
  name: 'tourCategory',
  title: 'Tour category',
  type: 'document',
  fields: [
    {name: 'name', title: 'Short name', type: 'string', validation: (R) => R.required()},
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'name', maxLength: 96},
      validation: (R) => R.required(),
      description: 'The URL is /tours/<slug>.',
    },
    {
      name: 'brief',
      title: 'Card summary',
      type: 'text',
      rows: 2,
      description: 'Shown in navigation and on cards — appears on every page of the site.',
      validation: (R) => R.required(),
    },
    {name: 'briefText', title: 'Page intro', type: 'text', rows: 3, description: 'Shown at the top of the category page.'},
    {name: 'body', title: 'Description', type: 'richText'},
    {name: 'hero', title: 'Hero image', type: 'image', options: {hotspot: true}, validation: (R) => R.required()},
    {name: 'thumb', title: 'Thumbnail', type: 'image', options: {hotspot: true}},
    {name: 'seq', title: 'Order', type: 'number', description: 'Lower sorts first.'},
    {name: 'featured', title: 'Featured', type: 'boolean', initialValue: false},
  ],
  orderings: [{title: 'Order', name: 'seq', by: [{field: 'seq', direction: 'asc'}]}],
  preview: {select: {title: 'name', subtitle: 'brief', media: 'hero'}},
};

/** A region of New Zealand — `/area/<slug>`. 15 live items. */
export const area = {
  name: 'area',
  title: 'Area',
  type: 'document',
  fields: [
    {name: 'name', title: 'Short name', type: 'string', validation: (R) => R.required()},
    {name: 'title', title: 'Page heading', type: 'string', validation: (R) => R.required()},
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'name', maxLength: 96},
      validation: (R) => R.required(),
      description: 'The URL is /area/<slug>.',
    },
    {name: 'brief', title: 'Brief', type: 'text', rows: 2},
    {name: 'body', title: 'Description', type: 'richText'},
    {name: 'hero', title: 'Hero image', type: 'image', options: {hotspot: true}},
    {name: 'map', title: 'Map image', type: 'image'},
    {name: 'island', title: 'Island', type: 'reference', to: [{type: 'island'}]},
  ],
  // NO ORDER FIELD. Webflow's `seq` is empty on all 15 live areas and its
  // `featured` switch is false on all 15, so neither was in use. Ordering is
  // alphabetical until someone decides otherwise — which is a content decision,
  // not something to invent here.
  orderings: [{title: 'Name', name: 'name', by: [{field: 'name', direction: 'asc'}]}],
  preview: {select: {title: 'name', subtitle: 'title', media: 'hero'}},
};

/** A duration tag — `/tag/<slug>`. 4 live items. */
export const tag = {
  name: 'tag',
  title: 'Tag',
  type: 'document',
  fields: [
    {name: 'name', title: 'Short name', type: 'string', validation: (R) => R.required()},
    {name: 'title', title: 'Page heading', type: 'string', validation: (R) => R.required()},
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'name', maxLength: 96},
      validation: (R) => R.required(),
      description: 'The URL is /tag/<slug>.',
    },
    {name: 'groupTitle', title: 'Group heading', type: 'string'},
    {name: 'color', title: 'Colour', type: 'string', description: 'Hex value, as stored in Webflow.'},
    {name: 'seq', title: 'Order', type: 'number', description: 'Lower sorts first.'},
    {name: 'hero', title: 'Hero image', type: 'image', options: {hotspot: true}},
  ],
  // `description` and `text` existed in Webflow and were empty on every live
  // item, so they are not carried.
  orderings: [{title: 'Order', name: 'seq', by: [{field: 'seq', direction: 'asc'}]}],
  preview: {select: {title: 'name', subtitle: 'title', media: 'hero'}},
};

/**
 * North or South. Two items, name and slug only — a lookup, not a page.
 *
 * Kept as a document because `area.island` is a reference to it in the source.
 */
export const island = {
  name: 'island',
  title: 'Island',
  type: 'document',
  fields: [
    {name: 'name', title: 'Name', type: 'string', validation: (R) => R.required()},
    {name: 'slug', title: 'Slug', type: 'slug', options: {source: 'name'}, validation: (R) => R.required()},
  ],
  preview: {select: {title: 'name'}},
};
