import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import { EDITOR_BLANK_LINE_PLACEHOLDER } from '../markdown/markdown-utils'
import {
  escapeNotePreviewTokensForEditorDisplay,
  getEditorMarkdownForPersistence,
  normalizeEditorNoteLinkDestinationsForPersistence,
  prepareMarkdownForEditorDisplay,
  prepareMarkdownNoteLinkDestinationsForEditorDisplay,
  restoreEditorBlankParagraphs,
  restoreEditorDisplay,
  setEditorMarkdownForDisplay,
} from './editor-markdown-display'

function textBlock(typeName: string, textContent = '', extra: Record<string, unknown> = {}) {
  return {
    type: { name: typeName },
    textContent,
    childCount: textContent ? 1 : 0,
    nodeSize: 1,
    child: () => ({ isText: true, text: textContent, textContent }),
    ...extra,
  }
}

function fakeEditorWithBlocks(blocks: any[]) {
  const deleteRange = vi.fn(function deleteRange(from: number, to: number) {
    tr.deletedRanges.push([from, to])
    return tr
  })
  const insert = vi.fn(function insert(position: number, node: any) {
    tr.insertedNodes.push({ position, node })
    return tr
  })
  const replaceWith = vi.fn(function replaceWith(_from: number, _to: number, nodes: any[]) {
    tr.replacedWith = nodes
    return tr
  })
  const setMeta = vi.fn(function setMeta(key: string, value: unknown) {
    tr.meta[key] = value
    return tr
  })
  const tr: any = {
    meta: {},
    deletedRanges: [],
    insertedNodes: [],
    delete: deleteRange,
    insert,
    replacedWith: null,
    replaceWith,
    setMeta,
  }
  const dispatch = vi.fn()
  const editor = {
    setMarkdown: vi.fn(),
    wwEditor: {
      view: {
        dispatch,
        state: {
          schema: {
            nodes: {
              paragraph: {
                create: () => textBlock('paragraph'),
              },
            },
          },
          tr,
          doc: {
            content: { size: blocks.length },
            forEach: (visitor: (node: any, offset: number) => void) => {
              let offset = 0
              blocks.forEach((node) => {
                visitor(node, offset)
                offset += typeof node.nodeSize === 'number' ? node.nodeSize : 1
              })
            },
            nodesBetween: (_from: number, _to: number, visitor: (node: any, position: number) => void) => {
              blocks.forEach((node, index) => visitor(node, index))
            },
            descendants: (visitor: (node: any, position: number) => void) => {
              blocks.forEach((node, index) => visitor(node, index))
            },
          },
        },
      },
    },
  } as unknown as Editor

  return { editor, tr, dispatch }
}

