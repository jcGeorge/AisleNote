import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it, vi } from 'vitest'
import {
  insertClipboardDataIntoView,
  isLayoutSensitiveClipboardText,
  serializeProseMirrorSelectionForClipboard,
  AISLENOTE_MARKDOWN_CLIPBOARD_MIME,
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

function withFakeParsedHtmlText<T>(text: string, run: () => T): T {
  const previousDOMParser = (globalThis as any).DOMParser
  const previousElement = (globalThis as any).Element
  const previousNode = (globalThis as any).Node
  class FakeTextNode {
    nodeType = 3
    textContent: string

    constructor(value: string) {
      this.textContent = value
    }
  }
  class FakeElement {
    nodeType = 1
    tagName: string
    childNodes: Array<FakeElement | FakeTextNode>

    constructor(tagName: string, childNodes: Array<FakeElement | FakeTextNode> = []) {
      this.tagName = tagName
      this.childNodes = childNodes
    }

    get children() {
      return this.childNodes.filter((child): child is FakeElement => child instanceof FakeElement)
    }

    get textContent() {
      return this.childNodes.map((child) => child.textContent ?? '').join('')
    }

    getAttribute() {
      return ''
    }

    querySelectorAll() {
      return []
    }
  }
  ;(globalThis as any).DOMParser = class {
    parseFromString() {
      return {
        body: new FakeElement('body', [
          new FakeElement('p', [
            new FakeElement('span', [
              new FakeTextNode(text),
            ]),
          ]),
        ]),
      }
    }
  }
  ;(globalThis as any).Element = FakeElement
  ;(globalThis as any).Node = { TEXT_NODE: 3 }

  try {
    return run()
  } finally {
    if (previousDOMParser === undefined) delete (globalThis as any).DOMParser
    else (globalThis as any).DOMParser = previousDOMParser
    if (previousElement === undefined) delete (globalThis as any).Element
    else (globalThis as any).Element = previousElement
    if (previousNode === undefined) delete (globalThis as any).Node
    else (globalThis as any).Node = previousNode
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
    expect(store.get(AISLENOTE_MARKDOWN_CLIPBOARD_MIME)).toBe('[label](<note--abc123>)')
    expect(store.has('text/html')).toBe(false)
  })

  it('pastes app-private markdown links as link marks instead of literal markdown text', () => {
    const view = createView([paragraph('')])
    const data = {
      getData: (type: string) => type === AISLENOTE_MARKDOWN_CLIPBOARD_MIME ? '[linked](<note--abc123>)' : '',
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

  it('pastes single-line plain text inline at the current caret', () => {
    const view = createView([paragraph('Hello ')], 1 + 'Hello '.length)
    const data = {
      getData: (type: string) => type === 'text/plain' ? 'world' : '',
    }

    expect(insertClipboardDataIntoView(view, data)).toBe(true)
    expect(view.state.doc.childCount).toBe(1)
    expect(view.state.doc.child(0).textContent).toBe('Hello world')
  })

  it('pastes single-line plain text with one terminal newline inline', () => {
    const view = createView([paragraph('Hello ')], 1 + 'Hello '.length)
    const data = {
      getData: (type: string) => type === 'text/plain' ? 'world\n' : '',
    }

    expect(insertClipboardDataIntoView(view, data)).toBe(true)
    expect(view.state.doc.childCount).toBe(1)
    expect(view.state.doc.child(0).textContent).toBe('Hello world')
  })

  it('detects plain text that needs exact layout preservation', () => {
    expect(isLayoutSensitiveClipboardText('Matthew 4:19\tFollow me')).toBe(true)
    expect(isLayoutSensitiveClipboardText('Matthew 4:19  Follow me')).toBe(false)
    expect(isLayoutSensitiveClipboardText('  indented')).toBe(true)
    expect(isLayoutSensitiveClipboardText('Matthew 4:19\nMatthew 8:19')).toBe(true)
    expect(isLayoutSensitiveClipboardText('plain sentence')).toBe(false)
  })

  it('uses single-line plain text before rich HTML so paste stays inline', () => {
    const view = createView([paragraph('Hello ')], 1 + 'Hello '.length)
    const data = {
      getData: (type: string) => {
        if (type === 'text/plain') return 'world'
        if (type === 'text/html') return '<p><span>world</span></p>'
        return ''
      },
    }

    withFakeParsedHtmlText('world', () => {
      expect(insertClipboardDataIntoView(view, data)).toBe(true)
    })

    expect(view.state.doc.childCount).toBe(1)
    expect(view.state.doc.child(0).textContent).toBe('Hello world')
  })

  it('uses layout-sensitive plain text before rich HTML when both clipboard formats are present', () => {
    const view = createView([paragraph('')])
    const plainText = 'Matthew 4:19\tAnd he says unto them\nMatthew 8:19\tAnd a certain scribe came'
    const data = {
      getData: (type: string) => {
        if (type === 'text/plain') return plainText
        if (type === 'text/html') return '<p><span style="color: #bbbebf;">Matthew 4:19 And he says unto them Matthew 8:19 And a certain scribe came</span></p>'
        return ''
      },
    }

    withFakeParsedHtmlText('Matthew 4:19 And he says unto them Matthew 8:19 And a certain scribe came', () => {
      expect(insertClipboardDataIntoView(view, data)).toBe(true)
    })

    expect(Array.from({ length: view.state.doc.childCount }, (_unused, index) => view.state.doc.child(index).textContent))
      .toEqual([
        'Matthew 4:19\tAnd he says unto them',
        'Matthew 8:19\tAnd a certain scribe came',
      ])
  })

  it('pastes styled span HTML as plain text when exact plain text is unavailable', () => {
    const view = createView([paragraph('')])
    const data = {
      getData: (type: string) => type === 'text/html'
        ? '<p><span style="color: #bbbebf;">Matthew 4:19 Follow me</span></p>'
        : '',
    }

    withFakeParsedHtmlText('Matthew 4:19 Follow me', () => {
      expect(insertClipboardDataIntoView(view, data)).toBe(true)
    })
    expect(view.state.doc.child(0).textContent).toBe('Matthew 4:19 Follow me')
  })

  it('keeps the HTML paste path app-owned in source instead of routing through Toast UI defaults', () => {
    const source = String(insertClipboardDataIntoView)
    expect(source).toContain('getData("text/html")')
    expect(source).toContain('insertClipboardHtmlIntoView')
  })
})
