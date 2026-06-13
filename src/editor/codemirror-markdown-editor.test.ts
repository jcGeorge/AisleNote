import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  buildRenderedMarkdownDecorationPlanFromLines,
  buildRenderedMarkdownTableBlockPlanFromLines,
  getCodeMirrorCursorSelection,
  getCodeMirrorDocSize,
  getRenderedMarkdownEditableTableKey,
  getRenderedMarkdownTableCellParts,
  restoreCodeMirrorSelection,
  type RenderedMarkdownLine,
} from './codemirror-markdown-editor'

const codeMirrorMarkdownEditorSource = readFileSync(
  fileURLToPath(new URL('./codemirror-markdown-editor.ts', import.meta.url)),
  'utf8',
)

function linesFromMarkdown(markdown: string): RenderedMarkdownLine[] {
  let from = 0
  return markdown.split('\n').map((text, index) => {
    const line = {
      from,
      to: from + text.length,
      number: index + 1,
      text,
    }
    from += text.length + 1
    return line
  })
}

function fakeCodeMirrorView({
  docLength,
  anchor,
  head,
  dispatch,
  focus,
}: {
  docLength: number
  anchor: number
  head: number
  dispatch?: (spec: unknown) => void
  focus?: () => void
}) {
  return {
    state: {
      doc: { length: docLength },
      selection: { main: { anchor, head } },
    },
    dispatch: dispatch ?? (() => undefined),
    focus: focus ?? (() => undefined),
  } as never
}

function hiddenRanges(markdown: string) {
  return buildRenderedMarkdownDecorationPlanFromLines(linesFromMarkdown(markdown))
    .replacements
    .filter((replacement) => replacement.kind === 'hidden')
    .map((replacement) => markdown.slice(replacement.from, replacement.to))
}

