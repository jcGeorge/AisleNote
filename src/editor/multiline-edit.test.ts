import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import type { MultiLineEditState } from '../types/app'
import {
  buildDeletedLineMultiLineState,
  buildForwardBoundaryDeletePlan,
  buildSelectedRowDeletePlan,
  buildSplitLineMultiLineState,
  getEmptyMultiLineBlockDeleteTargets,
  getMultiLineSplitPlan,
  shouldApplyMultiLineBoundaryDelete,
} from './multiline-edit'
import { buildMultiLineHeadingOperationPlan } from './multiline-format-operations'
import { getEditorTextLineRanges } from './multiline-ranges'

const multilineEditSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    hardBreak: {
      inline: true,
      group: 'inline',
      selectable: false,
      toDOM: () => ['br'],
    },
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
    bulletList: {
      group: 'block',
      content: 'listItem+',
      attrs: {
        marker: { default: 'bullet' },
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
  return multilineEditSchema.nodes.paragraph.create(null, text ? multilineEditSchema.text(text) : undefined)
}

function hardBreak() {
  return multilineEditSchema.nodes.hardBreak.create()
}

function paragraphWithInlineBreaks(parts: string[]) {
  const children = parts.flatMap((part, index) => {
    const nodes = part ? [multilineEditSchema.text(part)] : []
    return index < parts.length - 1 ? [...nodes, hardBreak()] : nodes
  })
  return multilineEditSchema.nodes.paragraph.create(null, children)
}

function heading(text: string, level = 2) {
  return multilineEditSchema.nodes.heading.create(
    { level, headingType: 'atx' },
    text ? multilineEditSchema.text(text) : undefined,
  )
}

function codeBlock(text: string) {
  return multilineEditSchema.nodes.codeBlock.create(null, text ? multilineEditSchema.text(text) : undefined)
}

function taskItem(text: string) {
  return multilineEditSchema.nodes.listItem.create({ task: true, checked: false }, paragraph(text))
}

function taskList(texts: string[]) {
  return multilineEditSchema.nodes.bulletList.create(null, texts.map((text) => taskItem(text)))
}

function bulletList(texts: string[], marker: 'bullet' | 'dash' = 'bullet') {
  return multilineEditSchema.nodes.bulletList.create({ marker }, texts.map((text) => multilineEditSchema.nodes.listItem.create(null, paragraph(text))))
}

function orderedList(texts: string[]) {
  return multilineEditSchema.nodes.orderedList.create({ order: 1 }, texts.map((text) => multilineEditSchema.nodes.listItem.create(null, paragraph(text))))
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

function multiLineState(indices: number[], columnOffset = 0): MultiLineEditState {
  return {
    anchorBlockIndex: indices[0],
    headBlockIndex: indices[indices.length - 1],
    columnOffset,
    cursorBlockIndices: indices,
  }
}

function boundaryDeleteStateForRanges(ranges: ReturnType<typeof getEditorTextLineRanges>, indices: number[]): MultiLineEditState {
  return {
    ...multiLineState(indices, ranges[indices[indices.length - 1]]?.length ?? 0),
    columnOffsets: indices.reduce<Record<number, number>>((acc, index) => {
      acc[index] = ranges[index]?.length ?? 0
      return acc
    }, {}),
  }
}

function selectedRowsStateForRanges(ranges: ReturnType<typeof getEditorTextLineRanges>, indices: number[]): MultiLineEditState {
  return {
    ...boundaryDeleteStateForRanges(ranges, indices),
    selectionAnchorOffsets: indices.reduce<Record<number, number>>((acc, index) => {
      acc[index] = 0
      return acc
    }, {}),
  }
}

function applyBoundaryDelete(doc: any, indices: number[]) {
  const view = createView(doc)
  const ranges = getEditorTextLineRanges(view)
  const state = boundaryDeleteStateForRanges(ranges, indices)
  const plan = buildForwardBoundaryDeletePlan(view.state.tr, state, ranges, indices)
  return {
    view,
    ranges,
    state,
    plan,
    nextState: plan ? view.apply(plan.transaction) : null,
  }
}

function applyRealDeleteInput(doc: any, indices: number[], input: 'backspace' | 'delete') {
  const view = createView(doc)
  const ranges = getEditorTextLineRanges(view)
  const state = boundaryDeleteStateForRanges(ranges, indices)
  const shouldUseBoundary =
    (input === 'backspace' || input === 'delete') && shouldApplyMultiLineBoundaryDelete(state, indices, ranges)
  const plan = shouldUseBoundary ? buildForwardBoundaryDeletePlan(view.state.tr, state, ranges, indices) : null
  return {
    view,
    ranges,
    state,
    shouldUseBoundary,
    plan,
    nextState: plan ? view.apply(plan.transaction) : null,
  }
}

function applySelectedRowDelete(doc: any, indices: number[]) {
  const view = createView(doc)
  const ranges = getEditorTextLineRanges(view)
  const state = selectedRowsStateForRanges(ranges, indices)
  const plan = buildSelectedRowDeletePlan(view.state.tr, state, ranges, indices)
  return {
    view,
    ranges,
    state,
    plan,
    nextState: plan ? view.apply(plan.transaction) : null,
  }
}

describe('multi-cursor split line editing', () => {
  it('splits a heading into a paragraph continuation line', () => {
    const view = createView(multilineEditSchema.nodes.doc.create(null, [heading('Title'), paragraph('after')]))
    const range = getEditorTextLineRanges(view)[0]
    const plan = getMultiLineSplitPlan(view.state.doc, range.end)

    expect(plan).not.toBeNull()
    const nextState = view.apply(view.state.tr.split(range.end, plan!.depth, plan!.typesAfter))

    expect(nextState.doc.child(0).type.name).toBe('heading')
    expect(nextState.doc.child(0).textContent).toBe('Title')
    expect(nextState.doc.child(1).type.name).toBe('paragraph')
    expect(nextState.doc.child(1).textContent).toBe('')
  })

  it('clears active inline formats after split-line continuations are created', () => {
    const nextState = buildSplitLineMultiLineState(
      {
        ...multiLineState([0, 1], 3),
        activeInlineFormats: ['bold', 'italic'],
      },
      [0, 1],
    )

    expect(nextState.cursorBlockIndices).toEqual([1, 3])
    expect(nextState.activeInlineFormats).toBeUndefined()
  })
})

describe('multi-cursor empty line delete editing', () => {
  it('deletes selected empty top-level rows and clamps the remaining multi-cursor state', () => {
    const view = createView(
      multilineEditSchema.nodes.doc.create(null, [paragraph('one'), paragraph(''), paragraph(''), paragraph('four')]),
    )
    const ranges = getEditorTextLineRanges(view)
    const targets = getEmptyMultiLineBlockDeleteTargets(view.state.doc, ranges, [1, 2])

    expect(targets.map((target) => target.blockIndex)).toEqual([1, 2])

    let transaction = view.state.tr
    for (const target of [...targets].sort((a, b) => b.from - a.from)) {
      transaction = transaction.delete(target.from, target.to)
    }
    const nextEditorState = view.apply(transaction)

    expect(nextEditorState.doc.childCount).toBe(2)
    expect(nextEditorState.doc.child(0).textContent).toBe('one')
    expect(nextEditorState.doc.child(1).textContent).toBe('four')

    const nextMultiLineState = buildDeletedLineMultiLineState(multiLineState([1, 2]), [1, 2], [1, 2], ranges)
    expect(nextMultiLineState.cursorBlockIndices).toEqual([1])
    expect(nextMultiLineState.activeInlineFormats).toBeUndefined()
  })

  it('leaves one block when every selected row is an empty top-level row', () => {
    const view = createView(multilineEditSchema.nodes.doc.create(null, [paragraph(''), paragraph('')]))
    const ranges = getEditorTextLineRanges(view)

    expect(getEmptyMultiLineBlockDeleteTargets(view.state.doc, ranges, [0, 1]).map((target) => target.blockIndex)).toEqual([0])
  })

  it('handles heading-to-paragraph, repeated Enter, then Delete on generated empty rows', () => {
    const view = createView(multilineEditSchema.nodes.doc.create(null, [heading('one'), heading('two')]))
    const conversionPlan = buildMultiLineHeadingOperationPlan(view, multiLineState([0, 1]), 0)
    expect(conversionPlan).not.toBeNull()
    view.apply(conversionPlan!.transaction)
    expect(view.state.doc.child(0).type.name).toBe('paragraph')
    expect(view.state.doc.child(1).type.name).toBe('paragraph')

    let ranges = getEditorTextLineRanges(view)
    let transaction = view.state.tr

    for (const blockIndex of [1, 0]) {
      const range = ranges[blockIndex]
      const mappedPos = transaction.mapping.map(range.end, 1)
      const plan = getMultiLineSplitPlan(transaction.doc, mappedPos)
      expect(plan).not.toBeNull()
      transaction = transaction.split(mappedPos, plan!.depth, plan!.typesAfter)
    }
    view.apply(transaction)

    ranges = getEditorTextLineRanges(view)
    expect(ranges.map((range) => range.text)).toEqual(['one', '', 'two', ''])

    const continuationState = buildSplitLineMultiLineState(multiLineState([0, 1]), [0, 1])
    const continuationIndices = continuationState.cursorBlockIndices ?? []
    const targets = getEmptyMultiLineBlockDeleteTargets(view.state.doc, ranges, continuationIndices)
    expect(targets.map((target) => target.blockIndex)).toEqual([1, 3])

    transaction = view.state.tr
    for (const target of [...targets].sort((a, b) => b.from - a.from)) {
      transaction = transaction.delete(target.from, target.to)
    }
    const nextState = view.apply(transaction)

    expect(nextState.doc.childCount).toBe(2)
    expect(nextState.doc.child(0).textContent).toBe('one')
    expect(nextState.doc.child(1).textContent).toBe('two')
  })
})

describe('multi-cursor forward boundary delete editing', () => {
  it.each(['backspace', 'delete'] as const)('routes row-end %s through visible boundary deletion', (input) => {
    const result = applyRealDeleteInput(
      multilineEditSchema.nodes.doc.create(null, ['one', 'two', 'three'].map((text) => paragraph(text))),
      [0, 1, 2],
      input,
    )

    expect(result.shouldUseBoundary).toBe(true)
    expect(result.plan?.consumedNextLineBlockIndices).toEqual([1, 2])
    expect(result.nextState?.doc.child(0).textContent).toBe('onetwothree')
  })

  it.each(['backspace', 'delete'] as const)('keeps cursors on preceding rows after %s deletes empty paragraph rows', (input) => {
    const result = applyRealDeleteInput(
      multilineEditSchema.nodes.doc.create(null, [
        paragraph('header'),
        paragraph(''),
        paragraph('header'),
        paragraph(''),
        paragraph('header'),
        paragraph(''),
      ]),
      [1, 3, 5],
      input,
    )

    expect(result.plan?.deletedLineBlockIndices).toEqual([1, 3, 5])
    expect(getEditorTextLineRanges({ state: result.nextState }).map((range) => range.text)).toEqual([
      'header',
      'header',
      'header',
    ])
    expect(result.plan?.nextMultiLineEditState.cursorBlockIndices).toEqual([0, 1, 2])
    expect(result.plan?.nextMultiLineEditState.columnOffsets).toEqual({ 0: 6, 1: 6, 2: 6 })
    expect(result.plan?.nextMultiLineEditState.selectionAnchorOffsets).toBeUndefined()
  })

  it.each(['backspace', 'delete'] as const)('keeps cursors after %s deletes empty hard-break rows', (input) => {
    const result = applyRealDeleteInput(
      multilineEditSchema.nodes.doc.create(null, [paragraphWithInlineBreaks(['header', '', 'header', '', 'header', ''])]),
      [1, 3, 5],
      input,
    )

    expect(result.plan?.deletedLineBlockIndices).toEqual([1, 3, 5])
    expect(getEditorTextLineRanges({ state: result.nextState }).map((range) => range.text)).toEqual([
      'header',
      'header',
      'header',
    ])
    expect(result.plan?.nextMultiLineEditState.cursorBlockIndices).toEqual([0, 1, 2])
    expect(result.plan?.nextMultiLineEditState.columnOffsets).toEqual({ 0: 6, 1: 6, 2: 6 })
    expect(result.plan?.nextMultiLineEditState.selectionAnchorOffsets).toBeUndefined()
  })

  it('keeps cursors after deleting empty hard-break rows from a contiguous multi-line selection', () => {
    const result = applyBoundaryDelete(
      multilineEditSchema.nodes.doc.create(null, [paragraphWithInlineBreaks(['header', '', 'header', '', 'header', ''])]),
      [0, 1, 2, 3, 4, 5],
    )

    expect(result.plan?.deletedLineBlockIndices).toEqual([1, 3, 5])
    expect(getEditorTextLineRanges({ state: result.nextState }).map((range) => range.text)).toEqual([
      'header',
      'header',
      'header',
    ])
    expect(result.plan?.nextMultiLineEditState.cursorBlockIndices).toEqual([0, 1, 2])
    expect(result.plan?.nextMultiLineEditState.columnOffsets).toEqual({ 0: 6, 1: 6, 2: 6 })
  })

  it('keeps cursors on preceding task rows after deleting empty task rows', () => {
    const result = applyBoundaryDelete(multilineEditSchema.nodes.doc.create(null, [taskList(['keep', '', 'keep', ''])]), [1, 3])

    expect(result.plan?.deletedLineBlockIndices).toEqual([1, 3])
    expect(getEditorTextLineRanges({ state: result.nextState }).map((range) => range.text)).toEqual(['keep', 'keep'])
    expect(result.plan?.nextMultiLineEditState.cursorBlockIndices).toEqual([0, 1])
    expect(result.plan?.nextMultiLineEditState.columnOffsets).toEqual({ 0: 4, 1: 4 })
  })

  it('places a deleted leading empty row cursor on the next surviving row', () => {
    const result = applyBoundaryDelete(
      multilineEditSchema.nodes.doc.create(null, [paragraph(''), paragraph('header'), paragraph('')]),
      [0, 2],
    )

    expect(result.plan?.deletedLineBlockIndices).toEqual([0, 2])
    expect(getEditorTextLineRanges({ state: result.nextState }).map((range) => range.text)).toEqual(['header'])
    expect(result.plan?.nextMultiLineEditState.cursorBlockIndices).toEqual([0])
    expect(result.plan?.nextMultiLineEditState.columnOffsets).toEqual({ 0: 0 })
  })

  it('does not use row-end boundary deletion for mid-line cursors', () => {
    const view = createView(multilineEditSchema.nodes.doc.create(null, ['one', 'two'].map((text) => paragraph(text))))
    const ranges = getEditorTextLineRanges(view)
    const state = multiLineState([0, 1], 1)

    expect(shouldApplyMultiLineBoundaryDelete(state, [0, 1], ranges)).toBe(false)
  })

  it('does not use row-end boundary deletion for partial highlighted selections', () => {
    const view = createView(multilineEditSchema.nodes.doc.create(null, ['one', 'two'].map((text) => paragraph(text))))
    const ranges = getEditorTextLineRanges(view)
    const state: MultiLineEditState = {
      ...multiLineState([0, 1], 2),
      columnOffsets: { 0: 2, 1: 2 },
      selectionAnchorOffsets: { 0: 0, 1: 0 },
    }

    expect(shouldApplyMultiLineBoundaryDelete(state, [0, 1], ranges)).toBe(false)
  })

  it('collapses five selected paragraph row boundaries', () => {
    const result = applyBoundaryDelete(
      multilineEditSchema.nodes.doc.create(null, ['1', '2', '3', '4', '5'].map((text) => paragraph(text))),
      [0, 1, 2, 3, 4],
    )

    expect(result.plan?.consumedNextLineBlockIndices).toEqual([1, 2, 3, 4])
    expect(result.nextState?.doc.childCount).toBe(1)
    expect(result.nextState?.doc.child(0).type.name).toBe('paragraph')
    expect(result.nextState?.doc.child(0).textContent).toBe('12345')
  })

  it('collapses five selected task rows by removing task boundaries', () => {
    const result = applyBoundaryDelete(
      multilineEditSchema.nodes.doc.create(null, [taskList(['1', '2', '3', '4', '5'])]),
      [0, 1, 2, 3, 4],
    )

    expect(result.plan?.consumedNextLineBlockIndices).toEqual([1, 2, 3, 4])
    const list = result.nextState?.doc.child(0)
    expect(list?.type.name).toBe('bulletList')
    expect(list?.childCount).toBe(1)
    expect(list?.child(0).attrs.task).toBe(true)
    expect(list?.child(0).textContent).toBe('12345')
  })

  it.each([
    ['bullet', () => bulletList(['1', '2', '3'])],
    ['dash', () => bulletList(['1', '2', '3'], 'dash')],
    ['numbered', () => orderedList(['1', '2', '3'])],
  ])('collapses selected %s list row boundaries', (_label, createList) => {
    const result = applyBoundaryDelete(multilineEditSchema.nodes.doc.create(null, [createList()]), [0, 1, 2])

    expect(result.plan?.consumedNextLineBlockIndices).toEqual([1, 2])
    const list = result.nextState?.doc.child(0)
    expect(list?.childCount).toBe(1)
    expect(list?.child(0).textContent).toBe('123')
  })

  it('removes a task marker when a paragraph is before a task row', () => {
    const result = applyBoundaryDelete(multilineEditSchema.nodes.doc.create(null, [paragraph('a'), taskList(['b'])]), [0, 1])

    expect(result.plan?.consumedNextLineBlockIndices).toEqual([1])
    expect(result.nextState?.doc.childCount).toBe(1)
    expect(result.nextState?.doc.child(0).type.name).toBe('paragraph')
    expect(result.nextState?.doc.child(0).textContent).toBe('ab')
  })

  it('removes a list marker when a list row is before a paragraph row', () => {
    const result = applyBoundaryDelete(multilineEditSchema.nodes.doc.create(null, [taskList(['a']), paragraph('b')]), [0, 1])

    expect(result.plan?.consumedNextLineBlockIndices).toEqual([1])
    expect(result.nextState?.doc.childCount).toBe(1)
    expect(result.nextState?.doc.child(0).type.name).toBe('bulletList')
    expect(result.nextState?.doc.child(0).child(0).textContent).toBe('ab')
  })

  it('deletes an empty task row instead of leaving its marker behind', () => {
    const result = applyBoundaryDelete(multilineEditSchema.nodes.doc.create(null, [taskList(['', 'next'])]), [0])

    expect(result.plan?.deletedLineBlockIndices).toEqual([0])
    expect(result.nextState?.doc.childCount).toBe(1)
    expect(result.nextState?.doc.child(0).type.name).toBe('bulletList')
    expect(result.nextState?.doc.child(0).childCount).toBe(1)
    expect(result.nextState?.doc.child(0).child(0).textContent).toBe('next')
  })

  it('deletes empty list rows and leaves an empty paragraph when they were the whole document', () => {
    const result = applyBoundaryDelete(multilineEditSchema.nodes.doc.create(null, [taskList(['', ''])]), [0, 1])

    expect(result.plan?.deletedLineBlockIndices).toEqual([0, 1])
    expect(result.nextState?.doc.childCount).toBe(1)
    expect(result.nextState?.doc.child(0).type.name).toBe('paragraph')
    expect(result.nextState?.doc.child(0).textContent).toBe('')
  })

  it('deletes a code block internal newline at end of a code line', () => {
    const result = applyBoundaryDelete(multilineEditSchema.nodes.doc.create(null, [codeBlock('one\ntwo')]), [0])

    expect(result.plan?.consumedNextLineBlockIndices).toEqual([1])
    expect(result.nextState?.doc.child(0).textContent).toBe('onetwo')
  })

  it('no-ops at the final document boundary without blocking earlier selected rows', () => {
    const result = applyBoundaryDelete(
      multilineEditSchema.nodes.doc.create(null, ['1', '2', '3'].map((text) => paragraph(text))),
      [0, 1, 2],
    )

    expect(result.plan?.consumedNextLineBlockIndices).toEqual([1, 2])
    expect(result.nextState?.doc.child(0).textContent).toBe('123')
  })

  it('keeps mixed adjacent and non-adjacent cursor groups valid after boundary deletes', () => {
    const result = applyBoundaryDelete(
      multilineEditSchema.nodes.doc.create(null, ['a', 'b', 'c', 'd', 'e'].map((text) => paragraph(text))),
      [0, 2],
    )

    expect(result.plan?.consumedNextLineBlockIndices).toEqual([1, 3])
    expect(getEditorTextLineRanges({ state: result.nextState }).map((range) => range.text)).toEqual(['ab', 'cd', 'e'])
    const nextMultiLineState = result.plan!.nextMultiLineEditState
    expect(nextMultiLineState.cursorBlockIndices).toEqual([0, 1])
    expect(nextMultiLineState.columnOffsets).toEqual({ 0: 1, 1: 1 })
    expect(nextMultiLineState.selectionAnchorOffsets).toBeUndefined()
  })
})

describe('multi-cursor selected row delete editing', () => {
  it('deletes fully selected paragraph rows as whole rows', () => {
    const result = applySelectedRowDelete(
      multilineEditSchema.nodes.doc.create(null, ['keep', 'delete', 'delete', 'keep'].map((text) => paragraph(text))),
      [1, 2],
    )

    expect(result.plan?.deletedLineBlockIndices).toEqual([1, 2])
    expect(getEditorTextLineRanges({ state: result.nextState }).map((range) => range.text)).toEqual(['keep', 'keep'])
  })

  it('deletes a fully selected task list and leaves an empty paragraph when it was the whole document', () => {
    const result = applySelectedRowDelete(
      multilineEditSchema.nodes.doc.create(null, [taskList(['one', 'two', 'three'])]),
      [0, 1, 2],
    )

    expect(result.plan?.deletedLineBlockIndices).toEqual([0, 1, 2])
    expect(result.nextState?.doc.childCount).toBe(1)
    expect(result.nextState?.doc.child(0).type.name).toBe('paragraph')
    expect(result.nextState?.doc.child(0).textContent).toBe('')
  })

  it('deletes fully selected task rows and preserves unselected task rows', () => {
    const result = applySelectedRowDelete(
      multilineEditSchema.nodes.doc.create(null, [taskList(['keep', 'delete', 'delete', 'keep'])]),
      [1, 2],
    )

    expect(result.plan?.deletedLineBlockIndices).toEqual([1, 2])
    expect(result.nextState?.doc.childCount).toBe(2)
    expect(result.nextState?.doc.child(0).type.name).toBe('bulletList')
    expect(result.nextState?.doc.child(0).child(0).attrs.task).toBe(true)
    expect(result.nextState?.doc.child(0).textContent).toBe('keep')
    expect(result.nextState?.doc.child(1).type.name).toBe('bulletList')
    expect(result.nextState?.doc.child(1).child(0).attrs.task).toBe(true)
    expect(result.nextState?.doc.child(1).textContent).toBe('keep')
  })

  it.each([
    ['bullet', () => bulletList(['one', 'two', 'three'])],
    ['dash', () => bulletList(['one', 'two', 'three'], 'dash')],
    ['numbered', () => orderedList(['one', 'two', 'three'])],
  ])('deletes fully selected %s list rows as list items', (_label, createList) => {
    const result = applySelectedRowDelete(multilineEditSchema.nodes.doc.create(null, [createList()]), [1])

    expect(result.plan?.deletedLineBlockIndices).toEqual([1])
    expect(result.nextState?.doc.child(0).textContent).toBe('one')
    expect(result.nextState?.doc.child(1).textContent).toBe('three')
  })

  it('falls back when selected ranges do not cover complete rows', () => {
    const view = createView(multilineEditSchema.nodes.doc.create(null, [taskList(['one', 'two'])]))
    const ranges = getEditorTextLineRanges(view)
    const state: MultiLineEditState = {
      ...multiLineState([0, 1], 2),
      columnOffsets: { 0: 2, 1: 2 },
      selectionAnchorOffsets: { 0: 0, 1: 0 },
    }

    expect(buildSelectedRowDeletePlan(view.state.tr, state, ranges, [0, 1])).toBeNull()
  })
})
