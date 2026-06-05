import { describe, expect, it, vi } from 'vitest'
import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import {
  deleteTerminalBlockBeforeCaret,
  getTerminalBlockLandingTarget,
  handleTerminalLandingZoneClick,
  handleTerminalBlankAreaClick,
  insertTerminalLandingParagraphs,
  isNotePreviewOnlyParagraphText,
  moveTerminalBlockBoundaryCaretByArrow,
  placeCaretInFinalEmptyTextBlock,
} from './terminal-block-landing'

const terminalDeleteSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    codeBlock: { group: 'block', content: 'text*', code: true, toDOM: () => ['pre', ['code', 0]] },
    image: { inline: true, group: 'inline', atom: true, attrs: { src: {} }, toDOM: (node) => ['img', { src: node.attrs.src }] },
    table: { group: 'block', content: 'paragraph*', toDOM: () => ['table', ['tbody', 0]] },
  },
  marks: {
    link: {
      attrs: { linkUrl: {} },
      toDOM: (mark) => ['a', { href: mark.attrs.linkUrl }, 0],
    },
  },
})

type FakePmNode = {
  type: { name: string }
  textContent: string
  text: string
  isText: boolean
  isTextblock: boolean
  content: { size: number }
  nodeSize: number
  childCount: number
  child: (index: number) => FakePmNode
  marks?: Array<{ type: { name: string }; attrs: Record<string, string> }>
}

function pmNode(
  typeName: string,
  textContent = '',
  nodeSize = textContent.length + 2,
  children: FakePmNode[] = [],
  marks: FakePmNode['marks'] = [],
): FakePmNode {
  const contentSize = children.length > 0
    ? children.reduce((sum, child) => sum + child.nodeSize, 0)
    : textContent.length
  return {
    type: { name: typeName },
    textContent,
    text: textContent,
    isText: typeName === 'text',
    isTextblock: typeName === 'paragraph' || typeName === 'codeBlock',
    content: { size: contentSize },
    nodeSize,
    childCount: children.length,
    child: (index: number) => children[index],
    marks,
  }
}

function pmDoc(children: Array<ReturnType<typeof pmNode>>) {
  return {
    childCount: children.length,
    content: { size: children.reduce((sum, child) => sum + child.nodeSize, 0) },
    child: (index: number) => children[index],
  }
}

function contextToken(id = 'preview-token') {
  return `![[Preview ${id}--123abc]]`
}

function mediaTextNode(text = 'Song', href = 'tabs-asset:///assets/song.mp3') {
  return pmNode('text', text, text.length, [], [{ type: { name: 'link' }, attrs: { linkUrl: href } }])
}

describe('terminal block landing target detection', () => {
  it('detects a final code block', () => {
    const doc = pmDoc([pmNode('paragraph', 'before', 8), pmNode('codeBlock', 'const x = 1', 13)])

    expect(getTerminalBlockLandingTarget(doc)).toEqual({
      kind: 'codeBlock',
      position: 21,
    })
  })

  it('detects a final table', () => {
    const doc = pmDoc([pmNode('paragraph', 'before', 8), pmNode('table', '', 18)])

    expect(getTerminalBlockLandingTarget(doc)).toEqual({
      kind: 'table',
      position: 26,
    })
  })

  it('detects a final paragraph containing only valid note preview tokens', () => {
    const token = contextToken()
    const doc = pmDoc([pmNode('paragraph', `${token} ${contextToken('second')}`, 50)])

    expect(isNotePreviewOnlyParagraphText(` ${token} `)).toBe(true)
    expect(getTerminalBlockLandingTarget(doc)).toEqual({
      kind: 'notePreview',
      position: 50,
    })
  })

  it('detects a final image-only paragraph', () => {
    const image = pmNode('image', '', 1)
    const doc = pmDoc([pmNode('paragraph', '', 3, [image])])

    expect(getTerminalBlockLandingTarget(doc)).toEqual({
      kind: 'image',
      position: 3,
    })
  })

  it('detects a final media-only paragraph', () => {
    const mediaText = mediaTextNode('Song')
    const doc = pmDoc([pmNode('paragraph', 'Song', 6, [mediaText])])

    expect(getTerminalBlockLandingTarget(doc)).toEqual({
      kind: 'media',
      position: 6,
    })
  })

  it('ignores normal paragraphs, blank trailing paragraphs, and mixed visual paragraphs', () => {
    const token = contextToken()
    const image = pmNode('image', '', 1)
    const text = pmNode('text', 'caption', 7)
    const mediaText = mediaTextNode('Song')

    expect(getTerminalBlockLandingTarget(pmDoc([pmNode('paragraph', 'normal text')]))).toBeNull()
    expect(getTerminalBlockLandingTarget(pmDoc([pmNode('codeBlock', 'code'), pmNode('paragraph', '')]))).toBeNull()
    expect(getTerminalBlockLandingTarget(pmDoc([pmNode('paragraph', `${token} extra text`)]))).toBeNull()
    expect(getTerminalBlockLandingTarget(pmDoc([pmNode('paragraph', 'caption', 10, [image, text])]))).toBeNull()
    expect(getTerminalBlockLandingTarget(pmDoc([pmNode('paragraph', 'Song caption', 14, [mediaText, text])]))).toBeNull()
    expect(isNotePreviewOnlyParagraphText('{{tabs-context:bad}}')).toBe(false)
  })
})

