import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import type { MultiLineEditState } from '../types/app'
import {
  applySingleCursorPageMovement,
  buildDeletedLineMultiLineState,
  buildForwardBoundaryDeletePlan,
  buildMissingMultiLineDownTargetLinePlan,
  buildSelectedRowDeletePlan,
  buildSplitLineMultiLineState,
  getEmptyMultiLineBlockDeleteTargets,
  getMultiLinePageMovementRowDelta,
  getMultiLineSplitPlan,
  moveMultiLineCursorRowsByDelta,
  moveMultiLineCursorState,
  shouldApplyMultiLineBoundaryDelete,
  shouldApplyMultiLineWholeSelectionBoundaryDelete,
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
    blockQuote: {
      group: 'block',
      content: 'block+',
      toDOM: () => ['blockquote', 0],
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

function blockQuote(texts: string[]) {
  return multilineEditSchema.nodes.blockQuote.create(null, texts.map((text) => paragraph(text)))
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
    get dom() {
      return { clientHeight: 72 }
    },
    apply(transaction: any) {
      state = state.apply(transaction)
      return state
    },
  }
}

function createDispatchingView(doc: any, selectionPosition: number) {
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, selectionPosition),
  })
  return {
    get state() {
      return state
    },
    dom: { clientHeight: 72 },
    dispatch(transaction: any) {
      state = state.apply(transaction)
    },
  }
}

