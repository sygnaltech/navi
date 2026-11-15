/**
 * Loader for the ported Webflow fragments.
 *
 * The fragments are produced by `npm run extract` and are VERBATIM Webflow
 * output. Nothing here reformats, re-indents or re-serialises them — the whole
 * point of the port is that the markup is Webflow's, byte for byte, so the CSS
 * that targets generated ids and deep selectors keeps working.
 *
 * Everything is loaded eagerly with `?raw` so the fragments are inlined at
 * build time and no route does filesystem work. Astro's `import.meta.glob`
 * keys are paths relative to THIS file.
 */
import manifest from '../data/pages.json';

const mains = import.meta.glob<string>('../html/main.*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const headExtras = import.meta.glob<string>('../html/head-extra.*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
});

import navHtml from '../html/nav.html?raw';
import footerHtml from '../html/footer.html?raw';
import headCustomHtml from '../html/head-custom.html?raw';

export type PortedPage = {
  path: string;
  template: boolean;
  wfPage?: string;
  lang: string;
  /** The `<body>` tag's own attributes, per page. Not constant — see Ported.astro. */
  bodyAttrs: Record<string, string>;
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  shell: 'full' | 'nav' | 'bare';
  headExtra: boolean;
};

export const pages = manifest.pages as Record<string, PortedPage>;
export const extractedFrom: string = manifest.extractedFrom;

/** A slug becomes a filename: `/` separators would be directories. */
const fileFor = (slug: string) => slug.replace(/\//g, '__');

const pick = (bag: Record<string, string>, suffix: string) => {
  const key = Object.keys(bag).find((k) => k.endsWith(`/${suffix}`));
  return key ? bag[key] : undefined;
};

/**
 * The page body, with the shared shell spliced back in.
 *
 * `__WF_PAGE_ID__` is substituted here rather than at extract time because the
 * nav and footer are SHARED: Webflow stamps the current page's id onto every
 * form on the page, including the forms inside the furniture, so the marker is
 * what lets one nav serve every page while the rendered output stays identical
 * to Webflow's.
 */
export function bodyFor(slug: string): string {
  const page = pages[slug];
  if (!page) throw new Error(`No ported page "${slug}" in src/data/pages.json`);

  const main = pick(mains, `main.${fileFor(slug)}.html`);
  if (main === undefined) throw new Error(`Missing src/html/main.${fileFor(slug)}.html`);

  const wfPage = page.wfPage ?? '';
  const stamp = (html: string) => html.replaceAll('__WF_PAGE_ID__', wfPage);

  return main
    .replace('<!--wf:nav-->', () => stamp(navHtml))
    .replace('<!--wf:footer-->', () => stamp(footerHtml));
}

/** Head nodes shared by every page, plus this page's own, in that order. */
export function headFor(slug: string): string {
  const page = pages[slug];
  const extra = page?.headExtra ? pick(headExtras, `head-extra.${fileFor(slug)}.html`) : undefined;
  return extra ? `${headCustomHtml}\n${extra}` : headCustomHtml;
}

/** Every page that has a route of its own — templates are consumed by hand. */
export const routablePages = Object.entries(pages).filter(([, p]) => !p.template);
