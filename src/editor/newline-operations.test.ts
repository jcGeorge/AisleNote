import { describe, expect, it } from 'vitest'
import { getBulletListMarkerFromAttrs } from './list-markers'
import { isCompatibleListNodeForOperation } from './list-operation-compatibility'
import { createOperationNodes } from './newline-operation-nodes'

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
})
