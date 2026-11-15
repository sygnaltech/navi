/**
 * A tour — the site's primary content type, at `/tour/<slug>`.
 *
 * 29 live items out of 102 in Webflow; the other 73 are archived or draft and
 * are dropped by the converter, not here.
 *
 * TWO FIELDS DELIBERATELY NOT CARRIED, both recorded in
 * migration-scripts/webflow/collections.mjs:
 *
 *   halal                       a switch, false on every live item — wired to
 *                               nothing
 *   pricing-section-intro-text  populated on four live tours and rendered on no
 *                               page on the site; two of the four are visibly
 *                               stale ("applied till end of SEP 2025")
 *
 * `name` and `title` are NOT duplicates anywhere in this dataset — `name` is
 * the short label used in cards and navigation, `title` is the page heading.
 * Tours happen to use only `name`; areas, tags and specials use both.
 */
export const tour = {
  name: 'tour',
  title: 'Tour',
  type: 'document',
  groups: [
    {name: 'content', title: 'Content', default: true},
    {name: 'pricing', title: 'Pricing'},
    {name: 'links', title: 'Relationships'},
    {name: 'admin', title: 'Admin'},
  ],
  fields: [
    {name: 'title', title: 'Name', type: 'string', group: 'content', validation: (R) => R.required()},
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'content',
      options: {source: 'title', maxLength: 96},
      validation: (R) => R.required(),
      description: 'The URL is /tour/<slug>. Changing it breaks inbound links.',
    },
    {
      name: 'nameDetail',
      title: 'Name badge',
      type: 'string',
      group: 'content',
      description: 'Short flash shown beside the name, e.g. a new-tour marker.',
    },
    {name: 'brief', title: 'Brief', type: 'text', rows: 3, group: 'content'},
    {name: 'heroImage', title: 'Hero image', type: 'image', options: {hotspot: true}, group: 'content'},
    {
      name: 'photos',
      title: 'Photos',
      type: 'array',
      of: [{type: 'image', options: {hotspot: true}}],
      group: 'content',
    },
    {name: 'highlights', title: 'Highlights', type: 'richText', group: 'content'},
    {name: 'body', title: 'Description', type: 'richText', group: 'content'},

    // ── Pricing ─────────────────────────────────────────────────────────────
    {
      name: 'pricingSection',
      title: 'Show the pricing section',
      type: 'boolean',
      group: 'pricing',
      initialValue: false,
    },
    {name: 'priceAdult', title: 'Adult price', type: 'number', group: 'pricing'},
    {name: 'priceChild', title: 'Child price', type: 'number', group: 'pricing'},
    {
      name: 'priceNoteChild',
      title: 'Child price note',
      type: 'string',
      group: 'pricing',
      description: 'Qualifies the child price, e.g. the age limit it applies to.',
    },
    {name: 'pricingNotes', title: 'Pricing notes', type: 'richText', group: 'pricing'},
    {name: 'canPayOnline', title: 'Can be paid online', type: 'boolean', group: 'pricing', initialValue: false},
    {
      name: 'hasSpecialCancellationPolicy',
      title: 'Has its own cancellation policy',
      type: 'boolean',
      group: 'pricing',
      initialValue: false,
    },
    {name: 'specialCancellationPolicy', title: 'Cancellation policy', type: 'richText', group: 'pricing'},

    // ── Relationships ───────────────────────────────────────────────────────
    {
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'tourCategory'}]}],
      group: 'links',
      validation: (R) => R.min(1),
    },
    {
      name: 'areas',
      title: 'Areas',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'area'}]}],
      group: 'links',
      validation: (R) => R.min(1),
    },
    {name: 'tag', title: 'Duration tag', type: 'reference', to: [{type: 'tag'}], group: 'links'},
    {
      name: 'relatedTours',
      title: 'Related tours',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'tour'}]}],
      group: 'links',
    },
    {name: 'special', title: 'Special offer', type: 'reference', to: [{type: 'special'}], group: 'links'},
    {
      name: 'island',
      title: 'Island',
      type: 'string',
      group: 'links',
      // Webflow stored this as an Option field whose VALUE is an opaque id
      // (`bf6dc55d…` / `efa308d6…`). The converter resolves the id through the
      // collection's own option list, so what lands here is readable.
      //
      // Note that `area.island` is a REFERENCE to the island document while this
      // is a plain string. Two mechanisms for one concept in the source; kept
      // as-is rather than unified, because unifying them is a content decision
      // and not a migration one.
      options: {list: [{title: 'North', value: 'north'}, {title: 'South', value: 'south'}]},
    },

    // ── Admin ───────────────────────────────────────────────────────────────
    {
      name: 'naviCode',
      title: 'Navi code',
      type: 'string',
      group: 'admin',
      description: 'Internal booking code. Set on every tour.',
      validation: (R) => R.required(),
    },
    {name: 'tourAidCode', title: 'Tour aid code', type: 'string', group: 'admin'},
    {
      name: 'seq',
      title: 'Order',
      type: 'number',
      group: 'admin',
      description: 'Lower sorts first. Set on all but one live tour in Webflow.',
    },
    {name: 'featured', title: 'Featured', type: 'boolean', group: 'admin', initialValue: false},
    {
      name: 'leadValueUsd',
      title: 'Lead value (USD)',
      type: 'number',
      group: 'admin',
      description: 'Analytics conversion value. Not shown on the site.',
    },
  ],
  orderings: [
    {title: 'Order, then name', name: 'seq', by: [{field: 'seq', direction: 'asc'}, {field: 'title', direction: 'asc'}]},
    {title: 'Name', name: 'title', by: [{field: 'title', direction: 'asc'}]},
  ],
  preview: {
    select: {title: 'title', subtitle: 'naviCode', media: 'heroImage'},
  },
};