function createFakeView(children: Array<ReturnType<typeof pmNode>>) {
  const doc = pmDoc(children)
  const schema = {
    text: (text: string) => ({ text }),
    nodes: {
      paragraph: {
        create: (_attrs: unknown, textNode?: { text: string }) => pmNode('paragraph', textNode?.text ?? ''),
      },
    },
  }
  const tr = {
    doc,
    insert: vi.fn(function insert(this: any, pos: number, nodes: unknown[]) {
      void pos
      void nodes
      return this
    }),
    setSelection: vi.fn(function setSelection(this: any) {
      return this
    }),
    scrollIntoView: vi.fn(function scrollIntoView(this: any) {
      return this
    }),
  }

  return {
    view: {
      state: { doc, schema, tr },
      dom: {
        lastElementChild: {
          getBoundingClientRect: () => ({ bottom: 100 }),
        },
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    },
    tr,
  }
}

function fakeTerminalElement(kind: 'code' | 'table' | 'preview' | 'image' | 'media') {
  return {
    childNodes: [],
    getBoundingClientRect: () => ({ top: 100, bottom: 200, left: 40, right: 240 }),
    matches: (selector: string) => {
      if (kind === 'code') return selector === '.toastui-editor-ww-code-block'
      if (kind === 'table') return selector === 'table'
      if (kind === 'preview') return selector === '.note-context-widget'
      if (kind === 'image') return selector === 'img'
      if (kind === 'media') return selector === '.tabs-media-player'
      return false
    },
    closest: (selector: string) => {
      if (selector === '.context-preview-editor-host') return null
      if (selector === 'p' && kind === 'image') return {}
      if (selector === '.toastui-editor-ww-code-block' && kind === 'code') return {}
      if (selector === '.tabs-media-player' && kind === 'media') return {}
      return null
    },
  } as unknown as Element
}

function createBoundaryView(children: Array<ReturnType<typeof pmNode>>, element: Element, domPosition: number) {
  const { view, tr } = createFakeView(children)
  view.dom = {
    ...view.dom,
    querySelectorAll: () => [element],
  } as typeof view.dom
  return {
    view: {
      ...view,
      posAtDOM: vi.fn(() => domPosition),
    },
    tr,
  }
}

function setTerminalArrowSelection(
  view: ReturnType<typeof createFakeView>['view'],
  node: ReturnType<typeof pmNode>,
  direction: 'up' | 'down',
  start = 0,
  index = 0,
) {
  if (node.type.name === 'table') {
    ;(view.state as any).selection = {
      node,
      from: start,
      to: start + node.nodeSize,
      $from: { index: () => index },
    }
    return
  }

  const position = direction === 'up' ? start + 1 : start + 1 + node.content.size
  ;(view.state as any).selection = {
    empty: true,
    from: position,
    to: position,
    head: position,
  }
}

const terminalBoundaryCases = [
  { label: 'code block', kind: 'code' as const, node: () => pmNode('codeBlock', 'code', 6), domPosition: 1 },
  { label: 'table', kind: 'table' as const, node: () => pmNode('table', '', 8), domPosition: 1 },
  { label: 'note preview', kind: 'preview' as const, node: () => pmNode('paragraph', contextToken()), domPosition: 1 },
  {
    label: 'image',
    kind: 'image' as const,
    node: () => pmNode('paragraph', '', 3, [pmNode('image', '', 1)]),
    domPosition: 1,
  },
  {
    label: 'media player',
    kind: 'media' as const,
    node: () => pmNode('paragraph', 'Song', 6, [mediaTextNode('Song')]),
    domPosition: 1,
  },
]

function terminalDeleteParagraph(text = '') {
  return text
    ? terminalDeleteSchema.nodes.paragraph.create(null, terminalDeleteSchema.text(text))
    : terminalDeleteSchema.nodes.paragraph.create()
}

function terminalDeleteCodeBlock(text = 'code') {
  return terminalDeleteSchema.nodes.codeBlock.create(null, terminalDeleteSchema.text(text))
}

function terminalDeleteTable() {
  return terminalDeleteSchema.nodes.table.create(null, [terminalDeleteParagraph('cell')])
}

function terminalDeletePreview() {
  return terminalDeleteParagraph(contextToken())
}

function terminalDeleteMedia() {
  return terminalDeleteSchema.nodes.paragraph.create(null, [
    terminalDeleteSchema.text('Song', [
      terminalDeleteSchema.marks.link.create({ linkUrl: 'tabs-asset:///assets/song.mp3' }),
    ]),
  ])
}

function terminalDeleteImage() {
  return terminalDeleteSchema.nodes.paragraph.create(null, [
    terminalDeleteSchema.nodes.image.create({ src: 'tabs-asset:///assets/image.png' }),
  ])
}

function createTerminalDeleteState(children: any[], selectionPosition: number, selectionTo = selectionPosition) {
  const doc = terminalDeleteSchema.nodes.doc.create(null, children)
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, selectionPosition, selectionTo),
  })
}

