/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Editor } from '@toast-ui/editor'
import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model'
import { Selection, TextSelection } from 'prosemirror-state'
import type { NewlineOperationId } from '../types/app'
import { getEditorTextLineRanges } from './multiline-ranges'
import { getCommandCapableEditor, getWysiwygView } from './prosemirror-utils'

type EditorNewlineOperationResult =
  | { handled: false }
  | { handled: true; aisleMarkdown?: string }

const TEXT_CARRYING_BLOCK_OPERATIONS = new Set<NewlineOperationId>([
  'normalNewLine',
  'task',
  'bulletList',
  'numberedList',
  'codeBlock',
  'blockQuote',
])

function getSelectionText(view: any): string {
  const { from, to } = view.state.selection
  return view.state.doc.textBetween(Math.min(from, to), Math.max(from, to), '\n').replace(/\u200b/g, '')
}

function getCarriedText(view: any): string {
  return getSelectionText(view).trim()
}

function getTextLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function getInlineText(text: string): string {
  return getTextLines(text).join(' ')
}

function createParagraph(schema: any, text = ''): ProseMirrorNode {
  const inlineText = getInlineText(text)
  return schema.nodes.paragraph.create(null, inlineText ? schema.text(inlineText) : undefined)
}

function createListItem(schema: any, text: string, task: boolean): ProseMirrorNode {
  return schema.nodes.listItem.create(
    task ? { task: true, checked: false } : null,
    createParagraph(schema, text),
  )
}

function createOperationNodes(schema: any, operation: NewlineOperationId, text = ''): ProseMirrorNode[] {
  if (operation === 'horizontalLine') {
    return [schema.nodes.thematicBreak.create(), schema.nodes.paragraph.create()]
  }

  if (operation === 'codeBlock') {
    return [schema.nodes.codeBlock.create(null, text ? schema.text(text) : undefined)]
  }

  if (operation === 'blockQuote') {
    const lines = getTextLines(text)
    const paragraphs = lines.length > 0 ? lines.map((line) => createParagraph(schema, line)) : [createParagraph(schema)]
    return [schema.nodes.blockQuote.create(null, paragraphs)]
  }

  if (operation === 'task' || operation === 'bulletList' || operation === 'numberedList') {
    const lines = getTextLines(text)
    const itemTexts = lines.length > 0 ? lines : ['']
    const isTask = operation === 'task'
    const listType = operation === 'numberedList' ? schema.nodes.orderedList : schema.nodes.bulletList
    const listAttrs = operation === 'numberedList' ? { order: 1 } : null
    return [listType.create(listAttrs, itemTexts.map((line) => createListItem(schema, line, isTask)))]
  }

  return [createParagraph(schema, text)]
}

function findTopLevelRange(state: any, from: number, to: number) {
  const docSize = state.doc.content.size
  const safeFrom = Math.max(0, Math.min(docSize, from))
  const safeTo = Math.max(safeFrom, Math.min(docSize, to))
  const $from = state.doc.resolve(safeFrom)
  const $to = state.doc.resolve(Math.max(safeFrom, safeTo - 1))
  return {
    from: $from.depth >= 1 ? $from.before(1) : 0,
    to: $to.depth >= 1 ? $to.after(1) : docSize,
  }
}

function findTopLevelAfter(state: any, position: number) {
  const docSize = state.doc.content.size
  const safePosition = Math.max(0, Math.min(docSize, position))
  const $position = state.doc.resolve(safePosition)
  return $position.depth >= 1 ? $position.after(1) : docSize
}

function isWholeLineSelection(view: any): boolean {
  const { from, to } = view.state.selection
  if (from === to) return false

  const selectionFrom = Math.min(from, to)
  const selectionTo = Math.max(from, to)
  const touchedRanges = getEditorTextLineRanges(view).filter(
    (range) => range.length > 0 && selectionFrom <= range.end && selectionTo >= range.start,
  )
  if (touchedRanges.length === 0) return false

  return touchedRanges.every((range) => selectionFrom <= range.start && selectionTo >= range.end)
}

function setSelectionNearInsertedContent(tr: any, from: number, to: number) {
  const docEnd = tr.doc.content.size
  const safeFrom = Math.max(0, Math.min(docEnd, from))
  const safeTo = Math.max(safeFrom, Math.min(docEnd, to))
  let caretPos: number | null = null

  tr.doc.nodesBetween(safeFrom, safeTo, (node: any, pos: number) => {
    if (!node?.isTextblock) return true
    caretPos = pos + 1 + node.content.size
    return false
  })

  const resolvedPos = Math.max(0, Math.min(docEnd, caretPos ?? safeTo))
  try {
    return tr.setSelection(TextSelection.create(tr.doc, resolvedPos, resolvedPos))
  } catch {
    return tr.setSelection(Selection.near(tr.doc.resolve(resolvedPos), -1))
  }
}