describe('editor markdown display helpers', () => {
  it('normalizes persisted markdown through the canonical editor gateway', () => {
    const editor = {
      getMarkdown: vi.fn(() => '<mark>text</mark>\n\nplain\u2003\u2003indent'),
    } as unknown as Editor

    expect(getEditorMarkdownForPersistence(editor)).toBe('==text==\n\nplain\u2060\u2003\u2003indent')
  })

  it('uses editor-safe internal note link destinations for display', () => {
    expect(prepareMarkdownForEditorDisplay('[2 aisle](<2 aisle--c761e6>)')).toBe('[2 aisle](2%20aisle--c761e6)')
    expect(prepareMarkdownForEditorDisplay(String.raw`\[strike\]\(https://lucide\.dev/icons/strikethrough\)`)).toBe(
      '[strike](https://lucide.dev/icons/strikethrough)',
    )
    expect(prepareMarkdownForEditorDisplay(String.raw`\[Welcome copy\]\(\<Welcome copy\-\-96d9e4\>\)`)).toBe(
      '[Welcome copy](Welcome%20copy--96d9e4)',
    )
    expect(prepareMarkdownNoteLinkDestinationsForEditorDisplay('![2 aisle](<2 aisle--c761e6>)')).toBe(
      '![2 aisle](2%20aisle--c761e6)',
    )
  })

  it('normalizes escaped annotation lines for editor display', () => {
    expect(prepareMarkdownForEditorDisplay(String.raw`\-\- And this bad boy`)).toBe('-- And this bad boy')
  })

  it('keeps internal note preview tokens as text for the editor preview plugin', () => {
    expect(escapeNotePreviewTokensForEditorDisplay('![Welcome copy](Welcome%20copy--96d9e4)')).toBe(
      String.raw`\!\[Welcome copy\]\(Welcome%20copy--96d9e4\)`,
    )
    expect(prepareMarkdownForEditorDisplay('![Welcome copy](<Welcome copy--96d9e4>)')).toBe(
      String.raw`\!\[Welcome copy\]\(Welcome%20copy--96d9e4\)`,
    )
    expect(prepareMarkdownForEditorDisplay('![Diagram](data:image/png;base64,abc)')).toBe(
      '![Diagram](data:image/png;base64,abc)',
    )
  })

  it('canonicalizes editor-safe internal note link destinations for persistence', () => {
    const editor = {
      getMarkdown: vi.fn(() => '[2 aisle](2%20aisle--c761e6)'),
    } as unknown as Editor

    expect(getEditorMarkdownForPersistence(editor)).toBe('[2 aisle](<2 aisle--c761e6>)')
    expect(normalizeEditorNoteLinkDestinationsForPersistence('[2 aisle](2%20aisle--c761e6)')).toBe(
      '[2 aisle](<2 aisle--c761e6>)',
    )
  })

  it('canonicalizes escaped editor note preview text for persistence', () => {
    const editor = {
      getMarkdown: vi.fn(() => String.raw`\!\[Welcome copy\]\(Welcome%20copy--96d9e4\)`),
    } as unknown as Editor

    expect(getEditorMarkdownForPersistence(editor)).toBe('![Welcome copy](<Welcome copy--96d9e4>)')
  })

  it('leaves web links and code examples alone when normalizing note link destinations', () => {
    const markdown = [
      '[site](https://example.com/has%20space)',
      '`[2 aisle](2%20aisle--c761e6)`',
      '```',
      '[2 aisle](2%20aisle--c761e6)',
      '```',
    ].join('\n')

    expect(normalizeEditorNoteLinkDestinationsForPersistence(markdown)).toBe(markdown)
  })

  it('strips editor blank artifacts from persisted markdown', () => {
    const editor = {
      getMarkdown: vi.fn(() => `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n<br>\n\ntwo`),
    } as unknown as Editor

    expect(getEditorMarkdownForPersistence(editor)).toBe('one\n\n\ntwo')
  })

  it('persists leading visual blank rows from the ProseMirror document', () => {
    const { editor } = fakeEditorWithBlocks([
      textBlock('paragraph'),
      textBlock('paragraph', 'okay'),
      textBlock('paragraph', 'so'),
      textBlock('paragraph', 'these are together.'),
    ])
    Object.assign(editor, {
      getMarkdown: vi.fn(() => 'okay\n\nso\n\nthese are together.'),
    })

    expect(getEditorMarkdownForPersistence(editor)).toBe('\nokay\nso\nthese are together.')
  })

  it('persists trailing visual blank rows from the ProseMirror document', () => {
    const { editor } = fakeEditorWithBlocks([
      textBlock('paragraph', 'okay'),
      textBlock('paragraph', 'so'),
      textBlock('paragraph'),
      textBlock('paragraph'),
    ])
    Object.assign(editor, {
      getMarkdown: vi.fn(() => 'okay\n\nso'),
    })

    expect(getEditorMarkdownForPersistence(editor)).toBe('okay\nso\n\n')
  })

  it('passes markdown without blank sentinels to Toast UI and restores blank paragraphs in ProseMirror', () => {
    const { editor, tr, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'one'),
      textBlock('paragraph', 'two'),
    ])

    setEditorMarkdownForDisplay(editor, `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)

    expect(editor.setMarkdown).toHaveBeenCalledWith('one\n\ntwo', false)
    expect(tr.replaceWith).not.toHaveBeenCalled()
    expect(tr.insertedNodes.map((entry: any) => [entry.position, entry.node.textContent])).toEqual([[1, '']])
    expect(tr.meta.addToHistory).toBe(false)
    expect(dispatch).toHaveBeenCalled()
  })

  it('restores blank paragraphs without replacing hyperlink content nodes', () => {
    const linkMark = { type: { name: 'link' }, attrs: { href: 'https://example.com' } }
    const { editor, tr, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'one', { marks: [linkMark] }),
      textBlock('paragraph', 'two', { marks: [linkMark] }),
    ])

    expect(restoreEditorBlankParagraphs(editor, `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)).toBe(true)

    expect(tr.replaceWith).not.toHaveBeenCalled()
    expect(tr.insertedNodes).toHaveLength(1)
    expect(tr.insertedNodes[0].position).toBe(1)
    expect(dispatch).toHaveBeenCalled()
  })

  it('deletes extra blank paragraphs without replacing surrounding content', () => {
    const { editor, tr, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'one'),
      textBlock('paragraph'),
      textBlock('paragraph'),
      textBlock('paragraph', 'two'),
    ])

    expect(restoreEditorBlankParagraphs(editor, `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)).toBe(true)

    expect(tr.replaceWith).not.toHaveBeenCalled()
    expect(tr.deletedRanges).toEqual([[2, 3]])
    expect(dispatch).toHaveBeenCalled()
  })

  it('restores blanks when Toast splits plain markdown lines into separate content blocks', () => {
    const { editor, tr, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'first'),
      textBlock('paragraph', 'second'),
      textBlock('paragraph', 'A'),
      textBlock('paragraph', 'B'),
    ])

    expect(restoreEditorBlankParagraphs(editor, [
      'first',
      'second',
      '',
      'A',
      '',
      '',
      '',
      'B',
    ].join('\n'))).toBe(true)

    expect(tr.replaceWith).not.toHaveBeenCalled()
    expect(tr.insertedNodes.map((entry: any) => entry.node.textContent)).toEqual(['', '', '', ''])
    expect(dispatch).toHaveBeenCalled()
  })

  it('keeps editor display restore pending when Toast has not produced the expected content blocks', () => {
    const { editor, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'one two'),
    ])

    expect(restoreEditorDisplay(editor, [
      'one',
      '',
      '',
      'two',
    ].join('\n'))).toEqual({
      restored: false,
      viewReady: true,
      displayReady: false,
    })

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('marks editor display restore ready when the blank paragraph layout already matches', () => {
    const { editor, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'one'),
      textBlock('paragraph'),
      textBlock('paragraph'),
      textBlock('paragraph', 'two'),
    ])

    expect(restoreEditorDisplay(editor, [
      'one',
      '',
      '',
      'two',
    ].join('\n'))).toEqual({
      restored: false,
      viewReady: true,
      displayReady: true,
    })

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('repairs broken table markdown before passing it to Toast UI', () => {
    const { editor } = fakeEditorWithBlocks([textBlock('table')])
    const brokenTable = [
      String.raw`\| A \| B \|`,
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      String.raw`\| \-\-\- \| \-\-\- \|`,
      '',
      String.raw`\| C \| D \|`,
    ].join('\n')

    setEditorMarkdownForDisplay(editor, brokenTable)

    expect(editor.setMarkdown).toHaveBeenCalledWith([
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
    ].join('\n'), false)
  })

  it('removes parser-only table spacing without replacing table content', () => {
    const { editor, tr, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'before'),
      textBlock('paragraph'),
      textBlock('table', 'A B C D'),
    ])

    expect(restoreEditorBlankParagraphs(editor, [
      'before',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
    ].join('\n'))).toBe(true)

    expect(tr.replaceWith).not.toHaveBeenCalled()
    expect(tr.deletedRanges).toEqual([[1, 2]])
    expect(tr.insertedNodes).toHaveLength(0)
    expect(dispatch).toHaveBeenCalled()
  })

  it('restores trailing blank paragraphs after table markdown without replacing table content', () => {
    const { editor, tr, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'before'),
      textBlock('table', 'A B C D'),
    ])

    expect(restoreEditorBlankParagraphs(editor, [
      'before',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      '',
      '',
    ].join('\n'))).toBe(true)

    expect(tr.replaceWith).not.toHaveBeenCalled()
    expect(tr.insertedNodes.map((entry: any) => [entry.position, entry.node.textContent])).toEqual([
      [2, ''],
      [3, ''],
      [4, ''],
    ])
    expect(dispatch).toHaveBeenCalled()
  })

  it('still restores explicit blank placeholders around table markdown', () => {
    const { editor, tr, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'before'),
      textBlock('table', 'A B C D'),
      textBlock('paragraph', 'after'),
    ])

    expect(restoreEditorBlankParagraphs(editor, [
      'before',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      'after',
    ].join('\n'))).toBe(true)

    expect(tr.insertedNodes).toHaveLength(2)
    expect(dispatch).toHaveBeenCalled()
  })

  it('keeps explicit blank paragraphs before a table when markdown contains the blank', () => {
    const { editor, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'before'),
      textBlock('paragraph'),
      textBlock('table', 'A B C D'),
    ])

    expect(restoreEditorBlankParagraphs(editor, [
      'before',
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
    ].join('\n'))).toBe(false)

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not restore blank paragraphs when content block counts do not match', () => {
    const { editor, dispatch } = fakeEditorWithBlocks([textBlock('paragraph', 'one')])

    expect(restoreEditorBlankParagraphs(editor, `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not dispatch when blank paragraph layout already matches the expected document', () => {
    const { editor, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'one'),
      textBlock('paragraph'),
      textBlock('paragraph', 'two'),
    ])

    expect(restoreEditorBlankParagraphs(editor, `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
