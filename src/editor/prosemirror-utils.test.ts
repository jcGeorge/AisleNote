import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import type { Editor } from '@toast-ui/editor'

const historySpies = vi.hoisted(() => ({
  redo: vi.fn(),
  undo: vi.fn(),
}))

vi.mock('prosemirror-history', () => ({
  redo: historySpies.redo,
  undo: historySpies.undo,
}))

import {
  createLinkMark,
  getExternalLinkRangeAtDocPosition,
  getInternalNoteLinkHitAtDocPosition,
  getLinkMarkAttrs,
  getNoteMentionQueryAtSelection,
  getTagAutocompleteQueryAtSelection,
  insertParagraphAfterInternalNoteLink,
  isProseMirrorDocMeaningful,
  markWysiwygLoadedUndoBoundary,
  restoreEditorCursorSelection,
  runWysiwygHistory,
  shouldBlockWysiwygUndo,
} from './prosemirror-utils'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    image: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { src: {} },
      toDOM: (node) => ['img', { src: node.attrs.src }],
    },
    table: {
      group: 'block',
      atom: true,
      toDOM: () => ['table', ['tbody', 0]],
    },
    thematicBreak: {
      group: 'block',
      atom: true,
      toDOM: () => ['hr'],
    },
    blockQuote: {
      group: 'block',
      content: 'block+',
      toDOM: () => ['blockquote', 0],
    },
  },
  marks: {
    link: {
      attrs: { href: {} },
      toDOM: (mark) => ['a', { href: mark.attrs.href }, 0],
    },
  },
})

const linkUrlSchema = new Schema({
  nodes: schema.spec.nodes,
  marks: {
    link: {
      attrs: { linkUrl: {} },
      toDOM: (mark) => ['a', { href: mark.attrs.linkUrl }, 0],
    },
  },
})

