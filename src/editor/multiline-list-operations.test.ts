import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { createBulletListAttrs, getBulletListMarkerFromAttrs } from './list-markers'
import {
  buildMultiLineListOperationPlan,
  createMultiLineListNode,
  getAdjacentIndexGroups,
  getMultiLineListMarkerShortcut,
  type MultiLineListOperation,
} from './multiline-list-operations'
import type { MultiLineEditState } from '../types/app'

const multilineListSchema = new Schema({
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
      attrs: {
        level: { default: 1 },
        headingType: { default: 'atx' },
      },
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    codeBlock: {
      group: 'block',
      content: 'text*',
      code: true,
      toDOM: () => ['pre', ['code', 0]],
    },
    blockQuote: {
      group: 'block',
      content: 'block+',
      toDOM: () => ['blockquote', 0],
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

function paragraph(text: string) {
  return multilineListSchema.nodes.paragraph.create(null, text ? multilineListSchema.text(text) : undefined)
}

function heading(text: string, level = 2) {
  return multilineListSchema.nodes.heading.create(
    { level, headingType: 'atx' },
    text ? multilineListSchema.text(text) : undefined,
  )
}

function codeBlock(text: string) {
  return multilineListSchema.nodes.codeBlock.create(null, text ? multilineListSchema.text(text) : undefined)
}

function blockQuote(texts: string[]) {
  return multilineListSchema.nodes.blockQuote.create(null, texts.map((text) => paragraph(text)))
}

function listItem(text: string, attrs: Record<string, unknown> | null = null) {
  return multilineListSchema.nodes.listItem.create(attrs, paragraph(text))
}

function bulletList(texts: string[], marker: 'bullet' | 'dash' = 'bullet') {
  return multilineListSchema.nodes.bulletList.create(
    createBulletListAttrs(marker),
    texts.map((text) => listItem(text)),
  )
}

function taskList(texts: string[]) {
  return multilineListSchema.nodes.bulletList.create(
    createBulletListAttrs('bullet'),
    texts.map((text) => listItem(text, { task: true, checked: false })),
  )
}

function orderedList(texts: string[]) {
  return multilineListSchema.nodes.orderedList.create(
    { order: 1 },
    texts.map((text) => listItem(text)),
  )
}

function createView(doc: any) {
  let state = EditorState.create({ doc })
  return {
    get state() {
      return state
    },
    apply(transaction: any) {
      state = state.apply(transaction)
      return state
    },
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

function multiLineState(indices: number[], columnOffset = 0): MultiLineEditState {
  return {
    anchorBlockIndex: indices[0],
    headBlockIndex: indices[indices.length - 1],
    columnOffset,
    cursorBlockIndices: indices,
  }
}

function applyListOperation(doc: any, indices: number[], operation: MultiLineListOperation) {
  const view = createView(doc)
  const plan = buildMultiLineListOperationPlan(view, multiLineState(indices), operation)
  expect(plan).not.toBeNull()
  return view.apply(plan!.transaction).doc
}

describe('multi-cursor list operations', () => {
  it('groups adjacent selected line indices', () => {
    expect(getAdjacentIndexGroups([3, 1, 2, 6])).toEqual([[1, 2, 3], [6]])
  })

  it('creates nodes for each supported list operation', () => {
    const dash = createMultiLineListNode(multilineListSchema, 'dashList', ['one'])
    const bullet = createMultiLineListNode(multilineListSchema, 'bulletList', ['one'])
    const ordered = createMultiLineListNode(multilineListSchema, 'numberedList', ['one'])
    const task = createMultiLineListNode(multilineListSchema, 'task', ['one'])

    expect(getBulletListMarkerFromAttrs(dash?.attrs)).toBe('dash')
    expect(getBulletListMarkerFromAttrs(bullet?.attrs)).toBe('bullet')
    expect(ordered?.type.name).toBe('orderedList')
    expect(task?.child(0).attrs).toMatchObject({ task: true, checked: false })
  })

  it('turns adjacent multi-cursor lines into one list', () => {
    const view = createView(multilineListSchema.nodes.doc.create(null, [paragraph('one'), paragraph('two')]))
    const plan = buildMultiLineListOperationPlan(view, multiLineState([0, 1]), 'bulletList')
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.child(0).type.name).toBe('bulletList')
    expect(listTexts(nextState.doc.child(0))).toEqual(['one', 'two'])
  })

  it('turns paragraphs into each requested list kind', () => {
    const operations: Array<[MultiLineListOperation, string, unknown]> = [
      ['dashList', 'bulletList', 'dash'],
      ['bulletList', 'bulletList', 'bullet'],
      ['numberedList', 'orderedList', null],
      ['task', 'bulletList', 'task'],
    ]

    operations.forEach(([operation, nodeType, marker]) => {
      const doc = applyListOperation(
        multilineListSchema.nodes.doc.create(null, [paragraph('one'), paragraph('two')]),
        [0, 1],
        operation,
      )

      expect(doc.child(0).type.name).toBe(nodeType)
      expect(listTexts(doc.child(0))).toEqual(['one', 'two'])
      if (marker === 'dash' || marker === 'bullet') {
        expect(getBulletListMarkerFromAttrs(doc.child(0).attrs)).toBe(marker)
      }
      if (marker === 'task') {
        expect(doc.child(0).child(0).attrs).toMatchObject({ task: true, checked: false })
      }
    })
  })

  it('turns selected headings and paragraphs into lists while preserving row order', () => {
    const doc = applyListOperation(
      multilineListSchema.nodes.doc.create(null, [heading('title'), paragraph('body'), heading('tail', 3)]),
      [0, 1, 2],
      'bulletList',
    )

    expect(doc.childCount).toBe(1)
    expect(doc.child(0).type.name).toBe('bulletList')
    expect(listTexts(doc.child(0))).toEqual(['title', 'body', 'tail'])
  })

  it('turns empty headings into empty list items', () => {
    const doc = applyListOperation(
      multilineListSchema.nodes.doc.create(null, [heading(''), paragraph('body')]),
      [0, 1],
      'task',
    )

    expect(doc.child(0).type.name).toBe('bulletList')
    expect(listTexts(doc.child(0))).toEqual(['', 'body'])
    expect(doc.child(0).child(0).attrs).toMatchObject({ task: true, checked: false })
  })

  it('turns selected headings and paragraphs into each requested list kind', () => {
    const operations: Array<[MultiLineListOperation, string, unknown]> = [
      ['dashList', 'bulletList', 'dash'],
      ['bulletList', 'bulletList', 'bullet'],
      ['numberedList', 'orderedList', null],
      ['task', 'bulletList', 'task'],
    ]

    operations.forEach(([operation, nodeType, marker]) => {
      const doc = applyListOperation(
        multilineListSchema.nodes.doc.create(null, [heading('one'), paragraph('two')]),
        [0, 1],
        operation,
      )

      expect(doc.child(0).type.name).toBe(nodeType)
      expect(listTexts(doc.child(0))).toEqual(['one', 'two'])
      if (marker === 'dash' || marker === 'bullet') {
        expect(getBulletListMarkerFromAttrs(doc.child(0).attrs)).toBe(marker)
      }
      if (marker === 'task') {
        expect(doc.child(0).child(0).attrs).toMatchObject({ task: true, checked: false })
      }
    })
  })

  it('turns non-adjacent multi-cursor lines into separate lists', () => {
    const view = createView(
      multilineListSchema.nodes.doc.create(null, [paragraph('one'), paragraph('middle'), paragraph('three')]),
    )
    const plan = buildMultiLineListOperationPlan(view, multiLineState([0, 2]), 'numberedList')
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.child(0).type.name).toBe('orderedList')
    expect(nextState.doc.child(1).type.name).toBe('paragraph')
    expect(nextState.doc.child(2).type.name).toBe('orderedList')
  })

  it('toggles selected existing list rows back to paragraphs and leaves neighbors listed', () => {
    const doc = applyListOperation(
      multilineListSchema.nodes.doc.create(null, [bulletList(['one', 'two', 'three', 'four'])]),
      [1, 2],
      'bulletList',
    )

    expect(docChildTypes(doc)).toEqual(['bulletList', 'paragraph', 'paragraph', 'bulletList'])
    expect(listTexts(doc.child(0))).toEqual(['one'])
    expect(doc.child(1).textContent).toBe('two')
    expect(doc.child(2).textContent).toBe('three')
    expect(listTexts(doc.child(3))).toEqual(['four'])
  })

  it('converts selected list rows to another list kind and splits around unselected rows', () => {
    const doc = applyListOperation(
      multilineListSchema.nodes.doc.create(null, [bulletList(['one', 'two', 'three', 'four'])]),
      [1, 2],
      'dashList',
    )

    expect(docChildTypes(doc)).toEqual(['bulletList', 'bulletList', 'bulletList'])
    expect(getBulletListMarkerFromAttrs(doc.child(0).attrs)).toBe('bullet')
    expect(getBulletListMarkerFromAttrs(doc.child(1).attrs)).toBe('dash')
    expect(getBulletListMarkerFromAttrs(doc.child(2).attrs)).toBe('bullet')
    expect(listTexts(doc.child(0))).toEqual(['one'])
    expect(listTexts(doc.child(1))).toEqual(['two', 'three'])
    expect(listTexts(doc.child(2))).toEqual(['four'])
  })

  it('converts selected list rows to ordered and task lists', () => {
    const orderedDoc = applyListOperation(
      multilineListSchema.nodes.doc.create(null, [bulletList(['one', 'two'], 'dash')]),
      [0, 1],
      'numberedList',
    )
    const taskDoc = applyListOperation(
      multilineListSchema.nodes.doc.create(null, [orderedList(['one', 'two'])]),
      [0, 1],
      'task',
    )

    expect(orderedDoc.child(0).type.name).toBe('orderedList')
    expect(listTexts(orderedDoc.child(0))).toEqual(['one', 'two'])
    expect(taskDoc.child(0).type.name).toBe('bulletList')
    expect(taskDoc.child(0).child(0).attrs).toMatchObject({ task: true, checked: false })
  })

  it('toggles selected task list rows back to paragraphs', () => {
    const doc = applyListOperation(
      multilineListSchema.nodes.doc.create(null, [taskList(['one', 'two'])]),
      [0, 1],
      'task',
    )

    expect(docChildTypes(doc)).toEqual(['paragraph', 'paragraph'])
    expect(doc.child(0).textContent).toBe('one')
    expect(doc.child(1).textContent).toBe('two')
  })

  it.each([
    ['-', 'dashList'],
    ['*', 'bulletList'],
    ['+', 'bulletList'],
    ['1.', 'numberedList'],
    ['1)', 'numberedList'],
  ] as Array<[string, MultiLineListOperation]>)('expands multi-cursor typed marker %s on Space', (marker, operation) => {
    const view = createView(multilineListSchema.nodes.doc.create(null, [paragraph(marker), paragraph(marker)]))
    const state = multiLineState([0, 1], marker.length)
    const shortcut = getMultiLineListMarkerShortcut(view, state)

    expect(shortcut?.operation).toBe(operation)
    const plan = shortcut
      ? buildMultiLineListOperationPlan(view, state, shortcut.operation, { textByBlockIndex: shortcut.textByBlockIndex })
      : null
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.child(0).type.name).toBe(operation === 'numberedList' ? 'orderedList' : 'bulletList')
    expect(listTexts(nextState.doc.child(0))).toEqual(['', ''])
  })

  it('does not expand mixed or non-bare typed multi-cursor markers', () => {
    const mixedView = createView(multilineListSchema.nodes.doc.create(null, [paragraph('-'), paragraph('*')]))
    const nonBareView = createView(multilineListSchema.nodes.doc.create(null, [paragraph('- item'), paragraph('- item')]))

    expect(getMultiLineListMarkerShortcut(mixedView, multiLineState([0, 1], 1))).toBeNull()
    expect(getMultiLineListMarkerShortcut(nonBareView, multiLineState([0, 1], 1))).toBeNull()
  })

  it('turns selected blockquote rows into lists and preserves unselected quoted rows', () => {
    const doc = applyListOperation(
      multilineListSchema.nodes.doc.create(null, [blockQuote(['keep', 'one', 'two', 'keep'])]),
      [1, 2],
      'bulletList',
    )

    expect(docChildTypes(doc)).toEqual(['blockQuote', 'bulletList', 'blockQuote'])
    expect(doc.child(0).textContent).toBe('keep')
    expect(listTexts(doc.child(1))).toEqual(['one', 'two'])
    expect(doc.child(2).textContent).toBe('keep')
  })

  it('turns selected code block lines into lists and preserves unselected code lines', () => {
    const doc = applyListOperation(
      multilineListSchema.nodes.doc.create(null, [codeBlock('keep\none\ntwo\nkeep')]),
      [1, 2],
      'numberedList',
    )

    expect(docChildTypes(doc)).toEqual(['codeBlock', 'orderedList', 'codeBlock'])
    expect(doc.child(0).textContent).toBe('keep')
    expect(listTexts(doc.child(1))).toEqual(['one', 'two'])
    expect(doc.child(2).textContent).toBe('keep')
  })
})
