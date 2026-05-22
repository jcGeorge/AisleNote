import { describe, expect, it, vi } from 'vitest'
import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { getBulletListMarkerFromAttrs } from './list-markers'
import { isCompatibleListNodeForOperation } from './list-operation-compatibility'
import { applyEditorNewlineOperation, getEmptyLineReplacementRangeForOperation } from './newline-operations'
import { createOperationNodes } from './newline-operation-nodes'
import { getEditorTextLineRanges } from './multiline-ranges'
import type { NewlineOperationId } from '../types/app'
import { BLOCK_INDENT_TOKEN, INDENT_TOKEN } from '../markdown/markdown-utils'

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

const newlineOperationSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    bulletList: {
      group: 'block',
      content: 'listItem+',
      attrs: {
        htmlAttrs: { default: null },
        classNames: { default: null },
      },
      toDOM: () => ['ul', 0],
    },
    orderedList: {
      group: 'block',
      content: 'listItem+',
      attrs: {
        order: { default: 1 },
      },
      toDOM: () => ['ol', 0],
    },
    listItem: {
      content: 'paragraph block*',
      attrs: {
        task: { default: null },
        checked: { default: null },
      },
      toDOM: () => ['li', 0],
    },
  },
})

function paragraphNode(text: string) {
  return newlineOperationSchema.nodes.paragraph.create(null, text ? newlineOperationSchema.text(text) : undefined)
}

function listItemNode(text: string, attrs: Record<string, unknown> | null = null) {
  return newlineOperationSchema.nodes.listItem.create(attrs, paragraphNode(text))
}

function bulletListNode(items: Array<{ text: string; attrs?: Record<string, unknown> | null }>) {
  return newlineOperationSchema.nodes.bulletList.create(
    { htmlAttrs: null, classNames: null },
    items.map((item) => listItemNode(item.text, item.attrs ?? null)),
  )
}

function orderedListNode(texts: string[]) {
  return newlineOperationSchema.nodes.orderedList.create(
    { order: 1 },
    texts.map((text) => listItemNode(text)),
  )
}

function createEditorForDoc(doc: any, selectionFrom: number, selectionTo: number) {
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, selectionFrom, selectionTo),
  })
  const view = {
    get state() {
      return state
    },
    dispatch: vi.fn((transaction) => {
      state = state.apply(transaction)
    }),
  }
  return {
    editor: {
      wwEditor: { view },
      focus: vi.fn(),
    },
    view,
  }
}

function listTexts(listNode: any): string[] {
  const texts: string[] = []
  for (let index = 0; index < listNode.childCount; index += 1) {
    texts.push(listNode.child(index).textContent)
  }
  return texts
}