describe('wysiwyg history commands', () => {
  beforeEach(() => {
    historySpies.redo.mockReset()
    historySpies.undo.mockReset()
  })

  const docForBlocks = (...blocks: any[]) => schema.nodes.doc.create(null, blocks)
  const paragraph = (text = '') => schema.nodes.paragraph.create(null, text ? [schema.text(text)] : undefined)

  it('runs undo against the active wysiwyg editor view', () => {
    const transaction = { doc: docForBlocks(paragraph('before')), docChanged: true }
    const view = { state: { doc: docForBlocks(paragraph('after')) }, dispatch: vi.fn() }
    const editor = { wwEditor: { view }, focus: vi.fn() }
    historySpies.undo.mockImplementation((_state, dispatch) => {
      dispatch?.(transaction)
      return true
    })

    expect(runWysiwygHistory(editor as unknown as Editor, 'undo')).toBe('applied')
    expect(historySpies.undo).toHaveBeenCalledWith(view.state, expect.any(Function), view)
    expect(view.dispatch).toHaveBeenCalledWith(transaction)
    expect(editor.focus).toHaveBeenCalledOnce()
  })

  it('runs redo and leaves focus alone when history does not change', () => {
    const view = { state: { doc: docForBlocks(paragraph('after')) }, dispatch: vi.fn() }
    const editor = { wwEditor: { view }, focus: vi.fn() }
    historySpies.redo.mockReturnValue(false)

    expect(runWysiwygHistory(editor as unknown as Editor, 'redo')).toBe('unavailable')
    expect(historySpies.redo).toHaveBeenCalledWith(view.state, expect.any(Function), view)
    expect(editor.focus).not.toHaveBeenCalled()
  })

  it('blocks undo that would clear protected loaded content', () => {
    const transaction = { doc: docForBlocks(paragraph()), docChanged: true }
    const view = { state: { doc: docForBlocks(paragraph('keep me')) }, dispatch: vi.fn() }
    const editor = { wwEditor: { view }, focus: vi.fn() }
    markWysiwygLoadedUndoBoundary(editor as unknown as Editor)
    historySpies.undo.mockImplementation((_state, dispatch) => {
      dispatch?.(transaction)
      return true
    })

    expect(runWysiwygHistory(editor as unknown as Editor, 'undo')).toBe('blocked')
    expect(view.dispatch).not.toHaveBeenCalled()
    expect(editor.focus).not.toHaveBeenCalled()
  })

  it('allows undo that clears current-session first-line content without a loaded boundary', () => {
    const transaction = { doc: docForBlocks(paragraph()), docChanged: true }
    const view = { state: { doc: docForBlocks(paragraph('typed now')) }, dispatch: vi.fn() }
    const editor = { wwEditor: { view }, focus: vi.fn() }
    historySpies.undo.mockImplementation((_state, dispatch) => {
      dispatch?.(transaction)
      return true
    })

    expect(runWysiwygHistory(editor as unknown as Editor, 'undo')).toBe('applied')
    expect(view.dispatch).toHaveBeenCalledWith(transaction)
  })

  it('allows undo that clears first-line content after the editor loaded empty', () => {
    const emptyDoc = docForBlocks(paragraph())
    const transaction = { doc: emptyDoc, docChanged: true }
    const view = { state: { doc: emptyDoc }, dispatch: vi.fn() }
    const editor = { wwEditor: { view }, focus: vi.fn() }
    markWysiwygLoadedUndoBoundary(editor as unknown as Editor)
    view.state.doc = docForBlocks(paragraph('typed after load'))
    historySpies.undo.mockImplementation((_state, dispatch) => {
      dispatch?.(transaction)
      return true
    })

    expect(runWysiwygHistory(editor as unknown as Editor, 'undo')).toBe('applied')
    expect(view.dispatch).toHaveBeenCalledWith(transaction)
  })

  it('allows undo that clears current-session block formatting without a loaded boundary', () => {
    const transaction = { doc: docForBlocks(paragraph()), docChanged: true }
    const blockQuote = schema.nodes.blockQuote.create(null, [paragraph('quote')])
    const view = { state: { doc: docForBlocks(blockQuote) }, dispatch: vi.fn() }
    const editor = { wwEditor: { view }, focus: vi.fn() }
    historySpies.undo.mockImplementation((_state, dispatch) => {
      dispatch?.(transaction)
      return true
    })

    expect(runWysiwygHistory(editor as unknown as Editor, 'undo')).toBe('applied')
    expect(view.dispatch).toHaveBeenCalledWith(transaction)
  })

  it('allows undo that leaves meaningful content', () => {
    const transaction = { doc: docForBlocks(paragraph('still here')), docChanged: true }
    const view = { state: { doc: docForBlocks(paragraph('after')) }, dispatch: vi.fn() }
    const editor = { wwEditor: { view }, focus: vi.fn() }
    historySpies.undo.mockImplementation((_state, dispatch) => {
      dispatch?.(transaction)
      return true
    })

    expect(runWysiwygHistory(editor as unknown as Editor, 'undo')).toBe('applied')
    expect(view.dispatch).toHaveBeenCalledWith(transaction)
  })

  it('allows undo from blank-only content to empty', () => {
    const transaction = { doc: docForBlocks(paragraph()), docChanged: true }
    const view = { state: { doc: docForBlocks(paragraph('\u200b')) }, dispatch: vi.fn() }
    const editor = { wwEditor: { view }, focus: vi.fn() }
    historySpies.undo.mockImplementation((_state, dispatch) => {
      dispatch?.(transaction)
      return true
    })

    expect(runWysiwygHistory(editor as unknown as Editor, 'undo')).toBe('applied')
    expect(view.dispatch).toHaveBeenCalledWith(transaction)
  })

  it('does not apply the clear-all undo guard to redo', () => {
    const transaction = { doc: docForBlocks(paragraph()), docChanged: true }
    const view = { state: { doc: docForBlocks(paragraph('after')) }, dispatch: vi.fn() }
    const editor = { wwEditor: { view }, focus: vi.fn() }
    historySpies.redo.mockImplementation((_state, dispatch) => {
      dispatch?.(transaction)
      return true
    })

    expect(runWysiwygHistory(editor as unknown as Editor, 'redo')).toBe('applied')
    expect(view.dispatch).toHaveBeenCalledWith(transaction)
  })
})

