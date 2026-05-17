import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import type { MultiLineEditState, MultiLineInlineFormat } from '../types/app'
import {
  applyActiveInlineFormatsToStoredMarks,
  applyActiveInlineFormatsToInsertedText,
  buildMultiLineHeadingOperationPlan,
  buildMultiLineInlineFormatPlan,
  buildMultiLineInlineMarkerOperationPlan,
  getActiveInlineFormatMarks,
  getMultiLineHeadingMarkerShortcut,
  getMultiLineInlineMarkerShortcut,
  type MultiLineHeadingLevel,
} from './multiline-format-operations'

const multilineFormatSchema = new Schema({
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
    bulletList: {
      group: 'block',
      content: 'listItem+',
      toDOM: () => ['ul', 0],
    },
    listItem: {
      content: 'paragraph block*',
      toDOM: () => ['li', 0],
    },
  },
  marks: {
    strong: { toDOM: () => ['strong', 0] },
    emph: { toDOM: () => ['em', 0] },
    strike: { toDOM: () => ['s', 0] },
  },
})

function paragraph(text: string) {
  return multilineFormatSchema.nodes.paragraph.create(null, text ? multilineFormatSchema.text(text) : undefined)
}

function heading(text: string, level = 2) {
  return multilineFormatSchema.nodes.heading.create(
    { level, headingType: 'atx' },
    text ? multilineFormatSchema.text(text) : undefined,
  )
}

function codeBlock(text: string) {
  return multilineFormatSchema.nodes.codeBlock.create(null, text ? multilineFormatSchema.text(text) : undefined)
}

function bulletList(texts: string[]) {
  return multilineFormatSchema.nodes.bulletList.create(
    null,
    texts.map((text) => multilineFormatSchema.nodes.listItem.create(null, paragraph(text))),
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

function multiLineState(
  indices: number[],
  columnOffset = 0,
  selectionAnchorOffsets?: Record<number, number>,
): MultiLineEditState {
  return {
    anchorBlockIndex: indices[0],
    headBlockIndex: indices[indices.length - 1],
    columnOffset,
    cursorBlockIndices: indices,
    selectionAnchorOffsets,
  }
}

function textMarkNames(node: any): string[] {
  return Array.from({ length: node.childCount }, (_, index) => index)
    .flatMap((index) => node.child(index).marks ?? [])
    .map((mark: any) => mark.type.name)
}

function applyHeading(doc: any, level: MultiLineHeadingLevel) {
  const view = createView(doc)
  const plan = buildMultiLineHeadingOperationPlan(view, multiLineState([0, 1]), level)
  expect(plan).not.toBeNull()
  return view.apply(plan!.transaction).doc
}

describe('multi-cursor heading operations', () => {
  it.each([1, 2, 3, 4, 5, 6] as MultiLineHeadingLevel[])('expands %# heading markers on Space', (level) => {
    const marker = '#'.repeat(level)
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph(marker), paragraph(marker)]))
    const state = multiLineState([0, 1], marker.length)
    const shortcut = getMultiLineHeadingMarkerShortcut(view, state)

    expect(shortcut?.level).toBe(level)
    const plan = shortcut
      ? buildMultiLineHeadingOperationPlan(view, state, shortcut.level, { textByBlockIndex: shortcut.textByBlockIndex })
      : null
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.child(0).type.name).toBe('heading')
    expect(nextState.doc.child(0).attrs.level).toBe(level)
    expect(nextState.doc.child(0).textContent).toBe('')
    expect(nextState.doc.child(1).attrs.level).toBe(level)
  })

  it('applies toolbar heading levels and paragraph conversion across selected rows', () => {
    const headingDoc = applyHeading(
      multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), heading('two', 3)]),
      4,
    )

    expect(headingDoc.child(0).type.name).toBe('heading')
    expect(headingDoc.child(0).attrs.level).toBe(4)
    expect(headingDoc.child(0).textContent).toBe('one')
    expect(headingDoc.child(1).attrs.level).toBe(4)

    const paragraphDoc = applyHeading(headingDoc, 0)
    expect(paragraphDoc.child(0).type.name).toBe('paragraph')
    expect(paragraphDoc.child(1).type.name).toBe('paragraph')
    expect(paragraphDoc.child(1).textContent).toBe('two')
  })

  it('does not expand mixed, non-bare, list, or code heading markers', () => {
    const mixedView = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('#'), paragraph('##')]))
    const nonBareView = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('# title'), paragraph('# title')]))
    const listView = createView(multilineFormatSchema.nodes.doc.create(null, [bulletList(['#', '#'])]))
    const codeView = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('#'), codeBlock('#')]))

    expect(getMultiLineHeadingMarkerShortcut(mixedView, multiLineState([0, 1], 1))).toBeNull()
    expect(getMultiLineHeadingMarkerShortcut(nonBareView, multiLineState([0, 1], 1))).toBeNull()
    expect(getMultiLineHeadingMarkerShortcut(listView, multiLineState([0, 1], 1))).toBeNull()
    expect(getMultiLineHeadingMarkerShortcut(codeView, multiLineState([0, 1], 1))).toBeNull()
  })
})

