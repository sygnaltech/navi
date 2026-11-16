/**
 * Webflow rich text (an HTML string) -> Portable Text (a block array).
 *
 *   import { toPortableText } from './html-to-portable-text.mjs';
 *   const blocks = toPortableText(html, { onWarn });
 *
 * Hand-written rather than delegated to @sanity/block-tools. Block-tools is the
 * right tool when the input is arbitrary HTML and the output just has to be
 * reasonable; here the input is one known generator's output over a bounded
 * corpus, and "reasonable" is not the bar — the bar is that the client's
 * published wording survives exactly. A rule I wrote is a rule I can point at
 * when a diff looks wrong.
 *
 * WHAT WEBFLOW ACTUALLY EMITS, measured on a real corpus:
 *
 *   - `id=""` on most block elements. Noise from the rich-text editor.
 *   - `&nbsp;` mid-sentence, frequently doubled, including before punctuation.
 *   - Paragraphs containing nothing but U+200C (ZERO WIDTH NON-JOINER) used as
 *     vertical spacers. They are layout, not content, and must not become empty
 *     blocks — an empty block renders as a gap the editor cannot see or delete.
 *   - `<h2>`/`<h3>` headings inside bodies, and `<h3><strong>…</strong></h3>`
 *     where the strong is redundant with the heading style.
 *   - A `<ul>` nested directly inside an `<li>`.
 *   - `<blockquote>`.
 *   - `data-rt-link-type="external"` on some links.
 *   - `<br>` inside paragraphs, typically in a contact block.
 *
 * RE-MEASURE THIS PER SITE. The list above is what one corpus contained, not a
 * guarantee. Run the converter, read the warnings, and add a rule for anything
 * new rather than letting it fall through.
 *
 * MARKS
 *
 * Portable Text marks are flat strings on a span, so nested inline formatting
 * is flattened to the set of decorators active at that point — which is exactly
 * what Portable Text models. Links are annotations: they get a generated `_key`
 * and live in the block's `markDefs`.
 *
 * FIGURES. Webflow places a picture or a video in the prose as a `<figure>`
 * carrying `data-rt-type="image"` or `"video"`, and this corpus has 16 of them
 * across 14 tour descriptions. They convert to an `image` block (with the
 * `_sanityAsset` the importer uploads) and a `videoEmbed` block respectively —
 * see `figureBlock`. An earlier version dropped both with a warning, which no
 * check could see: `sanity:verify` compares the plain TEXT of a field, and a
 * figure contributes none.
 *
 * A bare inline `<img>` outside a figure has not appeared here; if one does it
 * is reported via onWarn rather than silently dropped.
 */
import { JSDOM } from 'jsdom';

import { INTERNAL_LINK } from '../lib/project.mjs';

/** Decorators this schema allows. Anything else is reported and ignored. */
const DECORATORS = {
  strong: 'strong',
  b: 'strong',
  em: 'em',
  i: 'em',
  u: 'underline',
  s: 'strike-through',
  strike: 'strike-through',
  del: 'strike-through',
};

const BLOCK_STYLES = {
  p: 'normal',
  h1: 'h2', // demoted: the page template already owns the single <h1>
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  blockquote: 'blockquote',
};

/**
 * Deterministic key generator.
 *
 * Portable Text wants a `_key` on every block and span. They must be stable
 * across runs or every re-convert produces a diff against the dataset in which
 * nothing has actually changed — which makes the one real change impossible to
 * spot. So: a counter, reset per field, not a random id.
 */
function keyer(prefix) {
  let n = 0;
  return () => `${prefix}${(n++).toString(36)}`;
}

/**
 * Normalise Webflow's whitespace without touching the author's words.
 *
 * `&nbsp;` (U+00A0) becomes a plain space, because Webflow inserts it for
 * spacing rather than to prevent a line break, and a run of them collapses.
 * U+200C is dropped outright — it is invisible and only ever a spacer here.
 */
