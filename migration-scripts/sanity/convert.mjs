/**
 * PER-SITE. Webflow raw dump -> Sanity NDJSON. Offline, pure, re-runnable.
 *
 *   node migration-scripts/sanity/convert.mjs --report
 *
 * This file IS the field map as code. Read it beside
 * `migration-scripts/webflow/collections.mjs`, which says what is excluded and
 * why, and beside `schema/`, which says what each field means.
 *
 * TWO RULES IT EXISTS TO ENFORCE:
 *
 *   1. Only LIVE items are published. 73 of this site's 102 tour items are
 *      archived or draft, and every one of them would import cleanly if nothing
 *      stopped it.
 *   2. Only fields the site actually renders are published. The exclusions are
 *      listed in DEAD_FIELDS with the evidence for each.
 *
 * Document ids are derived from Webflow item ids, so a re-import UPDATES rather
 * than duplicating and a converter fix produces a diff of only what changed.
 */
import {
  load,
  idFor,
  ref,
  image,
  rich,
  clean,
  drop,
  warn,
  finish,
} from './convert-lib.mjs';
import {
  COLLECTIONS,
  EXCLUDED,
  EXPECTED,
  OPTIONS,
} from '../webflow/collections.mjs';

const report = process.argv.includes('--report');

/** Webflow's own flags are the only honest test for "not live". */
const live = (items, label) =>
  items.filter((item) => {
    if (!EXCLUDED.notLive(item)) return true;
    drop(`${label}: ${item.fieldData?.slug ?? item.id} (${item.isArchived ? 'archived' : 'draft'})`);
    return false;
  });

/** An Option field's stored value is an opaque id; resolve it or warn loudly. */
function option(path, value) {
  if (!value) return undefined;
  const resolved = OPTIONS[path]?.[value];
  if (!resolved) {
    warn(path, `unknown option id ${value} — add it to OPTIONS in collections.mjs`);
    return undefined;
  }
  return resolved;
}

const slug = (value) => (value ? {_type: 'slug', current: value} : undefined);

/**
 * Every collection, loaded once, with the live item ids per type.
 *
 * The live-id sets exist because REFERENCE FIELDS POINT AT NON-LIVE ITEMS.
 * Webflow does not clean them up: 21 of this site's `relatedTours` and review
 * `tours` entries name tours that are archived or draft. Imported as-is they
 * are dangling references — which import without complaint and surface weeks
 * later as a blank card, or as a "related tour" link to a 404.
 *
 * They are already broken on the live site, so pruning them is restoring the
 * invariant rather than losing content. Each one is reported.
 */
const raw = {};
const liveIds = {};
for (const name of Object.keys(COLLECTIONS)) {
  raw[name] = await load(name);
  liveIds[name] = new Set(raw[name].filter((i) => !EXCLUDED.notLive(i)).map((i) => i.id));
}

/** A single reference, dropped with a note when its target is not live. */
const liveRef = (type, id, where) => {
  if (!id) return undefined;
  if (liveIds[type].has(id)) return ref(type, id);
  drop(`${where}: reference to a non-live ${type} (${id})`);
  return undefined;
};

/** A reference array, pruned to live targets, keyed deterministically. */
const liveRefs = (type, ids, where) => {
  if (!Array.isArray(ids) || ids.length === 0) return undefined;
  const kept = ids.filter((id) => {
    if (liveIds[type].has(id)) return true;
    drop(`${where}: dropped ${type} reference to a non-live item (${id})`);
    return false;
  });
  // Keys are positional in the KEPT list, so they stay deterministic across
  // re-converts as long as the source order is stable.
  return kept.length ? kept.map((id, i) => ({...ref(type, id), _key: `${type}-${i}`})) : undefined;
};

