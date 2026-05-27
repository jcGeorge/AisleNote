import { describe, expect, it, vi } from 'vitest'
import {
  getTerminalBlockLandingTarget,
  handleTerminalLandingZoneClick,
  handleTerminalBlankAreaClick,
  insertTerminalLandingParagraphs,
  isNotePreviewOnlyParagraphText,
  placeCaretInFinalEmptyTextBlock,
} from './terminal-block-landing'

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
}

function pmNode(
  typeName: string,
  textContent = '',
  nodeSize = textContent.length + 2,
  children: FakePmNode[] = [],
): FakePmNode {
  return {
    type: { name: typeName },
    textContent,
    text: textContent,
    isText: typeName === 'text',
    isTextblock: typeName === 'paragraph' || typeName === 'codeBlock',
    content: { size: textContent.length },
    nodeSize,
    childCount: children.length,
    child: (index: number) => children[index],
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

  it('ignores normal paragraphs, blank trailing paragraphs, and mixed visual paragraphs', () => {
    const token = contextToken()
    const image = pmNode('image', '', 1)
    const text = pmNode('text', 'caption', 7)

    expect(getTerminalBlockLandingTarget(pmDoc([pmNode('paragraph', 'normal text')]))).toBeNull()
    expect(getTerminalBlockLandingTarget(pmDoc([pmNode('codeBlock', 'code'), pmNode('paragraph', '')]))).toBeNull()
    expect(getTerminalBlockLandingTarget(pmDoc([pmNode('paragraph', `${token} extra text`)]))).toBeNull()
    expect(getTerminalBlockLandingTarget(pmDoc([pmNode('paragraph', 'caption', 10, [image, text])]))).toBeNull()
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

function fakeTerminalElement(kind: 'code' | 'table' | 'preview' | 'image') {
  return {
    childNodes: [],
    getBoundingClientRect: () => ({ top: 100, bottom: 200, left: 40, right: 240 }),
    matches: (selector: string) => {
      if (kind === 'code') return selector === '.toastui-editor-ww-code-block'
      if (kind === 'table') return selector === 'table'
      if (kind === 'preview') return selector === '.note-context-widget'
      if (kind === 'image') return selector === 'img'
      return false
    },
    closest: (selector: string) => {
      if (selector === '.context-preview-editor-host') return null
      if (selector === 'p' && kind === 'image') return {}
      if (selector === '.toastui-editor-ww-code-block' && kind === 'code') return {}
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

const terminalBoundaryCases = [
  { label: 'code block', kind: 'code' as const, node: () => pmNode('codeBlock', 'code', 6), domPosition: 1 },
  { label: 'table', kind: 'table' as const, node: () => pmNode('table', '', 8), domPosition: 1 },
  { label: 'note preview', kind: 'preview' as const, node: () => pmNode('paragraph', contextToken(), 30), domPosition: 1 },
  {
    label: 'image',
    kind: 'image' as const,
    node: () => pmNode('paragraph', '', 3, [pmNode('image', '', 1)]),
    domPosition: 1,
  },
]

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
})
