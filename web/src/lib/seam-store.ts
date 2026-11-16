/**
 * The seam fragments, inlined by Vite.
 *
 * ISOLATED IN ITS OWN MODULE ON PURPOSE. `import.meta.glob` is a Vite
 * transform, not JavaScript — plain Node throws on it at module evaluation. So
 * every module that binds content takes a `seam(name)` function as a parameter
 * instead of reaching for the glob directly, and this file is the only place
 * the Vite-only form appears.
 *
 * That is what lets the whole binding layer be exercised offline against the
 * real fragments, with a disk reader standing in for this. Without it the only
 * way to check that a template binds a different image per item would be to run
 * a server and look.
 */
const seams = import.meta.glob<string>('../html/seams/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export type SeamResolver = (name: string) => string;

/** One seam fragment by `<template>.<list index>`. Throws rather than rendering nothing. */
export const seamFromBundle: SeamResolver = (name) => {
  const key = Object.keys(seams).find((k) => k.endsWith(`/${name}.html`));
  if (!key) {
    throw new Error(
      `seam template "${name}" is missing from web/src/html/seams/. ` +
        'Run `npm run seams -- --dump && node migration-scripts/sync-seams.mjs`.',
    );
  }
  return seams[key];
};