function applyTerminalDelete(state: EditorState, direction: 'backward' | 'forward') {
  let nextState = state
  const handled = deleteTerminalBlockBeforeCaret(state, direction, (tr) => {
    nextState = state.apply(tr as any)
  })
  return { handled, state: nextState }
}

describe('terminal block delete behavior', () => {
  it('deletes a code block from Backspace at the start of following text', () => {
    const codeBlock = terminalDeleteCodeBlock()
    const state = createTerminalDeleteState([codeBlock, terminalDeleteParagraph('after')], codeBlock.nodeSize + 1)
    const result = applyTerminalDelete(state, 'backward')

    expect(result.handled).toBe(true)
    expect(result.state.doc.childCount).toBe(1)
    expect(result.state.doc.child(0).type.name).toBe('paragraph')
    expect(result.state.doc.child(0).textContent).toBe('after')
    expect(result.state.selection.from).toBe(1)
  })

  it('deletes a table from Backspace at the start of following text', () => {
    const table = terminalDeleteTable()
    const state = createTerminalDeleteState([table, terminalDeleteParagraph('after')], table.nodeSize + 1)
    const result = applyTerminalDelete(state, 'backward')

    expect(result.handled).toBe(true)
    expect(result.state.doc.childCount).toBe(1)
    expect(result.state.doc.child(0).textContent).toBe('after')
    expect(result.state.selection.from).toBe(1)
  })

  it('deletes a terminal block from forward Delete in an empty spacer without lifting lower text', () => {
    const codeBlock = terminalDeleteCodeBlock()
    const empty = terminalDeleteParagraph()
    const state = createTerminalDeleteState([codeBlock, empty, terminalDeleteParagraph('after')], codeBlock.nodeSize + 1)
    const result = applyTerminalDelete(state, 'forward')

    expect(result.handled).toBe(true)
    expect(result.state.doc.childCount).toBe(2)
    expect(result.state.doc.child(0).textContent).toBe('')
    expect(result.state.doc.child(1).textContent).toBe('after')
    expect(result.state.selection.from).toBe(1)
  })

  it.each([
    { label: 'code block', node: terminalDeleteCodeBlock },
    { label: 'table', node: terminalDeleteTable },
    { label: 'note preview', node: terminalDeletePreview },
    { label: 'media player', node: terminalDeleteMedia },
  ])('deletes a $label before an empty blank run', ({ node }) => {
    const terminal = node()
    const firstEmpty = terminalDeleteParagraph()
    const secondEmpty = terminalDeleteParagraph()
    const selectionPosition = terminal.nodeSize + firstEmpty.nodeSize + 1
    const state = createTerminalDeleteState(
      [terminal, firstEmpty, secondEmpty, terminalDeleteParagraph('after')],
      selectionPosition,
    )
    const result = applyTerminalDelete(state, 'backward')

    expect(result.handled).toBe(true)
    expect(result.state.doc.childCount).toBe(3)
    expect(result.state.doc.child(0).textContent).toBe('')
    expect(result.state.doc.child(1).textContent).toBe('')
    expect(result.state.doc.child(2).textContent).toBe('after')
    expect(result.state.selection.from).toBe(firstEmpty.nodeSize + 1)
  })

  it('does not delete image-only paragraphs through terminal block deletion', () => {
    const image = terminalDeleteImage()
    const state = createTerminalDeleteState([image, terminalDeleteParagraph(), terminalDeleteParagraph('after')], image.nodeSize + 1)

    expect(deleteTerminalBlockBeforeCaret(state, 'backward', vi.fn())).toBe(false)
    expect(deleteTerminalBlockBeforeCaret(state, 'forward', vi.fn())).toBe(false)
  })

  it('leaves normal paragraph boundaries to native delete behavior', () => {
    const before = terminalDeleteParagraph('before')
    const state = createTerminalDeleteState([before, terminalDeleteParagraph(), terminalDeleteParagraph('after')], before.nodeSize + 1)

    expect(deleteTerminalBlockBeforeCaret(state, 'backward', vi.fn())).toBe(false)
    expect(deleteTerminalBlockBeforeCaret(state, 'forward', vi.fn())).toBe(false)
  })

  it('ignores non-collapsed selections and non-boundary text positions', () => {
    const codeBlock = terminalDeleteCodeBlock()
    const selectedText = createTerminalDeleteState([codeBlock, terminalDeleteParagraph('after')], codeBlock.nodeSize + 1, codeBlock.nodeSize + 3)
    const middleOfText = createTerminalDeleteState([codeBlock, terminalDeleteParagraph('after')], codeBlock.nodeSize + 3)

    expect(deleteTerminalBlockBeforeCaret(selectedText, 'backward', vi.fn())).toBe(false)
    expect(deleteTerminalBlockBeforeCaret(middleOfText, 'backward', vi.fn())).toBe(false)
  })
})

