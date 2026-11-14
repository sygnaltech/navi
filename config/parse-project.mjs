/**
 * The one parser for `project.jsonc`. Pure — no filesystem, no Node built-ins —
 * so the browser Studio can use it against a Vite `?raw` import and plain Node
 * can use it against `readFileSync`, and both get identical results.
 *
 * `.jsonc` does NOT make Node, Vite or the Sanity CLI tolerate comments. There
 * is no built-in JSONC support anywhere in this stack, and a regex that strips
 * `//` eats the `//` in every `https://` in the file and truncates the line —
 * which then parses as valid JSON with a mangled origin. So: a real parser,
 * with its errors checked.
 */
import {parse} from 'jsonc-parser';

export default function parseProject(source) {
  const errors = [];
  const config = parse(source, errors, {allowTrailingComma: true});
  if (errors.length) {
    throw new Error(
      'project.jsonc is not valid JSONC: parse errors at offsets ' +
        errors.map((e) => e.offset).join(', '),
    );
  }
  if (!config?.sanity?.projectId || !config?.sanity?.dataset) {
    throw new Error('project.jsonc is missing sanity.projectId or sanity.dataset');
  }
  return config;
}
