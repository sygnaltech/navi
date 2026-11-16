import {createClient} from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';

import project from './project.ts';

/**
 * Which dataset the SITE reads.
 *
 * `||` NOT `??`. `.env.example` ships `SANITY_DATASET=` with no value, which
 * loads as an EMPTY STRING, and `??` only substitutes for null/undefined — so
 * `??` resolves the dataset to `''` and every query in the build fails with
 * Sanity's own "`dataset` must be provided". This is the single most reliable
 * way to lose an afternoon on a fresh migration.
 */
// `import.meta.env?` — optional, because this module is also loaded by plain
// Node for the offline template tests, where `import.meta.env` does not exist
// and a bare property read throws before the client is ever constructed.
const dataset = import.meta.env?.SANITY_DATASET || project.sanity.dataset;

export const client = createClient({
  projectId: project.sanity.projectId,
  dataset,
  // Sanity versions its API by URL path segment, so this cannot be empty.
  apiVersion: project.sanity.apiVersion || 'vX',
  // FALSE, and it has to be. Every route renders on demand so that a publish in
  // the Studio is live immediately; reading through the CDN would serve the
  // previous version until its cache expired, which is precisely the delay
  // on-demand rendering exists to remove.
  useCdn: false,
  // Only needed to read drafts. Absent is the normal case — the dataset is
  // publicly readable, so the build needs no token at all.
  token: import.meta.env?.SANITY_READ_TOKEN || undefined,
});

const builder = imageUrlBuilder(client);

/** Image URL builder for Sanity image assets. */
export const urlFor = (source: Parameters<typeof builder.image>[0]) => builder.image(source);
