/**
 * The site-agnostic half of the dataset verifier.
 *
 * `migration-scripts/sanity/verify.mjs` is PER-SITE: which counts, references and
 * orderings are correct depends entirely on this site's content model. What is
 * the same everywhere — querying the dataset, the pass/fail reporter, and the
 * character-level text comparison — lives here.
 *
 * The verifier reads the dataset over the public query API and compares it to
 * migration/raw/, which is the input the converter saw. Separate from the
 * converter's own self-checks on purpose: those prove the NDJSON is internally
 * consistent, this proves the import landed.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ROOT } from '../lib/env.mjs';
import { SANITY_PROJECT_ID, SANITY_API_VERSION, SANITY_DATASET } from '../lib/project.mjs';
import { portableTextToPlain } from './html-to-portable-text.mjs';

const API =
  `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}` +
  `/data/query/${SANITY_DATASET}`;

/** Run a GROQ query against the dataset. Anonymous — the dataset is public. */
export const query = async (groq) => {
  const res = await fetch(`${API}?query=${encodeURIComponent(groq)}`);
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status}`);
  return (await res.json()).result;
};

/** Load one raw collection dump — the source of truth to compare against. */
export const raw = async (name) =>
  JSON.parse(await readFile(join(ROOT, `migration/raw/${name}.json`), 'utf8')).items;

let failures = 0;

export const check = (name, ok, detail = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    console.error(`FAIL  ${name}`);
    if (detail) console.error(`      ${detail}`);
    failures++;
  }
};

/**
 * Visible characters only — the comparison that survives whitespace policy.
 *
 * Entities are decoded and ALL whitespace removed, so the comparison is about
 * the author's characters and nothing else. Anything looser would pass while
 * losing a word; anything stricter fails on every field forever because the
 * converter legitimately normalises Webflow's spacing.
 */
/**
 * Decode entities and drop whitespace, WITHOUT stripping tags.
 *
 * For the SANITY side of a comparison, which is already plain text.
 *
 * WHY THIS IS SEPARATE FROM `sig`. `sig` strips `<[^>]+>` before decoding
 * entities, which is right for HTML and destructive for text. This site's
 * content contains `&lt; Option 1 : Halfday Rotorua sightseeing Tour &gt;` —
 * angle brackets as literal copy. On the HTML side they survive tag-stripping
 * (still encoded at that point) and decode to `<Option 1…>`; on the converted
 * side they arrive already decoded and get deleted as if they were a tag. The
 * comparison then reports a divergence in a field the converter handled
 * perfectly, and the "fix" would have been to break the converter.
 */
export const sigText = (s) =>
  (s ?? '')
    .replace(/‌/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&zwnj;/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/\s+/g, '')
    .trim();

/** Visible characters of an HTML source field: tags removed, entities decoded. */
export const sig = (s) =>
  (s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/‌/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&zwnj;/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/\s+/g, '')
    .trim();

/**
 * Compare one source HTML field against its converted Portable Text, recording
 * the first point of divergence rather than two walls of text.
 *
 * Push into a `problems` array so the caller can report them as one check.
 */
export function compareBody(problems, label, sourceHtml, blocks) {
  // Two different signatures, deliberately: the source is HTML and the
  // converted side is plain text. See the note on `sigText`.
  const want = sig(sourceHtml);
  const got = sigText(portableTextToPlain(blocks));
  if (want === got) return;
  let i = 0;
  while (i < want.length && want[i] === got[i]) i++;
  problems.push(
    `${label} diverges at ${i}: …${want.slice(Math.max(0, i - 30), i + 30)} | …${got.slice(Math.max(0, i - 30), i + 30)}`,
  );
}

/** Exit with the right code. Call once, at the end of verify.mjs. */
export function done(summary = '') {
  console.log();
  if (failures) {
    console.error(`${failures} check(s) failed\n`);
    process.exit(1);
  }
  console.log(`dataset ok${summary ? ` — ${summary}` : ''}\n`);
}
