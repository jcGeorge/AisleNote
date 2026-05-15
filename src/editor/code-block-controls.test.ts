import { describe, expect, it, vi } from 'vitest'
import {
  deleteCodeBlockAtPosition,
  findCodeBlockPositionForElement,
  getCodeBlockNodeText,
  type CodeBlockControlsView,
} from './code-block-controls'

function pmNode(typeName: string, textContent = '', nodeSize = textContent.length + 2) {
  return {
    type: { name: typeName },
    textContent,
    content: { size: textContent.length },
    nodeSize,
  }
}

function pmDoc(children: Array<ReturnType<typeof pmNode>>) {
  const starts: number[] = []
  let position = 0
  for (const child of children) {
    starts.push(position)
    position += child.nodeSize
  }

  return {
    childCount: children.length,
    child: (index: number) => children[index],
    nodeAt: (targetPosition: number) => {
      const index = starts.indexOf(targetPosition)
      return index >= 0 ? children[index] : null
    },
    descendants: (callback: (node: ReturnType<typeof pmNode>, position: number) => void | boolean) => {
      for (let index = 0; index < children.length; index += 1) {
        callback(children[index], starts[index])
      }
    },
  }
}

function createFakeView(children: Array<ReturnType<typeof pmNode>>) {
  const doc = pmDoc(children)
  const paragraph = pmNode('paragraph', '')
  const schema = {
    nodes: {
      paragraph: {
        create: vi.fn(() => paragraph),
      },
    },
  }
  const tr = {
    doc,
    delete: vi.fn(function deleteNode(this: any) {
      return this
    }),
    replaceWith: vi.fn(function replaceWith(this: any) {
      return this
    }),
    setSelection: vi.fn(function setSelection(this: any) {
      return this
    }),
    scrollIntoView: vi.fn(function scrollIntoView(this: any) {
      return this
    }),
  }
  const view: CodeBlockControlsView = {
    state: { doc, schema, tr },
    dispatch: vi.fn(),
    focus: vi.fn(),
  }
  return { view, tr, schema, paragraph }
}

describe('code block controls helpers', () => {
  it('resolves code text only from code block nodes', () => {
    expect(getCodeBlockNodeText(pmNode('codeBlock', 'const x = 1\nx'))).toBe('const x = 1\nx')
    expect(getCodeBlockNodeText(pmNode('paragraph', 'const x = 1'))).toBeNull()
  })

  it('deletes a code block among other blocks through editor history', () => {
    const before = pmNode('paragraph', 'before', 8)
    const code = pmNode('codeBlock', 'code', 6)
    const after = pmNode('paragraph', 'after', 7)
    const { view, tr } = createFakeView([before, code, after])

    expect(deleteCodeBlockAtPosition(view, 8)).toBe(true)

    expect(tr.delete).toHaveBeenCalledWith(8, 14)
    expect(tr.replaceWith).not.toHaveBeenCalled()
    expect(tr.scrollIntoView).toHaveBeenCalled()
    expect(view.dispatch).toHaveBeenCalledWith(tr)
    expect(view.focus).toHaveBeenCalled()
  })

  it('replaces an only-child code block with an empty paragraph', () => {
    const code = pmNode('codeBlock', 'code', 6)
    const { view, tr, paragraph } = createFakeView([code])
    const TextSelection = { create: vi.fn((_doc, anchor, head) => ({ anchor, head })) }

    expect(deleteCodeBlockAtPosition(view, 0, TextSelection)).toBe(true)

    expect(tr.replaceWith).toHaveBeenCalledWith(0, 6, paragraph)
    expect(tr.delete).not.toHaveBeenCalled()
    expect(TextSelection.create).toHaveBeenCalledWith(tr.doc, 1, 1)
    expect(tr.setSelection).toHaveBeenCalledWith({ anchor: 1, head: 1 })
    expect(view.dispatch).toHaveBeenCalledWith(tr)
  })

  it('ignores stale and non-code-block positions', () => {
    const paragraph = pmNode('paragraph', 'text', 6)
    const { view } = createFakeView([paragraph])

    expect(deleteCodeBlockAtPosition(view, 0)).toBe(false)
    expect(deleteCodeBlockAtPosition(view, 500)).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('finds the code block position for a rendered Toast UI wrapper', () => {
    const code = pmNode('codeBlock', 'code', 6)
    const { view } = createFakeView([code])
    const wrapperRef: { current: Element | null } = { current: null }
    const codeElement = {
      closest: (selector: string) => selector === '.toastui-editor-ww-code-block' ? wrapperRef.current : null,
    }
    const wrapper = {
      closest: (selector: string) => selector === '.toastui-editor-ww-code-block' ? wrapperRef.current : null,
      querySelector: (selector: string) => selector === 'code' ? codeElement : null,
      contains: (node: unknown) => node === wrapperRef.current || node === codeElement,
    } as unknown as Element
    wrapperRef.current = wrapper
    view.posAtDOM = vi.fn(() => 0)
    view.nodeDOM = vi.fn(() => wrapper as unknown as Node)

    expect(findCodeBlockPositionForElement(view, codeElement as unknown as Element)).toBe(0)
  })
})
