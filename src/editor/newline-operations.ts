import type { Editor } from '@toast-ui/editor'
import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model'
import { Selection, TextSelection } from 'prosemirror-state'
import type { NewlineOperationId } from '../types/app'
import { isCompatibleListNodeForOperation, isListNewlineOperation } from './list-operation-compatibility'
import {
  createOperationListItems,
  createOperationListNode,
  createOperationNodes,
} from './newline-operation-nodes'
import { getEditorTextLineRanges } from './multiline-ranges'
import { buildMultiLineListOperationPlan, type MultiLineListOperation } from './multiline-list-operations'
import { getCommandCapableEditor, getWysiwygView } from './prosemirror-utils'

type EditorNewlineOperationResult =
  | { handled: false }
  | { handled: true; aisleMarkdown?: string }

const TEXT_CARRYING_BLOCK_OPERATIONS = new Set<NewlineOperationId>([
  'normalNewLine',
  'task',
  'dashList',
  'bulletList',
  'numberedList',
  'codeBlock',
  'blockQuote',
])

const EMPTY_LINE_REPLACEMENT_OPERATIONS = new Set<NewlineOperationId>([
  'task',
  'dashList',
  'bulletList',
  'numberedList',
  'horizontalLine',
  'codeBlock',
  'blockQuote',
])

export function getEmptyLineReplacementRangeForOperation(
  operation: NewlineOperationId,
  state: any,
): { from: number; to: number } | null {
  if (!EMPTY_LINE_REPLACEMENT_OPERATIONS.has(operation)) return null
  const selection = state?.selection
  const $from = selection?.$from
  if (!selection?.empty || !$from) return null
  const parent = $from.parent
  if ($from.depth !== 1 || parent?.type?.name !== 'paragraph') return null
  if (!isEmptyTextOnlyParagraph(parent)) return null
  return {
    from: $from.before(1),
    to: $from.after(1),
  }
}

function isBlankEditorText(value: string) {
  return value.replace(/\u200b/g, '').trim().length <= 0
}

function isEmptyTextOnlyParagraph(paragraph: any) {
  const paragraphText = typeof paragraph?.textContent === 'string' ? paragraph.textContent : ''
  if (!isBlankEditorText(paragraphText)) return false
  if (typeof paragraph?.childCount !== 'number' || typeof paragraph?.child !== 'function') return true
  for (let index = 0; index < paragraph.childCount; index += 1) {
    const child = paragraph.child(index)
    if (!child?.isText && child?.type?.name !== 'text') return false
    const childText =
      typeof child.text === 'string'
        ? child.text
        : typeof child.textContent === 'string'
          ? child.textContent
          : ''
    if (!isBlankEditorText(childText)) return false
  }
  return true
}

function getSelectionText(view: any): string {
  const { from, to } = view.state.selection
  return view.state.doc.textBetween(Math.min(from, to), Math.max(from, to), '\n').replace(/\u200b/g, '')
}

function getCarriedText(view: any): string {
  return getSelectionText(view).trim()
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

function getWholeLineSelectionIndices(view: any): number[] {
  const { from, to } = view.state.selection
  if (from === to) return []

  const selectionFrom = Math.min(from, to)
  const selectionTo = Math.max(from, to)
  const touchedRanges = getEditorTextLineRanges(view)
    .map((range, index) => ({ range, index }))
    .filter(({ range }) =>
      range.length > 0
        ? selectionFrom <= range.end && selectionTo >= range.start
        : selectionFrom <= range.start && selectionTo >= range.end,
    )
  if (touchedRanges.length === 0) return []

  return touchedRanges.every(({ range }) => selectionFrom <= range.start && selectionTo >= range.end)
    ? touchedRanges.map(({ index }) => index)
    : []
}

function isWholeLineSelection(view: any): boolean {
  return getWholeLineSelectionIndices(view).length > 0
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

function getTopLevelStartByIndex(doc: any, index: number): number {
  let position = 0
  for (let currentIndex = 0; currentIndex < index; currentIndex += 1) {
    position += doc.child(currentIndex).nodeSize
  }
  return position
}

function findTopLevelChildAtStart(doc: any, start: number): { node: ProseMirrorNode; index: number; start: number } | null {
  let position = 0
  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index)
    if (position === start) return { node, index, start: position }
    position += node.nodeSize
  }
  return null
}

function getListChildNodes(node: any): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = []
  node.forEach((child: ProseMirrorNode) => {
    children.push(child)
  })
  return children
}

