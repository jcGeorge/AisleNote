import { describe, expect, it } from 'vitest'
import {
  RENDERED_MARKDOWN_CLASS_NAMES,
  RENDERED_MARKDOWN_PARITY_FIXTURES,
  RENDERED_MARKDOWN_SURFACE_CLASS,
  collectRenderedMarkdownHighlightRanges,
  getRenderedMarkdownInlineTextParts,
  getRenderedMarkdownHeadingClassName,
  getRenderedMarkdownHeadingLineClassName,
} from './rendered-markdown-surface'

describe('rendered Markdown surface contract', () => {
  it('defines one shared surface class for active editors and inactive previews', () => {
    expect(RENDERED_MARKDOWN_SURFACE_CLASS).toBe('tabs-rendered-markdown-surface')
    expect(RENDERED_MARKDOWN_CLASS_NAMES.link).toBe('tabs-rendered-markdown-link')
    expect(RENDERED_MARKDOWN_CLASS_NAMES.tableSourceLine).toBe('tabs-rendered-markdown-table-source-line')
  })

  it('normalizes heading classes to supported Markdown heading levels', () => {
    expect(getRenderedMarkdownHeadingClassName(1)).toBe('tabs-rendered-markdown-heading tabs-rendered-markdown-heading-1')
    expect(getRenderedMarkdownHeadingClassName(99)).toBe('tabs-rendered-markdown-heading tabs-rendered-markdown-heading-6')
    expect(getRenderedMarkdownHeadingLineClassName(0)).toBe('tabs-rendered-markdown-heading-line tabs-rendered-markdown-heading-line-1')
  })

  it('parses app highlight syntax and tags for shared preview/editor rendering', () => {
    expect(collectRenderedMarkdownHighlightRanges('A ==highlighted== value')).toEqual([
      { markerStart: 2, contentStart: 4, contentEnd: 15, markerEnd: 17 },
    ])
    expect(getRenderedMarkdownInlineTextParts('A ==highlighted== #tag')).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'highlight', text: 'highlighted' },
      { kind: 'text', text: ' ' },
      { kind: 'tag', text: '#tag', tag: 'tag' },
    ])
  })

  it('keeps a fixture list for parity work and marks unresolved block widgets as known gaps', () => {
    const fixtureIds = RENDERED_MARKDOWN_PARITY_FIXTURES.map((fixture) => fixture.id)

    expect(fixtureIds).toEqual(expect.arrayContaining([
      'heading',
      'paragraph-blank-lines',
      'external-link',
      'tags',
      'lists-and-tasks',
      'quote',
      'code',
      'table-links',
      'media',
      'note-preview',
      'next-aisle-3',
    ]))
    expect(RENDERED_MARKDOWN_PARITY_FIXTURES.find((fixture) => fixture.id === 'table-links')?.status).toBe('matched')
    expect(RENDERED_MARKDOWN_PARITY_FIXTURES.find((fixture) => fixture.id === 'next-aisle-3')?.markdown).toContain(
      '![sparkSubtab](<<sparkSubtab--97c129#last position>>)',
    )
  })
})