/** Multi-image field -> an array of import directives, keyed deterministically. */
const images = (field, where) => {
  if (!Array.isArray(field) || field.length === 0) return undefined;
  return field
    .map((f, i) => {
      const img = image(f);
      if (!img) {
        warn(where, `photo ${i} has no url`);
        return undefined;
      }
      // Deterministic keys: a counter, never a random id, or every re-convert
      // diffs against the dataset with nothing actually changed.
      return {...img, _key: `photo-${i}`};
    })
    .filter(Boolean);
};


const docs = [];

// ── island ─────────────────────────────────────────────────────────────────
// First, because area references it.
for (const item of live(raw.island, 'island')) {
  const f = item.fieldData;
  docs.push(
    clean({
      _id: idFor('island', item.id),
      _type: 'island',
      name: f.name,
      slug: slug(f.slug),
    }),
  );
}

// ── tag ────────────────────────────────────────────────────────────────────
for (const item of live(raw.tag, 'tag')) {
  const f = item.fieldData;
  docs.push(
    clean({
      _id: idFor('tag', item.id),
      _type: 'tag',
      name: f.name,
      title: f.title,
      slug: slug(f.slug),
      groupTitle: f['group-title'],
      color: f.color,
      seq: f.seq,
      hero: image(f.hero),
    }),
  );
}

// ── tourCategory ───────────────────────────────────────────────────────────
for (const item of live(raw.tourCategory, 'tourCategory')) {
  const f = item.fieldData;
  docs.push(
    clean({
      _id: idFor('tourCategory', item.id),
      _type: 'tourCategory',
      name: f.name,
      slug: slug(f.slug),
      brief: f.brief,
      briefText: f['brief-text'],
      body: rich(f.text, `tourCategory.text/${f.slug}`),
      hero: image(f.hero),
      thumb: image(f.thumb),
      seq: f.seq,
      featured: f.featured ?? false,
    }),
  );
}

// ── area ───────────────────────────────────────────────────────────────────
for (const item of live(raw.area, 'area')) {
  const f = item.fieldData;
  docs.push(
    clean({
      _id: idFor('area', item.id),
      _type: 'area',
      name: f.name,
      title: f.title,
      slug: slug(f.slug),
      brief: f.brief,
      body: rich(f.text, `area.text/${f.slug}`),
      hero: image(f.hero),
      map: image(f.map),
      island: liveRef('island', f.island, `area/${f.slug}`),
    }),
  );
}

// ── special ────────────────────────────────────────────────────────────────
// Before tour, which references it.
for (const item of live(raw.special, 'special')) {
  const f = item.fieldData;
  docs.push(
    clean({
      _id: idFor('special', item.id),
      _type: 'special',
      name: f.name,
      title: f.title,
      slug: slug(f.slug),
      details: f.details,
      body: rich(f.text, `special.text/${f.slug}`),
      startDate: f['promotion-start-date'],
      endDate: f['promotion-end-date'],
      homepageBanner: f['homepage-banner'] ?? false,
      homepageHeroImage: image(f['homepage-hero-image']),
      homepageLink: f['homepage-link'],
    }),
  );
}

// ── tour ───────────────────────────────────────────────────────────────────
for (const item of live(raw.tour, 'tour')) {
  const f = item.fieldData;
  const where = `tour/${f.slug}`;
  docs.push(
    clean({
      _id: idFor('tour', item.id),
      _type: 'tour',
      title: f.name,
      slug: slug(f.slug),
      nameDetail: f['name-detail'],
      brief: f.brief,
      heroImage: image(f['hero-image']),
      photos: images(f.photos, where),
      highlights: rich(f.highlights, `tour.highlights/${f.slug}`),
      body: rich(f.text, `tour.text/${f.slug}`),

      pricingSection: f['pricing-section'] ?? false,
      priceAdult: f['price-adult'],
      priceChild: f['price-child'],
      priceNoteChild: f['price-note-child'],
      pricingNotes: rich(f['pricing-section-notes'], `tour.pricing-section-notes/${f.slug}`),
      canPayOnline: f['can-pay-online'] ?? false,
      hasSpecialCancellationPolicy: f['has-special-cancellation-policy'] ?? false,
      specialCancellationPolicy: rich(
        f['special-cancellation-policy'],
        `tour.special-cancellation-policy/${f.slug}`,
      ),

      categories: liveRefs('tourCategory', f.categories, where),
      areas: liveRefs('area', f.areas, where),
      tag: liveRef('tag', f.tag, where),
      relatedTours: liveRefs('tour', f['related-tours'], where),
      special: liveRef('special', f.special, where),
      island: option('tour.island', f.island),

      naviCode: f['navi-code'],
      tourAidCode: f['tour-aid-code'],
      seq: f.seq,
      featured: f['featured-2'] ?? false,
      leadValueUsd: f['lead-value-usd'],

      // NOT CARRIED: `pricing-section-intro-text` (populated on 4 tours,
      // rendered nowhere, two values stale) and `halal` (false on every item).
      // See DEAD_FIELDS in collections.mjs for the evidence.
    }),
  );
}

