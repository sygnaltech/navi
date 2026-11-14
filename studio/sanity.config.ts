import {defineConfig} from 'sanity';
import {structureTool} from 'sanity/structure';
import {visionTool} from '@sanity/vision';

// The schema lives one level up so the Studio and the migration scripts compile
// the exact same definitions. If they drifted, the converter could emit
// documents the Studio refuses to render.
// @ts-expect-error — plain-JS schema module, deliberately untyped so the
// migration scripts can import it without a build step.
import {schemaTypes} from '../schema/index.mjs';

import project from './project-config';

/**
 * Which dataset this Studio edits. `production` unless told otherwise, so a
 * plain `npm run studio:dev` and every deploy stay on the live content.
 *
 * Set `SANITY_STUDIO_DATASET=staging` in `studio/.env.development` to point a
 * local Studio at a staging copy. NOT `.env` and NOT `.env.local` — both of
 * those are loaded by builds too, so the value would be compiled into a
 * deployed Studio. The `SANITY_STUDIO_` prefix is required (Sanity exposes no
 * other variables to Studio code), and `process.env` is the access form Sanity
 * recommends over `import.meta.env` because it works in browser and Node alike.
 *
 * `||` not `??`: `studio/.env.example` ships the key with no value, which loads
 * as an EMPTY STRING, and `??` only substitutes for null/undefined. The same
 * mistake on the site's read client resolves the dataset to `''` and fails
 * every query in the build with Sanity's own unhelpful message.
 */
const dataset = process.env.SANITY_STUDIO_DATASET || project.sanity.dataset;

export default defineConfig({
  name: 'default',
  title: dataset === 'production' ? 'Navi Tours' : `Navi Tours (${dataset})`,
  projectId: project.sanity.projectId,
  dataset,
  plugins: [structureTool(), visionTool()],
  schema: {types: schemaTypes},
});