function setSelectionNearListItems(tr: any, listStart: number, firstItemIndex: number, itemCount: number) {
  const listNode = tr.doc.nodeAt(listStart)
  if (!listNode) return setSelectionNearInsertedContent(tr, listStart, listStart)

  let itemStart = listStart + 1
  for (let index = 0; index < firstItemIndex && index < listNode.childCount; index += 1) {
    itemStart += listNode.child(index).nodeSize
  }

  let itemEnd = itemStart
  const lastIndex = Math.min(listNode.childCount, firstItemIndex + Math.max(1, itemCount))
  for (let index = firstItemIndex; index < lastIndex; index += 1) {
    itemEnd += listNode.child(index).nodeSize
  }

  return setSelectionNearInsertedContent(tr, itemStart, itemEnd)
}

function mergeCompatibleTopLevelLists(
  tr: any,
  operation: NewlineOperationId,
  insertedListStart: number,
  insertedItemCount: number,
) {
  const hit = findTopLevelChildAtStart(tr.doc, insertedListStart)
  if (!hit || !isCompatibleListNodeForOperation(hit.node, operation)) {
    return {
      tr,
      selectionFrom: insertedListStart,
      selectionTo: insertedListStart + (hit?.node?.nodeSize ?? 0),
    }
  }

  let startIndex = hit.index
  let endIndex = hit.index
  while (startIndex > 0 && isCompatibleListNodeForOperation(tr.doc.child(startIndex - 1), operation)) {
    startIndex -= 1
  }
  while (endIndex < tr.doc.childCount - 1 && isCompatibleListNodeForOperation(tr.doc.child(endIndex + 1), operation)) {
    endIndex += 1
  }

  if (startIndex === endIndex) {
    return {
      tr,
      selectionFrom: hit.start,
      selectionTo: hit.start + hit.node.nodeSize,
      listStart: hit.start,
      insertedItemIndex: 0,
      insertedItemCount,
    }
  }

  const mergeStart = getTopLevelStartByIndex(tr.doc, startIndex)
  let mergeEnd = mergeStart
  const mergedItems: ProseMirrorNode[] = []
  let insertedItemIndex = 0
  for (let index = startIndex; index <= endIndex; index += 1) {
    const listNode = tr.doc.child(index)
    if (index < hit.index) insertedItemIndex += listNode.childCount
    mergeEnd += listNode.nodeSize
    mergedItems.push(...getListChildNodes(listNode))
  }

  const firstList = tr.doc.child(startIndex)
  const mergedList = firstList.type.create(firstList.attrs, Fragment.fromArray(mergedItems))
  tr = tr.replaceWith(mergeStart, mergeEnd, mergedList)
  return {
    tr,
    selectionFrom: mergeStart,
    selectionTo: mergeStart + mergedList.nodeSize,
    listStart: mergeStart,
    insertedItemIndex,
    insertedItemCount,
  }
}

function findCompatibleListContext(state: any, operation: NewlineOperationId) {
  const { $from } = state.selection
  let listDepth: number | null = null

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (isCompatibleListNodeForOperation(node, operation)) {
      listDepth = depth
      break
    }
  }
  if (listDepth === null) return null

  for (let depth = $from.depth; depth > listDepth; depth -= 1) {
    if ($from.node(depth)?.type?.name === 'listItem' && $from.node(depth - 1) === $from.node(listDepth)) {
      return {
        listDepth,
        itemDepth: depth,
        itemEnd: $from.after(depth),
      }
    }
  }

  return null
}

function insertListItemsIntoCurrentList(view: any, operation: NewlineOperationId, text: string): boolean {
  if (!view.state.selection.empty) return false
  const context = findCompatibleListContext(view.state, operation)
  if (!context) return false

  const items = createOperationListItems(view.state.schema, operation, text)
  const fragment = Fragment.fromArray(items)
  const insertPos = context.itemEnd
  let tr = view.state.tr.insert(insertPos, fragment)
  tr = setSelectionNearInsertedContent(tr, insertPos, insertPos + fragment.size)
  view.dispatch(tr.scrollIntoView())
  return true
}

function insertListOperationBelow(view: any, operation: NewlineOperationId, text: string) {
  if (insertListItemsIntoCurrentList(view, operation, text)) return

  const { state } = view
  const { from, to } = state.selection
  const selectionFrom = Math.min(from, to)
  const selectionTo = Math.max(from, to)
  const insertAfter = findTopLevelAfter(state, selectionFrom)
  const listNode = createOperationListNode(state.schema, operation, text)
  if (!listNode) return
  let tr = state.tr

  if (selectionFrom !== selectionTo) {
    tr = tr.delete(selectionFrom, selectionTo)
  }

  const insertPos = tr.mapping.map(insertAfter, -1)
  tr = tr.insert(insertPos, listNode)
  const merged = mergeCompatibleTopLevelLists(tr, operation, insertPos, listNode.childCount)
  tr =
    typeof merged.listStart === 'number'
      ? setSelectionNearListItems(merged.tr, merged.listStart, merged.insertedItemIndex, merged.insertedItemCount)
      : setSelectionNearInsertedContent(merged.tr, merged.selectionFrom, merged.selectionTo)
  view.dispatch(tr.scrollIntoView())
}

