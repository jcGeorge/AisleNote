import type { Editor } from '@toast-ui/editor'
import { Fragment } from 'prosemirror-model'
import { Selection, TextSelection } from 'prosemirror-state'
import { getEditorMarkdownForPersistence, setEditorMarkdownForDisplay } from './editor-markdown-display'
import {
  getBulletListMarkerFromAttrs,
  setSelectedBulletListsMarker,
  type BulletListMarker,
} from './list-markers'
import {
  unwrapMatchingListItemsMarkdown,
  type ReorderListKind,
} from './list-reorder-markdown'
import {
  getCommandCapableEditor,
  getEditorCursorSelection,
  getWysiwygView,
  restoreEditorCursorSelection,
} from './prosemirror-utils'

export type ToolbarListCommand = 'taskList' | 'bulletList' | 'dashList' | 'orderedList'

type ProseMirrorNodeLike = {
  child?: (index: number) => ProseMirrorNodeLike
  childCount?: number
  nodeSize?: number
  isTextblock?: boolean
  type?: { name?: string }
  attrs?: Record<string, unknown> | null
  forEach?: (callback: (node: any) => void) => void
}

type ProseMirrorResolvedPosLike = {
  depth: number
  index?: (depth: number) => number
  node: (depth: number) => ProseMirrorNodeLike | null
  before?: (depth: number) => number
}

type ProseMirrorDocLike = {
  type?: {
    schema?: {
      nodes?: {
        bulletList?: any
        orderedList?: any
      }
    }
  }
  child?: (index: number) => ProseMirrorNodeLike
  childCount?: number
  content?: { size?: number }
  nodeAt?: (position: number) => ProseMirrorNodeLike | null
  resolve?: (position: number) => ProseMirrorResolvedPosLike
  nodesBetween?: (
    from: number,
    to: number,
    callback: (node: ProseMirrorNodeLike, position: number) => boolean | void,
  ) => void
}

type ProseMirrorViewLike = {
  state?: {
    schema?: {
      nodes?: {
        bulletList?: any
        orderedList?: any
      }
    }
    tr?: any
    selection?: {
      empty?: boolean
      from: number
      to: number
      anchor?: number
      head?: number
      $from?: ProseMirrorResolvedPosLike
      $to?: ProseMirrorResolvedPosLike
    }
    doc?: ProseMirrorDocLike
  }
  dispatch?: (transaction: unknown) => void
}

function getListKindForItem(parentList: ProseMirrorNodeLike | null, listItem: ProseMirrorNodeLike): ToolbarListCommand | null {
  if (parentList?.type?.name === 'orderedList') return 'orderedList'
  if (parentList?.type?.name !== 'bulletList') return null
  if (listItem.attrs?.task) return 'taskList'
  return getBulletListMarkerFromAttrs(parentList.attrs) === 'dash' ? 'dashList' : 'bulletList'
}

function hasDashListAncestor(resolvedPos: ProseMirrorResolvedPosLike, parentListDepth: number): boolean {
  for (let depth = parentListDepth - 1; depth > 0; depth -= 1) {
    const node = resolvedPos.node(depth)
    if (node?.type?.name === 'bulletList' && getBulletListMarkerFromAttrs(node.attrs) === 'dash') {
      return true
    }
  }
  return false
}

function getListKindForResolvedListItem(
  resolvedPos: ProseMirrorResolvedPosLike,
  listItemDepth: number,
  listItem: ProseMirrorNodeLike,
): ToolbarListCommand | null {
  const parentListDepth = listItemDepth - 1
  const parentList = resolvedPos.node(parentListDepth)
  const kind = getListKindForItem(parentList, listItem)
  if (kind !== 'bulletList') return kind
  return hasDashListAncestor(resolvedPos, parentListDepth) ? 'dashList' : kind
}

