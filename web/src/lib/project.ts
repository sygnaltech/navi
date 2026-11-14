/**
 * `project.jsonc`, as seen by the SITE.
 *
 * WHY NOT READ THE FILE HERE. `config/read-project.mjs` anchors itself with
 * `import.meta.url`, which is correct in plain Node and WRONG once Astro
 * bundles the module into `dist/server/.prerender/chunks/` — `import.meta.url`
 * comes through undefined there and the prerender dies with
 *
 *   TypeError: The "path" argument must be of type string or an instance of URL
 *
 * at a stack frame inside a hashed chunk, which points nowhere near the cause.
 *
 * So the values are resolved ONCE in `astro.config.mjs` — plain Node, never
 * bundled — and injected as a compile-time constant via Vite `define`. Nothing
 * touches the filesystem at render time, and the failure above is structurally
 * impossible rather than merely fixed.
 *
 * The constant is declared as a GLOBAL rather than a local `declare const`:
 * esbuild treats a local type-only binding as erasable and strips the export
 * that references it, which fails the build with the thoroughly misleading
 * `[MISSING_EXPORT] "default" is not exported by "src/lib/project.ts"`.
 */
export type Project = {
  webflow: {source: string; siteId?: string};
  sanity: {projectId: string; dataset: string; studioHost?: string; apiVersion?: string};
  cloudflare?: {
    accountId?: string;
    zone?: string;
    routes?: string[];
    worker?: {name?: string};
  };
};

declare global {
  // eslint-disable-next-line no-var
  var __PROJECT_CONFIG__: Project;
}

// The BARE identifier, deliberately: Vite's `define` replaces
// `__PROJECT_CONFIG__` and not `globalThis.__PROJECT_CONFIG__`, which is a
// member expression it never matches — and which would therefore be `undefined`
// at render time with no build error at all.
const project: Project = __PROJECT_CONFIG__;

export default project;
