import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import type { MultiLineEditState } from '../types/app'
import {
  buildDeletedLineMultiLineState,
  buildSplitLineMultiLineState,
  getEmptyMultiLineBlockDeleteTargets,
  getMultiLineSplitPlan,
} from './multiline-edit'
import { buildMultiLineHeadingOperationPlan } from './multiline-format-operations'
import { getEditorTextLineRanges } from './multiline-ranges'

const multilineEditSchema = new Schema({
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
  },
})

function paragraph(text: string) {
  return multilineEditSchema.nodes.paragraph.create(null, text ? multilineEditSchema.text(text) : undefined)
}

function heading(text: string, level = 2) {
  return multilineEditSchema.nodes.heading.create(
    { level, headingType: 'atx' },
    text ? multilineEditSchema.text(text) : undefined,
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

function multiLineState(indices: number[], columnOffset = 0): MultiLineEditState {
  return {
    anchorBlockIndex: indices[0],
    headBlockIndex: indices[indices.length - 1],
    columnOffset,
    cursorBlockIndices: indices,
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
