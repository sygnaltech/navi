/**
 * The Sanity schema, shared by the Studio and the migration scripts.
 *
 * Plain JS with no build step on purpose: `studio/sanity.config.ts` compiles it
 * through Vite and `migration-scripts/sanity/*.mjs` imports it with plain Node,
 * and both must see the identical definitions. A converter that emits a field
 * the Studio does not declare produces documents an editor cannot open.
 *
 * MODELLED FROM THE CMS, NOT THE RENDERED PAGES — §4 of the migration process,
 * after `npm run wf:pull`. What that read changed about the model, which a port
 * written from rendered HTML would have got wrong:
 *
 *   - `name` and `title` are separate fields with different content on every
 *     area, tag and special. Short label vs page heading.
 *   - Three of the thirteen Webflow collections are empty shells and are not
 *     represented at all.
 *   - Six fields are never set on a live item and are not carried.
 *   - `tour.pricing-section-intro-text` is populated and rendered nowhere; two
 *     of its four values are visibly stale.
 *   - `tour.island` is an Option storing an opaque id; `area.island` is a
 *     reference to a document. Two mechanisms, both kept as found.
 */
import {richText} from './richText.mjs';
import {tour} from './tour.mjs';
import {tourCategory, area, tag, island} from './taxonomy.mjs';
import {review, news, pickUp, special, featured} from './marketing.mjs';

export const schemaTypes = [
  // Object types first — documents reference them.
  richText,

  // Documents, in the order they should appear in the desk.
  tour,
  tourCategory,
  area,
  tag,
  island,
  review,
  news,
  pickUp,
  special,
  featured,
];
