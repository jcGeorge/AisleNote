import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { BLOCK_INDENT_TOKEN, INDENT_TOKEN } from '../markdown/markdown-utils'
import type { MultiLineEditState, MultiLineInlineFormat } from '../types/app'
import {
  applyActiveInlineFormatsToStoredMarks,
  applyActiveInlineFormatsToInsertedText,
  buildMultiLineBlockIndentOperationPlan,
  buildMultiLineBlockQuoteOperationPlan,
  buildMultiLineCodeBlockOperationPlan,
  buildMultiLineHeadingOperationPlan,
  buildMultiLineInlineFormatPlan,
  buildMultiLineInlineMarkerOperationPlan,
  buildMultiLineRemoveBlockIndentOperationPlan,
  buildMultiLineRemoveBlockQuoteOperationPlan,
  buildSelectionBlockIndentOperationPlan,
  buildSelectionBlockQuoteOperationPlan,
  buildSelectionRemoveBlockIndentOperationPlan,
  buildSelectionRemoveBlockQuoteOperationPlan,
  getActiveInlineFormatMarks,
  getMultiLineBlockQuoteMarkerShortcut,
  getMultiLineHeadingMarkerShortcut,
  getMultiLineInlineMarkerShortcut,
  selectionTouchesBlockQuoteRows,
  type MultiLineHeadingLevel,
} from './multiline-format-operations'
import { getEditorTextLineRanges } from './multiline-ranges'

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
    mark: { toDOM: () => ['mark', 0] },
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

function blockQuote(texts: string[]) {
  return multilineFormatSchema.nodes.blockQuote.create(null, texts.map((text) => paragraph(text)))
}

function bulletList(texts: string[]) {
  return multilineFormatSchema.nodes.bulletList.create(
    null,
    texts.map((text) => multilineFormatSchema.nodes.listItem.create(null, paragraph(text))),
  )
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

function selectTextLines(view: ReturnType<typeof createView>, startLineIndex: number, endLineIndex = startLineIndex) {
  const ranges = getEditorTextLineRanges(view)
  const from = ranges[startLineIndex]?.start
  const to = ranges[endLineIndex]?.end
  expect(from).toBeTypeOf('number')
  expect(to).toBeTypeOf('number')
  view.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
}

function setCaretInTextLine(view: ReturnType<typeof createView>, lineIndex: number, offset = 0) {
  const ranges = getEditorTextLineRanges(view)
  const range = ranges[lineIndex]
  expect(range).toBeTruthy()
  const position = Math.max(range!.start, Math.min(range!.end, range!.start + offset))
  view.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, position, position)))
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

