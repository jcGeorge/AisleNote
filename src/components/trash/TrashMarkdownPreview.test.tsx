import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TrashMarkdownPreview } from './TrashMarkdownPreview'

describe('TrashMarkdownPreview', () => {
  it('renders deleted trash markdown without mounting a Toast UI editor host', () => {
    const html = renderToStaticMarkup(
      <TrashMarkdownPreview markdown={['# Deleted note', '', 'trash **content**'].join('\n')} />,
    )

    expect(html).toContain('data-trash-markdown-preview="true"')
    expect(html).toContain('class="tabs-rendered-markdown-heading tabs-rendered-markdown-heading-1"')
    expect(html).toContain('Deleted note</h1>')
    expect(html).toContain('<strong>content</strong>')
    expect(html).not.toContain('toast-editor-host')
  })

  it('repairs escaped persisted markdown links in read-only previews', () => {
    const html = renderToStaticMarkup(
      <TrashMarkdownPreview markdown={String.raw`\[strike\]\(https://lucide\.dev/icons/strikethrough\)`} />,
    )

    expect(html).toContain('href="https://lucide.dev/icons/strikethrough"')
    expect(html).not.toContain('\\[strike\\]')
  })
})
