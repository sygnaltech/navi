/**
 * `project.jsonc`, read the one way a BROWSER bundle can read it.
 *
 * Vite's `?raw` import inlines the file's text at build time, so the Studio
 * never needs the filesystem — and must not: importing `config/read-project.mjs`
 * here would pull `node:fs` into the browser bundle and the build fails.
 *
 * The parser is the same pure module the CLI and the migration scripts use, so
 * all three agree on what this file means.
 */
import projectSource from '../project.jsonc?raw';
import parseProject from '../config/parse-project.mjs';

export default parseProject(projectSource);
