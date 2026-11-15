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
    {type: 'image', options: {hotspot: true}, fields: [{name: 'alt', type: 'string', title: 'Alt text'}]},
  ],
};