describe('multi-cursor blockquote operations', () => {
  it('expands blockquote markers on Space across selected rows', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('>'), paragraph('>')]))
    const state = multiLineState([0, 1], 1)
    const shortcut = getMultiLineBlockQuoteMarkerShortcut(view, state)

    expect(shortcut).not.toBeNull()
    const plan = shortcut
      ? buildMultiLineBlockQuoteOperationPlan(view, state, { textByBlockIndex: shortcut.textByBlockIndex })
      : null
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.childCount).toBe(1)
    expect(nextState.doc.child(0).type.name).toBe('blockQuote')
    expect(nextState.doc.child(0).childCount).toBe(2)
    expect(nextState.doc.child(0).child(0).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).child(0).textContent).toBe('')
    expect(nextState.doc.child(0).child(1).textContent).toBe('')
    expect(plan?.nextState.columnOffsets).toEqual({ 0: 0, 1: 0 })
  })

  it('applies toolbar blockquotes across selected paragraph and heading rows', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), heading('two', 3)]))
    const plan = buildMultiLineBlockQuoteOperationPlan(view, multiLineState([0, 1], 3))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.childCount).toBe(1)
    expect(nextState.doc.child(0).type.name).toBe('blockQuote')
    expect(nextState.doc.child(0).childCount).toBe(2)
    expect(nextState.doc.child(0).child(0).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).child(0).textContent).toBe('one')
    expect(nextState.doc.child(0).child(1).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).child(1).textContent).toBe('two')
  })

  it('creates separate blockquotes for non-adjacent selected rows', () => {
    const view = createView(
      multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), paragraph('middle'), paragraph('three')]),
    )
    const plan = buildMultiLineBlockQuoteOperationPlan(view, multiLineState([0, 2], 3))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.childCount).toBe(3)
    expect(nextState.doc.child(0).type.name).toBe('blockQuote')
    expect(nextState.doc.child(0).textContent).toBe('one')
    expect(nextState.doc.child(1).type.name).toBe('paragraph')
    expect(nextState.doc.child(1).textContent).toBe('middle')
    expect(nextState.doc.child(2).type.name).toBe('blockQuote')
    expect(nextState.doc.child(2).textContent).toBe('three')
  })

  it('does not expand mixed, non-bare, nested, or code blockquote markers', () => {
    const mixedView = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('>'), paragraph('#')]))
    const nonBareView = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('> quote'), paragraph('> quote')]))
    const nestedView = createView(multilineFormatSchema.nodes.doc.create(null, [blockQuote(['>']), paragraph('>')]))
    const codeView = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('>'), codeBlock('>')]))

    expect(getMultiLineBlockQuoteMarkerShortcut(mixedView, multiLineState([0, 1], 1))).toBeNull()
    expect(getMultiLineBlockQuoteMarkerShortcut(nonBareView, multiLineState([0, 1], 1))).toBeNull()
    expect(getMultiLineBlockQuoteMarkerShortcut(nestedView, multiLineState([0, 1], 1))).toBeNull()
    expect(getMultiLineBlockQuoteMarkerShortcut(codeView, multiLineState([0, 1], 1))).toBeNull()
  })

  it('converts selected list rows to blockquotes and preserves unselected list rows', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [bulletList(['keep', 'one', 'two', 'keep'])]))
    const plan = buildMultiLineBlockQuoteOperationPlan(view, multiLineState([1, 2], 3))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(docChildTypes(nextState.doc)).toEqual(['bulletList', 'blockQuote', 'bulletList'])
    expect(listTexts(nextState.doc.child(0))).toEqual(['keep'])
    expect(nextState.doc.child(1).textContent).toBe('onetwo')
    expect(nextState.doc.child(1).childCount).toBe(2)
    expect(listTexts(nextState.doc.child(2))).toEqual(['keep'])
  })

  it('converts selected code block lines to blockquotes and preserves unselected code lines', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [codeBlock('keep\none\ntwo\nkeep')]))
    const plan = buildMultiLineBlockQuoteOperationPlan(view, multiLineState([1, 2], 3))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(docChildTypes(nextState.doc)).toEqual(['codeBlock', 'blockQuote', 'codeBlock'])
    expect(nextState.doc.child(0).textContent).toBe('keep')
    expect(nextState.doc.child(1).childCount).toBe(2)
    expect(nextState.doc.child(1).textContent).toBe('onetwo')
    expect(nextState.doc.child(2).textContent).toBe('keep')
  })

  it('removes blockquote rows and preserves unselected quoted rows', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [blockQuote(['keep', 'one', 'two', 'keep'])]))
    const plan = buildMultiLineRemoveBlockQuoteOperationPlan(view, multiLineState([1, 2], 3))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(docChildTypes(nextState.doc)).toEqual(['blockQuote', 'paragraph', 'paragraph', 'blockQuote'])
    expect(nextState.doc.child(0).textContent).toBe('keep')
    expect(nextState.doc.child(1).textContent).toBe('one')
    expect(nextState.doc.child(2).textContent).toBe('two')
    expect(nextState.doc.child(3).textContent).toBe('keep')
  })

  it('removes a blockquote row from a normal collapsed caret selection', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [blockQuote(['quote'])]))
    setCaretInTextLine(view, 0, 2)

    expect(buildSelectionBlockQuoteOperationPlan(view)).toBeNull()
    const plan = buildSelectionRemoveBlockQuoteOperationPlan(view)
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.childCount).toBe(1)
    expect(nextState.doc.child(0).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).textContent).toBe('quote')
  })

  it('removes selected blockquote rows and preserves unselected quoted rows from a normal selection', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [blockQuote(['keep', 'lift', 'keep'])]))
    selectTextLines(view, 1)

    const plan = buildSelectionRemoveBlockQuoteOperationPlan(view)
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(docChildTypes(nextState.doc)).toEqual(['blockQuote', 'paragraph', 'blockQuote'])
    expect(nextState.doc.child(0).textContent).toBe('keep')
    expect(nextState.doc.child(1).textContent).toBe('lift')
    expect(nextState.doc.child(2).textContent).toBe('keep')
  })

  it('strips block indent tokens when converting rows to blockquotes', () => {
    const view = createView(
      multilineFormatSchema.nodes.doc.create(null, [
        paragraph(`${BLOCK_INDENT_TOKEN}one`),
        paragraph(`${BLOCK_INDENT_TOKEN}${INDENT_TOKEN}two`),
      ]),
    )
    const plan = buildMultiLineBlockQuoteOperationPlan(view, multiLineState([0, 1], 3))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.childCount).toBe(1)
    expect(nextState.doc.child(0).type.name).toBe('blockQuote')
    expect(nextState.doc.child(0).child(0).textContent).toBe('one')
    expect(nextState.doc.child(0).child(1).textContent).toBe(`${INDENT_TOKEN}two`)
  })

  it('strips block indent tokens when a normal selection is converted to a blockquote', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph(`${BLOCK_INDENT_TOKEN}${INDENT_TOKEN}one`)]))
    selectTextLines(view, 0)

    const plan = buildSelectionBlockQuoteOperationPlan(view)
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.child(0).type.name).toBe('blockQuote')
    expect(nextState.doc.child(0).child(0).textContent).toBe(`${INDENT_TOKEN}one`)
  })
})

