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

import { getExternalLinkRangeAtDocPosition, getNoteMentionQueryAtSelection, runWysiwygHistory } from './prosemirror-utils'

const schema = new Schema({
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
  },
})

describe('wysiwyg history commands', () => {
  beforeEach(() => {
    historySpies.redo.mockReset()
    historySpies.undo.mockReset()
  })

  it('runs undo against the active wysiwyg editor view', () => {
    const view = { state: {}, dispatch: vi.fn() }
    const editor = { wwEditor: { view }, focus: vi.fn() }
    historySpies.undo.mockReturnValue(true)

    expect(runWysiwygHistory(editor as unknown as Editor, 'undo')).toBe(true)
    expect(historySpies.undo).toHaveBeenCalledWith(view.state, view.dispatch, view)
    expect(editor.focus).toHaveBeenCalledOnce()
  })

  it('runs redo and leaves focus alone when history does not change', () => {
    const view = { state: {}, dispatch: vi.fn() }
    const editor = { wwEditor: { view }, focus: vi.fn() }
    historySpies.redo.mockReturnValue(false)

    expect(runWysiwygHistory(editor as unknown as Editor, 'redo')).toBe(false)
    expect(historySpies.redo).toHaveBeenCalledWith(view.state, view.dispatch, view)
    expect(editor.focus).not.toHaveBeenCalled()
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

  it('ignores completed mentions with whitespace after the query', () => {
    expect(getNoteMentionQueryAtSelection(viewForText('see @parent '))).toBeNull()
  })
})

describe('external link range detection', () => {
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
})
