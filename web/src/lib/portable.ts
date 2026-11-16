/**
 * Portable Text -> HTML, serialised into Webflow's OWN rich-text markup.
 *
 * This is the highest-leverage piece of the whole port. The output goes inside
 * a `.w-richtext` wrapper, which means the stylesheet Webflow already ships
 * styles CMS prose with NO NEW CSS — a paragraph published from Sanity is
 * indistinguishable from one Webflow rendered. Write a bespoke renderer with
 * its own classes instead and every CMS page needs its typography rebuilt.
 *
 * Hand-written rather than `@portabletext/to-html` because the output has to
 * match one specific generator's markup, the block vocabulary is closed (see
 * `schema/richText.mjs`), and the round-trip is asserted against real fixtures
 * by `migration-scripts/sanity/test-portable.mjs`.
 *
 * EVERYTHING IS ESCAPED. Content is data, never markup: a `<script>` in a
 * review body renders as text.
 */

export type Span = {
  _type: 'span';
  text: string;
  marks?: string[];
};

export type MarkDef = {
  _key: string;
  _type: string;
  href?: string;
};

export type Block = {
  _type: string;
  _key?: string;
  style?: string;
  listItem?: 'bullet' | 'number';
  level?: number;
  markDefs?: MarkDef[];
  children?: Span[];
  // `image` blocks — a picture placed in the prose
  asset?: {_ref?: string};
  alt?: string;
  align?: string;
  maxWidth?: number;
  caption?: string;
  // `videoEmbed` blocks
  url?: string;
  embedUrl?: string;
  dimensions?: string;
  ratio?: string;
};

/**
 * How an in-prose image becomes a URL.
 *
 * Passed in rather than imported so this module stays free of Sanity: it is
 * exercised offline by `test-portable.mjs`, which has no client and no network.
 * With no resolver an image block renders nothing, which is what it did before
 * figures were carried at all.
 */
export type Options = {imageUrl?: (block: Block) => string};

const escape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * A link's href, escaped, with `target`/`rel` only where it leaves the site.
 *
 * `rel="noopener"` is not optional on a `target="_blank"`: without it the
 * opened page gets a handle on `window.opener`.
 */
function anchor(href: string, inner: string): string {
  const external = /^https?:\/\//i.test(href);
  const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${escape(href)}"${attrs}>${inner}</a>`;
}

/** Decorator marks, innermost-first so the nesting is stable. */
const DECORATORS: Record<string, [string, string]> = {
  strong: ['<strong>', '</strong>'],
  em: ['<em>', '</em>'],
  underline: ['<u>', '</u>'],
  'strike-through': ['<s>', '</s>'],
  code: ['<code>', '</code>'],
};

/** Wrap already-escaped text in its decorators, then its annotations. */
function wrapMarks(text: string, marks: string[], markDefs: MarkDef[]): string {
  let out = text;
  for (const mark of marks) {
    const pair = DECORATORS[mark];
    if (pair) out = `${pair[0]}${out}${pair[1]}`;
  }
  // Annotations (links) wrap outermost, so a bold link is <a><strong>…
  for (const mark of marks) {
    if (DECORATORS[mark]) continue;
    const def = markDefs.find((d) => d._key === mark);
    if (def?._type === 'link' && def.href) out = anchor(def.href, out);
  }
  return out;
}

const sameMarks = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && a.every((m, i) => m === b[i]);

/**
 * Spans, with CONSECUTIVE IDENTICALLY-MARKED ONES MERGED.
 *
 * Two things are going on here and they interact.
 *
 * A newline inside a span IS a `<br>`: the converter represents Webflow's
 * `<br>` as a newline because Portable Text has no hard-break mark, and it has
 * to come back as a tag. Leaning on `white-space: pre-line` instead — which an
 * earlier version did — is wrong twice over: `pre-line` appears NOWHERE in the
 * ported Webflow stylesheet, and a newline leaves the page one `<body>` tag
 * short per break, which no reader can see and every structural check can.
 *
 * But a `<br>` inside a `<strong>` splits ONE bold run into three spans that
 * all carry the same mark, and wrapping each separately emits three `<strong>`
 * where Webflow emits one. Merging first is what makes the two agree:
 * `<strong>$2075.00 NZD / Adult<br />$1450.00 NZD / Child</strong>`, as on the
 * live page, rather than three adjacent bold fragments.
 */
function renderChildren(block: Block): string {
  const markDefs = block.markDefs ?? [];
  const children = block.children ?? [];
  const out: string[] = [];
  let i = 0;
  while (i < children.length) {
    const marks = children[i].marks ?? [];
    let text = '';
    while (i < children.length && sameMarks(children[i].marks ?? [], marks)) {
      text += escape(children[i].text ?? '').split('\n').join('<br />');
      i += 1;
    }
    out.push(wrapMarks(text, marks, markDefs));
  }
  return out.join('');
}

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * A `<figure>`, in Webflow's own markup.
 *
 * Reproduced attribute for attribute because the stylesheet targets
 * `.w-richtext-figure-type-*` and `.w-richtext-align-*` — those two classes are
 * the entire difference between a photograph floated beside the text and one
 * across the full column, and nothing else in the ported CSS sets it.
 *
 * The video's `padding-bottom` is what holds the aspect ratio before the iframe
 * loads; without it the page reflows as every embed arrives.
 */
