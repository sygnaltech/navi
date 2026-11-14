/**
 * The Sanity schema, shared by the Studio and the migration scripts.
 *
 * Plain JS with no build step on purpose: `studio/sanity.config.ts` compiles it
 * through Vite and `migration-scripts/sanity/*.mjs` imports it with plain Node,
 * and both must see the identical definitions. A converter that emits a field
 * the Studio does not declare produces documents an editor cannot open.
 *
 * EMPTY UNTIL THE CMS HAS BEEN READ. The content model is authored in §4 of the
 * migration process, AFTER `npm run wf:pull` dumps the real collections — not
 * from the rendered pages and never carried over from another site. On the
 * reference migration, a model written from rendered HTML was substantially
 * wrong: unrendered duplicate rich-text fields, a switch wired to nothing, a
 * collection whose order lived only in its parent's reference array, and a
 * purchased template's demo data still sitting in every collection.
 *
 * Add one file per document type beside this one and list it here.
 */
export const schemaTypes = [];