describe('ProseMirror meaningful content detection', () => {
  const docForBlocks = (...blocks: any[]) => schema.nodes.doc.create(null, blocks)
  const paragraph = (text = '') => schema.nodes.paragraph.create(null, text ? [schema.text(text)] : undefined)

  it('treats text as meaningful and blank placeholder paragraphs as empty', () => {
    const textDoc = docForBlocks(paragraph('text'))
    const emptyDoc = docForBlocks(paragraph())

    expect(isProseMirrorDocMeaningful(docForBlocks(paragraph('text')))).toBe(true)
    expect(isProseMirrorDocMeaningful(docForBlocks(paragraph('\u200b')))).toBe(false)
    expect(shouldBlockWysiwygUndo(textDoc, emptyDoc)).toBe(false)
    expect(shouldBlockWysiwygUndo(textDoc, emptyDoc, { loadedUndoBoundaryDoc: textDoc })).toBe(true)
  })

  it('treats embedded and structural content nodes as meaningful', () => {
    expect(isProseMirrorDocMeaningful(docForBlocks(
      schema.nodes.paragraph.create(null, [schema.nodes.image.create({ src: 'image.png' })]),
    ))).toBe(true)
    expect(isProseMirrorDocMeaningful(docForBlocks(schema.nodes.table.create()))).toBe(true)
    expect(isProseMirrorDocMeaningful(docForBlocks(schema.nodes.thematicBreak.create()))).toBe(true)
  })
})

describe('note mention query detection', () => {
  function viewForText(text: string) {
    return {
      state: {
        selection: {
          empty: true,
          from: text.length + 1,
          $from: {
            parentOffset: text.length,
            parent: {
              isTextblock: true,
              textBetween: () => text,
            },
          },
        },
      },
    }
  }

  it('detects an @ query before the cursor', () => {
    expect(getNoteMentionQueryAtSelection(viewForText('see @parent'))).toEqual({
      from: 5,
      to: 12,
      query: 'parent',
    })
  })

  it('allows multi-word queries before the cursor', () => {
    expect(getNoteMentionQueryAtSelection(viewForText('see @parent note'))).toEqual({
      from: 5,
      to: 17,
      query: 'parent note',
    })
  })

  it('does not detect a mention query when the first character after @ is a space', () => {
    expect(getNoteMentionQueryAtSelection(viewForText('see @ '))).toBeNull()
    expect(getNoteMentionQueryAtSelection(viewForText('see @ parent'))).toBeNull()
  })
})

describe('tag autocomplete query detection', () => {
  function viewForText(
    text: string,
    options: { empty?: boolean; codeBlock?: boolean; codeMark?: boolean } = {},
  ) {
    const codeMark = options.codeMark
      ? [{ type: { name: 'code', spec: { code: true } } }]
      : []
    return {
      state: {
        selection: {
          empty: options.empty ?? true,
          from: text.length + 1,
          $from: {
            parentOffset: text.length,
            marks: () => codeMark,
            parent: {
              isTextblock: true,
              type: options.codeBlock ? { name: 'codeBlock', spec: { code: true } } : { name: 'paragraph' },
              textBetween: () => text,
              childBefore: () => ({ node: { marks: codeMark } }),
            },
          },
        },
      },
    }
  }

  it('detects tag autocomplete queries before a collapsed cursor', () => {
    expect(getTagAutocompleteQueryAtSelection(viewForText('#'))).toEqual({ from: 1, to: 2, query: '' })
    expect(getTagAutocompleteQueryAtSelection(viewForText('see #Tag-3'))).toEqual({
      from: 5,
      to: 11,
      query: 'Tag-3',
    })
    expect(getTagAutocompleteQueryAtSelection(viewForText('see #nested/tag'))).toEqual({
      from: 5,
      to: 16,
      query: 'nested/tag',
    })
  })

  it('rejects non-tag contexts', () => {
    expect(getTagAutocompleteQueryAtSelection(viewForText('C#'))).toBeNull()
    expect(getTagAutocompleteQueryAtSelection(viewForText('https://example.com/#anchor'))).toBeNull()
    expect(getTagAutocompleteQueryAtSelection(viewForText('see #bad?'))).toBeNull()
    expect(getTagAutocompleteQueryAtSelection(viewForText('#asdf', { empty: false }))).toBeNull()
  })

  it('rejects inline code and code block cursors', () => {
    expect(getTagAutocompleteQueryAtSelection(viewForText('#asdf', { codeMark: true }))).toBeNull()
    expect(getTagAutocompleteQueryAtSelection(viewForText('#asdf', { codeBlock: true }))).toBeNull()
  })
})