function renderFigure(type: 'image' | 'video', block: Block, inner: string): string {
  const align = block.align ?? 'fullwidth';
  const style = type === 'video' && block.ratio ? ` style="padding-bottom:${escape(block.ratio)}"` : '';
  const data =
    type === 'video'
      ? ` data-rt-type="video" data-rt-align="${escape(align)}"` +
        (block.dimensions ? ` data-rt-dimensions="${escape(block.dimensions)}"` : '') +
        (block.url ? ` data-page-url="${escape(block.url)}"` : '')
      : ` data-rt-type="image" data-rt-align="${escape(align)}"` +
        (block.maxWidth ? ` data-rt-max-width="${block.maxWidth}"` : '');
  // No caption field at all means the live figure had no `<figcaption>`; an
  // EMPTY one means it had an empty one, which Webflow still emits.
  const caption =
    block.caption === undefined
      ? ''
      : `<figcaption>${escape(block.caption).split('\n').join('<br />')}</figcaption>`;
  return (
    `<figure class="w-richtext-figure-type-${type} w-richtext-align-${escape(align)}"` +
    `${style}${data}><div>${inner}</div>${caption}</figure>`
  );
}

/** One non-list block. */
function renderBlock(block: Block, options: Options): string {
  if (block._type === 'image') {
    const src = options.imageUrl?.(block);
    if (!src) return '';
    const alt = escape(block.alt ?? '');
    return renderFigure('image', block, `<img alt="${alt}" src="${escape(src)}" loading="lazy" />`);
  }

  if (block._type === 'videoEmbed') {
    if (!block.embedUrl) return '';
    return renderFigure(
      'video',
      block,
      `<iframe src="${escape(block.embedUrl)}" scrolling="no" frameborder="0" allowfullscreen=""></iframe>`,
    );
  }

  if (block._type !== 'block') return '';

  const inner = renderChildren(block);
  // An empty block renders as a dead vertical gap nobody can click into or
  // delete. The converter already drops spacer paragraphs; this is the backstop.
  if (!inner.trim()) return '';

  const style = block.style ?? 'normal';
  if (HEADINGS.has(style)) return `<${style}>${inner}</${style}>`;
  if (style === 'blockquote') return `<blockquote>${inner}</blockquote>`;
  return `<p>${inner}</p>`;
}

/**
 * Serialise Portable Text to Webflow-compatible HTML.
 *
 * Lists are assembled by scanning consecutive `listItem` blocks and nesting on
 * `level`, because Portable Text models a list as a FLAT run of items carrying
 * a depth rather than as a tree.
 */
export function renderPortableText(blocks?: Block[] | null, options: Options = {}): string {
  if (!blocks || blocks.length === 0) return '';

  const out: string[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (block?._type === 'block' && block.listItem) {
      // Collect the whole run of list items, then build it.
      const run: Block[] = [];
      while (i < blocks.length && blocks[i]?._type === 'block' && blocks[i].listItem) {
        run.push(blocks[i]);
        i += 1;
      }
      out.push(renderList(run, 1));
      continue;
    }

    out.push(renderBlock(block, options));
    i += 1;
  }

  return out.filter(Boolean).join('');
}

/**
 * One list level, recursing for deeper items.
 *
 * A deeper item belongs INSIDE the preceding `<li>`, which is what Webflow
 * emits and what its CSS targets — closing the `<li>` first and opening a bare
 * nested `<ul>` as a sibling is valid-looking and indents wrongly.
 */
function renderList(items: Block[], level: number): string {
  const tag = items[0].listItem === 'number' ? 'ol' : 'ul';
  const parts: string[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    const itemLevel = item.level ?? 1;

    if (itemLevel > level) {
      // Deeper run — attach it to the previous <li>, which is already closed,
      // so reopen it by splicing the nested list before its closing tag.
      const nested: Block[] = [];
      while (i < items.length && (items[i].level ?? 1) > level) {
        nested.push(items[i]);
        i += 1;
      }
      const sub = renderList(nested, level + 1);
      const prev = parts.pop();
      parts.push(prev ? prev.replace(/<\/li>$/, `${sub}</li>`) : `<li>${sub}</li>`);
      continue;
    }

    parts.push(`<li>${renderChildren(item)}</li>`);
    i += 1;
  }

  return `<${tag}>${parts.join('')}</${tag}>`;
}

/** Plain text, for meta descriptions and search indexing. */
export const portableTextToPlain = (blocks?: Block[] | null): string =>
  (blocks ?? [])
    .filter((b) => b._type === 'block')
    .map((b) => (b.children ?? []).map((c) => c.text ?? '').join(''))
    .join('\n\n')
    .trim();
