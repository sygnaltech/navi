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
  // image blocks
  asset?: {_ref?: string};
  alt?: string;
};

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

function renderSpan(span: Span, markDefs: MarkDef[]): string {
  let out = escape(span.text ?? '');
  const marks = span.marks ?? [];

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

const renderChildren = (block: Block) =>
  (block.children ?? []).map((c) => renderSpan(c, block.markDefs ?? [])).join('');

/**
 * `white-space: pre-line` on every paragraph.
 *
 * The converter turns a `<br>` into a newline INSIDE one block rather than
 * splitting the block, which is right — a `<br>` is a line break, not a new
 * paragraph. But HTML collapses that newline to a space, so without this the
 * multi-line addresses and itineraries in this site's content render as one
 * run-on line and nobody can see why.
 */
const PRE_LINE = ' style="white-space:pre-line"';

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** One non-list block. */
function renderBlock(block: Block): string {
  if (block._type !== 'block') return '';

  const inner = renderChildren(block);
  // An empty block renders as a dead vertical gap nobody can click into or
  // delete. The converter already drops spacer paragraphs; this is the backstop.
  if (!inner.trim()) return '';

  const style = block.style ?? 'normal';
  if (HEADINGS.has(style)) return `<${style}>${inner}</${style}>`;
  if (style === 'blockquote') return `<blockquote>${inner}</blockquote>`;
  return `<p${inner.includes('\n') ? PRE_LINE : ''}>${inner}</p>`;
}

/**
 * Serialise Portable Text to Webflow-compatible HTML.
 *
 * Lists are assembled by scanning consecutive `listItem` blocks and nesting on
 * `level`, because Portable Text models a list as a FLAT run of items carrying
 * a depth rather than as a tree.
 */
export function renderPortableText(blocks?: Block[] | null): string {
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

    out.push(renderBlock(block));
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