const clean = (text) =>
  text
    .replace(/‌/g, '')
    .replace(/ /g, ' ')
    // A LITERAL NEWLINE IN A TEXT NODE IS WHITESPACE, NOT A LINE BREAK. Webflow
    // leaves them in the markup for readability and the browser collapses them.
    // Only a `<br>` ELEMENT produces the newline this pipeline treats as a hard
    // break — so these go here, or the serialiser turns a source file's
    // indentation into `<br>` tags. Two appeared on `/area/te-anau`.
    .replace(/[\r\n]+/g, ' ')
    .replace(/[ \t]+/g, ' ');

/**
 * U+200D (ZWJ) IS CONTENT AND MUST NOT BE STRIPPED. `clean` above drops U+200C
 * (ZWNJ) and only that, deliberately: Webflow's editor uses a ZWJ-only
 * paragraph as a vertical spacer and RENDERS it — `/tour/rotorua-one-day-tour`
 * has three — so collapsing them costs one `<p>` each. Stripping it took the
 * structural check from 73 pages matching to 57 before this note existed.
 */

/** Is this element one that starts a new Portable Text block? */
const isBlockish = (tag) =>
  tag in BLOCK_STYLES || tag === 'ul' || tag === 'ol' || tag === 'li' || tag === 'hr' ||
  tag === 'table' || tag === 'figure' || tag === 'div';