function withPageCoordinates<T extends { state: EditorState }>(view: T, lineHeight = 20): T & {
  dom: { clientHeight: number }
  coordsAtPos: (position: number) => { left: number; top: number; bottom: number }
  posAtCoords: (coords: { left: number; top: number }) => { pos: number }
} {
  const ranges = getEditorTextLineRanges(view)
  return {
    ...(view as T),
    get state() {
      return view.state
    },
    dom: { clientHeight: 60 },
    coordsAtPos: (position: number) => {
      const index = Math.max(
        0,
        ranges.findIndex((range) => position >= range.start && position <= range.end),
      )
      const range = ranges[index]
      return {
        left: Math.max(0, position - (range?.start ?? position)) * 10,
        top: index * lineHeight,
        bottom: index * lineHeight + lineHeight,
      }
    },
    posAtCoords: ({ top }: { left: number; top: number }) => {
      const index = Math.max(0, Math.min(ranges.length - 1, Math.round(top / lineHeight)))
      return { pos: ranges[index].start }
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
  const shouldUseBoundary = shouldApplyMultiLineWholeSelectionBoundaryDelete(input, state, indices, ranges)
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

describe('multi-cursor missing line creation', () => {
  it('creates a paragraph target line when expanding down after the final paragraph', () => {
    const view = createView(multilineEditSchema.nodes.doc.create(null, [paragraph('alpha')]))
    const ranges = getEditorTextLineRanges(view)
    const plan = buildMissingMultiLineDownTargetLinePlan(view.state.tr, ranges, 0)

    expect(plan).not.toBeNull()
    expect(plan?.targetBlockIndex).toBe(1)
    view.apply(plan!.transaction)

    expect(view.state.doc.childCount).toBe(2)
    expect(view.state.doc.child(0).textContent).toBe('alpha')
    expect(view.state.doc.child(1).textContent).toBe('')
    expect(getEditorTextLineRanges(view).map((range) => range.text)).toEqual(['alpha', ''])
  })

  it('creates a code block target line when expanding down after the final code line', () => {
    const view = createView(multilineEditSchema.nodes.doc.create(null, [codeBlock('alpha')]))
    const ranges = getEditorTextLineRanges(view)
    const plan = buildMissingMultiLineDownTargetLinePlan(view.state.tr, ranges, 0)

    expect(plan).not.toBeNull()
    expect(plan?.targetBlockIndex).toBe(1)
    view.apply(plan!.transaction)

    expect(view.state.doc.childCount).toBe(1)
    expect(getEditorTextLineRanges(view).map((range) => range.text)).toEqual(['alpha', ''])
  })
})

describe('multi-cursor page movement editing', () => {
  it('moves all cursor rows by a page delta while preserving and clamping columns', () => {
    const view = createView(
      multilineEditSchema.nodes.doc.create(null, [
        paragraph('zero'),
        paragraph('one'),
        paragraph('two'),
        paragraph('three'),
        paragraph('x'),
        paragraph('longer'),
      ]),
    )
    const ranges = getEditorTextLineRanges(view)
    const state: MultiLineEditState = {
      ...multiLineState([1, 2], 3),
      columnOffsets: { 1: 3, 2: 3 },
    }
    const nextState = moveMultiLineCursorRowsByDelta(state, [1, 2], ranges, 3)

    expect(nextState.cursorBlockIndices).toEqual([4, 5])
    expect(nextState.anchorBlockIndex).toBe(4)
    expect(nextState.headBlockIndex).toBe(5)
    expect(nextState.columnOffsets).toEqual({ 4: 1, 5: 3 })
    expect(nextState.columnOffset).toBe(3)
  })

  it('clamps page row movement at document boundaries without losing multi-cursor state', () => {
    const view = createView(multilineEditSchema.nodes.doc.create(null, ['a', 'bb', 'ccc'].map((text) => paragraph(text))))
    const ranges = getEditorTextLineRanges(view)

    const topState = moveMultiLineCursorRowsByDelta(multiLineState([0, 1], 1), [0, 1], ranges, -10)
    expect(topState.cursorBlockIndices).toEqual([0, 1])
    expect(topState.anchorBlockIndex).toBe(0)
    expect(topState.headBlockIndex).toBe(1)

    const bottomState = moveMultiLineCursorRowsByDelta(multiLineState([1, 2], 2), [1, 2], ranges, 10)
    expect(bottomState.cursorBlockIndices).toEqual([1, 2])
    expect(bottomState.anchorBlockIndex).toBe(1)
    expect(bottomState.headBlockIndex).toBe(2)
  })

  it('keeps page movement clamped instead of shrinking boundary cursors', () => {
    const view = createView(multilineEditSchema.nodes.doc.create(null, ['a', 'bb', 'ccc'].map((text) => paragraph(text))))
    const ranges = getEditorTextLineRanges(view)
    const nextState = moveMultiLineCursorState(multiLineState([1, 2], 1), [1, 2], ranges, 'page-down', {
      pageRowDelta: 10,
    })

    expect(nextState?.cursorBlockIndices).toEqual([1, 2])
    expect(nextState?.anchorBlockIndex).toBe(1)
    expect(nextState?.headBlockIndex).toBe(2)
  })

  it('derives page row deltas from editor coordinates', () => {
    const view = createView(
      multilineEditSchema.nodes.doc.create(
        null,
        Array.from({ length: 12 }, (_, index) => paragraph(`line ${index}`)),
      ),
    )
    const ranges = getEditorTextLineRanges(view)
    const fakeView = {
      ...view,
      dom: { clientHeight: 60 },
      coordsAtPos: (position: number) => {
        const index = getEditorTextLineRanges(view).findIndex((range) => position >= range.start && position <= range.end)
        return { left: 0, top: index * 20, bottom: index * 20 + 20 }
      },
      posAtCoords: ({ top }: { top: number }) => {
        const index = Math.max(0, Math.min(ranges.length - 1, Math.round(top / 20)))
        return { pos: ranges[index].start }
      },
    }
    const state: MultiLineEditState = {
      ...multiLineState([4, 5], 2),
      columnOffsets: { 4: 2, 5: 2 },
    }

    expect(getMultiLinePageMovementRowDelta(fakeView, state, [4, 5], ranges, 'page-down')).toBe(3)
    expect(getMultiLinePageMovementRowDelta(fakeView, state, [4, 5], ranges, 'page-up')).toBe(-3)
  })

  it('falls back to fixed row movement when editor coordinates are unavailable', () => {
    const view = createView(
      multilineEditSchema.nodes.doc.create(
        null,
        Array.from({ length: 20 }, (_, index) => paragraph(`line ${index}`)),
      ),
    )
    const ranges = getEditorTextLineRanges(view)
    const fakeView = { ...view, dom: { clientHeight: 72 } }
    const state = multiLineState([5, 6], 2)

    expect(getMultiLinePageMovementRowDelta(fakeView, state, [5, 6], ranges, 'page-down')).toBe(3)
    expect(getMultiLinePageMovementRowDelta(fakeView, state, [5, 6], ranges, 'page-up')).toBe(-3)
  })
})

describe('single-cursor page movement editing', () => {
  it('moves the normal cursor down and up by viewport-derived rows', () => {
    const doc = multilineEditSchema.nodes.doc.create(
      null,
      Array.from({ length: 10 }, (_, index) => paragraph(`line ${index}`)),
    )
    const setupView = createView(doc)
    const setupRanges = getEditorTextLineRanges(setupView)
    const downView = withPageCoordinates(createDispatchingView(doc, setupRanges[2].start + 2))

    expect(applySingleCursorPageMovement(downView, 'page-down')).toBe(true)
    let ranges = getEditorTextLineRanges(downView)
    expect(downView.state.selection.head).toBe(ranges[5].start + 2)

    expect(applySingleCursorPageMovement(downView, 'page-up')).toBe(true)
    ranges = getEditorTextLineRanges(downView)
    expect(downView.state.selection.head).toBe(ranges[2].start + 2)
  })

  it('preserves columns while clamping to shorter target lines', () => {
    const doc = multilineEditSchema.nodes.doc.create(null, [
      paragraph('zero'),
      paragraph('longer'),
      paragraph('two'),
      paragraph('three'),
      paragraph('x'),
      paragraph('after'),
    ])
    const setupView = createView(doc)
    const setupRanges = getEditorTextLineRanges(setupView)
    const view = withPageCoordinates(createDispatchingView(doc, setupRanges[1].start + 5))

    expect(applySingleCursorPageMovement(view, 'page-down')).toBe(true)
    const ranges = getEditorTextLineRanges(view)
    expect(view.state.selection.head).toBe(ranges[4].end)
  })

  it('clamps normal page movement at document boundaries', () => {
    const doc = multilineEditSchema.nodes.doc.create(null, [paragraph('one'), paragraph('two'), paragraph('three')])
    const setupView = createView(doc)
    const setupRanges = getEditorTextLineRanges(setupView)
    const topView = withPageCoordinates(createDispatchingView(doc, setupRanges[0].start + 1))
    const bottomView = withPageCoordinates(createDispatchingView(doc, setupRanges[2].start + 1))

    expect(applySingleCursorPageMovement(topView, 'page-up')).toBe(true)
    expect(topView.state.selection.head).toBe(setupRanges[0].start + 1)

    expect(applySingleCursorPageMovement(bottomView, 'page-down')).toBe(true)
    expect(bottomView.state.selection.head).toBe(setupRanges[2].start + 1)
  })

  it('falls back to row deltas when editor coordinates are unavailable', () => {
    const doc = multilineEditSchema.nodes.doc.create(
      null,
      Array.from({ length: 8 }, (_, index) => paragraph(`line ${index}`)),
    )
    const setupView = createView(doc)
    const setupRanges = getEditorTextLineRanges(setupView)
    const view = createDispatchingView(doc, setupRanges[1].start + 1)

    expect(applySingleCursorPageMovement(view, 'page-down')).toBe(true)
    const ranges = getEditorTextLineRanges(view)
    expect(view.state.selection.head).toBe(ranges[4].start + 1)
  })

  it('extends the normal selection with shift page movement', () => {
    const doc = multilineEditSchema.nodes.doc.create(
      null,
      Array.from({ length: 10 }, (_, index) => paragraph(`line ${index}`)),
    )
    const setupView = createView(doc)
    const setupRanges = getEditorTextLineRanges(setupView)
    const anchor = setupRanges[2].start + 1
    const view = withPageCoordinates(createDispatchingView(doc, anchor))

    expect(applySingleCursorPageMovement(view, 'page-down', true)).toBe(true)
    const ranges = getEditorTextLineRanges(view)
    expect(view.state.selection.anchor).toBe(anchor)
    expect(view.state.selection.head).toBe(ranges[5].start + 1)
    expect(view.state.selection.empty).toBe(false)
  })
})

describe('multi-cursor boundary row movement editing', () => {
  it('shrinks upward boundary movement by dropping the bottommost cursor', () => {
    const view = createView(multilineEditSchema.nodes.doc.create(null, ['zero', 'one', 'two'].map((text) => paragraph(text))))
    const ranges = getEditorTextLineRanges(view)
    const state: MultiLineEditState = {
      ...multiLineState([0, 1, 2], 2),
      columnOffsets: { 0: 1, 1: 2, 2: 3 },
    }
    const nextState = moveMultiLineCursorState(state, [0, 1, 2], ranges, 'up')

    expect(nextState?.cursorBlockIndices).toEqual([0, 1])
    expect(nextState?.anchorBlockIndex).toBe(1)
    expect(nextState?.headBlockIndex).toBe(0)
    expect(nextState?.columnOffsets).toEqual({ 0: 1, 1: 2 })
    expect(nextState?.selectionAnchorOffsets).toBeUndefined()
  })

  it('shrinks downward boundary movement by dropping the topmost cursor', () => {
    const view = createView(multilineEditSchema.nodes.doc.create(null, ['zero', 'one', 'two'].map((text) => paragraph(text))))
    const ranges = getEditorTextLineRanges(view)
    const state: MultiLineEditState = {
      ...multiLineState([1, 2], 2),
      columnOffsets: { 1: 1, 2: 2 },
    }
    const nextState = moveMultiLineCursorState(state, [1, 2], ranges, 'down')

    expect(nextState?.cursorBlockIndices).toEqual([2])
    expect(nextState?.anchorBlockIndex).toBe(2)
    expect(nextState?.headBlockIndex).toBe(2)
    expect(nextState?.columnOffsets).toEqual({ 2: 2 })
    expect(nextState?.selectionAnchorOffsets).toBeUndefined()
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
  it('routes row-end forward Delete through visible boundary deletion', () => {
    const result = applyRealDeleteInput(
      multilineEditSchema.nodes.doc.create(null, ['one', 'two', 'three'].map((text) => paragraph(text))),
      [0, 1, 2],
      'delete',
    )

    expect(result.shouldUseBoundary).toBe(true)
    expect(result.plan?.consumedNextLineBlockIndices).toEqual([1, 2])
    expect(result.nextState?.doc.child(0).textContent).toBe('onetwothree')
  })

  it.each([
    ['paragraphs', multilineEditSchema.nodes.doc.create(null, ['asdf', 'asdf', 'asdf'].map((text) => paragraph(text)))],
    ['tasks', multilineEditSchema.nodes.doc.create(null, [taskList(['asdf', 'asdf', 'asdf'])])],
    ['bullets', multilineEditSchema.nodes.doc.create(null, [bulletList(['asdf', 'asdf', 'asdf'])])],
    ['blockquotes', multilineEditSchema.nodes.doc.create(null, [blockQuote(['asdf', 'asdf', 'asdf'])])],
  ])('does not route row-end Backspace on non-empty %s through boundary deletion', (_label, doc) => {
    const result = applyRealDeleteInput(doc, [0, 1, 2], 'backspace')

    expect(result.shouldUseBoundary).toBe(false)
    expect(result.plan).toBeNull()
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

  it.each(['backspace', 'delete'] as const)('keeps cursors after %s deletes empty blockquote rows', (input) => {
    const result = applyRealDeleteInput(
      multilineEditSchema.nodes.doc.create(null, [blockQuote(['quote', '', 'quote', ''])]),
      [1, 3],
      input,
    )

    expect(result.plan?.deletedLineBlockIndices).toEqual([1, 3])
    expect(getEditorTextLineRanges({ state: result.nextState }).map((range) => range.text)).toEqual(['quote', 'quote'])
    expect(result.nextState?.doc.child(0).type.name).toBe('blockQuote')
    expect(result.plan?.nextMultiLineEditState.cursorBlockIndices).toEqual([0, 1])
    expect(result.plan?.nextMultiLineEditState.columnOffsets).toEqual({ 0: 5, 1: 5 })
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

  it('collapses selected blockquote row boundaries', () => {
    const result = applyBoundaryDelete(multilineEditSchema.nodes.doc.create(null, [blockQuote(['a', 'b', 'c'])]), [0, 1, 2])

    expect(result.plan?.consumedNextLineBlockIndices).toEqual([1, 2])
    expect(result.nextState?.doc.childCount).toBe(1)
    expect(result.nextState?.doc.child(0).type.name).toBe('blockQuote')
    expect(result.nextState?.doc.child(0).childCount).toBe(1)
    expect(result.nextState?.doc.child(0).textContent).toBe('abc')
  })

  it('removes a blockquote marker when a paragraph is before a quoted row', () => {
    const result = applyBoundaryDelete(multilineEditSchema.nodes.doc.create(null, [paragraph('a'), blockQuote(['b'])]), [0, 1])

    expect(result.plan?.consumedNextLineBlockIndices).toEqual([1])
    expect(result.nextState?.doc.childCount).toBe(1)
    expect(result.nextState?.doc.child(0).type.name).toBe('paragraph')
    expect(result.nextState?.doc.child(0).textContent).toBe('ab')
  })

  it('removes an empty blockquote row instead of leaving its marker behind', () => {
    const result = applyBoundaryDelete(multilineEditSchema.nodes.doc.create(null, [blockQuote(['', 'next'])]), [0])

    expect(result.plan?.deletedLineBlockIndices).toEqual([0])
    expect(result.nextState?.doc.childCount).toBe(1)
    expect(result.nextState?.doc.child(0).type.name).toBe('blockQuote')
    expect(result.nextState?.doc.child(0).childCount).toBe(1)
    expect(result.nextState?.doc.child(0).textContent).toBe('next')
  })

  it('deletes empty blockquote rows and leaves an empty paragraph when they were the whole document', () => {
    const result = applyBoundaryDelete(multilineEditSchema.nodes.doc.create(null, [blockQuote(['', ''])]), [0, 1])

    expect(result.plan?.deletedLineBlockIndices).toEqual([0, 1])
    expect(result.nextState?.doc.childCount).toBe(1)
    expect(result.nextState?.doc.child(0).type.name).toBe('paragraph')
    expect(result.nextState?.doc.child(0).textContent).toBe('')
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

  it('deletes fully selected blockquote rows and preserves unselected quoted rows', () => {
    const result = applySelectedRowDelete(
      multilineEditSchema.nodes.doc.create(null, [blockQuote(['keep', 'delete', 'delete', 'keep'])]),
      [1, 2],
    )

    expect(result.plan?.deletedLineBlockIndices).toEqual([1, 2])
    expect(result.nextState?.doc.childCount).toBe(1)
    expect(result.nextState?.doc.child(0).type.name).toBe('blockQuote')
    expect(result.nextState?.doc.child(0).childCount).toBe(2)
    expect(getEditorTextLineRanges({ state: result.nextState }).map((range) => range.text)).toEqual(['keep', 'keep'])
  })

  it('deletes a fully selected blockquote and leaves an empty paragraph when it was the whole document', () => {
    const result = applySelectedRowDelete(
      multilineEditSchema.nodes.doc.create(null, [blockQuote(['one', 'two'])]),
      [0, 1],
    )

    expect(result.plan?.deletedLineBlockIndices).toEqual([0, 1])
    expect(result.nextState?.doc.childCount).toBe(1)
    expect(result.nextState?.doc.child(0).type.name).toBe('paragraph')
    expect(result.nextState?.doc.child(0).textContent).toBe('')
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