function getListKindForResolvedParentList(
  resolvedPos: ProseMirrorResolvedPosLike | null | undefined,
  listItem: ProseMirrorNodeLike,
): ToolbarListCommand | null {
  if (!resolvedPos) return null
  const parentListDepth = resolvedPos.depth
  const parentList = resolvedPos.node(parentListDepth)
  const kind = getListKindForItem(parentList, listItem)
  if (kind !== 'bulletList') return kind
  return hasDashListAncestor(resolvedPos, parentListDepth) ? 'dashList' : kind
}

export function getToolbarListKindForNode(node: ProseMirrorNodeLike | null | undefined): ToolbarListCommand | null {
  if (node?.type?.name === 'orderedList') return 'orderedList'
  if (node?.type?.name !== 'bulletList') return null

  let hasTaskItem = false
  let hasPlainItem = false
  for (let index = 0; index < (node.childCount ?? 0); index += 1) {
    const child = node.child?.(index)
    if (child?.attrs?.task) {
      hasTaskItem = true
    } else {
      hasPlainItem = true
    }
  }

  if (hasTaskItem) return hasPlainItem ? null : 'taskList'
  return getBulletListMarkerFromAttrs(node.attrs) === 'dash' ? 'dashList' : 'bulletList'
}

export function getCompatibleListSiblingRange(
  parentNode: { childCount?: number; child?: (index: number) => ProseMirrorNodeLike | null },
  listIndex: number,
  command: ToolbarListCommand,
): { startIndex: number; endIndex: number } | null {
  const childCount = parentNode.childCount ?? 0
  if (listIndex < 0 || listIndex >= childCount) return null
  if (getToolbarListKindForNode(parentNode.child?.(listIndex)) !== command) return null

  let startIndex = listIndex
  let endIndex = listIndex
  while (startIndex > 0 && getToolbarListKindForNode(parentNode.child?.(startIndex - 1)) === command) {
    startIndex -= 1
  }
  while (endIndex < childCount - 1 && getToolbarListKindForNode(parentNode.child?.(endIndex + 1)) === command) {
    endIndex += 1
  }

  return { startIndex, endIndex }
}

function hasListItemAncestor(resolvedPos: ProseMirrorResolvedPosLike | null | undefined) {
  if (!resolvedPos) return false
  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    if (resolvedPos.node(depth)?.type?.name === 'listItem') return true
  }
  return false
}

export function selectionTouchesListItem(view: unknown): boolean {
  const proseMirrorView = view as ProseMirrorViewLike | null
  const selection = proseMirrorView?.state?.selection
  const doc = proseMirrorView?.state?.doc
  if (!selection) return false
  if (hasListItemAncestor(selection.$from) || hasListItemAncestor(selection.$to)) return true

  let touchesListItem = false
  if (!selection.empty && doc?.nodesBetween) {
    doc.nodesBetween(Math.min(selection.from, selection.to), Math.max(selection.from, selection.to), (node) => {
      if (node.type?.name === 'listItem') {
        touchesListItem = true
        return false
      }
      return !touchesListItem
    })
  }
  return touchesListItem
}

function addListItemAncestorKinds(
  resolvedPos: ProseMirrorResolvedPosLike | null | undefined,
  listKindsByPosition: Map<number, ToolbarListCommand>,
) {
  if (!resolvedPos) return
  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    const listItem = resolvedPos.node(depth)
    if (listItem?.type?.name !== 'listItem') continue
    const kind = getListKindForResolvedListItem(resolvedPos, depth, listItem)
    if (!kind) continue
    const position = resolvedPos.before?.(depth) ?? depth
    listKindsByPosition.set(position, kind)
  }
}

