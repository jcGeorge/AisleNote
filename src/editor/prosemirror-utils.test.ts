import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Schema } from 'prosemirror-model'
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
  getLinkMarkAttrs,
  getNoteMentionQueryAtSelection,
  isProseMirrorDocMeaningful,
  markWysiwygLoadedUndoBoundary,
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

describe('external link range detection', () => {
  it('creates link marks with the schema-supported href attribute', () => {
    expect(getLinkMarkAttrs(linkUrlSchema.marks.link, '#tabs-note/body?domainId=d&spaceId=s&tabId=t')).toEqual({
      linkUrl: '#tabs-note/body?domainId=d&spaceId=s&tabId=t',
    })
    expect(getLinkMarkAttrs(schema.marks.link, '#tabs-note/body?domainId=d&spaceId=s&tabId=t')).toEqual({
      href: '#tabs-note/body?domainId=d&spaceId=s&tabId=t',
    })

    const mark = createLinkMark(linkUrlSchema.marks.link, '#tabs-note/body?domainId=d&spaceId=s&tabId=t')
    expect(mark.attrs).toEqual({ linkUrl: '#tabs-note/body?domainId=d&spaceId=s&tabId=t' })
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

  it('finds internal note links stored with Toast UI linkUrl marks', () => {
    const href = '#tabs-note/body?domainId=domain&spaceId=space&tabId=tab'
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
})
