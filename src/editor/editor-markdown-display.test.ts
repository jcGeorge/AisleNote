import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import {
  BLOCK_INDENT_TOKEN,
  EDITOR_BLANK_LINE_PLACEHOLDER,
  INDENT_TOKEN,
} from '../markdown/markdown-utils'
import {
  applyMarkdownHighlightDelimitersToEditorDisplay,
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

function parentBlock(typeName: string, children: any[], extra: Record<string, unknown> = {}) {
  return {
    type: { name: typeName },
    textContent: children.map((child) => child.textContent ?? '').join(''),
    childCount: children.length,
    nodeSize: children.length + 2,
    child: (index: number) => children[index],
    forEach: (visitor: (node: any, offset: number) => void) => {
      let offset = 0
      children.forEach((child) => {
        visitor(child, offset)
        offset += typeof child.nodeSize === 'number' ? child.nodeSize : 1
      })
    },
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

const highlightSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
  },
  marks: {
    link: {
      attrs: { href: {} },
      toDOM: (mark) => ['a', { href: mark.attrs.href }, 0],
    },
    mark: {
      toDOM: () => ['mark', 0],
    },
    code: {
      code: true,
      toDOM: () => ['code', 0],
    },
  },
})

function highlightParagraph(children: any[]) {
  return highlightSchema.nodes.paragraph.create(null, children)
}

function fakeEditorWithProseMirrorDoc(doc: any) {
  let currentState = EditorState.create({ schema: highlightSchema, doc })
  const view: any = {
    get state() {
      return currentState
    },
    dispatch: vi.fn((transaction: any) => {
      currentState = currentState.apply(transaction)
    }),
  }
  const editor = { wwEditor: { view } } as unknown as Editor
  return {
    editor,
    view,
    getState: () => currentState,
  }
}

function textSegments(node: any): Array<{ text: string; marks: string[] }> {
  const segments: Array<{ text: string; marks: string[] }> = []
  node.descendants((child: any) => {
    if (!child?.isText) return true
    segments.push({
      text: child.text,
      marks: child.marks.map((mark: any) => mark.type.name),
    })
    return false
  })
  return segments
}

