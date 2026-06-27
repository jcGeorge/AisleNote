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
  MarkdownPreviewInput,
  MarkdownPreviewLink,
  MarkdownPreviewListItem,
  MarkdownPreviewParagraph,
  createMarkdownPreviewListItem,
  createMarkdownPreviewUnorderedList,
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
  input: MarkdownPreviewInput,
  li: MarkdownPreviewListItem,
  p: MarkdownPreviewParagraph,
}

function renderPreview(markdown: string) {
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={defaultUrlTransform}
      components={{
        ...previewComponents,
        li: createMarkdownPreviewListItem(markdown),
        ul: createMarkdownPreviewUnorderedList(markdown),
      }}
    >
      {markdown}
    </ReactMarkdown>,
  )
}

describe('markdown preview tag appearance', () => {
  it('marks encoded bracket-wrapped internal note hrefs as vault links', () => {
    const state: AppState = {
      theme: 'dark',
      vault: {
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

    expect(html).toContain('<span class="aislenote-tag-token" data-aislenote-tag="Tag-3" data-app-tooltip="filter by tag">#Tag-3</span>')
    expect(html).toContain('<span class="aislenote-tag-token" data-aislenote-tag="asdf" data-app-tooltip="filter by tag">#asdf</span>')
    expect(html).toContain(
      '<span class="aislenote-tag-token" data-aislenote-tag="nested/tag" data-app-tooltip="filter by tag">#nested/tag</span>',
    )
  })

  it('keeps numeric hashtags as plain preview text', () => {
    const html = renderPreview([
      '# Heading #1 #4word',
      '',
      'Text #2024 and #2024-q1',
      '',
      '- item #4-5 #4/word',
    ].join('\n'))

    expect(html).not.toContain('data-aislenote-tag="1"')
    expect(html).not.toContain('data-aislenote-tag="2024"')
    expect(html).not.toContain('data-aislenote-tag="4-5"')
    expect(html).toContain('<span class="aislenote-tag-token" data-aislenote-tag="4word" data-app-tooltip="filter by tag">#4word</span>')
    expect(html).toContain('<span class="aislenote-tag-token" data-aislenote-tag="2024-q1" data-app-tooltip="filter by tag">#2024-q1</span>')
    expect(html).toContain('<span class="aislenote-tag-token" data-aislenote-tag="4/word" data-app-tooltip="filter by tag">#4/word</span>')
  })

  it('does not style tags inside inline code or fenced code', () => {
    const html = renderPreview([
      'Visible #Tag and `#Inline`',
      '',
      '```',
      '#Fenced',
      '```',
    ].join('\n'))

    expect(html).toContain('<span class="aislenote-tag-token" data-aislenote-tag="Tag" data-app-tooltip="filter by tag">#Tag</span>')
    expect(html).toContain('<code>#Inline</code>')
    expect(html).toContain('<code>#Fenced')
    expect(html).not.toContain('<span class="aislenote-tag-token">#Inline</span>')
    expect(html).not.toContain('<span class="aislenote-tag-token">#Fenced</span>')
  })

  it('applies shared rendered Markdown surface classes to preview links and headings', () => {
    const html = renderPreview('# My Header\n\n[copy](https://lucide.dev/icons/files)')

    expect(html).toContain('class="aislenote-rendered-markdown-heading aislenote-rendered-markdown-heading-1"')
    expect(html).toContain('class="aislenote-rendered-markdown-link"')
    expect(html).toContain('href="https://lucide.dev/icons/files"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('renders app highlight syntax without exposing the == markers', () => {
    const html = renderPreview('Alright\n==highlighted==')

    expect(html).toContain('class="aislenote-rendered-markdown-highlight"')
    expect(html).toContain('highlighted</span>')
    expect(html).not.toContain('==highlighted==')
  })

  it('keeps dash lists distinct from bullet lists in React markdown previews', () => {
    const html = renderPreview(['* bullet item', '', 'between', '', '- dash item'].join('\n'))

    expect(html).toContain('class="aislenote-dash-list"')
    expect(html).toContain('aislenote-dash-list-item')
    expect(html).toContain('bullet item')
    expect(html).toContain('dash item')
  })

  it('renders annotation markers without exposing their source marker text', () => {
    const html = renderPreview(['-- And this bad boy', '^-- Man that is inconsistent.'].join('\n\n'))

    expect(html).toContain('aislenote-annotation-line')
    expect(html).toContain('And this bad boy')
    expect(html).toContain('aislenote-annotation-inline-arrow')
    expect(html).toContain('\u21b0')
    expect(html).toContain('Man that is inconsistent.')
    expect(html).not.toContain('-- And this bad boy')
    expect(html).not.toContain('^-- Man that is inconsistent.')
  })

  it('renders one real checkbox for task list rows', () => {
    const html = renderPreview("- [x] That's not great")

    expect(html).toContain('class="task-list-item aislenote-rendered-markdown-list-item"')
    expect(html.match(/type="checkbox"/g) ?? []).toHaveLength(1)
    expect(html).toContain('checked=""')
    expect(html).not.toContain('disabled=""')
  })

  it('renders shortcut-menu blocks with editor preview conventions when markdown blocks are already separated', () => {
    const markdown = [
      '# Shortcut menu',
      '',
      "> totally doesn't work",
      '',
      '* how something is that?',
      '',
      '- at least dashes work',
      '',
      '-- And this bad boy',
      '',
      '1. and this one.',
      '',
      '^--\u00a0Man that is inconsistent.',
      '',
      '* [x] Hmm',
      "* [ ] That's not great",
    ].join('\n')
    const html = renderPreview(markdown)

    expect(html).toContain('aislenote-dash-list-item')
    expect(html).toContain('aislenote-annotation-line')
    expect(html).toContain('And this bad boy')
    expect(html).toContain('aislenote-annotation-inline-arrow')
    expect(html).toContain('Man that is inconsistent.')
    expect(html.match(/type="checkbox"/g) ?? []).toHaveLength(2)
    expect(html).toContain('checked=""')
    expect(html).not.toContain(String.raw`\-\-`)
    expect(html).not.toContain('^--')
  })
})
