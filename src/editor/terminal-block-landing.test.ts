import { describe, expect, it, vi } from 'vitest'
import {
  getTerminalBlockLandingTarget,
  insertTerminalLandingParagraphs,
  isNotePreviewOnlyParagraphText,
} from './terminal-block-landing'

function pmNode(typeName: string, textContent = '', nodeSize = textContent.length + 2) {
  return {
    type: { name: typeName },
    textContent,
    content: { size: textContent.length },
    nodeSize,
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

  it('detects a final paragraph containing only valid note preview tokens', () => {
    const token = contextToken()
    const doc = pmDoc([pmNode('paragraph', `${token} ${contextToken('second')}`, 50)])

    expect(isNotePreviewOnlyParagraphText(` ${token} `)).toBe(true)
    expect(getTerminalBlockLandingTarget(doc)).toEqual({
      kind: 'notePreview',
      position: 50,
    })
  })

  it('ignores normal paragraphs, blank trailing paragraphs, and mixed preview paragraphs', () => {
    const token = contextToken()

    expect(getTerminalBlockLandingTarget(pmDoc([pmNode('paragraph', 'normal text')]))).toBeNull()
    expect(getTerminalBlockLandingTarget(pmDoc([pmNode('codeBlock', 'code'), pmNode('paragraph', '')]))).toBeNull()
    expect(getTerminalBlockLandingTarget(pmDoc([pmNode('paragraph', `${token} extra text`)]))).toBeNull()
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
      dispatch: vi.fn(),
      focus: vi.fn(),
    },
    tr,
  }
}

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
})