function collectSelectionListKinds(view: ProseMirrorViewLike): {
  listKinds: Set<ToolbarListCommand>
  containsNonListTextblock: boolean
} {
  const selection = view.state?.selection
  const doc = view.state?.doc
  const listKindsByPosition = new Map<number, ToolbarListCommand>()
  if (!selection) return { listKinds: new Set(), containsNonListTextblock: false }

  addListItemAncestorKinds(selection.$from, listKindsByPosition)
  addListItemAncestorKinds(selection.$to, listKindsByPosition)

  let containsNonListTextblock = false
  if (!selection.empty && doc?.nodesBetween) {
    const from = Math.min(selection.from, selection.to)
    const to = Math.max(selection.from, selection.to)
    const docSize = Math.max(0, doc.content?.size ?? to)
    doc.nodesBetween(from, to, (node, position) => {
      if (node.type?.name === 'listItem') {
        const resolved = doc.resolve?.(Math.max(0, Math.min(position, docSize)))
        const kind = getListKindForResolvedParentList(resolved, node)
        if (kind) listKindsByPosition.set(position, kind)
        return true
      }

      if (node.isTextblock) {
        const resolved = doc.resolve?.(Math.max(0, Math.min(position, docSize)))
        if (!hasListItemAncestor(resolved)) {
          containsNonListTextblock = true
          return false
        }
        return false
      }

      return true
    })
  }

  return {
    listKinds: new Set(listKindsByPosition.values()),
    containsNonListTextblock,
  }
}

export function selectionUsesOnlyListKind(view: unknown, command: ToolbarListCommand): boolean {
  const { listKinds, containsNonListTextblock } = collectSelectionListKinds(view as ProseMirrorViewLike)
  return !containsNonListTextblock && listKinds.size === 1 && listKinds.has(command)
}

function getOnlySelectedListKind(view: unknown): ToolbarListCommand | null {
  const { listKinds, containsNonListTextblock } = collectSelectionListKinds(view as ProseMirrorViewLike)
  if (containsNonListTextblock || listKinds.size !== 1) return null
  return Array.from(listKinds)[0] ?? null
}

function resolveSafe(doc: ProseMirrorDocLike | undefined, position: number) {
  const docSize = Math.max(0, doc?.content?.size ?? position)
  try {
    return doc?.resolve?.(Math.max(0, Math.min(position, docSize)))
  } catch {
    return null
  }
}

function isEffectivelyDashBulletList(doc: ProseMirrorDocLike | undefined, node: ProseMirrorNodeLike, position: number) {
  if (node.type?.name !== 'bulletList') return false
  if (getBulletListMarkerFromAttrs(node.attrs) === 'dash') return true

  const resolvedInsideList = resolveSafe(doc, position + 1)
  if (!resolvedInsideList) return false
  for (let depth = resolvedInsideList.depth; depth > 0; depth -= 1) {
    const ancestor = resolvedInsideList.node(depth)
    if (ancestor?.type?.name === 'bulletList' && getBulletListMarkerFromAttrs(ancestor.attrs) === 'dash') {
      return true
    }
  }
  return false
}

function collectSelectedDashListPositions(view: ProseMirrorViewLike): Array<{ position: number; node: ProseMirrorNodeLike }> {
  const selection = view.state?.selection
  const doc = view.state?.doc
  if (!selection || !doc) return []

  if (selection.empty && selection.$from?.before) {
    for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
      const node = selection.$from.node(depth)
      const position = selection.$from.before(depth)
      if (node?.type?.name === 'bulletList' && isEffectivelyDashBulletList(doc, node, position)) {
        return [{ position, node }]
      }
    }
    return []
  }

  const candidates: Array<{ position: number; node: ProseMirrorNodeLike }> = []
  const from = Math.min(selection.from, selection.to)
  const to = Math.max(selection.from, selection.to)
  doc.nodesBetween?.(from, to, (node, position) => {
    if (node.type?.name === 'bulletList' && isEffectivelyDashBulletList(doc, node, position)) {
      candidates.push({ position, node })
    }
    return true
  })

  candidates.sort((a, b) => a.position - b.position)
  const nonOverlapping: Array<{ position: number; node: ProseMirrorNodeLike }> = []
  let lastEnd = -1
  for (const candidate of candidates) {
    if (candidate.position < lastEnd) continue
    nonOverlapping.push(candidate)
    lastEnd = candidate.position + (candidate.node.nodeSize ?? 0)
  }
  return nonOverlapping
}

