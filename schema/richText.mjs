/**
 * The one rich-text definition, shared by every document type.
 *
 * Deliberately NARROW. It declares exactly the marks and block styles that
 * appear in this site's Webflow rich text and nothing else, because the
 * converter's contract is that no visible character is lost — and a style the
 * schema does not declare is a style the Studio silently refuses to render.
 * Widening it later is cheap; discovering a dropped heading in production is
 * not.
 *
 * What the live content actually uses, read off the raw dump: `h3`/`h4`
 * headings, bold, italic, links, bulleted and numbered lists.
 */
export const richText = {
  name: 'richText',
  title: 'Rich text',
  type: 'array',
  of: [
    {
      type: 'block',
      styles: [
        {title: 'Normal', value: 'normal'},
        {title: 'Heading 2', value: 'h2'},
        {title: 'Heading 3', value: 'h3'},
        {title: 'Heading 4', value: 'h4'},
        {title: 'Quote', value: 'blockquote'},
      ],
      lists: [
        {title: 'Bullet', value: 'bullet'},
        {title: 'Numbered', value: 'number'},
      ],
      marks: {
        decorators: [
          {title: 'Bold', value: 'strong'},
          {title: 'Italic', value: 'em'},
          {title: 'Underline', value: 'underline'},
        ],
        annotations: [
          {
            name: 'link',
            title: 'Link',
            type: 'object',
            fields: [
              {
                name: 'href',
                title: 'URL',
                type: 'url',
                // Webflow writes internal links as absolute URLs on the apex
                // host even when the site is served from www, so the converter
                // rewrites those to paths. Relative values must therefore be
                // allowed here or the rewritten link fails validation.
                validation: (Rule) =>
                  Rule.uri({allowRelative: true, scheme: ['http', 'https', 'mailto', 'tel']}),
              },
            ],
          },
        ],
      },
    },
    /**
     * A picture placed INSIDE the prose, which Webflow emits as a `<figure>`:
     *
     *     <figure class="w-richtext-figure-type-image w-richtext-align-floatright"
     *             data-rt-type="image" data-rt-align="floatright">
     *       <div><img alt="…" src="…" …></div><figcaption>…</figcaption>
     *     </figure>
     *
     * Six of them across five tour descriptions. `align` and `maxWidth` are
     * carried because they are the whole difference between a photograph
     * floated beside the text and one across the full column — the stylesheet
     * targets `.w-richtext-align-*` and nothing else sets it.
     */
    {
      type: 'image',
      options: {hotspot: true},
      fields: [
        {name: 'alt', type: 'string', title: 'Alt text'},
        {
          name: 'align',
          title: 'Alignment',
          type: 'string',
          options: {
            list: [
              {title: 'Full width', value: 'fullwidth'},
              {title: 'Float left', value: 'floatleft'},
              {title: 'Float right', value: 'floatright'},
              {title: 'Centred', value: 'center'},
            ],
          },
          initialValue: 'fullwidth',
        },
        {name: 'maxWidth', title: 'Max width (px)', type: 'number'},
        {name: 'caption', title: 'Caption', type: 'string'},
      ],
    },
    /**
     * A video placed in the prose — ten of them, YouTube and one Vimeo.
     *
     * Both URLs are stored as Webflow had them. `url` is the share link the
     * editor pasted and `embedUrl` is the iframe `src` the provider's oEmbed
     * returned; deriving one from the other means guessing a provider's URL
     * scheme, and a guess that is wrong renders a blank box rather than an
     * error. `ratio` is the padding-bottom percentage Webflow writes to hold
     * the aspect before the iframe loads.
     */
    {
      type: 'object',
      name: 'videoEmbed',
      title: 'Video',
      fields: [
        {name: 'url', title: 'Video page URL', type: 'url', validation: (R) => R.required()},
        {name: 'embedUrl', title: 'Embed URL', type: 'url', validation: (R) => R.required()},
        {name: 'align', title: 'Alignment', type: 'string', initialValue: 'fullwidth'},
        {name: 'dimensions', title: 'Dimensions', type: 'string', description: 'e.g. 854:480'},
        {name: 'ratio', title: 'Aspect padding', type: 'string', description: 'e.g. 56.25%'},
        {name: 'caption', title: 'Caption', type: 'string'},
      ],
      preview: {select: {title: 'url'}},
    },
  ],
};