describe('CodeMirror rendered Markdown decoration plan', () => {
  it('keeps link-heavy table previews viewport-scoped instead of rebuilding the full document state field', () => {
    expect(codeMirrorMarkdownEditorSource).toContain('const CODEMIRROR_TABLE_PREVIEW_CONTEXT_LINE_COUNT = 80')
    expect(codeMirrorMarkdownEditorSource).toContain('function collectBufferedRenderedMarkdownLines(')
    expect(codeMirrorMarkdownEditorSource).toContain('const visibleRanges = getCodeMirrorVisibleRanges(view)')
    expect(codeMirrorMarkdownEditorSource).toContain('return ViewPlugin.fromClass(')
    expect(codeMirrorMarkdownEditorSource).not.toContain('StateField.define<CodeMirrorTablePreviewState>')
    expect(codeMirrorMarkdownEditorSource).not.toContain('collectRenderedMarkdownLinesFromState')
  })

  it('debounces CodeMirror Markdown emission and flushes on save boundaries', () => {
    expect(codeMirrorMarkdownEditorSource).toContain('const CODEMIRROR_MARKDOWN_CHANGE_DEBOUNCE_MS = 450')
    expect(codeMirrorMarkdownEditorSource).toContain('scheduleCodeMirrorChange(update.state)')
    expect(codeMirrorMarkdownEditorSource).toContain("flushPendingCodeMirrorChange('blur')")
    expect(codeMirrorMarkdownEditorSource).toContain("flushPendingCodeMirrorChange('destroy')")
    expect(codeMirrorMarkdownEditorSource).toContain("flushPendingCodeMirrorChange('snapshot')")
    expect(codeMirrorMarkdownEditorSource).not.toContain('onChange(update.state.doc.toString())')
  })

  it('hides heading markers while styling the visible heading text', () => {
    const markdown = '# My Header'
    const plan = buildRenderedMarkdownDecorationPlanFromLines(linesFromMarkdown(markdown))

    expect(hiddenRanges(markdown)).toContain('# ')
    expect(plan.lines[0]?.className).toContain('tabs-cm-rendered-heading-line-1')
    expect(plan.marks).toContainEqual({
      from: 2,
      to: markdown.length,
      className:
        'tabs-rendered-markdown-heading tabs-rendered-markdown-heading-1 tabs-cm-rendered-heading-text tabs-cm-rendered-heading-1',
    })
  })

  it('renders Markdown links as the label while hiding brackets and destination', () => {
    const markdown = '[copy](https://lucide.dev/icons/files)'
    const plan = buildRenderedMarkdownDecorationPlanFromLines(linesFromMarkdown(markdown))

    expect(hiddenRanges(markdown)).toEqual(['[', '](https://lucide.dev/icons/files)'])
    expect(plan.marks).toContainEqual({
      from: 1,
      to: 5,
      className: 'tabs-rendered-markdown-link tabs-cm-rendered-link',
      attrs: { 'data-tabs-link-url': 'https://lucide.dev/icons/files' },
    })
  })

  it('does not add duplicate bare-url marks for URLs inside Markdown links', () => {
    const markdown = '[copy](https://lucide.dev/icons/files) [undo](https://lucide.dev/icons/undo)'
    const plan = buildRenderedMarkdownDecorationPlanFromLines(linesFromMarkdown(markdown))

    expect(plan.marks.filter((mark) => mark.className === 'tabs-rendered-markdown-link tabs-cm-rendered-link')).toEqual([
      {
        from: 1,
        to: 5,
        className: 'tabs-rendered-markdown-link tabs-cm-rendered-link',
        attrs: { 'data-tabs-link-url': 'https://lucide.dev/icons/files' },
      },
      {
        from: 40,
        to: 44,
        className: 'tabs-rendered-markdown-link tabs-cm-rendered-link',
        attrs: { 'data-tabs-link-url': 'https://lucide.dev/icons/undo' },
      },
    ])
  })

  it('uses the app tag extractor so visible nested tags match preview behavior', () => {
    const markdown = 'Track #nested/tag and `#ignored`'
    const plan = buildRenderedMarkdownDecorationPlanFromLines(linesFromMarkdown(markdown))

    expect(plan.marks).toContainEqual({
      from: 6,
      to: 17,
      className: 'tabs-tag-token',
      attrs: {
        'data-tabs-tag': 'nested/tag',
        'data-app-tooltip': 'filter by tag',
      },
    })
    expect(plan.marks.some((mark) =>
      mark.className === 'tabs-tag-token' && markdown.slice(mark.from, mark.to) === '#ignored',
    )).toBe(false)
  })

  it('replaces task/list markers without dropping the authored Markdown source', () => {
    const markdown = '- [x] done\n- item\n1. ordered'
    const plan = buildRenderedMarkdownDecorationPlanFromLines(linesFromMarkdown(markdown))

    expect(plan.replacements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: 0,
        to: 6,
        kind: 'task-marker',
        label: '☑',
        className: 'tabs-rendered-markdown-task-marker tabs-cm-task-marker is-checked',
      }),
      expect.objectContaining({
        from: 11,
        to: 13,
        kind: 'list-marker',
        label: '•',
        className: 'tabs-rendered-markdown-list-marker tabs-cm-list-marker',
      }),
      expect.objectContaining({
        from: 18,
        to: 21,
        kind: 'list-marker',
        label: '1.',
        className: 'tabs-rendered-markdown-list-marker tabs-cm-list-marker tabs-cm-ordered-marker',
      }),
    ]))
  })

  it('styles GFM table source without installing unsafe block widgets from the view plugin', () => {
    const markdown = [
      '| [copy](https://lucide.dev/icons/files) |  |',
      '| ---- | --- |',
      '| [undo](https://lucide.dev/icons/undo) |  |',
    ].join('\n')
    const plan = buildRenderedMarkdownDecorationPlanFromLines(linesFromMarkdown(markdown))

    expect(plan.replacements.some((replacement) => replacement.kind === 'hidden')).toBe(false)
    expect(plan.lines).toEqual([
      {
        from: 0,
        className:
          'tabs-rendered-markdown-table-source-line tabs-cm-rendered-table-source-line cm-tabs-table-line',
      },
      {
        from: 46,
        className:
          'tabs-rendered-markdown-table-source-line tabs-rendered-markdown-table-delimiter-line tabs-cm-rendered-table-source-line tabs-cm-rendered-table-delimiter-line cm-tabs-table-line',
      },
      {
        from: 61,
        className:
          'tabs-rendered-markdown-table-source-line tabs-cm-rendered-table-source-line cm-tabs-table-line',
      },
    ])
  })

  it('plans table preview blocks outside the active selection and exposes source inside the table', () => {
    const markdown = [
      '| [copy](https://lucide.dev/icons/files) |  |',
      '| ---- | --- |',
      '| [undo](https://lucide.dev/icons/undo) |  |',
    ].join('\n')
    const lines = linesFromMarkdown(markdown)

    expect(buildRenderedMarkdownTableBlockPlanFromLines(lines)).toEqual([
      {
        from: 0,
        to: markdown.length,
        rows: [
          ['[copy](https://lucide.dev/icons/files)', ''],
          ['[undo](https://lucide.dev/icons/undo)', ''],
        ],
      },
    ])
    expect(buildRenderedMarkdownTableBlockPlanFromLines(lines, { editableRanges: [{ from: 1, to: 1 }] })).toEqual([])
  })

  it('plans valid one-column GFM tables for CodeMirror table widgets', () => {
    const markdown = [
      '| [copy](https://lucide.dev/icons/files) |',
      '| ---- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) |',
      '| [aisles](https://lucide.dev/icons/shelving-unit) |',
    ].join('\n')
    const lines = linesFromMarkdown(markdown)
    const plan = buildRenderedMarkdownDecorationPlanFromLines(lines)

    expect(plan.lines).toHaveLength(4)
    expect(plan.lines[1]?.className).toContain('tabs-cm-rendered-table-delimiter-line')
    expect(buildRenderedMarkdownTableBlockPlanFromLines(lines)).toEqual([
      {
        from: 0,
        to: markdown.length,
        rows: [
          ['[copy](https://lucide.dev/icons/files)'],
          ['[tableOfContents](https://lucide.dev/icons/table-of-contents)'],
          ['[aisles](https://lucide.dev/icons/shelving-unit)'],
        ],
      },
    ])
  })

  it('parses rendered table cell links as labels for table widget cells', () => {
    expect(getRenderedMarkdownTableCellParts('[copy](https://lucide.dev/icons/files)')).toEqual([
      { kind: 'link', text: 'copy', url: 'https://lucide.dev/icons/files' },
    ])
    expect(getRenderedMarkdownTableCellParts('icon: ![diagram](tabs-asset:///assets/diagram.png)')).toEqual([
      { kind: 'text', text: 'icon: ' },
      { kind: 'image', text: 'diagram', url: 'tabs-asset:///assets/diagram.png' },
    ])
  })

  it('keeps table preview state stable for selection changes outside table blocks', () => {
    const markdown = [
      'Before',
      '',
      '| [copy](https://lucide.dev/icons/files) |  |',
      '| ---- | --- |',
      '| [undo](https://lucide.dev/icons/undo) |  |',
      '',
      'After',
    ].join('\n')
    const blocks = buildRenderedMarkdownTableBlockPlanFromLines(linesFromMarkdown(markdown))
    const tableBlock = blocks[0]!

    expect(tableBlock).toBeDefined()
    expect(getRenderedMarkdownEditableTableKey(blocks, [{ from: 0, to: 0 }])).toBe('')
    expect(getRenderedMarkdownEditableTableKey(blocks, [{ from: markdown.length, to: markdown.length }])).toBe('')
    expect(getRenderedMarkdownEditableTableKey(blocks, [{ from: tableBlock.from + 1, to: tableBlock.from + 1 }])).toBe('0')
  })

  it('renders horizontal rules as a replacement instead of visible source markers', () => {
    const markdown = '---'
    const plan = buildRenderedMarkdownDecorationPlanFromLines(linesFromMarkdown(markdown))

    expect(plan.replacements).toContainEqual({
      from: 0,
      to: 3,
      kind: 'hr',
      className: 'tabs-rendered-markdown-hr tabs-cm-rendered-hr',
    })
    expect(plan.marks).toEqual([])
  })

  it('keeps a selected table editable instead of replacing it with the preview widget', () => {
    const markdown = [
      '| [copy](https://lucide.dev/icons/files) |  |',
      '| ---- | --- |',
      '| [undo](https://lucide.dev/icons/undo) |  |',
    ].join('\n')
    const plan = buildRenderedMarkdownDecorationPlanFromLines(linesFromMarkdown(markdown), {
      editableRanges: [{ from: 1, to: 1 }],
    })

    expect(plan.lines.some((line) => line.className.includes('tabs-cm-rendered-table-source-line'))).toBe(true)
  })

  it('hides code fences while styling fenced code contents', () => {
    const markdown = ['```ts', 'const value = "#not-a-tag"', '```'].join('\n')
    const lines = linesFromMarkdown(markdown).map((line) => ({
      ...line,
      isFenceBoundary: line.text.startsWith('```'),
      isInsideFence: line.number === 2,
    }))
    const plan = buildRenderedMarkdownDecorationPlanFromLines(lines)

    expect(hiddenRanges(markdown)).toEqual(['```ts', '```'])
    expect(plan.lines).toEqual([{
      from: 6,
      className: 'tabs-rendered-markdown-code-block-line tabs-cm-rendered-code-block-line',
    }])
    expect(plan.marks.some((mark) => mark.className === 'tabs-tag-token')).toBe(false)
  })
})