function collectSelectedListPositionsByType(
  view: ProseMirrorViewLike,
  listTypeName: 'bulletList' | 'orderedList',
): Array<{ position: number; node: ProseMirrorNodeLike }> {
  const selection = view.state?.selection
  const doc = view.state?.doc
  if (!selection || !doc) return []

  if (selection.empty && selection.$from?.before) {
    for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
      const node = selection.$from.node(depth)
      if (node?.type?.name === listTypeName) {
        return [{ position: selection.$from.before(depth), node }]
      }
    }
    return []
  }

  const candidates: Array<{ position: number; node: ProseMirrorNodeLike }> = []
  const addNearestListAncestor = (resolvedPos: ProseMirrorResolvedPosLike | null | undefined) => {
    if (!resolvedPos?.before) return
    for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
      const node = resolvedPos.node(depth)
      if (node?.type?.name !== listTypeName) continue
      candidates.push({ position: resolvedPos.before(depth), node })
      return
    }
  }
  addNearestListAncestor(selection.$from)
  addNearestListAncestor(selection.$to)

  const from = Math.min(selection.from, selection.to)
  const to = Math.max(selection.from, selection.to)
  doc.nodesBetween?.(from, to, (node, position) => {
    if (node.type?.name === listTypeName) {
      candidates.push({ position, node })
    }
    return true
  })

  candidates.sort((a, b) => a.position - b.position)
  const nonOverlapping: Array<{ position: number; node: ProseMirrorNodeLike }> = []
  let lastEnd = -1
  for (const candidate of candidates) {
    if (candidate.position < lastEnd) continue
    nonOverlapping.push(candidate)
    lastEnd = candidate.position + (candidate.node.nodeSize ?? 0)
  }
  return nonOverlapping
}

function getOrderedListAttrs(orderedListType: any, content: unknown): Record<string, unknown> | null {
  try {
    orderedListType.create({ order: 1 }, content)
    return { order: 1 }
  } catch {
    return null
  }
}

function getNodeChildren(node: ProseMirrorNodeLike): any[] {
  const children: any[] = []
  node.forEach?.((child) => children.push(child))
  return children
}

function convertDashListBranchToOrderedList(node: any, orderedListType: any, inheritedDashList = false): any {
  const isDashBulletList =
    node?.type?.name === 'bulletList' &&
    (inheritedDashList || getBulletListMarkerFromAttrs(node.attrs) === 'dash')
  const childInheritedDashList = inheritedDashList || isDashBulletList
  const children = getNodeChildren(node).map((child) =>
    convertDashListBranchToOrderedList(child, orderedListType, childInheritedDashList),
  )
  const content = Fragment.fromArray(children)

  if (isDashBulletList) {
    return orderedListType.create(getOrderedListAttrs(orderedListType, content), content)
  }

  return children.length > 0 && typeof node?.copy === 'function' ? node.copy(content) : node
}

function getTaskListItemAttrs(attrs: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return {
    ...(attrs ?? {}),
    task: true,
    checked: attrs?.checked === true,
  }
}

function convertOrderedListBranchToTaskList(node: any, bulletListType: any): any {
  const children = getNodeChildren(node).map((child) => convertOrderedListBranchToTaskList(child, bulletListType))
  const content = Fragment.fromArray(children)

  if (node?.type?.name === 'orderedList') {
    return bulletListType.create(null, content)
  }

  if (node?.type?.name === 'listItem') {
    return node.type.create(getTaskListItemAttrs(node.attrs), content)
  }

  return children.length > 0 && typeof node?.copy === 'function' ? node.copy(content) : node
}

export function convertSelectedDashListsToOrderedList(view: unknown): boolean {
  const proseMirrorView = view as ProseMirrorViewLike | null
  const state = proseMirrorView?.state
  const orderedListType = state?.schema?.nodes?.orderedList ?? state?.doc?.type?.schema?.nodes?.orderedList
  if (!proseMirrorView?.dispatch || !state?.tr || !orderedListType) return false

  const selectedDashLists = collectSelectedDashListPositions(proseMirrorView as ProseMirrorViewLike)
  if (selectedDashLists.length === 0) return false

  let transaction = state.tr
  for (const { position, node } of [...selectedDashLists].sort((a, b) => b.position - a.position)) {
    const orderedListNode = convertDashListBranchToOrderedList(node, orderedListType, true)
    transaction = transaction.replaceWith(position, position + (node.nodeSize ?? 0), orderedListNode)
  }
  proseMirrorView.dispatch(transaction.scrollIntoView())
  return true
}

