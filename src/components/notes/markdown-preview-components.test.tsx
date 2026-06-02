import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { describe, expect, it } from 'vitest'
import {
  MarkdownPreviewHeading1,
  MarkdownPreviewHeading2,
  MarkdownPreviewHeading3,
  MarkdownPreviewHeading4,
  MarkdownPreviewHeading5,
  MarkdownPreviewHeading6,
  MarkdownPreviewLink,
  MarkdownPreviewListItem,
  MarkdownPreviewParagraph,
} from './markdown-preview-components'

const previewComponents = {
  a: MarkdownPreviewLink,
  h1: MarkdownPreviewHeading1,
  h2: MarkdownPreviewHeading2,
  h3: MarkdownPreviewHeading3,
  h4: MarkdownPreviewHeading4,
  h5: MarkdownPreviewHeading5,
  h6: MarkdownPreviewHeading6,
  li: MarkdownPreviewListItem,
  p: MarkdownPreviewParagraph,
}

function renderPreview(markdown: string) {
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={defaultUrlTransform}
      components={previewComponents}
    >
      {markdown}
    </ReactMarkdown>,
  )
}

describe('markdown preview tag appearance', () => {
  it('styles visible tags in paragraphs, headings, and list text', () => {
    const html = renderPreview([
      '# Heading #Tag-3',
      '',
      'Text #asdf',
      '',
      '- item #nested/tag',
    ].join('\n'))

    expect(html).toContain('<span class="tabs-tag-token" data-tabs-tag="Tag-3" title="filter by tag">#Tag-3</span>')
    expect(html).toContain('<span class="tabs-tag-token" data-tabs-tag="asdf" title="filter by tag">#asdf</span>')
    expect(html).toContain(
      '<span class="tabs-tag-token" data-tabs-tag="nested/tag" title="filter by tag">#nested/tag</span>',
    )
  })

  it('does not style tags inside inline code or fenced code', () => {
    const html = renderPreview([
      'Visible #Tag and `#Inline`',
      '',
      '```',
      '#Fenced',
      '```',
    ].join('\n'))

    expect(html).toContain('<span class="tabs-tag-token" data-tabs-tag="Tag" title="filter by tag">#Tag</span>')
    expect(html).toContain('<code>#Inline</code>')
    expect(html).toContain('<code>#Fenced')
    expect(html).not.toContain('<span class="tabs-tag-token">#Inline</span>')
    expect(html).not.toContain('<span class="tabs-tag-token">#Fenced</span>')
  })
})