describe('cursor selection restore safety', () => {
  it('returns false when dispatch fails', () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text('asdf')])])
    const view = {
      state: {
        doc,
        tr: {
          setSelection: vi.fn(() => {
            throw new Error('dispatch prep failed')
          }),
        },
      },
      dispatch: vi.fn(),
    }

    expect(restoreEditorCursorSelection({ wwEditor: { view }, focus: vi.fn() } as unknown as Editor, {
      anchor: 5,
      head: 5,
    })).toBe(false)
  })

  it('returns false when focus fails after selection restore', () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text('asdf')])])
    const transaction = { scrollIntoView: vi.fn(() => 'transaction') }
    const view = {
      state: {
        doc,
        tr: {
          setSelection: vi.fn(() => transaction),
        },
      },
      dispatch: vi.fn(),
    }

    expect(restoreEditorCursorSelection({
      wwEditor: { view },
      focus: vi.fn(() => {
        throw new Error('focus failed')
      }),
    } as unknown as Editor, {
      anchor: 5,
      head: 5,
    })).toBe(false)
  })
})

describe('external link range detection', () => {
  function createView(doc: any, position: number) {
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, position),
    })
    return {
      get state() {
        return state
      },
      dispatch: vi.fn((transaction) => {
        state = state.apply(transaction)
      }),
      focus: vi.fn(),
    }
  }

  it('creates link marks with the schema-supported href attribute', () => {
    expect(getLinkMarkAttrs(linkUrlSchema.marks.link, 'https://example.com')).toEqual({
      linkUrl: 'https://example.com',
    })
    expect(getLinkMarkAttrs(schema.marks.link, 'https://example.com')).toEqual({
      href: 'https://example.com',
    })

    const mark = createLinkMark(linkUrlSchema.marks.link, 'https://example.com')
    expect(mark.attrs).toEqual({ linkUrl: 'https://example.com' })
  })

  it('finds the full link text range at a document position', () => {
    const link = schema.marks.link.create({ href: 'https://example.com' })
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('visit '),
        schema.text('example', [link]),
        schema.text(' now'),
      ]),
    ])

    expect(getExternalLinkRangeAtDocPosition(doc, 9, 'https://example.com')).toEqual({
      from: 7,
      to: 14,
      href: 'https://example.com',
    })
  })

  it('rejects positions outside matching links', () => {
    const link = schema.marks.link.create({ href: 'https://example.com' })
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('visit '),
        schema.text('example', [link]),
      ]),
    ])

    expect(getExternalLinkRangeAtDocPosition(doc, 2, 'https://example.com')).toBeNull()
    expect(getExternalLinkRangeAtDocPosition(doc, 9, 'https://other.example')).toBeNull()
  })

  it('finds links stored with Toast UI linkUrl marks', () => {
    const href = 'https://example.com/docs'
    const link = createLinkMark(linkUrlSchema.marks.link, href)
    const doc = linkUrlSchema.nodes.doc.create(null, [
      linkUrlSchema.nodes.paragraph.create(null, [
        linkUrlSchema.text('see '),
        linkUrlSchema.text('headers', [link]),
      ]),
    ])

    expect(getExternalLinkRangeAtDocPosition(doc, 7, href)).toEqual({
      from: 5,
      to: 12,
      href,
    })
    expect(getExternalLinkRangeAtDocPosition(doc, 7)?.href).not.toMatch(/^file:/)
  })

  it('moves bare Enter out of internal note links without changing their href', () => {
    const href = 'Link%20that%20remains--14eeb9'
    const link = schema.marks.link.create({ href })
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('before '),
        schema.text('link that remains', [link]),
        schema.text(' after'),
      ]),
    ])
    const range = getExternalLinkRangeAtDocPosition(doc, 12, href)
    if (!range) throw new Error('expected link range')
    const view = createView(doc, range.from + 4)
    const resolveInternal = vi.fn((token: string) =>
      token === '[link that remains](Link%20that%20remains--14eeb9)'
        ? ({ label: 'link that remains' }) as any
        : null,
    )

    expect(insertParagraphAfterInternalNoteLink(view, resolveInternal)).toBe(true)
    expect(view.state.doc.textBetween(0, view.state.doc.content.size, '\n', '\n')).toBe(
      'before link that remains\n after',
    )
    expect(getExternalLinkRangeAtDocPosition(view.state.doc, range.from + 4, href)).toMatchObject({
      href,
      from: range.from,
      to: range.to,
    })
    expect(view.dispatch).toHaveBeenCalledOnce()
    expect(view.focus).toHaveBeenCalledOnce()
  })

  it('does not intercept Enter inside external web links', () => {
    const href = 'https://example.com'
    const link = schema.marks.link.create({ href })
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('visit '), schema.text('example', [link])]),
    ])
    const range = getExternalLinkRangeAtDocPosition(doc, 9, href)
    if (!range) throw new Error('expected link range')
    const view = createView(doc, range.from + 2)

    expect(insertParagraphAfterInternalNoteLink(view, () => null)).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('does not intercept Enter at note-link edges', () => {
    const href = 'Linked--123abc'
    const link = schema.marks.link.create({ href })
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('see '), schema.text('Linked', [link])]),
    ])
    const range = getExternalLinkRangeAtDocPosition(doc, 7, href)
    if (!range) throw new Error('expected link range')
    const resolveInternal = vi.fn(() => ({ label: 'Linked' }) as any)

    expect(insertParagraphAfterInternalNoteLink(createView(doc, range.from), resolveInternal)).toBe(false)
    expect(insertParagraphAfterInternalNoteLink(createView(doc, range.to), resolveInternal)).toBe(false)
  })
})

describe('internal note link hit detection', () => {
  function createTextDoc(text: string) {
    return {
      descendants(callback: (node: unknown, pos: number) => void) {
        callback({ isText: true, text }, 1)
      },
    }
  }

  const resolvedReference = {
    target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null },
    heading: undefined,
    label: 'Linked',
  }

  it('returns source range and occurrence metadata for resolved markdown note links', () => {
    const hit = getInternalNoteLinkHitAtDocPosition(
      createTextDoc('Before [Linked](Linked--123abc) after'),
      10,
      () => resolvedReference as any,
    )

    expect(hit).toMatchObject({
      href: '[Linked](Linked--123abc)',
      from: 8,
      to: 32,
      occurrence: 0,
      label: 'Linked',
    })
  })

  it('counts unresolved markdown note links when reporting occurrence metadata', () => {
    const hit = getInternalNoteLinkHitAtDocPosition(
      createTextDoc('[Missing](Missing--999999) then [Linked](Linked--123abc)'),
      40,
      (token) => (token === '[Linked](Linked--123abc)' ? resolvedReference as any : null),
    )

    expect(hit).toMatchObject({
      href: '[Linked](Linked--123abc)',
      from: 33,
      to: 57,
      occurrence: 1,
    })
  })
})