export function convertSelectedOrderedListsToTaskList(view: unknown): boolean {
  const proseMirrorView = view as ProseMirrorViewLike | null
  const state = proseMirrorView?.state
  const bulletListType = state?.schema?.nodes?.bulletList ?? state?.doc?.type?.schema?.nodes?.bulletList
  if (!proseMirrorView?.dispatch || !state?.tr || !bulletListType) return false

  const selectedOrderedLists = collectSelectedListPositionsByType(proseMirrorView as ProseMirrorViewLike, 'orderedList')
  if (selectedOrderedLists.length === 0) return false

  let transaction = state.tr
  for (const { position, node } of [...selectedOrderedLists].sort((a, b) => b.position - a.position)) {
    const taskListNode = convertOrderedListBranchToTaskList(node, bulletListType)
    transaction = transaction.replaceWith(position, position + (node.nodeSize ?? 0), taskListNode)
  }
  proseMirrorView.dispatch(transaction.scrollIntoView())
  return true
}

export function applyBulletListMarkerCommand(editor: Editor, marker: BulletListMarker): boolean {
  editor.focus()
  getCommandCapableEditor(editor).exec('bulletList')
  const view = getWysiwygView(editor)
  return setSelectedBulletListsMarker(view, marker)
}

export function applyStructuralListIndent(editor: Editor, outdent: boolean): boolean {
  const view = getWysiwygView(editor)
  if (!selectionTouchesListItem(view)) return false
  const selectedListKind = getOnlySelectedListKind(view)
  editor.focus()
  getCommandCapableEditor(editor).exec(outdent ? 'outdent' : 'indent')
  if (!outdent && selectedListKind === 'dashList') {
    setSelectedBulletListsMarker(getWysiwygView(editor), 'dash')
  }
  return true
}

function getReorderListKindForToolbarCommand(command: ToolbarListCommand): ReorderListKind {
  if (command === 'taskList') return 'task'
  if (command === 'dashList') return 'dash'
  if (command === 'orderedList') return 'numbered'
  return 'bullet'
}

function getTopLevelChildStart(doc: { childCount?: number; child?: (index: number) => ProseMirrorNodeLike }, index: number) {
  let position = 0
  for (let currentIndex = 0; currentIndex < index; currentIndex += 1) {
    position += doc.child?.(currentIndex)?.nodeSize ?? 0
  }
  return position
}

function getListChildNodes(node: ProseMirrorNodeLike): any[] {
  const children: any[] = []
  node.forEach?.((child) => children.push(child))
  return children
}

function setSelectionAfterListMerge(
  tr: any,
  mergeStart: number,
  originalListStart: number,
  previousListContentSize: number,
  anchor: number,
  head: number,
) {
  const mapPosition = (position: number) => {
    const relativeToOriginalList = Math.max(0, position - originalListStart)
    const docSize = tr.doc.content.size
    return Math.max(0, Math.min(docSize, mergeStart + previousListContentSize + relativeToOriginalList))
  }

  const nextAnchor = mapPosition(anchor)
  const nextHead = mapPosition(head)
  try {
    return tr.setSelection(TextSelection.create(tr.doc, nextAnchor, nextHead))
  } catch {
    const nearPosition = Math.max(0, Math.min(tr.doc.content.size, nextHead))
    return tr.setSelection(Selection.near(tr.doc.resolve(nearPosition), 1))
  }
}

