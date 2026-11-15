/**
 * PER-SITE. Prove the imported dataset matches the raw Webflow dump.
 *
 *   node migration-scripts/sanity/verify.mjs
 *
 * Separate from the converter's own self-checks: those prove the NDJSON is
 * internally consistent, this proves the IMPORT LANDED — reading the dataset
 * back over the query API and comparing it to the input the converter saw.
 *
 * The assertions are ordered cheapest-first, so a failure is diagnosed by the
 * earliest check that fires rather than by a wall of text diffs.
 */
import {query, raw, check, sig, sigText, compareBody, done} from './verify-lib.mjs';
import {EXPECTED, EXCLUDED, RICH_TEXT_FIELDS} from '../webflow/collections.mjs';

const live = (items) => items.filter((i) => !EXCLUDED.notLive(i));

// ── 1. counts, per type ────────────────────────────────────────────────────
// The cheapest guard against a half-landed import.

const counts = await query(
  `{${Object.keys(EXPECTED)
    .map((t) => `"${t}": count(*[_type == "${t}"])`)
    .join(',')}}`,
);

for (const [type, want] of Object.entries(EXPECTED)) {
  check(`${type}: ${want} document(s)`, counts[type] === want, `found ${counts[type]}`);
}

// ── 2. the wholesale exclusions really are absent ──────────────────────────
// A type that was decided against must have zero documents, not "probably
// none". If someone populates the collection in Webflow later, this fails
// rather than the content silently appearing.

const excludedCounts = await query(
  `{${EXCLUDED.collections.map((t) => `"${t}": count(*[_type == "${t}"])`).join(',')}}`,
);
for (const type of EXCLUDED.collections) {
  check(`${type}: excluded, 0 documents`, excludedCounts[type] === 0, `found ${excludedCounts[type]}`);
}

// ── 3. every slug present and unique, per routed type ──────────────────────
// A duplicate slug is two documents fighting over one URL; a missing one is a
// page that cannot be built.

const ROUTED = {tour: 'tour', tourCategory: 'tours', area: 'area', tag: 'tag', review: 'reviews', news: 'news'};

