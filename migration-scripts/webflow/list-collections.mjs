/**
 * List the Webflow site's collections, with their ids and field schemas.
 *
 *   node migration-scripts/webflow/list-collections.mjs            # names, ids, counts
 *   node migration-scripts/webflow/list-collections.mjs --fields   # plus every field
 *
 * THIS IS THE STEP BEFORE §4. `collections.mjs` is keyed by Webflow collection
 * id and `wf:pull` reads it, so the pull cannot run until the ids are known —
 * and nothing else in the engine produces them. Webflow's own `manifest.json`
 * names only the collections that have a DETAIL TEMPLATE, so it is not a
 * substitute: a collection that only ever appears inside a list on another page
 * is invisible there and is exactly the kind that gets missed.
 *
 * Reads WEBFLOW_API_TOKEN through lib/env.mjs, which never prints a value. The
 * site id comes from project.jsonc (`webflow.siteId`), so this script needs no
 * configuration at all — which is the point, since it runs before there is any.
 */
import {loadEnv, requireEnv} from '../lib/env.mjs';
import {optional} from '../lib/project.mjs';

loadEnv();
const TOKEN = requireEnv('WEBFLOW_API_TOKEN', {
  why: 'listing the Webflow collections (one-off, not needed by the build)',
});

const SITE_ID = optional('webflow.siteId');
if (!SITE_ID) {
  console.error('\nproject.jsonc is missing `webflow.siteId`.');
  console.error('  Read it off the live page source: data-wf-site="..."\n');
  process.exit(1);
}

const API = 'https://api.webflow.com/v2';
const headers = {authorization: `Bearer ${TOKEN}`, 'accept-version': '2.0.0'};

async function api(path) {
  const res = await fetch(`${API}${path}`, {headers});
  // Deliberately does not echo the response body: a 401 from Webflow can
  // include the token prefix.
  if (!res.ok) throw new Error(`Webflow API ${res.status} ${res.statusText} for ${path}`);
  return res.json();
}

const withFields = process.argv.includes('--fields');

const {collections} = await api(`/sites/${SITE_ID}/collections`);

console.log(`\n${collections.length} collections on site ${SITE_ID}\n`);
console.log(`${'SLUG'.padEnd(24)}${'ID'.padEnd(26)}NAME`);
for (const c of collections.sort((a, b) => a.slug.localeCompare(b.slug))) {
  console.log(`${c.slug.padEnd(24)}${c._id ?? c.id}  ${c.displayName}`);
}

if (!withFields) {
  console.log('\nRe-run with --fields for each collection\'s field schema.');
  process.exit(0);
}

for (const c of collections) {
  const schema = await api(`/collections/${c._id ?? c.id}`);
  console.log(`\n── ${schema.displayName} (${schema.slug}) ──`);
  for (const f of schema.fields ?? []) {
    const req = f.isRequired ? ' required' : '';
    const ref = f.validations?.collectionId ? ` -> ${f.validations.collectionId}` : '';
    console.log(`  ${String(f.slug).padEnd(30)} ${String(f.type).padEnd(18)}${req}${ref}`);
  }
}