function docChildTypes(doc: any): string[] {
  const types: string[] = []
  for (let index = 0; index < doc.childCount; index += 1) {
    types.push(doc.child(index).type.name)
  }
  return types
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

  it('strips block indent tokens from generated block quotes', () => {
    const [node] = createOperationNodes(
      createTestSchema(),
      'blockQuote',
      `${BLOCK_INDENT_TOKEN}${INDENT_TOKEN}one`,
    ) as unknown as TestNode[]
    const [paragraphNode] = node.content as TestNode[]
    const textNode = paragraphNode.content as TestNode

    expect(node.type).toBe('blockQuote')
    expect(paragraphNode.type).toBe('paragraph')
    expect(textNode.text).toBe(`${INDENT_TOKEN}one`)
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

  it('converts selected mixed-list bullet rows to tasks without deleting earlier task rows', () => {
    const doc = newlineOperationSchema.nodes.doc.create(null, [
      bulletListNode([
        { text: 'existing task one', attrs: { task: true, checked: false } },
        { text: 'existing task two', attrs: { task: true, checked: false } },
        { text: 'new task from bullet' },
        { text: '' },
      ]),
    ])
    const ranges = getEditorTextLineRanges({ state: { doc } })
    const { editor, view } = createEditorForDoc(doc, ranges[2].start, ranges[3].end)

    expect(applyEditorNewlineOperation(editor as any, 'task')).toEqual({ handled: true })

    expect(view.state.doc.childCount).toBe(2)
    expect(listTexts(view.state.doc.child(0))).toEqual(['existing task one', 'existing task two'])
    expect(view.state.doc.child(0).child(0).attrs).toMatchObject({ task: true, checked: false })
    expect(view.state.doc.child(0).child(1).attrs).toMatchObject({ task: true, checked: false })
    expect(listTexts(view.state.doc.child(1))).toEqual(['new task from bullet', ''])
    expect(view.state.doc.child(1).child(0).attrs).toMatchObject({ task: true, checked: false })
    expect(view.state.doc.child(1).child(1).attrs).toMatchObject({ task: true, checked: false })
    expect(view.dispatch.mock.calls[0]?.[0]?.getMeta('addToHistory')).not.toBe(false)
  })

  it('converts selected numbered row text to a task without deleting sibling rows', () => {
    const doc = newlineOperationSchema.nodes.doc.create(null, [
      orderedListNode(['Add parent tab', 'Add sub-tab', 'Each note keeps separate content']),
    ])
    const ranges = getEditorTextLineRanges({ state: { doc } })
    const { editor, view } = createEditorForDoc(doc, ranges[1].start, ranges[1].end)

    expect(applyEditorNewlineOperation(editor as any, 'task')).toEqual({ handled: true })

    expect(docChildTypes(view.state.doc)).toEqual(['orderedList', 'bulletList', 'orderedList'])
    expect(listTexts(view.state.doc.child(0))).toEqual(['Add parent tab'])
    expect(listTexts(view.state.doc.child(1))).toEqual(['Add sub-tab'])
    expect(view.state.doc.child(1).child(0).attrs).toMatchObject({ task: true, checked: false })
    expect(listTexts(view.state.doc.child(2))).toEqual(['Each note keeps separate content'])
    expect(view.dispatch.mock.calls[0]?.[0]?.getMeta('addToHistory')).not.toBe(false)
  })

  it('converts selected first and last numbered rows without deleting the other rows', () => {
    const firstRowDoc = newlineOperationSchema.nodes.doc.create(null, [orderedListNode(['one', 'two', 'three'])])
    const firstRowRanges = getEditorTextLineRanges({ state: { doc: firstRowDoc } })
    const firstRow = createEditorForDoc(firstRowDoc, firstRowRanges[0].start, firstRowRanges[0].end)

    expect(applyEditorNewlineOperation(firstRow.editor as any, 'task')).toEqual({ handled: true })
    expect(docChildTypes(firstRow.view.state.doc)).toEqual(['bulletList', 'orderedList'])
    expect(listTexts(firstRow.view.state.doc.child(0))).toEqual(['one'])
    expect(listTexts(firstRow.view.state.doc.child(1))).toEqual(['two', 'three'])

    const lastRowDoc = newlineOperationSchema.nodes.doc.create(null, [orderedListNode(['one', 'two', 'three'])])
    const lastRowRanges = getEditorTextLineRanges({ state: { doc: lastRowDoc } })
    const lastRow = createEditorForDoc(lastRowDoc, lastRowRanges[2].start, lastRowRanges[2].end)

    expect(applyEditorNewlineOperation(lastRow.editor as any, 'task')).toEqual({ handled: true })
    expect(docChildTypes(lastRow.view.state.doc)).toEqual(['orderedList', 'bulletList'])
    expect(listTexts(lastRow.view.state.doc.child(0))).toEqual(['one', 'two'])
    expect(listTexts(lastRow.view.state.doc.child(1))).toEqual(['three'])
  })

  it('expands partial selected numbered row text to the whole row before converting to a task', () => {
    const doc = newlineOperationSchema.nodes.doc.create(null, [
      orderedListNode(['Add parent tab', 'Add sub-tab', 'Each note keeps separate content']),
    ])
    const ranges = getEditorTextLineRanges({ state: { doc } })
    const { editor, view } = createEditorForDoc(doc, ranges[1].start + 4, ranges[1].start + 7)

    expect(applyEditorNewlineOperation(editor as any, 'task')).toEqual({ handled: true })

    expect(docChildTypes(view.state.doc)).toEqual(['orderedList', 'bulletList', 'orderedList'])
    expect(listTexts(view.state.doc.child(0))).toEqual(['Add parent tab'])
    expect(listTexts(view.state.doc.child(1))).toEqual(['Add sub-tab'])
    expect(listTexts(view.state.doc.child(2))).toEqual(['Each note keeps separate content'])
  })

  it('converts selected numbered row ranges to tasks and preserves unselected rows', () => {
    const doc = newlineOperationSchema.nodes.doc.create(null, [
      orderedListNode(['one', 'two', 'three', 'four']),
    ])
    const ranges = getEditorTextLineRanges({ state: { doc } })
    const { editor, view } = createEditorForDoc(doc, ranges[1].start, ranges[2].end)

    expect(applyEditorNewlineOperation(editor as any, 'task')).toEqual({ handled: true })

    expect(docChildTypes(view.state.doc)).toEqual(['orderedList', 'bulletList', 'orderedList'])
    expect(listTexts(view.state.doc.child(0))).toEqual(['one'])
    expect(listTexts(view.state.doc.child(1))).toEqual(['two', 'three'])
    expect(view.state.doc.child(1).child(0).attrs).toMatchObject({ task: true, checked: false })
    expect(view.state.doc.child(1).child(1).attrs).toMatchObject({ task: true, checked: false })
    expect(listTexts(view.state.doc.child(2))).toEqual(['four'])
  })

  it('converts an empty selected numbered row to an empty task without deleting sibling rows', () => {
    const doc = newlineOperationSchema.nodes.doc.create(null, [orderedListNode(['one', '', 'three'])])
    const ranges = getEditorTextLineRanges({ state: { doc } })
    const { editor, view } = createEditorForDoc(doc, ranges[1].start, ranges[2].start)

    expect(applyEditorNewlineOperation(editor as any, 'task')).toEqual({ handled: true })

    expect(docChildTypes(view.state.doc)).toEqual(['orderedList', 'bulletList', 'orderedList'])
    expect(listTexts(view.state.doc.child(0))).toEqual(['one'])
    expect(listTexts(view.state.doc.child(1))).toEqual([''])
    expect(view.state.doc.child(1).child(0).attrs).toMatchObject({ task: true, checked: false })
    expect(listTexts(view.state.doc.child(2))).toEqual(['three'])
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