describe('CodeMirror cursor helpers', () => {
  it('reads cursor selections and document size from the CodeMirror view', () => {
    const view = fakeCodeMirrorView({ docLength: 42, anchor: 8, head: 14 })

    expect(getCodeMirrorCursorSelection(view)).toEqual({ anchor: 8, head: 14 })
    expect(getCodeMirrorDocSize(view)).toBe(42)
  })

  it('clamps restored cursor selections to the document and focuses by default', () => {
    const dispatch = vi.fn()
    const focus = vi.fn()
    const view = fakeCodeMirrorView({ docLength: 10, anchor: 0, head: 0, dispatch, focus })

    expect(restoreCodeMirrorSelection(view, { anchor: 99, head: -4 })).toBe(true)

    const dispatched = dispatch.mock.calls[0]?.[0] as {
      selection: { anchor: number; head: number }
      scrollIntoView: boolean
    }
    const selection = dispatched.selection
    expect(selection.anchor).toBe(10)
    expect(selection.head).toBe(0)
    expect(dispatched.scrollIntoView).toBe(true)
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('can restore CodeMirror selections without focusing', () => {
    const dispatch = vi.fn()
    const focus = vi.fn()
    const view = fakeCodeMirrorView({ docLength: 10, anchor: 0, head: 0, dispatch, focus })

    expect(restoreCodeMirrorSelection(view, { anchor: 4, head: 4 }, { focus: false })).toBe(true)

    const dispatched = dispatch.mock.calls[0]?.[0] as { selection: { anchor: number; head: number } }
    expect(dispatched.selection.anchor).toBe(4)
    expect(dispatched.selection.head).toBe(4)
    expect(focus).not.toHaveBeenCalled()
  })
})