describe('multi-cursor inline formatting operations', () => {
  it('maps active inline formats to stored editor marks immediately', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), paragraph('two')]))
    const activeMarks = getActiveInlineFormatMarks(view.state.schema, ['bold', 'italic', 'strike'])

    expect(activeMarks.map((mark: any) => mark.type.name)).toEqual(['strong', 'emph', 'strike'])

    const activeState = view.apply(applyActiveInlineFormatsToStoredMarks(view.state.tr, view.state.schema, ['bold']))
    expect(activeState.storedMarks?.map((mark: any) => mark.type.name)).toEqual(['strong'])

    const clearedState = view.apply(applyActiveInlineFormatsToStoredMarks(view.state.tr, view.state.schema, undefined))
    expect(clearedState.storedMarks).toEqual([])
  })

  it.each([
    ['bold', 'strong'],
    ['italic', 'emph'],
    ['strike', 'strike'],
  ] as Array<[MultiLineInlineFormat, string]>)('adds and removes %s marks across selected ranges', (format, markName) => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), paragraph('two')]))
    const state = multiLineState([0, 1], 3, { 0: 0, 1: 0 })
    const addPlan = buildMultiLineInlineFormatPlan(view, state, format)
    expect(addPlan).not.toBeNull()
    const addedState = view.apply(addPlan!.transaction)

    expect(textMarkNames(addedState.doc.child(0))).toEqual([markName])
    expect(textMarkNames(addedState.doc.child(1))).toEqual([markName])

    const removePlan = buildMultiLineInlineFormatPlan(view, state, format)
    expect(removePlan).not.toBeNull()
    const removedState = view.apply(removePlan!.transaction)

    expect(textMarkNames(removedState.doc.child(0))).toEqual([])
    expect(textMarkNames(removedState.doc.child(1))).toEqual([])
  })

  it('toggles empty cursor future typing marks', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), paragraph('two')]))
    const state = multiLineState([0, 1], 3)
    const plan = buildMultiLineInlineFormatPlan(view, state, 'strike')

    expect(plan?.nextState.activeInlineFormats).toEqual(['strike'])

    let transaction = view.state.tr.insertText('!', 4, 4)
    transaction = applyActiveInlineFormatsToInsertedText(
      transaction,
      view.state.schema,
      4,
      '!',
      plan?.nextState.activeInlineFormats,
    )
    const nextState = view.apply(transaction)

    expect(nextState.doc.child(0).textContent).toBe('one!')
    expect(nextState.doc.child(0).child(1).marks.map((mark: any) => mark.type.name)).toEqual(['strike'])

    const offPlan = buildMultiLineInlineFormatPlan(view, plan!.nextState, 'strike')
    expect(offPlan?.nextState.activeInlineFormats).toBeUndefined()

    let unmarkedTransaction = view.state.tr.insertText('?', 5, 5)
    unmarkedTransaction = applyActiveInlineFormatsToInsertedText(
      unmarkedTransaction,
      view.state.schema,
      5,
      '?',
      offPlan?.nextState.activeInlineFormats,
    )
    const unmarkedState = view.apply(unmarkedTransaction)
    expect(unmarkedState.doc.child(0).textContent).toBe('one!?')
    expect(unmarkedState.doc.child(0).child(unmarkedState.doc.child(0).childCount - 1).marks).toEqual([])
  })

  it.each([
    ['**one*', '*', 'bold', 'strong'],
    ['*one', '*', 'italic', 'emph'],
    ['_one', '_', 'italic', 'emph'],
    ['~~one~', '~', 'strike', 'strike'],
  ] as Array<[string, string, MultiLineInlineFormat, string]>)(
    'converts closed typed inline marker %s%s',
    (textBeforeInput, inputText, format, markName) => {
      const view = createView(
        multilineFormatSchema.nodes.doc.create(null, [paragraph(textBeforeInput), paragraph(textBeforeInput)]),
      )
      const state = multiLineState([0, 1], textBeforeInput.length)
      const shortcut = getMultiLineInlineMarkerShortcut(view, state, inputText)

      expect(shortcut?.format).toBe(format)
      const plan = buildMultiLineInlineMarkerOperationPlan(view, state, inputText)
      expect(plan).not.toBeNull()
      const nextState = view.apply(plan!.transaction)

      expect(nextState.doc.child(0).textContent).toBe('one')
      expect(textMarkNames(nextState.doc.child(0))).toEqual([markName])
      expect(textMarkNames(nextState.doc.child(1))).toEqual([markName])
    },
  )

  it('does not convert mixed inline markers or code block rows', () => {
    const mixedView = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('*one'), paragraph('_one')]))
    const codeView = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('*one'), codeBlock('*one')]))

    expect(getMultiLineInlineMarkerShortcut(mixedView, multiLineState([0, 1], 4), '*')).toBeNull()
    expect(getMultiLineInlineMarkerShortcut(codeView, multiLineState([0, 1], 4), '*')).toBeNull()
  })
})
