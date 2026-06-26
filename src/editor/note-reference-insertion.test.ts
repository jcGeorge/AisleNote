import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it, vi } from 'vitest'
import { insertMarkdownNoteReferenceTokenIntoView } from './note-reference-insertion'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
  marks: {
    link: {
      attrs: { linkUrl: {} },
      toDOM: (mark) => ['a', { href: mark.attrs.linkUrl }, 0],
    },
  },
})

function paragraph(text = '') {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
}

function createView(text = '', anchor = 1, head = anchor) {
  const doc = schema.nodes.doc.create(null, [paragraph(text)])
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, anchor, head),
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

describe('note reference insertion', () => {
  it('inserts note links as editor link marks instead of literal markdown text', () => {
    const view = createView()

    expect(insertMarkdownNoteReferenceTokenIntoView(view, '[Welcome copy](<Welcome copy--96d9e4>)')).toBe(true)

    const inserted = view.state.doc.child(0).child(0)
    expect(inserted.text).toBe('Welcome copy')
    expect(inserted.marks[0]?.attrs).toEqual({ linkUrl: 'Welcome%20copy--96d9e4' })
    expect(view.state.doc.textContent).not.toContain('[Welcome copy]')
    expect(view.dispatch).toHaveBeenCalledOnce()
    expect(view.focus).toHaveBeenCalledOnce()
  })

  it('inserts note previews as raw token text for the preview decoration plugin', () => {
    const view = createView('@qa', 1, 4)
    const token = '![Q&A](Q&A--92a8ed)'

    expect(insertMarkdownNoteReferenceTokenIntoView(view, token, { from: 1, to: 4 })).toBe(true)

    expect(view.state.doc.textContent).toBe(token)
    expect(view.state.doc.child(0).child(0).marks).toHaveLength(0)
    expect(view.dispatch).toHaveBeenCalledOnce()
  })
})