describe('selection block indent operations', () => {
  it('detects collapsed carets inside blockquote rows without matching normal paragraphs', () => {
    const quoteView = createView(multilineFormatSchema.nodes.doc.create(null, [blockQuote(['quote'])]))
    setCaretInTextLine(quoteView, 0, 2)

    const normalView = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('normal')]))
    setCaretInTextLine(normalView, 0, 2)

    expect(selectionTouchesBlockQuoteRows(quoteView)).toBe(true)
    expect(selectionTouchesBlockQuoteRows(normalView)).toBe(false)
  })

  it('converts a collapsed caret blockquote row to a block indent paragraph', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [blockQuote(['quote'])]))
    setCaretInTextLine(view, 0, 2)

    const plan = buildSelectionBlockIndentOperationPlan(view)
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.childCount).toBe(1)
    expect(nextState.doc.child(0).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).textContent).toBe(`${BLOCK_INDENT_TOKEN}quote`)
  })

  it('prefixes a single selected paragraph with the block indent token', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('one')]))
    selectTextLines(view, 0)

    const plan = buildSelectionBlockIndentOperationPlan(view)
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.childCount).toBe(1)
    expect(nextState.doc.child(0).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).textContent).toBe(`${BLOCK_INDENT_TOKEN}one`)
  })

  it('prefixes adjacent selected paragraphs without creating blockquotes', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), paragraph('two')]))
    selectTextLines(view, 0, 1)

    const plan = buildSelectionBlockIndentOperationPlan(view)
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.childCount).toBe(2)
    expect(nextState.doc.child(0).type.name).toBe('paragraph')
    expect(nextState.doc.child(1).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).textContent).toBe(`${BLOCK_INDENT_TOKEN}one`)
    expect(nextState.doc.child(1).textContent).toBe(`${BLOCK_INDENT_TOKEN}two`)
  })

  it('preserves paragraph indent text inside the block indent', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph(`${INDENT_TOKEN}one`)]))
    selectTextLines(view, 0)

    const plan = buildSelectionBlockIndentOperationPlan(view)
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.child(0).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).textContent).toBe(`${BLOCK_INDENT_TOKEN}${INDENT_TOKEN}one`)
  })

  it('removes selected block indent tokens without touching neighboring rows', () => {
    const view = createView(
      multilineFormatSchema.nodes.doc.create(null, [
        paragraph(`${BLOCK_INDENT_TOKEN}keep`),
        paragraph(`${BLOCK_INDENT_TOKEN}lift`),
        paragraph(`${BLOCK_INDENT_TOKEN}keep`),
      ]),
    )
    selectTextLines(view, 1)

    const plan = buildSelectionRemoveBlockIndentOperationPlan(view)
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(docChildTypes(nextState.doc)).toEqual(['paragraph', 'paragraph', 'paragraph'])
    expect(nextState.doc.child(0).textContent).toBe(`${BLOCK_INDENT_TOKEN}keep`)
    expect(nextState.doc.child(1).textContent).toBe('lift')
    expect(nextState.doc.child(2).textContent).toBe(`${BLOCK_INDENT_TOKEN}keep`)
  })

  it('converts selected blockquote rows to block indent rows while preserving unselected quote rows', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [blockQuote(['keep', 'lift', 'keep'])]))
    selectTextLines(view, 1)

    const plan = buildSelectionBlockIndentOperationPlan(view)
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(docChildTypes(nextState.doc)).toEqual(['blockQuote', 'paragraph', 'blockQuote'])
    expect(nextState.doc.child(0).textContent).toBe('keep')
    expect(nextState.doc.child(1).textContent).toBe(`${BLOCK_INDENT_TOKEN}lift`)
    expect(nextState.doc.child(2).textContent).toBe('keep')
  })

  it('converts multi-cursor blockquote rows to block indent rows', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [blockQuote(['keep', 'one', 'two', 'keep'])]))
    const plan = buildMultiLineBlockIndentOperationPlan(view, multiLineState([1, 2], 3))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(docChildTypes(nextState.doc)).toEqual(['blockQuote', 'paragraph', 'paragraph', 'blockQuote'])
    expect(nextState.doc.child(0).textContent).toBe('keep')
    expect(nextState.doc.child(1).textContent).toBe(`${BLOCK_INDENT_TOKEN}one`)
    expect(nextState.doc.child(2).textContent).toBe(`${BLOCK_INDENT_TOKEN}two`)
    expect(nextState.doc.child(3).textContent).toBe('keep')
    expect(plan?.nextState.columnOffsets).toEqual({
      1: BLOCK_INDENT_TOKEN.length + 3,
      2: BLOCK_INDENT_TOKEN.length + 3,
    })
  })

  it('does not remove blockquote structure on remove block indent when no marker is present', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [blockQuote(['quote'])]))
    selectTextLines(view, 0)

    expect(buildSelectionRemoveBlockIndentOperationPlan(view)).toBeNull()
    expect(view.state.doc.child(0).type.name).toBe('blockQuote')
    expect(view.state.doc.child(0).textContent).toBe('quote')
  })

  it('does not remove blockquote structure from a collapsed caret on remove block indent', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [blockQuote(['quote'])]))
    setCaretInTextLine(view, 0, 2)

    expect(buildSelectionRemoveBlockIndentOperationPlan(view)).toBeNull()
    expect(view.state.doc.child(0).type.name).toBe('blockQuote')
    expect(view.state.doc.child(0).textContent).toBe('quote')
  })

  it('removes legacy block indent tokens inside blockquotes without lifting the quote', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [blockQuote([`${BLOCK_INDENT_TOKEN}quote`])]))
    selectTextLines(view, 0)

    const plan = buildSelectionRemoveBlockIndentOperationPlan(view)
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.child(0).type.name).toBe('blockQuote')
    expect(nextState.doc.child(0).textContent).toBe('quote')
  })

  it('applies and removes block indent tokens across multi-cursor rows', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), paragraph('two')]))
    const applyPlan = buildMultiLineBlockIndentOperationPlan(view, multiLineState([0, 1], 3))
    expect(applyPlan).not.toBeNull()
    const appliedState = view.apply(applyPlan!.transaction)

    expect(appliedState.doc.child(0).textContent).toBe(`${BLOCK_INDENT_TOKEN}one`)
    expect(appliedState.doc.child(1).textContent).toBe(`${BLOCK_INDENT_TOKEN}two`)
    expect(applyPlan?.nextState.columnOffsets).toEqual({
      0: BLOCK_INDENT_TOKEN.length + 3,
      1: BLOCK_INDENT_TOKEN.length + 3,
    })

    const removePlan = buildMultiLineRemoveBlockIndentOperationPlan(view, applyPlan!.nextState)
    expect(removePlan).not.toBeNull()
    const removedState = view.apply(removePlan!.transaction)

    expect(removedState.doc.child(0).textContent).toBe('one')
    expect(removedState.doc.child(1).textContent).toBe('two')
    expect(removePlan?.nextState.columnOffsets).toEqual({ 0: 3, 1: 3 })
  })
})