function insertOperationBelow(view: any, operation: NewlineOperationId, text: string) {
  const { state } = view
  const { from, to } = state.selection
  const selectionFrom = Math.min(from, to)
  const selectionTo = Math.max(from, to)
  const insertAfter = findTopLevelAfter(state, selectionFrom)
  const fragment = Fragment.fromArray(createOperationNodes(state.schema, operation, text))
  let tr = state.tr

  if (selectionFrom !== selectionTo) {
    tr = tr.delete(selectionFrom, selectionTo)
  }

  const insertPos = tr.mapping.map(insertAfter, -1)
  tr = tr.insert(insertPos, fragment)
  tr = setSelectionNearInsertedContent(tr, insertPos, insertPos + fragment.size)
  view.dispatch(tr.scrollIntoView())
}

function replaceSelectedLine(view: any, operation: NewlineOperationId, text: string) {
  const { state } = view
  const { from, to } = state.selection
  const range = findTopLevelRange(state, Math.min(from, to), Math.max(from, to))
  const fragment = Fragment.fromArray(createOperationNodes(state.schema, operation, text))
  let tr = state.tr.replaceWith(range.from, range.to, fragment)
  tr = setSelectionNearInsertedContent(tr, range.from, range.from + fragment.size)
  view.dispatch(tr.scrollIntoView())
}

function deleteSelectionAndInsertHorizontalRule(view: any) {
  const { state } = view
  const { from, to } = state.selection
  const selectionFrom = Math.min(from, to)
  const selectionTo = Math.max(from, to)
  const insertAfter = findTopLevelAfter(state, selectionFrom)
  const fragment = Fragment.fromArray(createOperationNodes(state.schema, 'horizontalLine'))
  let tr = state.tr

  if (selectionFrom !== selectionTo) {
    tr = tr.delete(selectionFrom, selectionTo)
  }

  const insertPos = tr.mapping.map(insertAfter, -1)
  tr = tr.insert(insertPos, fragment)
  tr = setSelectionNearInsertedContent(tr, insertPos, insertPos + fragment.size)
  view.dispatch(tr.scrollIntoView())
}

function extractSelectionForAisle(editor: Editor): EditorNewlineOperationResult {
  const view = getWysiwygView(editor)
  if (!view) return { handled: true, aisleMarkdown: '' }

  const { state } = view
  const { from, to } = state.selection
  if (from === to) return { handled: true, aisleMarkdown: '' }

  const selectionFrom = Math.min(from, to)
  const selectionTo = Math.max(from, to)
  const aisleMarkdown = getSelectionText(view).trim()
  let tr = state.tr

  if (isWholeLineSelection(view)) {
    const range = findTopLevelRange(state, selectionFrom, selectionTo)
    tr =
      range.from === 0 && range.to >= state.doc.content.size
        ? tr.replaceWith(range.from, range.to, state.schema.nodes.paragraph.create())
        : tr.delete(range.from, range.to)
  } else {
    tr = tr.delete(selectionFrom, selectionTo)
  }

  view.dispatch(tr.scrollIntoView())
  editor.focus()
  return { handled: true, aisleMarkdown }
}

export function applyEditorNewlineOperation(
  editor: Editor,
  operation: NewlineOperationId,
): EditorNewlineOperationResult {
  if (operation === 'operationsMenu') return { handled: false }
  if (operation === 'aisle') return extractSelectionForAisle(editor)

  const view = getWysiwygView(editor)
  if (!view) return { handled: false }

  if (operation === 'inlineCode') {
    editor.focus()
    getCommandCapableEditor(editor).exec('code')
    return { handled: true }
  }

  if (operation === 'horizontalLine') {
    deleteSelectionAndInsertHorizontalRule(view)
    editor.focus()
    return { handled: true }
  }

  if (!TEXT_CARRYING_BLOCK_OPERATIONS.has(operation)) return { handled: false }

  const { empty } = view.state.selection
  const text = getCarriedText(view)
  if (!empty && isWholeLineSelection(view)) {
    replaceSelectedLine(view, operation, text)
  } else {
    insertOperationBelow(view, operation, empty ? '' : text)
  }

  editor.focus()
  return { handled: true }
}
