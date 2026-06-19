import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LinkPrompt } from './LinkPrompt'

describe('LinkPrompt', () => {
  it('renders the URL prompt as a larger two-field dialog with close and note actions', () => {
    const html = renderToStaticMarkup(
      <LinkPrompt
        linkPromptInputRef={{ current: null }}
        linkPrompt={{
          open: true,
          top: 20,
          left: 24,
          url: 'https://example.com',
          text: 'Example',
          urlEditable: true,
          editRange: { from: 1, to: 8, href: '' },
        }}
        onLinkPromptUrlChange={vi.fn()}
        onLinkPromptTextChange={vi.fn()}
        onInsertNamedLink={vi.fn()}
        onCloseLinkPrompt={vi.fn()}
        onOpenLink={vi.fn()}
        onOpenNoteLink={vi.fn()}
      />,
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain('Insert link')
    expect(html).toContain('aria-label="Close link prompt"')
    expect(html).toContain('<span>link url</span>')
    expect(html).toContain('<span>link text</span>')
    expect(html).toContain('link-prompt-actions')
    expect(html).toContain('>note</button>')
    expect(html).toContain('>done</button>')
  })
})
