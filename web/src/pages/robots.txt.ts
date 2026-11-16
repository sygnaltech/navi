/**
 * `/robots.txt`.
 *
 * The live Webflow site's robots.txt is one line — a sitemap pointer and
 * nothing else — so this matches it rather than inventing rules. The sitemap
 * check asserts the pointer is present and correct.
 */
import type {APIRoute} from 'astro';

import project from '../lib/project';

export const prerender = false;

const ORIGIN = project.webflow.source.replace(/\/+$/, '');

export const GET: APIRoute = () =>
  new Response(`Sitemap: ${ORIGIN}/sitemap.xml\n`, {
    headers: {'content-type': 'text/plain; charset=utf-8'},
  });
