import { describe, expect, it, vi } from 'vitest'
import { getBulletListMarkerFromAttrs } from './list-markers'
import { isCompatibleListNodeForOperation } from './list-operation-compatibility'
import { applyEditorNewlineOperation, getEmptyLineReplacementRangeForOperation } from './newline-operations'
import { createOperationNodes } from './newline-operation-nodes'
import type { NewlineOperationId } from '../types/app'

type TestNode = {
  type: string
  attrs: unknown
  content?: unknown
  text?: string
}

function createTestNodeFactory(type: string) {
  return {
    create: (attrs?: unknown, content?: unknown): TestNode => ({
      type,
      attrs: attrs ?? null,
      content,
    }),
  }
}

function createTestSchema(): Parameters<typeof createOperationNodes>[0] {
  return {
    text: (text: string): TestNode => ({ type: 'text', attrs: null, text }),
    nodes: {
      paragraph: createTestNodeFactory('paragraph'),
      listItem: createTestNodeFactory('listItem'),
      bulletList: createTestNodeFactory('bulletList'),
      orderedList: createTestNodeFactory('orderedList'),
      thematicBreak: createTestNodeFactory('thematicBreak'),
      codeBlock: createTestNodeFactory('codeBlock'),
      blockQuote: createTestNodeFactory('blockQuote'),
    },
  }
}

function createPmNode(typeName: string, attrs: unknown = null, children: any[] = []) {
  return {
    type: { name: typeName },
    attrs,
    childCount: children.length,
    child: (index: number) => children[index],
  }
}

function createSelectionState({
  empty = true,
  depth = 1,
  typeName = 'paragraph',
  textContent = '',
  children,
  from = 4,
  to = 6,
}: {
  empty?: boolean
  depth?: number
  typeName?: string
  textContent?: string
  children?: Array<{ typeName: string; text?: string; textContent?: string; isText?: boolean }>
  from?: number
  to?: number
} = {}) {
  const parentChildren = children ?? null
  return {
    selection: {
      empty,
      $from: {
        depth,
        parent: {
          type: { name: typeName },
          textContent,
          ...(parentChildren
            ? {
                childCount: parentChildren.length,
                child: (index: number) => {
                  const child = parentChildren[index]
                  return {
                    type: { name: child.typeName },
                    text: child.text,
                    textContent: child.textContent,
                    isText: child.isText ?? child.typeName === 'text',
                  }
                },
              }
            : {}),
        },
        before: () => from,
        after: () => to,
      },
    },
  }
}

describe('editor newline operations', () => {
  it('creates dash-list nodes with dash marker attrs', () => {
    const [node] = createOperationNodes(createTestSchema(), 'dashList', 'one\ntwo') as unknown as TestNode[]

    expect(node.type).toBe('bulletList')
    expect(getBulletListMarkerFromAttrs(node.attrs)).toBe('dash')
    expect(node.content).toHaveLength(2)
  })

  it('keeps existing bullet and numbered list operations distinct', () => {
    const [bulletNode] = createOperationNodes(createTestSchema(), 'bulletList', 'one') as unknown as TestNode[]
    const [numberedNode] = createOperationNodes(createTestSchema(), 'numberedList', 'one') as unknown as TestNode[]

    expect(bulletNode.type).toBe('bulletList')
    expect(getBulletListMarkerFromAttrs(bulletNode.attrs)).toBe('bullet')
    expect(numberedNode.type).toBe('orderedList')
    expect(numberedNode.attrs).toEqual({ order: 1 })
  })

  it('only treats matching list kinds as compatible', () => {
    const taskItem = createPmNode('listItem', { task: true })
    const plainItem = createPmNode('listItem')
    const bulletList = createPmNode('bulletList', null, [plainItem])
    const dashList = createPmNode('bulletList', { htmlAttrs: { 'data-tabs-list-marker': 'dash' } }, [plainItem])
    const taskList = createPmNode('bulletList', null, [taskItem])
    const orderedList = createPmNode('orderedList', { order: 1 }, [plainItem])

    expect(isCompatibleListNodeForOperation(taskList, 'task')).toBe(true)
    expect(isCompatibleListNodeForOperation(taskList, 'bulletList')).toBe(false)
    expect(isCompatibleListNodeForOperation(bulletList, 'bulletList')).toBe(true)
    expect(isCompatibleListNodeForOperation(bulletList, 'dashList')).toBe(false)
    expect(isCompatibleListNodeForOperation(dashList, 'dashList')).toBe(true)
    expect(isCompatibleListNodeForOperation(orderedList, 'numberedList')).toBe(true)
    expect(isCompatibleListNodeForOperation(orderedList, 'bulletList')).toBe(false)
  })

  it('replaces an empty top-level paragraph for list shortcuts', () => {
    const operations: NewlineOperationId[] = ['task', 'dashList', 'bulletList', 'numberedList']

    operations.forEach((operation) => {
      expect(getEmptyLineReplacementRangeForOperation(operation, createSelectionState())).toEqual({ from: 4, to: 6 })
    })
  })

  it('replaces an empty top-level paragraph for block shortcuts', () => {
    const operations: NewlineOperationId[] = ['codeBlock', 'blockQuote', 'horizontalLine']

    operations.forEach((operation) => {
      expect(getEmptyLineReplacementRangeForOperation(operation, createSelectionState())).toEqual({ from: 4, to: 6 })
    })
  })

  it('does not replace empty lines for non-block shortcut operations', () => {
    const operations: NewlineOperationId[] = ['normalNewLine', 'aisle', 'inlineCode', 'strikethrough']

    operations.forEach((operation) => {
      expect(getEmptyLineReplacementRangeForOperation(operation, createSelectionState())).toBeNull()
    })
  })

  it('runs strikethrough as an inline editor command', () => {
    const exec = vi.fn()
    const focus = vi.fn()

    expect(applyEditorNewlineOperation({ exec, focus } as any, 'strikethrough')).toEqual({ handled: true })
    expect(exec).toHaveBeenCalledWith('strike')
    expect(focus).toHaveBeenCalled()
  })

  it('does not replace a non-empty paragraph', () => {
    expect(
      getEmptyLineReplacementRangeForOperation('bulletList', createSelectionState({ textContent: 'already here' })),
    ).toBeNull()
  })

  it('does not replace selected ranges', () => {
    expect(getEmptyLineReplacementRangeForOperation('bulletList', createSelectionState({ empty: false }))).toBeNull()
  })

  it('treats whitespace and zero-width placeholders as empty paragraph content', () => {
    expect(
      getEmptyLineReplacementRangeForOperation('bulletList', createSelectionState({ textContent: ' \u200b\t ' })),
    ).toEqual({ from: 4, to: 6 })
  })

  it('does not replace nested empty list item paragraphs', () => {
    expect(getEmptyLineReplacementRangeForOperation('bulletList', createSelectionState({ depth: 3 }))).toBeNull()
  })

  it('does not replace paragraphs containing non-text inline nodes', () => {
    expect(
      getEmptyLineReplacementRangeForOperation('bulletList', createSelectionState({
        children: [{ typeName: 'image', textContent: '' }],
      })),
    ).toBeNull()
  })
})
