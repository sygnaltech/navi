/**
 * ESM filesystem reader for `project.jsonc`, for plain Node and for Astro's
 * server-side code.
 *
 * Anchored to this file's own location rather than to `process.cwd()`, because
 * the commands that use it run from the repo root AND from `web/`, and a
 * cwd-relative path silently reads `web/project.jsonc` — which does not exist —
 * from one of them.
 */
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import parseProject from './parse-project.mjs';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export default parseProject(readFileSync(join(ROOT, 'project.jsonc'), 'utf8'));
