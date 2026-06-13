import { extractMarkdownTagRanges } from '../tags/tags.js'

export type RenderedMarkdownParityStatus = 'matched' | 'known-gap' | 'unsupported'

export type RenderedMarkdownParityFixture = {
  id: string
  label: string
  markdown: string
  status: RenderedMarkdownParityStatus
  notes?: string
}

export type RenderedMarkdownInlineTextPart =
  | { kind: 'text'; text: string }
  | { kind: 'highlight'; text: string }
  | { kind: 'tag'; text: string; tag: string }

export type RenderedMarkdownHighlightRange = {
  markerStart: number
  contentStart: number
  contentEnd: number
  markerEnd: number
}

export const RENDERED_MARKDOWN_SURFACE_CLASS = 'tabs-rendered-markdown-surface'

export const RENDERED_MARKDOWN_CLASS_NAMES = {
  paragraph: 'tabs-rendered-markdown-paragraph',
  heading: 'tabs-rendered-markdown-heading',
  headingLine: 'tabs-rendered-markdown-heading-line',
  link: 'tabs-rendered-markdown-link',
  imageLabel: 'tabs-rendered-markdown-image-label',
  listItem: 'tabs-rendered-markdown-list-item',
  listLine: 'tabs-rendered-markdown-list-line',
  taskLine: 'tabs-rendered-markdown-task-line',
  unorderedListLine: 'tabs-rendered-markdown-unordered-list-line',
  orderedListLine: 'tabs-rendered-markdown-ordered-list-line',
  listMarker: 'tabs-rendered-markdown-list-marker',
  taskMarker: 'tabs-rendered-markdown-task-marker',
  blockquoteLine: 'tabs-rendered-markdown-blockquote-line',
  code: 'tabs-rendered-markdown-code',
  codeBlockLine: 'tabs-rendered-markdown-code-block-line',
  hrLine: 'tabs-rendered-markdown-hr-line',
  hrSource: 'tabs-rendered-markdown-hr-source',
  tableSourceLine: 'tabs-rendered-markdown-table-source-line',
  tableDelimiterLine: 'tabs-rendered-markdown-table-delimiter-line',
  table: 'tabs-rendered-markdown-table',
  strong: 'tabs-rendered-markdown-strong',
  emphasis: 'tabs-rendered-markdown-emphasis',
  strike: 'tabs-rendered-markdown-strike',
  highlight: 'tabs-rendered-markdown-highlight',
} as const

export function getRenderedMarkdownHeadingClassName(level: number) {
  const normalizedLevel = Number.isFinite(level) ? Math.min(6, Math.max(1, Math.trunc(level))) : 1
  return `${RENDERED_MARKDOWN_CLASS_NAMES.heading} ${RENDERED_MARKDOWN_CLASS_NAMES.heading}-${normalizedLevel}`
}

export function getRenderedMarkdownHeadingLineClassName(level: number) {
  const normalizedLevel = Number.isFinite(level) ? Math.min(6, Math.max(1, Math.trunc(level))) : 1
  return `${RENDERED_MARKDOWN_CLASS_NAMES.headingLine} ${RENDERED_MARKDOWN_CLASS_NAMES.headingLine}-${normalizedLevel}`
}

const RENDERED_MARKDOWN_HIGHLIGHT_RE = /==([^=\n]+)==/g

export function collectRenderedMarkdownHighlightRanges(value: string): RenderedMarkdownHighlightRange[] {
  const source = String(value ?? '')
  const ranges: RenderedMarkdownHighlightRange[] = []
  RENDERED_MARKDOWN_HIGHLIGHT_RE.lastIndex = 0
  for (const match of source.matchAll(RENDERED_MARKDOWN_HIGHLIGHT_RE)) {
    const markerStart = match.index ?? 0
    const content = match[1] ?? ''
    const contentStart = markerStart + 2
    const contentEnd = contentStart + content.length
    const markerEnd = contentEnd + 2
    if (content.trim().length === 0) continue
    ranges.push({ markerStart, contentStart, contentEnd, markerEnd })
  }
  return ranges
}

function appendTagParts(parts: RenderedMarkdownInlineTextPart[], value: string) {
  if (!value) return
  const ranges = extractMarkdownTagRanges(value)
  if (ranges.length === 0) {
    parts.push({ kind: 'text', text: value })
    return
  }

  let cursor = 0
  ranges.forEach((range) => {
    if (range.from > cursor) parts.push({ kind: 'text', text: value.slice(cursor, range.from) })
    parts.push({ kind: 'tag', text: value.slice(range.from, range.to), tag: range.tag })
    cursor = range.to
  })
  if (cursor < value.length) parts.push({ kind: 'text', text: value.slice(cursor) })
}