export function mergeAdjacentCompatibleLists(view: unknown, command: ToolbarListCommand): boolean {
  const proseMirrorView = view as ProseMirrorViewLike | null
  const state = proseMirrorView?.state
  const doc = state?.doc
  const selection = state?.selection
  if (!proseMirrorView?.dispatch || !state || !doc || !selection) return false

  const $from = selection.$from
  if (!$from) return false
  let listIndex = -1
  let listStart = -1
  let listNode: ProseMirrorNodeLike | null = null
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (getToolbarListKindForNode(node) !== command) continue
    if (depth !== 1) return false
    listIndex = $from.index?.(0) ?? -1
    listStart = $from.before?.(depth) ?? -1
    listNode = node
    break
  }
  if (!listNode || listIndex < 0 || listStart < 0) return false

  const range = getCompatibleListSiblingRange(doc, listIndex, command)
  if (!range || range.startIndex === range.endIndex) return false

  const mergeStart = getTopLevelChildStart(doc, range.startIndex)
  let mergeEnd = mergeStart
  let previousListContentSize = 0
  const mergedItems: any[] = []

  for (let index = range.startIndex; index <= range.endIndex; index += 1) {
    const currentNode = doc.child?.(index)
    if (!currentNode) continue
    if (index < listIndex) {
      previousListContentSize += Math.max(0, (currentNode.nodeSize ?? 2) - 2)
    }
    mergeEnd += currentNode.nodeSize ?? 0
    mergedItems.push(...getListChildNodes(currentNode))
  }

  const firstList = doc.child?.(range.startIndex)
  if (!firstList?.type) return false

  const mergedList = (firstList.type as any).create(firstList.attrs, Fragment.fromArray(mergedItems))
  let tr = (state as any).tr.replaceWith(mergeStart, mergeEnd, mergedList)
  tr = setSelectionAfterListMerge(
    tr,
    mergeStart,
    listStart,
    previousListContentSize,
    selection.anchor ?? selection.from,
    selection.head ?? selection.to,
  )
  proseMirrorView.dispatch(tr.scrollIntoView())
  return true
}

export function applyListToolbarCommand(editor: Editor, command: ToolbarListCommand): boolean {
  editor.focus()
  const view = getWysiwygView(editor)
  const commandEditor = getCommandCapableEditor(editor)
  const selectedListKind = getOnlySelectedListKind(view)
  if (selectionUsesOnlyListKind(view, command)) {
    const selectedText = commandEditor.getSelectedText?.() ?? ''
    const nextMarkdown = unwrapMatchingListItemsMarkdown(
      getEditorMarkdownForPersistence(editor),
      selectedText,
      getReorderListKindForToolbarCommand(command),
    )
    if (nextMarkdown !== null) {
      const previousSelection = getEditorCursorSelection(editor)
      setEditorMarkdownForDisplay(editor, nextMarkdown, false)
      if (!previousSelection || !restoreEditorCursorSelection(editor, previousSelection)) {
        editor.focus()
      }
      return true
    }

    commandEditor.exec('outdent')
    return true
  }

  const shouldRestoreConvertedSelection =
    command === 'orderedList' || (command === 'taskList' && selectedListKind === 'orderedList')
  const previousConvertedSelection = shouldRestoreConvertedSelection ? getEditorCursorSelection(editor) : null

  if (command === 'orderedList' && selectedListKind === 'dashList' && convertSelectedDashListsToOrderedList(view)) {
    editor.focus()
  } else if (command === 'taskList' && selectedListKind === 'orderedList' && convertSelectedOrderedListsToTaskList(view)) {
    editor.focus()
  } else if (command === 'dashList') {
    applyBulletListMarkerCommand(editor, 'dash')
  } else if (command === 'bulletList') {
    applyBulletListMarkerCommand(editor, 'bullet')
  } else {
    commandEditor.exec(command)
  }

  mergeAdjacentCompatibleLists(getWysiwygView(editor), command)
  if (shouldRestoreConvertedSelection) {
    if (!previousConvertedSelection || !restoreEditorCursorSelection(editor, previousConvertedSelection)) {
      editor.focus()
    }
  }
  return true
}