for (const [type, base] of Object.entries(ROUTED)) {
  const slugs = await query(`*[_type == "${type}"].slug.current`);
  const sourceSlugs = live(await raw(type)).map((i) => i.fieldData.slug).sort();
  const missing = sourceSlugs.filter((s) => !slugs.includes(s));
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);

  check(
    `/${base}/<slug>: ${sourceSlugs.length} slug(s), all present and unique`,
    missing.length === 0 && dupes.length === 0 && slugs.every(Boolean),
    [
      missing.length ? `missing: ${missing.join(', ')}` : '',
      dupes.length ? `duplicated: ${[...new Set(dupes)].join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('; '),
  );
}

// ── 4. required images actually landed ─────────────────────────────────────
// THE MISTAKE MOST LIKELY TO SHIP is text binding correctly while every page
// shows the same image, so assert the asset reference per document rather than
// trusting the import summary.

const heroless = await query(
  `{"tour": *[_type == "tour" && !defined(heroImage.asset)].slug.current,
    "tourCategory": *[_type == "tourCategory" && !defined(hero.asset)].slug.current,
    "tag": *[_type == "tag" && !defined(hero.asset)].slug.current,
    "featured": *[_type == "featured" && !defined(heroImage.asset)].slug.current}`,
);
for (const [type, slugs] of Object.entries(heroless)) {
  check(`${type}: every document has its hero image`, slugs.length === 0, `without one: ${slugs.join(', ')}`);
}

// Tour photo galleries: 29 of 29 tours had photos in Webflow, so none may be empty.
const photoCounts = await query(`*[_type == "tour"]{"slug": slug.current, "n": count(photos)}`);
const noPhotos = photoCounts.filter((t) => !t.n);
check(
  `tour: all ${photoCounts.length} galleries populated (${photoCounts.reduce((a, t) => a + (t.n ?? 0), 0)} photos)`,
  noPhotos.length === 0,
  `empty: ${noPhotos.map((t) => t.slug).join(', ')}`,
);

// ── 5. references resolve to real documents ────────────────────────────────
// A dangling reference imports without complaint and surfaces weeks later as a
// blank card.

// DEREFERENCE AND COUNT, rather than testing membership inside an array
// filter. `count(categories[^._ref in *[...]._id])` looks like it asks "how
// many of these refs resolve" and does not — `^` does not reach the array
// element there, so the inner filter matches nothing and EVERY document counts
// as broken. It reported 29 of 29 tours and 9 of 9 reviews, which is the tell:
// a reference check that fails on everything is testing the wrong thing.
//
// `categories[]->_id` drops any reference that does not resolve, so comparing
// its length to the raw array's length is the real question.
const broken = await query(
  `{"tourCategories": count(*[_type == "tour" && count(categories) != count(categories[]->_id)]),
    "tourAreas": count(*[_type == "tour" && count(areas) != count(areas[]->_id)]),
    "areaIsland": count(*[_type == "area" && defined(island) && !defined(island->_id)]),
    "reviewTours": count(*[_type == "review" && defined(tours) && count(tours) != count(tours[]->_id)]),
    "tourTag": count(*[_type == "tour" && defined(tag) && !defined(tag->_id)]),
    "tourRelated": count(*[_type == "tour" && defined(relatedTours) && count(relatedTours) != count(relatedTours[]->_id)]),
    "tourSpecial": count(*[_type == "tour" && defined(special) && !defined(special->_id)])}`,
);
for (const [what, n] of Object.entries(broken)) {
  check(`${what}: every reference resolves`, n === 0, `${n} document(s) with a dangling reference`);
}

// Every tour must keep at least one category and one area, or it falls out of
// every listing on the site — the pruning of non-live references in the
// converter must not have emptied them.
const orphanTours = await query(
  `*[_type == "tour" && (count(categories) == 0 || count(areas) == 0)].slug.current`,
);
check(
  'tour: every tour still has a category and an area',
  orphanTours.length === 0,
  `orphaned: ${orphanTours.join(', ')}`,
);

// ── 6. rich text, character for character ──────────────────────────────────
// THE CENTRAL ASSERTION. Everything above can pass while the client's
// published wording has quietly changed.

const FIELD_TO_SANITY = {
  'tour.highlights': ['tour', 'highlights'],
  'tour.text': ['tour', 'body'],
  'tour.pricing-section-notes': ['tour', 'pricingNotes'],
  'tour.special-cancellation-policy': ['tour', 'specialCancellationPolicy'],
  'tourCategory.text': ['tourCategory', 'body'],
  'area.text': ['area', 'body'],
  'review.full': ['review', 'body'],
  'news.post-body': ['news', 'body'],
  'special.text': ['special', 'body'],
  'featured.article': ['featured', 'body'],
};

const problems = [];
let compared = 0;

for (const path of RICH_TEXT_FIELDS) {
  const mapping = FIELD_TO_SANITY[path];
  if (!mapping) {
    problems.push(`${path}: no Sanity field mapped — add it to FIELD_TO_SANITY`);
    continue;
  }
  const [type, sanityField] = mapping;
  const [, webflowField] = path.split('.');

  const docs = await query(`*[_type == "${type}"]{"slug": slug.current, "body": ${sanityField}}`);
  const bySlug = new Map(docs.map((d) => [d.slug, d.body]));

  for (const item of live(await raw(type))) {
    const source = item.fieldData[webflowField];
    if (!source || !sig(source)) continue;
    compared += 1;
    compareBody(problems, `${path}/${item.fieldData.slug}`, source, bySlug.get(item.fieldData.slug));
  }
}

check(
  `rich text: ${compared} field(s) identical character for character`,
  problems.length === 0,
  problems.slice(0, 8).join('\n      '),
);

// ── 7. plain-text fields the site depends on ───────────────────────────────

const plainProblems = [];
for (const [type, pairs] of Object.entries({
  tour: [['name', 'title'], ['brief', 'brief'], ['navi-code', 'naviCode']],
  tourCategory: [['name', 'name'], ['brief', 'brief']],
  area: [['name', 'name'], ['title', 'title']],
  tag: [['name', 'name'], ['title', 'title']],
  review: [['name', 'title'], ['general-brief', 'generalBrief']],
  pickUp: [['address', 'address'], ['latitude', 'latitude'], ['longitude', 'longitude']],
})) {
  const fields = pairs.map(([, s]) => `"${s}": ${s}`).join(',');
  const docs = await query(`*[_type == "${type}"]{"slug": slug.current, ${fields}}`);
  const bySlug = new Map(docs.map((d) => [d.slug, d]));

  for (const item of live(await raw(type))) {
    const doc = bySlug.get(item.fieldData.slug);
    if (!doc) continue;
    for (const [webflowField, sanityField] of pairs) {
      // `sig` for the Webflow side (may hold entities), `sigText` for ours
      // (already decoded) — stripping tags from plain text deletes any literal
      // angle bracket in the copy.
      const want = sig(item.fieldData[webflowField] ?? '');
      const got = sigText(String(doc[sanityField] ?? ''));
      if (want !== got) {
        plainProblems.push(`${type}.${webflowField}/${item.fieldData.slug}: "${want}" vs "${got}"`);
      }
    }
  }
}
check(
  'plain text: names, briefs, codes and addresses identical',
  plainProblems.length === 0,
  plainProblems.slice(0, 8).join('\n      '),
);

done(`${Object.values(EXPECTED).reduce((a, b) => a + b, 0)} documents`);