export function toPortableText(html, { onWarn = () => {} } = {}) {
  if (!html || !html.trim()) return [];

  const dom = new JSDOM(`<body>${html}</body>`);
  const body = dom.window.document.body;
  const Node = dom.window.Node;

  const nextKey = keyer('b');
  const blocks = [];

  /**
   * Walk inline content, accumulating spans.
   *
   * `marks` is the set active from enclosing elements; `markDefs` collects link
   * annotations for the block being built.
   */
  function inline(node, marks, markDefs, spans, spanKey) {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = clean(child.nodeValue ?? '');
        if (!text) continue;
        spans.push({ _type: 'span', _key: spanKey(), text, marks: [...marks] });
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = child.tagName.toLowerCase();

      if (tag === 'br') {
        // Portable Text has no hard-break mark. A newline inside a span is the
        // conventional representation and renders correctly through
        // astro-portabletext with `white-space: pre-line`, which the ported
        // Webflow CSS already applies to rich-text paragraphs.
        spans.push({ _type: 'span', _key: spanKey(), text: '\n', marks: [...marks] });
        continue;
      }

      if (tag === 'a') {
        const href = child.getAttribute('href');
        if (!href) {
          inline(child, marks, markDefs, spans, spanKey);
          continue;
        }
        const key = `l${markDefs.length.toString(36)}`;
        markDefs.push({
          _type: 'link',
          _key: key,
          href: normaliseHref(href),
          // Webflow records target in an attribute on some links and not
          // others; treat an explicit _blank as the only signal.
          ...(child.getAttribute('target') === '_blank' ? { blank: true } : {}),
        });
        inline(child, [...marks, key], markDefs, spans, spanKey);
        continue;
      }

      if (tag === 'sub' || tag === 'sup') {
        // Not in this schema's decorator list. Keep the text, lose the
        // formatting, and say so — silently dropping the characters would be
        // worse than silently dropping the styling.
        onWarn(`<${tag}> is not a decorator in this schema; kept text, dropped formatting`);
        inline(child, marks, markDefs, spans, spanKey);
        continue;
      }

      const decorator = DECORATORS[tag];
      if (decorator) {
        inline(child, marks.includes(decorator) ? marks : [...marks, decorator], markDefs, spans, spanKey);
        continue;
      }

      if (tag === 'img') {
        onWarn(`inline <img src="${child.getAttribute('src')}"> in rich text — not converted`);
        continue;
      }

      // span, code, anything else inline-ish: descend and keep the text.
      inline(child, marks, markDefs, spans, spanKey);
    }
  }

  /**
   * Webflow writes internal links as `http://<apex-no-www>/...` — http, apex,
   * no www. Left as-is that is three redirects on every click and a
   * mixed-content warning. Rewritten to a root-relative path, which is also
   * what makes the links work on a staging hostname.
   *
   * The host list is derived from `webflow.source` in project.jsonc — both the
   * apex and the www form, because Webflow uses the apex regardless of which
   * one the site is served from.
   */
  function normaliseHref(href) {
    const internal = INTERNAL_LINK.exec(href.trim());
    if (internal) return internal[1] || '/';
    return href.trim();
  }

  /** Build one text block from a block-level element. */
  function textBlock(el, style, listItem, level) {
    const markDefs = [];
    const spans = [];
    const spanKey = keyer('s');
    inline(el, [], markDefs, spans, spanKey);

    // Collapse a block whose only content was spacer characters.
    const hasText = spans.some((s) => s.text.trim());
    if (!hasText) return null;

    // Trim the outer edges: Webflow leaves a leading space after `&nbsp;`
    // normalisation surprisingly often.
    if (spans.length) {
      spans[0].text = spans[0].text.replace(/^ +/, '');
      spans[spans.length - 1].text = spans[spans.length - 1].text.replace(/ +$/, '');
    }

    return {
      _type: 'block',
      _key: nextKey(),
      style,
      markDefs,
      children: spans.filter((s) => s.text !== ''),
      ...(listItem ? { listItem, level } : {}),
    };
  }

  /**
   * A `<figure>` -> an image or a video block, or null if it is neither.
   *
   * Webflow's two figure shapes, as measured across this corpus's 16 of them:
   *
   *     <figure class="w-richtext-figure-type-image w-richtext-align-floatright"
   *             data-rt-type="image" data-rt-align="floatright" data-rt-max-width="564">
   *       <div><img alt="…" src="…"></div><figcaption>…</figcaption></figure>
   *
   *     <figure class="w-richtext-figure-type-video w-richtext-align-fullwidth"
   *             style="padding-bottom:56.25%" data-rt-type="video"
   *             data-rt-dimensions="854:480" data-page-url="https://youtu.be/…">
   *       <div><iframe src="https://www.youtube.com/embed/…"></iframe></div>
   *       <figcaption>…</figcaption></figure>
   *
   * BOTH video URLs are kept. `data-page-url` is the link the editor pasted and
   * the iframe `src` is what the provider's oEmbed returned; deriving one from
   * the other means guessing a provider's URL scheme, and a wrong guess renders
   * a blank box rather than an error.
   *
   * The captions in this corpus are all editor noise — `&nbsp;`, `<br>` plus a
   * zero-width joiner — so `clean` reduces them to nothing and the field is
   * omitted. A real one survives.
   */
  function figureBlock(el) {
    const type = el.getAttribute('data-rt-type');
    const align = el.getAttribute('data-rt-align') || undefined;
    /**
     * THE CAPTION IS KEPT AS FOUND, including when it is editor noise.
     *
     * Webflow emits a `<figcaption>` only when the editor has been in it, so
     * its ABSENCE is a fact about the figure: `/tour/abel-tasman-guided-walk`
     * has none and `/tour/hobbiton-waitomo-caves-tour-1-day` has
     * `<figcaption><br>&zwj;</figcaption>`. Reducing the second to nothing
     * makes the two look identical here and emits a `<figcaption>` on both —
     * one tag too many on one page and one too few on the other.
     *
     * So: undefined when there is no element, and otherwise the text with its
     * `<br>` kept as a newline, the way a span carries one.
     */
    const captionEl = el.querySelector('figcaption');
    // Cleaned PER NODE, because `clean` collapses literal newlines and the
    // ones standing in for a `<br>` have to survive it.
    const caption = captionEl
      ? [...captionEl.childNodes]
          .map((n) => (n.nodeName.toLowerCase() === 'br' ? '\n' : clean(n.textContent ?? '')))
          .join('')
      : undefined;

    if (type === 'image') {
      const img = el.querySelector('img');
      const src = img?.getAttribute('src');
      if (!src) return null;
      const maxWidth = Number.parseInt(el.getAttribute('data-rt-max-width') ?? '', 10);
      return {
        _type: 'image',
        _key: nextKey(),
        // The same convention as every other image in the migration: the
        // Sanity import resolves `_sanityAsset` wherever it appears in a
        // document, nested blocks included, and uploads the file.
        _sanityAsset: `image@${src}`,
        ...(img.getAttribute('alt') ? { alt: img.getAttribute('alt') } : {}),
        ...(align ? { align } : {}),
        ...(Number.isFinite(maxWidth) ? { maxWidth } : {}),
        ...(caption !== undefined ? { caption } : {}),
      };
    }

    if (type === 'video') {
      const embedUrl = el.querySelector('iframe')?.getAttribute('src');
      const url = el.getAttribute('data-page-url');
      if (!embedUrl || !url) return null;
      const ratio = /padding-bottom:\s*([^;]+)/.exec(el.getAttribute('style') ?? '')?.[1];
      return {
        _type: 'videoEmbed',
        _key: nextKey(),
        url,
        embedUrl,
        ...(align ? { align } : {}),
        ...(el.getAttribute('data-rt-dimensions')
          ? { dimensions: el.getAttribute('data-rt-dimensions') }
          : {}),
        ...(ratio ? { ratio: ratio.trim() } : {}),
        ...(caption !== undefined ? { caption } : {}),
      };
    }

    return null;
  }

  /** Lists: each <li> is its own block carrying listItem + level. */
  function walkList(el, listItem, level) {
    for (const li of el.children) {
      if (li.tagName.toLowerCase() !== 'li') continue;

      // A nested list inside an <li> becomes deeper-level blocks AFTER this
      // item's own text, which is how Portable Text represents nesting.
      const nested = [...li.children].filter((c) =>
        ['ul', 'ol'].includes(c.tagName.toLowerCase()),
      );
      for (const n of nested) n.remove();

      const block = textBlock(li, 'normal', listItem, level);
      if (block) blocks.push(block);

      for (const n of nested) {
        walkList(n, n.tagName.toLowerCase() === 'ol' ? 'number' : 'bullet', level + 1);
      }
    }
  }

  function walk(parent) {
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        // Bare text at the top level — wrap it rather than lose it.
        const text = clean(node.nodeValue ?? '');
        if (!text.trim()) continue;
        blocks.push({
          _type: 'block',
          _key: nextKey(),
          style: 'normal',
          markDefs: [],
          children: [{ _type: 'span', _key: 's0', text: text.trim(), marks: [] }],
        });
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = node.tagName.toLowerCase();

      if (tag === 'hr') {
        blocks.push({ _type: 'divider', _key: nextKey() });
        continue;
      }

      if (tag === 'ul' || tag === 'ol') {
        walkList(node, tag === 'ol' ? 'number' : 'bullet', 1);
        continue;
      }

      if (tag in BLOCK_STYLES) {
        if (tag === 'h1') {
          onWarn('<h1> in rich text demoted to h2 — the page template owns the h1');
        }
        const block = textBlock(node, BLOCK_STYLES[tag], null, null);
        if (block) blocks.push(block);
        continue;
      }

      if (tag === 'table') {
        onWarn('<table> in rich text — not converted (add a rule if one appears)');
        continue;
      }

      if (tag === 'figure') {
        const figure = figureBlock(node);
        if (figure) {
          blocks.push(figure);
          continue;
        }
        // Not a shape we know. Fall through to keeping the text, and say so —
        // a figure that silently vanishes is content loss with no symptom.
        onWarn(
          `<figure data-rt-type="${node.getAttribute('data-rt-type') ?? ''}"> ` +
            'is not an image or a video — kept its text only',
        );
        walk(node);
        continue;
      }

      if (tag === 'div') {
        // Webflow wraps embeds in divs. Descend and keep the text rather than
        // inventing a rule for a case that has not happened.
        if (node.getAttribute('data-rt-embed-type')) {
          onWarn(`rich-text embed (${node.getAttribute('data-rt-embed-type')}) — not converted`);
          continue;
        }
        walk(node);
        continue;
      }

      if (isBlockish(tag)) {
        walk(node);
        continue;
      }

      // An inline element at the top level, e.g. a bare <strong>. Wrap it.
      const block = textBlock(node, 'normal', null, null);
      if (block) blocks.push(block);
    }
  }

  walk(body);
  return blocks;
}

/** Plain text -> a single normal block. For short plain-text fields. */
export function textToPortableText(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return [];
  return [
    {
      _type: 'block',
      _key: 'b0',
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: 's0', text: trimmed, marks: [] }],
    },
  ];
}

/** Flatten Portable Text back to plain text. Used by the verifier. */
export function portableTextToPlain(blocks) {
  return (blocks ?? [])
    .filter((b) => b._type === 'block')
    .map((b) => (b.children ?? []).map((c) => c.text).join(''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}