// ── review ─────────────────────────────────────────────────────────────────
// After tour, which it references.
for (const item of live(raw.review, 'review')) {
  const f = item.fieldData;
  docs.push(
    clean({
      _id: idFor('review', item.id),
      _type: 'review',
      title: f.name,
      slug: slug(f.slug),
      from: f.from,
      where: f.where,
      date: f.date,
      rating: f.rating,
      brief: f.brief,
      generalBrief: f['general-brief'],
      body: rich(f.full, `review.full/${f.slug}`),
      link: f.link,
      tours: liveRefs('tour', f.tours, `review/${f.slug}`),
    }),
  );
}

// ── news ───────────────────────────────────────────────────────────────────
for (const item of live(raw.news, 'news')) {
  const f = item.fieldData;
  docs.push(
    clean({
      _id: idFor('news', item.id),
      _type: 'news',
      title: f.name,
      slug: slug(f.slug),
      date: f.date,
      summary: f['post-summary'],
      mainImage: image(f['main-image']),
      body: rich(f['post-body'], `news.post-body/${f.slug}`),
      featured: f.featured ?? false,
    }),
  );
}

// ── pickUp ─────────────────────────────────────────────────────────────────
for (const item of live(raw.pickUp, 'pickUp')) {
  const f = item.fieldData;
  docs.push(
    clean({
      _id: idFor('pickUp', item.id),
      _type: 'pickUp',
      title: f.name,
      slug: slug(f.slug),
      address: f.address,
      // Strings, as Webflow stored them. Parsing to numbers here would be the
      // migration quietly changing data it was asked to move.
      latitude: f.latitude,
      longitude: f.longitude,
    }),
  );
}

// ── featured ───────────────────────────────────────────────────────────────
for (const item of live(raw.featured, 'featured')) {
  const f = item.fieldData;
  docs.push(
    clean({
      _id: idFor('featured', item.id),
      _type: 'featured',
      name: f.name,
      title: f.title,
      slug: slug(f.slug),
      subtitle: f.subtitle,
      heroImage: image(f['hero-image']),
      link: f.link,
      body: rich(f.article, `featured.article/${f.slug}`),
      pos: f.pos,
      enabled: f.enabled ?? false,
      startDate: f['start-date'],
      endDate: f['end-date'],
    }),
  );
}

// ── the wholesale exclusions, asserted ─────────────────────────────────────
// Loading them anyway and asserting zero LIVE items turns "somebody populated
// it in Webflow later" into a failing check rather than a silent omission.
for (const name of EXCLUDED.collections) {
  if (!(name in COLLECTIONS)) continue;
  const items = raw[name];
  const liveCount = items.filter((i) => !EXCLUDED.notLive(i)).length;
  if (liveCount > 0) {
    warn(
      name,
      `excluded wholesale but now has ${liveCount} LIVE item(s) — revisit EXCLUDED.collections`,
    );
  }
  drop(`${name}: whole collection (${items.length} item(s), ${liveCount} live)`);
}

await finish(docs, {expected: EXPECTED, report});
