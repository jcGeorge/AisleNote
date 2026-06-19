import React from 'react'
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
import type { AppState } from '../../types/app'
import { buildInternalNoteLinkToken } from '../../notes/note-references'

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
  it('marks encoded bracket-wrapped internal note hrefs as notebook links', () => {
    const state: AppState = {
      theme: 'dark',
      notebook: {
        activeNoteId: 'note-source',
        items: [
          { type: 'note', id: 'note-source', title: 'Source', noteBodyId: 'body-source' },
          { type: 'note', id: 'note-target-c761e6', title: '2 aisle', noteBodyId: 'body-target' },
        ],
        deletedItems: [],
        settings: { autoRemoveDeletedDays: 30 },
      },
      noteBodies: [
        { id: 'body-source', aisles: [{ id: 'aisle-source', aisleBodyId: 'aisle-body-source' }] },
        { id: 'body-target', aisles: [{ id: 'aisle-target', aisleBodyId: 'aisle-body-target' }] },
      ],
      noteAisleBodies: [
        { id: 'aisle-body-source', markdown: '' },
        { id: 'aisle-body-target', markdown: '' },
      ],
      hotkeys: { shortcuts: {} as AppState['hotkeys']['shortcuts'], newlineShortcuts: { shortcuts: {} as never, menuOperations: [] } },
      frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
      ui: {
        sidebarCollapsed: false,
        sidebarWidth: 280,
        collapsedFolderIds: [],
        tableAddTargetMode: 'active-cell',
        tableDeleteTargetMode: 'active-cell',
        noteFontScale: 1,
        settingsSection: 'data',
        noteCursorLocations: {},
        headingCollapseState: {},
        seenTipIds: [],
        disabledTipIds: [],
      },
    }
    const token = buildInternalNoteLinkToken(state, { noteId: 'note-target-c761e6' })
    const destination = token.match(/\]\((.*)\)$/)?.[1] ?? ''
    expect(destination).toMatch(/^<2 aisle--[0-9a-f]{6}>$/)
    const html = renderToStaticMarkup(
      <MarkdownPreviewLink
        href={encodeURIComponent(destination)}
        appState={state}
        onOpenNote={() => undefined}
      >
        2 aisle
      </MarkdownPreviewLink>,
    )

    expect(html).toContain('data-note-reference="true"')
    expect(html).toContain(`href="${encodeURIComponent(destination)}"`)
  })

  it('styles visible tags in paragraphs, headings, and list text', () => {
    const html = renderPreview([
      '# Heading #Tag-3',
      '',
      'Text #asdf',
      '',
      '- item #nested/tag',
    ].join('\n'))

    expect(html).toContain('<span class="tabs-tag-token" data-tabs-tag="Tag-3" data-app-tooltip="filter by tag">#Tag-3</span>')
    expect(html).toContain('<span class="tabs-tag-token" data-tabs-tag="asdf" data-app-tooltip="filter by tag">#asdf</span>')
    expect(html).toContain(
      '<span class="tabs-tag-token" data-tabs-tag="nested/tag" data-app-tooltip="filter by tag">#nested/tag</span>',
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

    expect(html).toContain('<span class="tabs-tag-token" data-tabs-tag="Tag" data-app-tooltip="filter by tag">#Tag</span>')
    expect(html).toContain('<code>#Inline</code>')
    expect(html).toContain('<code>#Fenced')
    expect(html).not.toContain('<span class="tabs-tag-token">#Inline</span>')
    expect(html).not.toContain('<span class="tabs-tag-token">#Fenced</span>')
  })

  it('applies shared rendered Markdown surface classes to preview links and headings', () => {
    const html = renderPreview('# My Header\n\n[copy](https://lucide.dev/icons/files)')

    expect(html).toContain('class="tabs-rendered-markdown-heading tabs-rendered-markdown-heading-1"')
    expect(html).toContain('class="tabs-rendered-markdown-link"')
    expect(html).toContain('href="https://lucide.dev/icons/files"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('renders app highlight syntax without exposing the == markers', () => {
    const html = renderPreview('Alright\n==highlighted==')

    expect(html).toContain('class="tabs-rendered-markdown-highlight"')
    expect(html).toContain('highlighted</span>')
    expect(html).not.toContain('==highlighted==')
  })
})
