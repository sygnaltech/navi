/**
 * CommonJS reader for `project.jsonc`, for the Sanity CLI alone.
 *
 * WHY THIS FILE EXISTS. The CLI transpiles `sanity.cli.ts` to CommonJS and
 * `require`s whatever it imports. An ESM-only import fails there with
 * "require is not defined", and the CLI then reports the far more confusing
 * "sanity.cli.ts does not contain a project identifier" — so the real error is
 * never the one you see.
 *
 * `__dirname` rather than `process.cwd()`: `sanity deploy` is run from
 * `studio/`, and a cwd-relative path would look for `studio/project.jsonc`.
 *
 * It requires the same pure parser the Studio and the scripts use, so there is
 * exactly one definition of what this file means. Node supports `require()` of
 * an ES module (no top-level await in that module, and there is none).
 */
const {readFileSync} = require('node:fs');
const {join} = require('node:path');

const parseProject = require('./parse-project.mjs').default;

const ROOT = join(__dirname, '..');

module.exports = parseProject(readFileSync(join(ROOT, 'project.jsonc'), 'utf8'));