describe('multi-cursor code block operations', () => {
  it('applies toolbar code blocks across adjacent paragraph and heading rows', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), heading('two', 3)]))
    const plan = buildMultiLineCodeBlockOperationPlan(view, multiLineState([0, 1], 3))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.childCount).toBe(1)
    expect(nextState.doc.child(0).type.name).toBe('codeBlock')
    expect(nextState.doc.child(0).textContent).toBe('one\ntwo')
    expect(plan?.nextState.columnOffsets).toEqual({ 0: 3, 1: 3 })
  })

  it('creates separate code blocks for non-adjacent selected rows', () => {
    const view = createView(
      multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), paragraph('middle'), paragraph('three')]),
    )
    const plan = buildMultiLineCodeBlockOperationPlan(view, multiLineState([0, 2], 3))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.childCount).toBe(3)
    expect(nextState.doc.child(0).type.name).toBe('codeBlock')
    expect(nextState.doc.child(0).textContent).toBe('one')
    expect(nextState.doc.child(1).type.name).toBe('paragraph')
    expect(nextState.doc.child(1).textContent).toBe('middle')
    expect(nextState.doc.child(2).type.name).toBe('codeBlock')
    expect(nextState.doc.child(2).textContent).toBe('three')
  })

  it('preserves empty selected rows inside the generated code block', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), paragraph(''), paragraph('three')]))
    const plan = buildMultiLineCodeBlockOperationPlan(view, multiLineState([0, 1, 2], 5))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(nextState.doc.childCount).toBe(1)
    expect(nextState.doc.child(0).type.name).toBe('codeBlock')
    expect(nextState.doc.child(0).textContent).toBe('one\n\nthree')
  })

  it('converts selected list rows to code blocks and preserves unselected list rows', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [bulletList(['keep', 'one', 'two', 'keep'])]))
    const plan = buildMultiLineCodeBlockOperationPlan(view, multiLineState([1, 2], 3))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(docChildTypes(nextState.doc)).toEqual(['bulletList', 'codeBlock', 'bulletList'])
    expect(listTexts(nextState.doc.child(0))).toEqual(['keep'])
    expect(nextState.doc.child(1).textContent).toBe('one\ntwo')
    expect(listTexts(nextState.doc.child(2))).toEqual(['keep'])
  })

  it('converts selected blockquote rows to code blocks and preserves unselected quoted rows', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [blockQuote(['keep', 'one', 'two', 'keep'])]))
    const plan = buildMultiLineCodeBlockOperationPlan(view, multiLineState([1, 2], 3))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(docChildTypes(nextState.doc)).toEqual(['blockQuote', 'codeBlock', 'blockQuote'])
    expect(nextState.doc.child(0).textContent).toBe('keep')
    expect(nextState.doc.child(1).textContent).toBe('one\ntwo')
    expect(nextState.doc.child(2).textContent).toBe('keep')
  })

  it('converts non-code rows while leaving selected code block rows unchanged', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), codeBlock('two')]))
    const plan = buildMultiLineCodeBlockOperationPlan(view, multiLineState([0, 1], 3))
    expect(plan).not.toBeNull()
    const nextState = view.apply(plan!.transaction)

    expect(docChildTypes(nextState.doc)).toEqual(['codeBlock', 'codeBlock'])
    expect(nextState.doc.child(0).textContent).toBe('one')
    expect(nextState.doc.child(1).textContent).toBe('two')
  })

  it('does not convert when all selected rows are already inside a code block', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [codeBlock('one\ntwo')]))

    expect(buildMultiLineCodeBlockOperationPlan(view, multiLineState([0, 1], 3))).toBeNull()
  })
})

describe('multi-cursor inline formatting operations', () => {
  it('maps active inline formats to stored editor marks immediately', () => {
    const view = createView(multilineFormatSchema.nodes.doc.create(null, [paragraph('one'), paragraph('two')]))
    const activeMarks = getActiveInlineFormatMarks(view.state.schema, ['bold', 'italic', 'strike', 'highlight'])

    expect(activeMarks.map((mark: any) => mark.type.name)).toEqual(['strong', 'emph', 'strike', 'mark'])

    const activeState = view.apply(applyActiveInlineFormatsToStoredMarks(view.state.tr, view.state.schema, ['bold']))
    expect(activeState.storedMarks?.map((mark: any) => mark.type.name)).toEqual(['strong'])

    const clearedState = view.apply(applyActiveInlineFormatsToStoredMarks(view.state.tr, view.state.schema, undefined))
    expect(clearedState.storedMarks).toEqual([])
  })

  it.each([
    ['bold', 'strong'],
    ['italic', 'emph'],
    ['strike', 'strike'],
    ['highlight', 'mark'],
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
    ['==one=', '=', 'highlight', 'mark'],
    ['== one =', '=', 'highlight', 'mark'],
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