export function getRenderedMarkdownInlineTextParts(value: string): RenderedMarkdownInlineTextPart[] {
  const source = String(value ?? '')
  const highlightRanges = collectRenderedMarkdownHighlightRanges(source)
  if (highlightRanges.length === 0) {
    const parts: RenderedMarkdownInlineTextPart[] = []
    appendTagParts(parts, source)
    return parts
  }

  const parts: RenderedMarkdownInlineTextPart[] = []
  let cursor = 0
  highlightRanges.forEach((range) => {
    if (range.markerStart > cursor) appendTagParts(parts, source.slice(cursor, range.markerStart))
    parts.push({ kind: 'highlight', text: source.slice(range.contentStart, range.contentEnd) })
    cursor = range.markerEnd
  })
  if (cursor < source.length) appendTagParts(parts, source.slice(cursor))
  return parts
}

export const RENDERED_MARKDOWN_PARITY_FIXTURES: RenderedMarkdownParityFixture[] = [
  {
    id: 'heading',
    label: 'Heading',
    markdown: '# My Header',
    status: 'matched',
  },
  {
    id: 'paragraph-blank-lines',
    label: 'Paragraphs and blank lines',
    markdown: ['sure, I guess.', '', 'Wait, what?'].join('\n'),
    status: 'matched',
  },
  {
    id: 'external-link',
    label: 'Ordinary external link',
    markdown: '[copy](https://lucide.dev/icons/files)',
    status: 'matched',
  },
  {
    id: 'tags',
    label: 'Tags',
    markdown: 'Track #nested/tag in text.',
    status: 'matched',
  },
  {
    id: 'lists-and-tasks',
    label: 'Lists and tasks',
    markdown: ['- item', '1. ordered', '- [x] done'].join('\n'),
    status: 'matched',
  },
  {
    id: 'quote',
    label: 'Block quote',
    markdown: '> quoted text',
    status: 'matched',
  },
  {
    id: 'code',
    label: 'Inline and fenced code',
    markdown: ['Use `code` here.', '', '```ts', 'const value = 1', '```'].join('\n'),
    status: 'matched',
  },
  {
    id: 'table-links',
    label: 'Link-heavy table',
    markdown: [
      '# Completed items',
      '',
      '| [copy](https://lucide.dev/icons/files) |  |',
      '| ---- | --- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) |  |',
      '| [undo](https://lucide.dev/icons/undo) |  |',
      '| [redo](https://lucide.dev/icons/redo) |  |',
      '| [heading](https://lucide.dev/icons/heading) |  |',
      '| [bold](https://lucide.dev/icons/bold) |  |',
      '| [italic](https://lucide.dev/icons/italic) |  |',
    ].join('\n'),
    status: 'matched',
  },
  {
    id: 'media',
    label: 'Media',
    markdown: '![Audio](tabs-asset:///assets/song.mp3)',
    status: 'known-gap',
    notes: 'Media widgets remain preview/Toast-backed until the shared preview surface owns safe block widgets.',
  },
  {
    id: 'note-preview',
    label: 'Note preview',
    markdown: '![Linked note](tabs://note/example)',
    status: 'known-gap',
    notes: 'Note preview widgets remain explicit-only and are not mounted for ordinary external links.',
  },
  {
    id: 'next-aisle-3',
    label: 'NEXT! aisle 3',
    markdown: [
      '# Third, probably',
      '',
      '**Alright**',
      '*Italics*',
      '==highlighted==',
      '> block quote? ~~strikeout!~~',
      '---',
      '- dash',
      '',
      '- bullet',
      '',
      '1. task and numbered list does not seem to work',
      '---',
      'Tab indent also is a no go..',
      '',
      '**asdf asdf asdf**',
      '^-- block quote indent also no',
      '![sparkSubtab](<<sparkSubtab--97c129#last position>>)',
      '',
      "Preview doesn't work, ability to add other tabs also not available.",
      '',
      'My inline code: `here`',
      '',
      '```',
      'My code block here',
      '```',
      '',
      '| kjkj | jjjj |',
      '| --- | --- |',
      '|  |  |',
    ].join('\n'),
    status: 'known-gap',
    notes: 'Fixture for active/preview parity work. Tables and embedded preview widgets have safe v1 behavior instead of full rich editing.',
  },
]