function insertOperationBelow(view: any, operation: NewlineOperationId, text: string) {
  if (isListNewlineOperation(operation)) {
    insertListOperationBelow(view, operation, text)
    return
  }

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

  if (isListNewlineOperation(operation)) {
    const selectedLineIndices = getWholeLineSelectionIndices(view)
    if (selectedLineIndices.length >= 2) {
      const plan = buildMultiLineListOperationPlan(
        view,
        {
          anchorBlockIndex: selectedLineIndices[0],
          headBlockIndex: selectedLineIndices[selectedLineIndices.length - 1],
          columnOffset: 0,
          cursorBlockIndices: selectedLineIndices,
        },
        operation as MultiLineListOperation,
      )
      if (plan) {
        view.dispatch(plan.transaction.scrollIntoView())
        return
      }
    }

    const listNode = createOperationListNode(state.schema, operation, text)
    if (!listNode) return
    let tr = state.tr.replaceWith(range.from, range.to, listNode)
    const merged = mergeCompatibleTopLevelLists(tr, operation, range.from, listNode.childCount)
    tr =
      typeof merged.listStart === 'number'
        ? setSelectionNearListItems(merged.tr, merged.listStart, merged.insertedItemIndex, merged.insertedItemCount)
        : setSelectionNearInsertedContent(merged.tr, merged.selectionFrom, merged.selectionTo)
    view.dispatch(tr.scrollIntoView())
    return
  }

  const fragment = Fragment.fromArray(createOperationNodes(state.schema, operation, text))
  let tr = state.tr.replaceWith(range.from, range.to, fragment)
  tr = setSelectionNearInsertedContent(tr, range.from, range.from + fragment.size)
  view.dispatch(tr.scrollIntoView())
}

function replaceEmptyLineWithOperation(view: any, operation: NewlineOperationId, text = ''): boolean {
  const range = getEmptyLineReplacementRangeForOperation(operation, view.state)
  if (!range) return false

  if (isListNewlineOperation(operation)) {
    const listNode = createOperationListNode(view.state.schema, operation, text)
    if (!listNode) return false
    let tr = view.state.tr.replaceWith(range.from, range.to, listNode)
    const merged = mergeCompatibleTopLevelLists(tr, operation, range.from, listNode.childCount)
    tr =
      typeof merged.listStart === 'number'
        ? setSelectionNearListItems(merged.tr, merged.listStart, merged.insertedItemIndex, merged.insertedItemCount)
        : setSelectionNearInsertedContent(merged.tr, merged.selectionFrom, merged.selectionTo)
    view.dispatch(tr.scrollIntoView())
    return true
  }

  const fragment = Fragment.fromArray(createOperationNodes(view.state.schema, operation, text))
  let tr = view.state.tr.replaceWith(range.from, range.to, fragment)
  tr = setSelectionNearInsertedContent(tr, range.from, range.from + fragment.size)
  view.dispatch(tr.scrollIntoView())
  return true
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
  if (operation === 'strikethrough') {
    editor.focus()
    getCommandCapableEditor(editor).exec('strike')
    return { handled: true }
  }

  const view = getWysiwygView(editor)
  if (!view) return { handled: false }

  if (operation === 'inlineCode') {
    editor.focus()
    getCommandCapableEditor(editor).exec('code')
    return { handled: true }
  }

  if (operation === 'horizontalLine') {
    if (replaceEmptyLineWithOperation(view, operation)) {
      editor.focus()
      return { handled: true }
    }
    deleteSelectionAndInsertHorizontalRule(view)
    editor.focus()
    return { handled: true }
  }

  if (!TEXT_CARRYING_BLOCK_OPERATIONS.has(operation)) return { handled: false }

  const { empty } = view.state.selection
  const text = getCarriedText(view)
  if (!empty && isWholeLineSelection(view)) {
    replaceSelectedLine(view, operation, text)
  } else if (empty) {
    if (!replaceEmptyLineWithOperation(view, operation)) {
      insertOperationBelow(view, operation, '')
    }
  } else {
    insertOperationBelow(view, operation, text)
  }

  editor.focus()
  return { handled: true }
}
