import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it, vi } from 'vitest'
import {
  insertClipboardDataIntoView,
  serializeProseMirrorSelectionForClipboard,
  TABS_MARKDOWN_CLIPBOARD_MIME,
  writeEditorClipboardData,
} from './visual-clipboard'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: { level: { default: 1 } },
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    image: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { imageUrl: {}, altText: { default: '' } },
      toDOM: (node) => ['img', { src: node.attrs.imageUrl, alt: node.attrs.altText }],
    },
  },
  marks: {
    link: {
      attrs: { linkUrl: {} },
      toDOM: (mark) => ['a', { href: mark.attrs.linkUrl }, 0],
    },
    strong: {
      toDOM: () => ['strong', 0],
    },
  },
})

function paragraph(text = '') {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
}

function createView(blocks: any[], anchor = 1, head = anchor) {
  const doc = schema.nodes.doc.create(null, blocks)
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

describe('visual clipboard helpers', () => {
  it('serializes selected visible rows with exact blank-line spacing', () => {
    const doc = schema.nodes.doc.create(null, [
      paragraph('okay'),
      paragraph(),
      paragraph('so'),
      paragraph(),
      paragraph('these are together.'),
    ])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, Math.max(1, doc.content.size - 1)),
    })
    const view = { state }

    expect(serializeProseMirrorSelectionForClipboard(view)).toEqual({
      text: 'okay\n\nso\n\nthese are together.',
      markdown: 'okay\n\nso\n\nthese are together.',
    })
  })

  it('writes both plain text and private markdown clipboard data', () => {
    const store = new Map<string, string>()

    expect(writeEditorClipboardData({
      setData: (type: string, value: string) => store.set(type, value),
    }, {
      text: 'label',
      markdown: '[label](<note--abc123>)',
    })).toBe(true)
    expect(store.get('text/plain')).toBe('label')
    expect(store.get(TABS_MARKDOWN_CLIPBOARD_MIME)).toBe('[label](<note--abc123>)')
  })

  it('pastes app-private markdown links as link marks instead of literal markdown text', () => {
    const view = createView([paragraph('')])
    const data = {
      getData: (type: string) => type === TABS_MARKDOWN_CLIPBOARD_MIME ? '[linked](<note--abc123>)' : '',
    }

    expect(insertClipboardDataIntoView(view, data)).toBe(true)
    const inserted = view.state.doc.child(0).child(0)
    expect(inserted.text).toBe('linked')
    expect(inserted.marks[0]?.attrs).toEqual({ linkUrl: 'note--abc123' })
  })

  it('pastes plain text multiline content as exact visible rows', () => {
    const view = createView([paragraph('')])
    const data = {
      getData: (type: string) => type === 'text/plain' ? 'okay\n\nso' : '',
    }

    expect(insertClipboardDataIntoView(view, data)).toBe(true)
    expect(Array.from({ length: view.state.doc.childCount }, (_unused, index) => view.state.doc.child(index).textContent))
      .toEqual(['okay', '', 'so'])
  })

  it('keeps the HTML paste path app-owned in source instead of routing through Toast UI defaults', () => {
    const source = String(insertClipboardDataIntoView)
    expect(source).toContain('getData("text/html")')
    expect(source).toContain('insertClipboardHtmlIntoView')
  })
})
