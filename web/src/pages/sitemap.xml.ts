/**
 * `/sitemap.xml`, generated from the same sources the routes use.
 *
 * Generated rather than maintained, so adding a document adds its URL and
 * nothing can list a page that does not exist. `npm run sitemap` diffs this
 * against the live Webflow one.
 *
 * THREE RULES, each of which was a bug on an earlier migration:
 *
 *   - `/404` IS EXCLUDED EXPLICITLY. Webflow's `/404` answers **200**, so a
 *     status check does not catch it and it would be submitted as a real page.
 *   - `lastmod` ONLY WHERE IT IS TRUE. CMS documents have a real `_updatedAt`;
 *     the 22 ported static pages do not. Emitting the build time for those
 *     tells Google every page changed on every deploy and trains the crawler to
 *     ignore the field.
 *   - A REDIRECTED URL MUST NOT APPEAR. Generating from documents makes that
 *     structural — no document carries a dropped slug — and the check asserts
 *     it anyway.
 *
 * Note the ported `/sitemap` HTML page is a different thing entirely and still
 * exists; this is the XML for crawlers.
 */
import type {APIRoute} from 'astro';

import {client} from '../lib/sanity';
import project from '../lib/project';
import {pages} from '../lib/ported';
import {REDIRECTS} from '../../../migration-scripts/redirects.config.mjs';

export const prerender = false;

const ORIGIN = project.webflow.source.replace(/\/+$/, '');

/** Routed types, and the path prefix each publishes under. */
const ROUTED: Array<[string, string]> = [
  ['tour', '/tour'],
  ['tourCategory', '/tours'],
  ['area', '/area'],
  ['tag', '/tag'],
  ['review', '/reviews'],
  ['news', '/news'],
];

const SITEMAP_QUERY = `{${ROUTED.map(
  ([type]) => `"${type}": *[_type == "${type}" && defined(slug.current)]{"slug": slug.current, _updatedAt}`,
).join(',')}}`;

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async () => {
  const docs = await client.fetch<Record<string, Array<{slug: string; _updatedAt: string}>>>(
    SITEMAP_QUERY,
  );

  const redirected = new Set(REDIRECTS.map((r: {from: string}) => r.from));

  const entries: Array<{loc: string; lastmod?: string}> = [];

  // The ported static pages. No honest `lastmod` — see the note above.
  for (const [slug, page] of Object.entries(pages)) {
    if (page.template) continue;
    if (page.path === '/404') continue;
    if (redirected.has(page.path)) continue;
    entries.push({loc: page.path === '/' ? ORIGIN : `${ORIGIN}${page.path}`});
  }

  // CMS documents, with their real last-modified date.
  for (const [type, base] of ROUTED) {
    for (const doc of docs[type] ?? []) {
      const path = `${base}/${doc.slug}`;
      if (redirected.has(path)) continue;
      entries.push({loc: `${ORIGIN}${path}`, lastmod: doc._updatedAt});
    }
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      ({loc, lastmod}) =>
        `  <url><loc>${escape(loc)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ''}</url>`,
    ),
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // Short, because the sitemap follows the dataset like everything else.
      'cache-control': 'public, max-age=300',
    },
  });
};