describe('terminal block landing insertion', () => {
  it('inserts typed text into a new paragraph after the terminal block', () => {
    const { view, tr } = createFakeView([pmNode('codeBlock', 'code', 6)])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }

    expect(insertTerminalLandingParagraphs(view, TextSelection, 'a')).toBe(true)

    expect(tr.insert).toHaveBeenCalledWith(
      6,
      expect.arrayContaining([expect.objectContaining({ type: { name: 'paragraph' }, textContent: 'a' })]),
    )
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, 8, 8)
    expect(view.dispatch).toHaveBeenCalledWith(tr)
    expect(view.focus).toHaveBeenCalled()
  })

  it('splits pasted multiline text into paragraphs and places the cursor at the end', () => {
    const { view, tr } = createFakeView([pmNode('codeBlock', 'code', 6)])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }

    expect(insertTerminalLandingParagraphs(view, TextSelection, 'one\ntwo')).toBe(true)

    const insertedNodes = tr.insert.mock.calls[0][1] as Array<{ textContent: string }>
    expect(insertedNodes.map((node) => node.textContent)).toEqual(['one', 'two'])
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, 15, 15)
  })

  it('inserts an empty paragraph for Enter activation', () => {
    const { view, tr } = createFakeView([pmNode('codeBlock', 'code', 6)])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }

    expect(insertTerminalLandingParagraphs(view, TextSelection)).toBe(true)

    const insertedNodes = tr.insert.mock.calls[0][1] as Array<{ textContent: string }>
    expect(insertedNodes).toHaveLength(1)
    expect(insertedNodes[0].textContent).toBe('')
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, 7, 7)
  })

  it('turns a primary landing-zone click into a real empty paragraph selection', () => {
    const { view, tr } = createFakeView([pmNode('codeBlock', 'code', 6)])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    const event = {
      button: 0,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent

    expect(handleTerminalLandingZoneClick(event, view, TextSelection)).toBe(true)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
    expect(tr.insert).toHaveBeenCalledWith(
      6,
      expect.arrayContaining([expect.objectContaining({ type: { name: 'paragraph' }, textContent: '' })]),
    )
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, 7, 7)
    expect(view.focus).toHaveBeenCalled()
  })

  it('ignores non-primary landing-zone clicks', () => {
    const { view, tr } = createFakeView([pmNode('codeBlock', 'code', 6)])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    const event = {
      button: 2,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent

    expect(handleTerminalLandingZoneClick(event, view, TextSelection)).toBe(false)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
    expect(tr.insert).not.toHaveBeenCalled()
  })

  it('places the caret in an existing final empty paragraph from a blank-area click', () => {
    const { view, tr } = createFakeView([pmNode('paragraph', '', 2)])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    const target = view.dom as unknown as Element
    const event = {
      button: 0,
      clientY: 120,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent

    expect(handleTerminalBlankAreaClick(event, target, view, TextSelection)).toBe(true)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
    expect(tr.insert).not.toHaveBeenCalled()
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, 1, 1)
    expect(view.focus).toHaveBeenCalled()
  })

  it('inserts after a terminal block from a blank-area click below the landing row', () => {
    const { view, tr } = createFakeView([pmNode('codeBlock', 'code', 6)])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    const target = view.dom as unknown as Element
    const event = {
      button: 0,
      clientY: 120,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent

    expect(handleTerminalBlankAreaClick(event, target, view, TextSelection)).toBe(true)

    expect(tr.insert).toHaveBeenCalledWith(
      6,
      expect.arrayContaining([expect.objectContaining({ type: { name: 'paragraph' }, textContent: '' })]),
    )
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, 7, 7)
  })

  it('does not repair normal clicks inside the rendered content bounds', () => {
    const { view, tr } = createFakeView([pmNode('paragraph', '', 2)])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    const event = {
      button: 0,
      clientY: 90,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent

    expect(handleTerminalBlankAreaClick(event, view.dom as unknown as Element, view, TextSelection)).toBe(false)
    expect(placeCaretInFinalEmptyTextBlock(view, TextSelection)).toBe(true)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(tr.insert).not.toHaveBeenCalled()
  })

  it.each(terminalBoundaryCases)('inserts a real paragraph before a first $label boundary click', ({ kind, node, domPosition }) => {
    const element = fakeTerminalElement(kind)
    const { view, tr } = createBoundaryView([node()], element, domPosition)
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    const event = {
      button: 0,
      clientX: 80,
      clientY: 90,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent

    expect(handleTerminalBlankAreaClick(event, view.dom as unknown as Element, view, TextSelection)).toBe(true)

    expect(tr.insert).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ type: { name: 'paragraph' }, textContent: '' }),
    )
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, 1, 1)
    expect(view.focus).toHaveBeenCalled()
  })

  it.each(terminalBoundaryCases)('places the caret after a $label boundary click when a following paragraph exists', ({ kind, node, domPosition }) => {
    const terminalNode = node()
    const element = fakeTerminalElement(kind)
    const { view, tr } = createBoundaryView([terminalNode, pmNode('paragraph', 'after', 7)], element, domPosition)
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    const event = {
      button: 0,
      clientX: 80,
      clientY: 210,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent

    expect(handleTerminalBlankAreaClick(event, view.dom as unknown as Element, view, TextSelection)).toBe(true)

    expect(tr.insert).not.toHaveBeenCalled()
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, terminalNode.nodeSize + 1, terminalNode.nodeSize + 1)
    expect(view.focus).toHaveBeenCalled()
  })

  it.each(terminalBoundaryCases)('inserts a paragraph after a final $label from ArrowDown', ({ node }) => {
    const terminalNode = node()
    const { view, tr } = createFakeView([terminalNode])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    setTerminalArrowSelection(view, terminalNode, 'down')

    expect(moveTerminalBlockBoundaryCaretByArrow(view, 'down', TextSelection)).toBe(true)

    expect(tr.insert).toHaveBeenCalledWith(
      terminalNode.nodeSize,
      expect.objectContaining({ type: { name: 'paragraph' }, textContent: '' }),
    )
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, terminalNode.nodeSize + 1, terminalNode.nodeSize + 1)
    expect(view.focus).toHaveBeenCalled()
  })

  it.each(terminalBoundaryCases)('inserts a paragraph before a first $label from ArrowUp', ({ node }) => {
    const terminalNode = node()
    const { view, tr } = createFakeView([terminalNode])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    setTerminalArrowSelection(view, terminalNode, 'up')

    expect(moveTerminalBlockBoundaryCaretByArrow(view, 'up', TextSelection)).toBe(true)

    expect(tr.insert).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ type: { name: 'paragraph' }, textContent: '' }),
    )
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, 1, 1)
    expect(view.focus).toHaveBeenCalled()
  })

  it('moves ArrowDown into an existing following paragraph without inserting another one', () => {
    const terminalNode = pmNode('codeBlock', 'code', 6)
    const { view, tr } = createFakeView([terminalNode, pmNode('paragraph', 'after', 7)])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    setTerminalArrowSelection(view, terminalNode, 'down')

    expect(moveTerminalBlockBoundaryCaretByArrow(view, 'down', TextSelection)).toBe(true)

    expect(tr.insert).not.toHaveBeenCalled()
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, terminalNode.nodeSize + 1, terminalNode.nodeSize + 1)
  })

  it('moves ArrowUp into an existing previous paragraph without inserting another one', () => {
    const before = pmNode('paragraph', 'before', 8)
    const terminalNode = pmNode('codeBlock', 'code', 6)
    const { view, tr } = createFakeView([before, terminalNode])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    setTerminalArrowSelection(view, terminalNode, 'up', before.nodeSize, 1)

    expect(moveTerminalBlockBoundaryCaretByArrow(view, 'up', TextSelection)).toBe(true)

    expect(tr.insert).not.toHaveBeenCalled()
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, 7, 7)
  })

  it('treats the caret after an image-only paragraph as an ArrowUp boundary', () => {
    const terminalNode = pmNode('paragraph', '', 3, [pmNode('image', '', 1)])
    const { view, tr } = createFakeView([terminalNode])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    setTerminalArrowSelection(view, terminalNode, 'down')

    expect(moveTerminalBlockBoundaryCaretByArrow(view, 'up', TextSelection)).toBe(true)

    expect(tr.insert).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ type: { name: 'paragraph' }, textContent: '' }),
    )
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, 1, 1)
  })

  it('does not hijack ArrowDown in the middle of a code block', () => {
    const terminalNode = pmNode('codeBlock', 'const x = 1', 13)
    const { view, tr } = createFakeView([terminalNode])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }
    ;(view.state as any).selection = { empty: true, from: 4, to: 4, head: 4 }
    ;(view as any).endOfTextblock = vi.fn(() => false)

    expect(moveTerminalBlockBoundaryCaretByArrow(view, 'down', TextSelection)).toBe(false)

    expect(tr.insert).not.toHaveBeenCalled()
    expect(TextSelection.create).not.toHaveBeenCalled()
  })
})