describe('editor markdown display helpers', () => {
  it('normalizes persisted markdown through the canonical editor gateway', () => {
    const editor = {
      getMarkdown: vi.fn(() => '<mark>text</mark>\n\nplain\u2003\u2003indent'),
    } as unknown as Editor

    expect(getEditorMarkdownForPersistence(editor)).toBe('==text==\n\nplain\u2060\u2003\u2003indent')
  })

  it('preserves live blockquote paragraph spacing when Toast serializes quoted text compactly', () => {
    const quotedText = '5    The altar was also split apart, and the ashes poured out from the altar.'
    const { editor } = fakeEditorWithBlocks([
      parentBlock('blockQuote', [textBlock('paragraph', quotedText)]),
      textBlock('paragraph'),
      textBlock('paragraph', '-- 1 Kings 13:1-10'),
    ])
    Object.assign(editor, {
      getMarkdown: vi.fn(() => [
        '> 5 The altar was also split apart, and the ashes poured out from the altar.',
        '',
        String.raw`\-\- 1 Kings 13:1\-10`,
      ].join('\n')),
    })

    expect(getEditorMarkdownForPersistence(editor)).toBe([
      `> ${quotedText}`,
      '',
      '-- 1 Kings 13:1-10',
    ].join('\n'))
  })

  it('uses tab-block wrappers for persisted block indents and internal tokens for display', () => {
    const editor = {
      getMarkdown: vi.fn(() => `${BLOCK_INDENT_TOKEN}indented`),
    } as unknown as Editor

    expect(getEditorMarkdownForPersistence(editor)).toBe([
      '<div tab-block="1">',
      '',
      'indented',
      '',
      '</div>',
    ].join('\n'))
    expect(prepareMarkdownForEditorDisplay([
      '<div tab-block="2">',
      '',
      'indented',
      '',
      '</div>',
    ].join('\n'))).toBe(`${BLOCK_INDENT_TOKEN.repeat(2)}indented`)
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

  it('leaves linked highlight markers for the editor document pass', () => {
    expect(prepareMarkdownForEditorDisplay('==plain==')).toBe('<mark>plain</mark>')
    expect(prepareMarkdownForEditorDisplay('==[Specs](<Specs--abcdef>)==')).toBe(
      '==[Specs](Specs--abcdef)==',
    )
  })

  it('converts linked highlight delimiters into composable editor marks', () => {
    const linkMark = highlightSchema.marks.link.create({ href: 'Specs--abcdef' })
    const doc = highlightSchema.nodes.doc.create(null, [
      highlightParagraph([
        highlightSchema.text('==For '),
        highlightSchema.text('Specs', [linkMark]),
        highlightSchema.text(' now=='),
      ]),
    ])
    const mounted = fakeEditorWithProseMirrorDoc(doc)

    expect(applyMarkdownHighlightDelimitersToEditorDisplay(mounted.editor)).toBe(true)

    const paragraph = mounted.getState().doc.child(0)
    expect(paragraph.textContent).toBe('For Specs now')
    expect(textSegments(paragraph)).toEqual([
      { text: 'For ', marks: ['mark'] },
      { text: 'Specs', marks: ['link', 'mark'] },
      { text: ' now', marks: ['mark'] },
    ])
    expect(mounted.view.dispatch).toHaveBeenCalledOnce()
  })

  it('does not consume highlight-looking delimiters inside inline code', () => {
    const codeMark = highlightSchema.marks.code.create()
    const doc = highlightSchema.nodes.doc.create(null, [
      highlightParagraph([
        highlightSchema.text('==[Specs](Specs--abcdef)==', [codeMark]),
      ]),
    ])
    const mounted = fakeEditorWithProseMirrorDoc(doc)

    expect(applyMarkdownHighlightDelimitersToEditorDisplay(mounted.editor)).toBe(false)
    expect(mounted.getState().doc.textContent).toBe('==[Specs](Specs--abcdef)==')
    expect(mounted.view.dispatch).not.toHaveBeenCalled()
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

  it('strips blank placeholders before Toast UI and restores the ProseMirror layout once', () => {
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

  it('uses compact display markdown for table-adjacent blanks and lets restore own visual spacing', () => {
    const markdown = [
      'before',
      '',
      '',
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      '',
      'after',
    ].join('\n')
    const displayMarkdown = prepareMarkdownForEditorDisplay(markdown)

    expect(displayMarkdown).toBe([
      'before',
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      'after',
    ].join('\n'))
  })

  it('keeps restored table-adjacent blank paragraphs stable through persistence', () => {
    const source = [
      'before',
      '',
      '',
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      '',
      'after',
    ].join('\n')
    const { editor } = fakeEditorWithBlocks([
      textBlock('paragraph', 'before'),
      textBlock('paragraph'),
      textBlock('paragraph'),
      textBlock('paragraph'),
      textBlock('table', 'A B C D'),
      textBlock('paragraph'),
      textBlock('paragraph'),
      textBlock('paragraph', 'after'),
    ])
    Object.assign(editor, {
      getMarkdown: vi.fn(() => [
        'before',
        '',
        '| A | B |',
        '| --- | --- |',
        '| C | D |',
        '',
        'after',
      ].join('\n')),
    })

    for (let index = 0; index < 5; index += 1) {
      expect(getEditorMarkdownForPersistence(editor)).toBe(source)
    }
  })

  it('preserves restored tab-block and table-adjacent blank paragraphs before persistence normalization', () => {
    const indentedText = 'I\u2019ve got enough to make the plan concrete.'
    const source = [
      '# Completed items Yazoo xyq',
      'I remember when theis app ran well.',
      'Okay, this si still slow. Which is fine.',
      '',
      'Even here, this item is still slow.',
      'SUre.',
      '',
      '<div tab-block="2">',
      '',
      indentedText,
      '',
      '</div>',
      `${INDENT_TOKEN}${indentedText}`,
      '',
      '| [copy](https://lucide.dev/icons/files) |',
      '| ---- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) |',
    ].join('\n')
    const editorMarkdown = [
      '# Completed items Yazoo xyq',
      '',
      'I remember when theis app ran well.',
      'Okay, this si still slow. Which is fine.',
      '',
      'Even here, this item is still slow.',
      'SUre.',
      '',
      `${BLOCK_INDENT_TOKEN.repeat(2)}${indentedText}`,
      `${INDENT_TOKEN}${indentedText}`,
      '',
      '| [copy](https://lucide.dev/icons/files) |',
      '| ---- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) |',
    ].join('\n')
    const { editor } = fakeEditorWithBlocks([
      textBlock('heading', 'Completed items Yazoo xyq'),
      textBlock('paragraph', 'I remember when theis app ran well.'),
      textBlock('paragraph', 'Okay, this si still slow. Which is fine.'),
      textBlock('paragraph'),
      textBlock('paragraph', 'Even here, this item is still slow.'),
      textBlock('paragraph', 'SUre.'),
      textBlock('paragraph'),
      textBlock('paragraph', `${BLOCK_INDENT_TOKEN.repeat(2)}${indentedText}`),
      textBlock('paragraph', `${INDENT_TOKEN}${indentedText}`),
      textBlock('paragraph'),
      textBlock('table', 'copytableOfContents'),
    ])
    Object.assign(editor, {
      getMarkdown: vi.fn(() => editorMarkdown),
    })

    expect(getEditorMarkdownForPersistence(editor)).toBe(source)
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

  it('observes placeholder-backed display readiness without mutating the editor document', () => {
    const { editor, tr, dispatch } = fakeEditorWithBlocks([
      textBlock('paragraph', 'one'),
      textBlock('paragraph'),
      textBlock('paragraph', 'two'),
    ])

    expect(restoreEditorDisplay(editor, `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)).toEqual({
      restored: false,
      viewReady: true,
      displayReady: true,
    })

    expect(tr.replaceWith).not.toHaveBeenCalled()
    expect(tr.insertedNodes).toEqual([])
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

  it('keeps the table-adjacent cursor theft fixture as paragraph plus table display markdown', () => {
    const fixture = [
      '# Completed items Yazoo xyq',
      'I remember when theis app ran well.',
      'Okay, this si still slow. Which is fine.',
      'Even here, this item is still slow.',
      'SUre.',
      '<div tab-block="2">',
      '',
      'I\u2019ve got enough to make the plan concrete. The implementation should not try to force synchronous disk writes on every keystroke; it should restore the missing \u201cedit buffer becomes canonical state\u201d path, then flush that state at the right boundaries.',
      '',
      '</div>',
      '\u2060\u2003\u2003I\u2019ve got enough to make the plan concrete. The implementation should not try to force synchronous disk writes on every keystroke; it should restore the missing \u201cedit buffer becomes canonical state\u201d path, then flush that state at the right boundaries.',
      '| [copy](https://lucide.dev/icons/files) |',
      '| ---- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) |',
      '| [aisles](https://lucide.dev/icons/shelving-unit) |',
      '| [findReplace](https://lucide.dev/icons/search) |',
      '| [undo](https://lucide.dev/icons/undo) |',
      '| [redo](https://lucide.dev/icons/redo) |',
    ].join('\n')

    expect(prepareMarkdownForEditorDisplay(fixture)).toBe([
      '# Completed items Yazoo xyq',
      '',
      'I remember when theis app ran well.',
      'Okay, this si still slow. Which is fine.',
      'Even here, this item is still slow.',
      'SUre.',
      `${BLOCK_INDENT_TOKEN.repeat(2)}I\u2019ve got enough to make the plan concrete. The implementation should not try to force synchronous disk writes on every keystroke; it should restore the missing \u201cedit buffer becomes canonical state\u201d path, then flush that state at the right boundaries.`,
      `${INDENT_TOKEN}I\u2019ve got enough to make the plan concrete. The implementation should not try to force synchronous disk writes on every keystroke; it should restore the missing \u201cedit buffer becomes canonical state\u201d path, then flush that state at the right boundaries.`,
      '',
      '| [copy](https://lucide.dev/icons/files) |',
      '| ---- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) |',
      '| [aisles](https://lucide.dev/icons/shelving-unit) |',
      '| [findReplace](https://lucide.dev/icons/search) |',
      '| [undo](https://lucide.dev/icons/undo) |',
      '| [redo](https://lucide.dev/icons/redo) |',
    ].join('\n'))
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
