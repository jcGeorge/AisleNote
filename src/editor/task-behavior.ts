import type { Editor } from '@toast-ui/editor'
import { Selection, TextSelection } from 'prosemirror-state'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { DASH_LIST_CLASS_NAME, DASH_LIST_MARKER_ATTR, DASH_LIST_MARKER_VALUE } from './list-markers'
import type { ReorderListKind } from './list-reorder-markdown'
import { getWysiwygView } from './prosemirror-utils'

const COMPLETED_TASK_HOLD_MS = 500
const COMPLETED_TASK_POINTER_SLOP_PX = 6
export const COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS = 10 * 60 * 1000
export const COMPLETED_TASK_UNDO_HINT_DETECTION_MS = 60 * 1000
const TASK_REORDER_SELECTION_SUPPRESS_PX = 4
const TASK_REORDER_DRAG_SLOP_PX = 8
const TASK_REORDER_PREVIEW_MAX_CHARS = 30
const TASK_REORDER_MARKER_GAP_OFFSET_PX = 4
const TASK_REORDER_SLOT_HYSTERESIS_PX = 6
const TASK_REORDER_MARKER_MIN_WIDTH_PX = 72
const TASK_REORDER_MARKER_EXTRA_WIDTH_PX = 34
const TASK_REORDER_GHOST_CURSOR_X_PERCENT = 25
export const TASK_REORDER_SELECTION_SUPPRESSION_CLASS = 'task-reorder-selection-suppressed'

type TaskListItemHit = {
  node: any
  offset: number
}

type TaskReorderDropTarget = {
  listElement: HTMLElement
  element: HTMLElement
  insertIndex: number
  markerY: number
}

type ProseMirrorNodeHit = {
  node: any
  pos: number
}

export type CapturedListItemBranch = {
  itemNode: any
  itemPos: number
  listNode: any
  listPos: number
}

type TextLineRect = {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export function getListReorderPointerDecision(deltaX: number, deltaY: number): {
  shouldCancelReorder: boolean
  shouldSuppressSelection: boolean
  shouldStartDrag: boolean
} {
  const horizontalDistance = Math.abs(deltaX)
  const verticalDistance = Math.abs(deltaY)
  const shouldCancelReorder =
    Number.isFinite(horizontalDistance) &&
    Number.isFinite(verticalDistance) &&
    horizontalDistance >= TASK_REORDER_DRAG_SLOP_PX &&
    verticalDistance < TASK_REORDER_SELECTION_SUPPRESS_PX
  const shouldStartDrag =
    Number.isFinite(horizontalDistance) &&
    Number.isFinite(verticalDistance) &&
    !shouldCancelReorder &&
    verticalDistance >= TASK_REORDER_DRAG_SLOP_PX &&
    verticalDistance > 0
  const shouldSuppressSelection =
    Number.isFinite(horizontalDistance) &&
    Number.isFinite(verticalDistance) &&
    !shouldCancelReorder &&
    verticalDistance >= TASK_REORDER_SELECTION_SUPPRESS_PX &&
    verticalDistance > 0
  return {
    shouldCancelReorder,
    shouldSuppressSelection,
    shouldStartDrag,
  }
}

export function shouldUseManualListCaretPlacement(startedOnTrailingSpace: boolean, pointerUpInsideItem: boolean): boolean {
  return startedOnTrailingSpace && pointerUpInsideItem
}

export function shouldRunDelayedTaskCaretPlacement({
  scheduledVersion,
  currentVersion,
  sourceConnected,
  activeEditorMatches,
  activeViewMatches,
}: {
  scheduledVersion: number
  currentVersion: number
  sourceConnected: boolean
  activeEditorMatches: boolean
  activeViewMatches: boolean
}): boolean {
  return scheduledVersion === currentVersion && sourceConnected && activeEditorMatches && activeViewMatches
}

export function scheduleTaskCheckboxStateCommit(editor: Editor, onCommit?: (editor: Editor) => void): () => void {
  if (!onCommit) return () => {}
  let cancelled = false
  let frameId: number | null = null
  const timeoutId = window.setTimeout(() => {
    if (cancelled) return
    const run = () => {
      if (!cancelled) onCommit(editor)
    }
    if (typeof window.requestAnimationFrame === 'function') {
      frameId = window.requestAnimationFrame(run)
    } else {
      run()
    }
  }, 0)

  return () => {
    cancelled = true
    window.clearTimeout(timeoutId)
    if (frameId !== null && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(frameId)
    }
  }
}

export function shouldScheduleUncheckedTaskCheckboxCommit(hit: {
  node?: { attrs?: { task?: boolean; checked?: boolean } }
} | null): boolean {
  return Boolean(hit?.node?.attrs?.task && hit.node.attrs.checked !== true)
}

export function shouldSuppressListReorderSelectStart(isDragging: boolean): boolean {
  return isDragging
}

export function setTaskReorderDocumentSelectionSuppressed(isSuppressed: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement?.classList.toggle(TASK_REORDER_SELECTION_SUPPRESSION_CLASS, isSuppressed)
  document.body?.classList.toggle(TASK_REORDER_SELECTION_SUPPRESSION_CLASS, isSuppressed)
}

export function clearTaskReorderNativeSelection() {
  try {
    if (typeof window !== 'undefined') {
      window.getSelection?.()?.removeAllRanges()
    }
  } catch {
    // Selection APIs can be unavailable in tests or during teardown.
  }
  try {
    if (typeof document !== 'undefined') {
      document.getSelection?.()?.removeAllRanges()
    }
  } catch {
    // Keep drag cleanup best-effort.
  }
}

export function scheduleTaskReorderNativeSelectionClear(onComplete?: () => void): () => void {
  clearTaskReorderNativeSelection()

  if (typeof window === 'undefined') {
    onComplete?.()
    return () => {}
  }

  let cancelled = false
  let pendingCount = 0
  let frameId: number | null = null
  let timeoutId: number | null = null

  const completeOne = () => {
    if (cancelled) return
    clearTaskReorderNativeSelection()
    pendingCount -= 1
    if (pendingCount <= 0) {
      onComplete?.()
    }
  }

  if (typeof window.requestAnimationFrame === 'function') {
    pendingCount += 1
    frameId = window.requestAnimationFrame(completeOne)
  }

  if (typeof window.setTimeout === 'function') {
    pendingCount += 1
    timeoutId = window.setTimeout(completeOne, 0)
  }

  if (pendingCount === 0) {
    onComplete?.()
  }

  return () => {
    cancelled = true
    if (frameId !== null && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(frameId)
    }
    if (timeoutId !== null && typeof window.clearTimeout === 'function') {
      window.clearTimeout(timeoutId)
    }
  }
}

export function createTaskReorderSelectionSuppressionController() {
  let isActive = false
  let listenerInstalled = false
  let pendingClearCancel: (() => void) | null = null
  let releaseToken = 0

  const handleSelectionChange = () => {
    if (!isActive) return
    clearTaskReorderNativeSelection()
  }

  const cancelPendingClear = () => {
    pendingClearCancel?.()
    pendingClearCancel = null
  }

  const installSelectionChangeGuard = () => {
    if (listenerInstalled || typeof document === 'undefined') return
    document.addEventListener('selectionchange', handleSelectionChange, true)
    listenerInstalled = true
  }

  const removeSelectionChangeGuard = () => {
    if (!listenerInstalled || typeof document === 'undefined') return
    document.removeEventListener('selectionchange', handleSelectionChange, true)
    listenerInstalled = false
  }

  const clearAfterBrowserPass = (onComplete?: () => void) => {
    cancelPendingClear()
    pendingClearCancel = scheduleTaskReorderNativeSelectionClear(() => {
      pendingClearCancel = null
      onComplete?.()
    })
  }

  const begin = () => {
    releaseToken += 1
    isActive = true
    setTaskReorderDocumentSelectionSuppressed(true)
    installSelectionChangeGuard()
    clearAfterBrowserPass()
  }

  const endWithoutClearing = () => {
    releaseToken += 1
    cancelPendingClear()
    isActive = false
    removeSelectionChangeGuard()
    setTaskReorderDocumentSelectionSuppressed(false)
  }

  const endImmediately = () => {
    const shouldClearSelection = isActive || listenerInstalled || pendingClearCancel !== null
    endWithoutClearing()
    if (shouldClearSelection) {
      clearTaskReorderNativeSelection()
    }
  }

  const endAfterBrowserPass = () => {
    if (!isActive) {
      endWithoutClearing()
      return
    }
    const token = releaseToken + 1
    releaseToken = token
    clearAfterBrowserPass(() => {
      if (token !== releaseToken) return
      isActive = false
      removeSelectionChangeGuard()
      setTaskReorderDocumentSelectionSuppressed(false)
    })
  }

  return {
    begin,
    clearAfterBrowserPass: () => {
      if (!isActive) return
      clearAfterBrowserPass()
    },
    endImmediately,
    endAfterBrowserPass,
    endWithoutClearing,
    isActive: () => isActive,
  }
}

export function mergeInlineRectsIntoLineRects(rects: TextLineRect[]): TextLineRect[] {
  const visibleRects = rects
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => (Math.abs(a.top - b.top) <= 2 ? a.left - b.left : a.top - b.top))
  const lines: TextLineRect[] = []

  for (const rect of visibleRects) {
    const rectCenter = rect.top + rect.height / 2
    const existingLine = lines.find((line) => rectCenter >= line.top - 2 && rectCenter <= line.bottom + 2)
    if (!existingLine) {
      lines.push({ ...rect })
      continue
    }

    existingLine.top = Math.min(existingLine.top, rect.top)
    existingLine.bottom = Math.max(existingLine.bottom, rect.bottom)
    existingLine.left = Math.min(existingLine.left, rect.left)
    existingLine.right = Math.max(existingLine.right, rect.right)
    existingLine.width = existingLine.right - existingLine.left
    existingLine.height = existingLine.bottom - existingLine.top
  }

  return lines
}

function parseCssPixel(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isTaskCheckboxHit(listItemElement: HTMLElement, event: globalThis.MouseEvent): boolean {
  const style = window.getComputedStyle(listItemElement, '::before')
  const rect = listItemElement.getBoundingClientRect()
  const boxLeft = parseCssPixel(style.left, 0)
  const boxTop = parseCssPixel(style.top, 1)
  const boxWidth = parseCssPixel(style.width, 18)
  const boxHeight = parseCssPixel(style.height, 18)
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  return x >= boxLeft && x <= boxLeft + boxWidth && y >= boxTop && y <= boxTop + boxHeight
}

function getElementFromEventTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target
  if (target instanceof Text) return target.parentElement
  return null
}

function findListItemHitFromResolvedPos(resolvedPos: any): TaskListItemHit | null {
  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    const node = resolvedPos.node(depth)
    if (node?.type?.name === 'listItem') {
      return {
        node,
        offset: resolvedPos.before(depth),
      }
    }
  }
  return null
}

function findTaskListItemHit(view: any, listItemElement: HTMLElement, event: globalThis.MouseEvent): TaskListItemHit | null {
  try {
    const domPos = view.posAtDOM(listItemElement, 0)
    const resolved = view.state.doc.resolve(domPos)
    if (resolved.nodeAfter?.type?.name === 'listItem') {
      return { node: resolved.nodeAfter, offset: domPos }
    }
    const fromDom = findListItemHitFromResolvedPos(resolved)
    if (fromDom) return fromDom
  } catch {
    // Fall back to coordinates; pseudo-element clicks can be awkward for DOM mapping.
  }

  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!coords) return null
  return findListItemHitFromResolvedPos(view.state.doc.resolve(coords.pos))
}

function getTaskCheckboxHit(view: any, event: globalThis.MouseEvent): TaskListItemHit | null {
  if (event.button !== 0) return null
  const target = getElementFromEventTarget(event.target)
  if (!target) return null
  const listItemElement = target.closest('li.task-list-item[data-task]')
  if (!(listItemElement instanceof HTMLElement)) return null
  if (!view.dom.contains(listItemElement)) return null
  if (!isTaskCheckboxHit(listItemElement, event)) return null

  const hit = findTaskListItemHit(view, listItemElement, event)
  if (!hit?.node?.attrs?.task) return null
  return hit
}

function uncheckCompletedTaskListItem(view: any, hit: TaskListItemHit) {
  const attrs = hit.node.attrs ?? {}
  view.dispatch(view.state.tr.setNodeMarkup(hit.offset, null, { ...attrs, checked: false }).scrollIntoView())
}

function deleteTaskListItem(view: any, hit: TaskListItemHit) {
  const { state } = view
  const { doc, schema } = state
  const itemStart = hit.offset
  const itemEnd = itemStart + hit.node.nodeSize
  const resolvedItemStart = doc.resolve(itemStart)
  const parentList = resolvedItemStart.parent

  if (parentList?.type?.name !== 'bulletList' && parentList?.type?.name !== 'orderedList') {
    view.dispatch(state.tr.delete(itemStart, itemEnd).scrollIntoView())
    return
  }

  if (parentList.childCount > 1) {
    view.dispatch(state.tr.delete(itemStart, itemEnd).scrollIntoView())
    return
  }

  const listDepth = resolvedItemStart.depth
  const listStart = resolvedItemStart.before(listDepth)
  const listEnd = listStart + parentList.nodeSize
  const onlyDocumentBlock = listDepth === 1 && doc.childCount === 1
  const replacement = onlyDocumentBlock ? schema.nodes.paragraph.create() : null
  const tr = replacement ? state.tr.replaceWith(listStart, listEnd, replacement) : state.tr.delete(listStart, listEnd)
  view.dispatch(tr.scrollIntoView())
}

export function installCompletedTaskCheckboxBehavior(
  root: HTMLElement,
  getEditor: () => Editor | null,
  onQuickDelete: (beforeMarkdown: string) => void,
  onTaskStateCommit?: (editor: Editor) => void,
) {
  type PendingTaskAction = {
    editor: Editor
    view: any
    hit: TaskListItemHit
    beforeMarkdown: string
    startX: number
    startY: number
    held: boolean
    timer: number
  }

  let pending: PendingTaskAction | null = null
  let suppressNextClick = false
  let pendingTaskCommitCancel: (() => void) | null = null

  const scheduleCommit = (editor: Editor) => {
    pendingTaskCommitCancel?.()
    pendingTaskCommitCancel = scheduleTaskCheckboxStateCommit(editor, (committedEditor) => {
      pendingTaskCommitCancel = null
      onTaskStateCommit?.(committedEditor)
    })
  }

  const clearPending = () => {
    if (pending) window.clearTimeout(pending.timer)
    pending = null
    window.removeEventListener('mouseup', handleMouseUp, true)
    window.removeEventListener('mousemove', handleMouseMove, true)
    window.removeEventListener('blur', handleCancel, true)
  }

  const handleCancel = () => {
    clearPending()
  }

  const handleMouseMove = (event: globalThis.MouseEvent) => {
    if (!pending) return
    const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY)
    if (distance > COMPLETED_TASK_POINTER_SLOP_PX && !pending.held) {
      clearPending()
    }
  }

  const handleMouseUp = (event: globalThis.MouseEvent) => {
    if (!pending) return
    event.preventDefault()
    event.stopPropagation()
    suppressNextClick = true

    const action = pending
    clearPending()
    if (action.held) return

    onQuickDelete(action.beforeMarkdown)
    deleteTaskListItem(action.view, action.hit)
    scheduleCommit(action.editor)
  }

  const handleMouseDown = (event: globalThis.MouseEvent) => {
    const editor = getEditor()
    const view = getWysiwygView(editor)
    if (!editor || !view) return

    const hit = getTaskCheckboxHit(view, event)
    if (!hit) return
    if (shouldScheduleUncheckedTaskCheckboxCommit(hit)) {
      scheduleCommit(editor)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    suppressNextClick = true

    clearPending()
    pending = {
      editor,
      view,
      hit,
      beforeMarkdown: normalizeMarkdownForPersistence(editor.getMarkdown()),
      startX: event.clientX,
      startY: event.clientY,
      held: false,
      timer: window.setTimeout(() => {
        if (!pending) return
        pending.held = true
        uncheckCompletedTaskListItem(pending.view, pending.hit)
        scheduleCommit(pending.editor)
      }, COMPLETED_TASK_HOLD_MS),
    }

    window.addEventListener('mouseup', handleMouseUp, true)
    window.addEventListener('mousemove', handleMouseMove, true)
    window.addEventListener('blur', handleCancel, true)
  }

  const handleClick = (event: globalThis.MouseEvent) => {
    if (suppressNextClick) {
      suppressNextClick = false
      event.preventDefault()
      event.stopPropagation()
      return
    }

    const editor = getEditor()
    const view = getWysiwygView(editor)
    if (!editor || !view) return
    if (!getTaskCheckboxHit(view, event)) return
    scheduleCommit(editor)
  }

  root.addEventListener('mousedown', handleMouseDown, true)
  root.addEventListener('click', handleClick, true)

  return () => {
    pendingTaskCommitCancel?.()
    pendingTaskCommitCancel = null
    clearPending()
    root.removeEventListener('mousedown', handleMouseDown, true)
    root.removeEventListener('click', handleClick, true)
  }
}

function getListItemParagraphElement(listItemElement: HTMLElement): HTMLElement | null {
  const paragraph = listItemElement.querySelector('p')
  return paragraph instanceof HTMLElement ? paragraph : null
}

function getParagraphLineRects(paragraph: HTMLElement): TextLineRect[] {
  const range = document.createRange()
  range.selectNodeContents(paragraph)
  const rects = mergeInlineRectsIntoLineRects(Array.from(range.getClientRects()))
  range.detach()
  return rects
}

function getClosestParagraphLineRect(paragraph: HTMLElement, event: globalThis.MouseEvent): TextLineRect | null {
  const rects = getParagraphLineRects(paragraph)
  if (rects.length === 0) return paragraph.getBoundingClientRect()

  const containingLine = rects.find((rect) => event.clientY >= rect.top - 2 && event.clientY <= rect.bottom + 2)
  if (containingLine) return containingLine

  return rects.reduce((closest, rect) => {
    const closestCenter = closest.top + closest.height / 2
    const rectCenter = rect.top + rect.height / 2
    return Math.abs(event.clientY - rectCenter) < Math.abs(event.clientY - closestCenter) ? rect : closest
  }, rects[0])
}

function isListItemTrailingEmptySpaceClick(listItemElement: HTMLElement, event: globalThis.MouseEvent) {
  const paragraph = getListItemParagraphElement(listItemElement)
  if (!paragraph) return false

  const paragraphRect = paragraph.getBoundingClientRect()
  if (
    event.clientY < paragraphRect.top - 2 ||
    event.clientY > paragraphRect.bottom + 2 ||
    event.clientX > paragraphRect.right + 2
  ) {
    return false
  }

  const lineRect = getClosestParagraphLineRect(paragraph, event)
  if (!lineRect) return false
  return event.clientX > lineRect.right + 2 && event.clientX >= lineRect.left
}

function isMouseUpInsideTaskElement(listItemElement: HTMLElement, event: globalThis.MouseEvent) {
  const elementAtPoint = document.elementFromPoint(event.clientX, event.clientY)
  if (elementAtPoint && listItemElement.contains(elementAtPoint)) return true

  const target = getElementFromEventTarget(event.target)
  return Boolean(target && listItemElement.contains(target))
}

function placeTaskCaretAtParagraphEnd(view: any, editor: Editor, listItemElement: HTMLElement) {
  const paragraph = getListItemParagraphElement(listItemElement)
  if (!paragraph || !view.dom.contains(paragraph)) return

  try {
    const rawPos = view.posAtDOM(paragraph, paragraph.childNodes.length)
    const pos = Math.max(0, Math.min(rawPos, view.state.doc.content.size))
    const SelectionCtor = view.state.selection.constructor as {
      create?: (doc: unknown, anchor: number, head?: number) => unknown
    }
    if (typeof SelectionCtor.create !== 'function') return
    const nextSelection = SelectionCtor.create(view.state.doc, pos, pos)
    view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
    editor.focus()
  } catch {
    editor.focus()
  }
}

function getRenderedListKind(listElement: HTMLElement): ReorderListKind | null {
  const tagName = listElement.tagName.toLowerCase()
  if (tagName === 'ol') return 'numbered'
  if (tagName !== 'ul') return null
  if (
    listElement.classList.contains(DASH_LIST_CLASS_NAME) ||
    listElement.getAttribute(DASH_LIST_MARKER_ATTR) === DASH_LIST_MARKER_VALUE
  ) {
    return 'dash'
  }
  return 'bullet'
}

function getInheritedRenderedListKind(listElement: HTMLElement): ReorderListKind | null {
  const ownKind = getRenderedListKind(listElement)
  if (ownKind !== 'bullet') return ownKind

  let currentList: HTMLElement | null = listElement
  while (currentList) {
    const parentItem: Element | null = currentList.parentElement ? currentList.parentElement.closest('li') : null
    const parentList: Element | null = parentItem?.parentElement ?? null
    if (!isRenderedListElement(parentList)) break
    if (getRenderedListKind(parentList) === 'dash') {
      return 'dash'
    }
    currentList = parentList
  }
  return ownKind
}

function getRenderedListItemKind(listItemElement: HTMLElement): ReorderListKind | null {
  if (listItemElement.matches('li.task-list-item[data-task]')) return 'task'
  const listElement = listItemElement.parentElement
  if (!(listElement instanceof HTMLElement)) return null
  return getInheritedRenderedListKind(listElement)
}

function isRenderedListElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false
  const tagName = element.tagName.toLowerCase()
  return tagName === 'ul' || tagName === 'ol'
}

function getTopReorderListElement(listElement: HTMLElement, root: HTMLElement): HTMLElement {
  let topList = listElement
  let current: HTMLElement | null = listElement
  while (current) {
    const parentItem: Element | null = current.parentElement ? current.parentElement.closest('li') : null
    const parentList: Element | null = parentItem?.parentElement ?? null
    if (!isRenderedListElement(parentList) || !root.contains(parentList)) break
    topList = parentList
    current = parentList
  }
  return topList
}

function isInlineFormattedTextTarget(target: Element): boolean {
  return Boolean(target.closest('strong, em, s, del, code'))
}

function getListTextDragElement(
  view: any,
  event: globalThis.MouseEvent,
): { element: HTMLElement; kind: ReorderListKind } | null {
  if (event.button !== 0) return null
  const target = getElementFromEventTarget(event.target)
  if (!target) return null
  if (target.closest('a, button, input, textarea, select, img')) return null
  if (isInlineFormattedTextTarget(target)) return null

  const listItemElement = target.closest('li')
  if (!(listItemElement instanceof HTMLElement)) return null
  if (!view.dom.contains(listItemElement)) return null
  const kind = getRenderedListItemKind(listItemElement)
  if (!kind) return null
  if (kind === 'task' && isTaskCheckboxHit(listItemElement, event)) return null

  const textBlock = target.closest('p')
  if (textBlock instanceof HTMLElement && listItemElement.contains(textBlock)) return { element: listItemElement, kind }
  if (!isListItemTrailingEmptySpaceClick(listItemElement, event)) return null

  return { element: listItemElement, kind }
}

function clearTaskReorderClasses(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>('.task-reorder-source, .task-reorder-target')
    .forEach((element) => {
      element.classList.remove('task-reorder-source', 'task-reorder-target')
    })
}

function getDirectReorderListItems(listElement: HTMLElement, kind: ReorderListKind): HTMLElement[] {
  return Array.from(listElement.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      child.tagName.toLowerCase() === 'li' &&
      getRenderedListItemKind(child) === kind,
  )
}

function isCompatibleReorderListElement(
  listElement: HTMLElement,
  clusterElement: HTMLElement,
  sourceElement: HTMLElement,
  kind: ReorderListKind,
): boolean {
  if (listElement !== clusterElement && !clusterElement.contains(listElement)) return false
  if (sourceElement.contains(listElement)) return false
  return getDirectReorderListItems(listElement, kind).length > 0
}

function getPointerCompatibleListElement(
  clusterElement: HTMLElement,
  sourceElement: HTMLElement,
  kind: ReorderListKind,
  event: globalThis.MouseEvent,
): HTMLElement | null {
  const pointerElement = document.elementFromPoint(event.clientX, event.clientY)
  if (!pointerElement) return null

  const listItem = pointerElement.closest('li')
  const listElement: Element | null = listItem?.parentElement ?? null
  if (
    isRenderedListElement(listElement) &&
    isCompatibleReorderListElement(listElement, clusterElement, sourceElement, kind)
  ) {
    return listElement
  }

  const closestList = pointerElement.closest('ul, ol')
  if (
    isRenderedListElement(closestList) &&
    isCompatibleReorderListElement(closestList, clusterElement, sourceElement, kind)
  ) {
    return closestList
  }

  return null
}

function getNearestCompatibleListElement(
  clusterElement: HTMLElement,
  sourceElement: HTMLElement,
  kind: ReorderListKind,
  event: globalThis.MouseEvent,
): HTMLElement | null {
  const candidateLists = [clusterElement, ...Array.from(clusterElement.querySelectorAll<HTMLElement>('ul, ol'))].filter(
    (candidate) => isCompatibleReorderListElement(candidate, clusterElement, sourceElement, kind),
  )
  if (candidateLists.length === 0) return null

  const getScore = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const verticalDistance =
      event.clientY < rect.top ? rect.top - event.clientY : event.clientY > rect.bottom ? event.clientY - rect.bottom : 0
    const horizontalDistance =
      event.clientX < rect.left ? rect.left - event.clientX : event.clientX > rect.right ? event.clientX - rect.right : 0
    return verticalDistance * 4 + horizontalDistance
  }

  return candidateLists.reduce((best, candidate) => (getScore(candidate) < getScore(best) ? candidate : best), candidateLists[0])
}

function getTaskSlotMarkerY(listItems: HTMLElement[], insertIndex: number): number {
  const firstRect = listItems[0]?.getBoundingClientRect()
  const lastRect = listItems[listItems.length - 1]?.getBoundingClientRect()
  if (!firstRect || !lastRect) return 0

  if (insertIndex <= 0) return firstRect.top - TASK_REORDER_MARKER_GAP_OFFSET_PX
  if (insertIndex >= listItems.length) return lastRect.bottom + TASK_REORDER_MARKER_GAP_OFFSET_PX

  const previousRect = listItems[insertIndex - 1].getBoundingClientRect()
  const nextRect = listItems[insertIndex].getBoundingClientRect()
  const gap = nextRect.top - previousRect.bottom
  if (gap > 2) return previousRect.bottom + gap / 2

  return nextRect.top - TASK_REORDER_MARKER_GAP_OFFSET_PX
}

function getTaskDropTargetFromList(
  sourceIndex: number,
  listElement: HTMLElement,
  kind: ReorderListKind,
  event: globalThis.MouseEvent,
  previousInsertIndex: number | null,
  isSourceList: boolean,
): TaskReorderDropTarget | null {
  const listItems = getDirectReorderListItems(listElement, kind)
  if (listItems.length < (isSourceList ? 2 : 1) || sourceIndex < 0) return null

  const centers = listItems.map((element) => {
    const rect = element.getBoundingClientRect()
    return rect.top + rect.height / 2
  })
  let insertIndex = 0
  while (insertIndex < centers.length && event.clientY >= centers[insertIndex]) {
    insertIndex += 1
  }

  if (previousInsertIndex !== null && Math.abs(insertIndex - previousInsertIndex) === 1) {
    if (insertIndex > previousInsertIndex) {
      const boundary = centers[previousInsertIndex]
      if (boundary !== undefined && event.clientY < boundary + TASK_REORDER_SLOT_HYSTERESIS_PX) {
        insertIndex = previousInsertIndex
      }
    } else {
      const boundary = centers[insertIndex]
      if (boundary !== undefined && event.clientY > boundary - TASK_REORDER_SLOT_HYSTERESIS_PX) {
        insertIndex = previousInsertIndex
      }
    }
  }

  return {
    listElement,
    element: listItems[Math.min(insertIndex, listItems.length - 1)],
    insertIndex,
    markerY: getTaskSlotMarkerY(listItems, insertIndex),
  }
}

function getTaskDragPreviewText(element: HTMLElement, kind: ReorderListKind): string {
  const paragraph = element.querySelector<HTMLElement>('p')
  const text = (paragraph?.innerText ?? element.innerText).replace(/\s+/g, ' ').trim()
  if (!text) return kind === 'numbered' ? 'numbered item' : `${kind} item`
  return text.length > TASK_REORDER_PREVIEW_MAX_CHARS
    ? `${text.slice(0, TASK_REORDER_PREVIEW_MAX_CHARS).trimEnd()}...`
    : text
}

function createTaskReorderGhost(root: HTMLElement, text: string): HTMLElement {
  const ghost = document.createElement('div')
  ghost.className = 'task-reorder-ghost'
  ghost.textContent = text
  root.appendChild(ghost)
  return ghost
}

function createTaskReorderMarker(root: HTMLElement): HTMLElement {
  const marker = document.createElement('div')
  marker.className = 'task-reorder-marker'
  root.appendChild(marker)
  return marker
}

function positionTaskReorderGhost(ghost: HTMLElement, event: globalThis.MouseEvent) {
  ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-${TASK_REORDER_GHOST_CURSOR_X_PERCENT}%, -50%)`
}

function positionTaskReorderMarker(
  marker: HTMLElement,
  targetElement: HTMLElement,
  markerY: number,
) {
  const rect = targetElement.getBoundingClientRect()
  const textRect = targetElement.querySelector<HTMLElement>('p')?.getBoundingClientRect()
  const markerLeft = Math.max(8, rect.left - 28)
  const contentWidth = textRect?.width && textRect.width > 0 ? textRect.width : rect.width
  const markerWidth = Math.min(
    Math.max(contentWidth + TASK_REORDER_MARKER_EXTRA_WIDTH_PX, TASK_REORDER_MARKER_MIN_WIDTH_PX),
    window.innerWidth - markerLeft - 12,
  )

  marker.style.width = `${markerWidth}px`
  marker.style.transform = `translate(${markerLeft}px, ${markerY}px) translateY(-50%)`
  marker.classList.add('is-visible')
}

function hideTaskReorderMarker(marker: HTMLElement | null) {
  if (!marker) return
  marker.classList.remove('is-visible')
}

function getNodeHitAtDomElement(view: any, element: HTMLElement, typeNames: string[]): ProseMirrorNodeHit | null {
  const typeNameSet = new Set(typeNames)
  try {
    const pos = view.posAtDOM(element, 0)
    const resolved = view.state.doc.resolve(pos)
    if (resolved.nodeAfter && typeNameSet.has(resolved.nodeAfter.type?.name)) {
      return { node: resolved.nodeAfter, pos }
    }

    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = resolved.node(depth)
      if (!node || !typeNameSet.has(node.type?.name)) continue
      return { node, pos: resolved.before(depth) }
    }
  } catch {
    return null
  }
  return null
}

function getListItemHitForElement(view: any, element: HTMLElement): ProseMirrorNodeHit | null {
  return getNodeHitAtDomElement(view, element, ['listItem'])
}

function getListHitForElement(view: any, element: HTMLElement): ProseMirrorNodeHit | null {
  return getNodeHitAtDomElement(view, element, ['bulletList', 'orderedList'])
}

function getParentListHitForListItemPosition(doc: any, listItemPos: number): ProseMirrorNodeHit | null {
  try {
    const resolved = doc.resolve(listItemPos)
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = resolved.node(depth)
      if (node?.type?.name === 'bulletList' || node?.type?.name === 'orderedList') {
        return { node, pos: resolved.before(depth) }
      }
    }
  } catch {
    return null
  }
  return null
}

export function captureListItemBranchInEditor(view: any, sourceElement: HTMLElement): CapturedListItemBranch | null {
  if (!view?.state?.doc) return null
  const sourceItem = getListItemHitForElement(view, sourceElement)
  if (!sourceItem?.node || sourceItem.node.type?.name !== 'listItem') return null
  const sourceList = getParentListHitForListItemPosition(view.state.doc, sourceItem.pos)
  if (!sourceList) return null
  return {
    itemNode: sourceItem.node,
    itemPos: sourceItem.pos,
    listNode: sourceList.node,
    listPos: sourceList.pos,
  }
}

function getListInsertPosition(
  view: any,
  targetListElement: HTMLElement,
  targetItems: HTMLElement[],
  insertIndex: number,
): number | null {
  const targetList = getListHitForElement(view, targetListElement)
  if (!targetList) return null

  const nextItem = targetItems[insertIndex]
  if (nextItem) {
    return getListItemHitForElement(view, nextItem)?.pos ?? null
  }

  return targetList.pos + targetList.node.nodeSize - 1
}

function findTextSelectionPositionInsideListItem(doc: any, listItemStart: number): number {
  const listItem = doc.nodeAt(listItemStart)
  if (!listItem) return Math.max(0, Math.min(doc.content.size, listItemStart))

  let selectionPosition = listItemStart + 1
  listItem.descendants?.((node: any, position: number) => {
    if (!node?.isTextblock) return true
    const contentSize = typeof node.content?.size === 'number' ? node.content.size : 0
    selectionPosition = listItemStart + 1 + position + 1 + contentSize
    return false
  })

  return Math.max(0, Math.min(doc.content.size, selectionPosition))
}

type ScrollPositionSnapshot = {
  element: Element
  top: number
  left: number
}

function isScrollableElement(element: Element): boolean {
  if (typeof HTMLElement === 'undefined' || !(element instanceof HTMLElement)) return false
  const style = window.getComputedStyle(element)
  const canScrollY = style.overflowY === 'auto' || style.overflowY === 'scroll'
  const canScrollX = style.overflowX === 'auto' || style.overflowX === 'scroll'
  return (canScrollY && element.scrollHeight > element.clientHeight) ||
    (canScrollX && element.scrollWidth > element.clientWidth)
}

function captureScrollPositions(element: Element | null | undefined): ScrollPositionSnapshot[] {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof Element === 'undefined' ||
    !(element instanceof Element)
  ) {
    return []
  }
  const snapshots: ScrollPositionSnapshot[] = []
  let current: Element | null = element
  while (current) {
    if (isScrollableElement(current)) {
      snapshots.push({
        element: current,
        top: current.scrollTop,
        left: current.scrollLeft,
      })
    }
    current = current.parentElement
  }

  const documentScroller = document.scrollingElement
  if (documentScroller) {
    snapshots.push({
      element: documentScroller,
      top: documentScroller.scrollTop,
      left: documentScroller.scrollLeft,
    })
  }
  return snapshots
}

function restoreScrollPositions(snapshots: ScrollPositionSnapshot[]) {
  if (snapshots.length === 0 || typeof window === 'undefined') return
  const restore = () => {
    snapshots.forEach(({ element, top, left }) => {
      element.scrollTop = top
      element.scrollLeft = left
    })
  }
  restore()
  window.requestAnimationFrame?.(restore)
}

export function moveListItemBranchInEditor(
  view: any,
  sourceElement: HTMLElement,
  _sourceListElement: HTMLElement,
  sourceIndex: number,
  targetListElement: HTMLElement,
  targetItems: HTMLElement[],
  insertIndex: number,
): boolean {
  const sourceBranch = captureListItemBranchInEditor(view, sourceElement)
  if (!sourceBranch) return false
  return moveCapturedListItemBranchInEditor(
    view,
    sourceBranch,
    sourceIndex,
    targetListElement,
    targetItems,
    insertIndex,
  )
}

export function moveCapturedListItemBranchInEditor(
  view: any,
  sourceBranch: CapturedListItemBranch,
  sourceIndex: number,
  targetListElement: HTMLElement,
  targetItems: HTMLElement[],
  insertIndex: number,
): boolean {
  if (!view?.state?.doc || !view.dispatch) return false
  if (sourceIndex < 0 || insertIndex < 0 || insertIndex > targetItems.length) return false

  const sourceItem = view.state.doc.nodeAt(sourceBranch.itemPos)
  const sourceList = view.state.doc.nodeAt(sourceBranch.listPos)
  const targetList = getListHitForElement(view, targetListElement)
  const insertPos = getListInsertPosition(view, targetListElement, targetItems, insertIndex)
  if (!sourceItem || !sourceList || !targetList || insertPos === null) return false
  if (sourceItem.type?.name !== 'listItem') return false
  if (sourceBranch.itemNode && typeof sourceItem.eq === 'function' && !sourceItem.eq(sourceBranch.itemNode)) return false
  if (sourceList.type?.name !== targetList.node.type?.name) return false

  const adjustedTargetIndex =
    sourceBranch.listPos === targetList.pos && sourceIndex < insertIndex ? insertIndex - 1 : insertIndex
  if (sourceBranch.listPos === targetList.pos && adjustedTargetIndex === sourceIndex) return false

  const sourceStart = sourceBranch.itemPos
  const sourceEnd = sourceStart + sourceItem.nodeSize
  if (targetList.pos > sourceStart && targetList.pos < sourceEnd) return false
  if (insertPos > sourceStart && insertPos < sourceEnd) return false

  const deleteWholeSourceList = sourceBranch.listPos !== targetList.pos && sourceList.childCount === 1
  const deleteFrom = deleteWholeSourceList ? sourceBranch.listPos : sourceStart
  const deleteTo = deleteWholeSourceList ? sourceBranch.listPos + sourceList.nodeSize : sourceEnd

  let transaction: any
  let mappedInsertPos: number
  try {
    transaction = view.state.tr.delete(deleteFrom, deleteTo)
    mappedInsertPos = transaction.mapping.map(insertPos)
    transaction = transaction.insert(mappedInsertPos, sourceItem)
  } catch {
    return false
  }
  const selectionPosition = findTextSelectionPositionInsideListItem(transaction.doc, mappedInsertPos)

  try {
    transaction = transaction.setSelection(TextSelection.create(transaction.doc, selectionPosition))
  } catch {
    try {
      transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(selectionPosition), 1))
    } catch {
      // The move itself is still valid; leave ProseMirror's mapped selection in place.
    }
  }

  const scrollSnapshot = captureScrollPositions(view.dom)
  view.dispatch(transaction)
  restoreScrollPositions(scrollSnapshot)
  return true
}

type TaskTextReorderBehaviorOptions = {
  onReorderCommitted?: (editor: Editor) => void
}

export function installTaskTextReorderBehavior(
  root: HTMLElement,
  getEditor: () => Editor | null,
  options: TaskTextReorderBehaviorOptions = {},
) {
  type DragState = {
    editor: Editor
    sourceElement: HTMLElement
    sourceBranch: CapturedListItemBranch
    sourceIndex: number
    listElement: HTMLElement
    clusterElement: HTMLElement
    listKind: ReorderListKind
    insertIndex: number | null
    targetListElement: HTMLElement | null
    ghost: HTMLElement | null
    marker: HTMLElement | null
    previewText: string
    startX: number
    startY: number
    startedOnTrailingSpace: boolean
    dragging: boolean
    suppressingSelection: boolean
  }

  let dragState: DragState | null = null
  let suppressNextClick = false
  let manualCaretPlacementVersion = 0
  const selectionSuppression = createTaskReorderSelectionSuppressionController()

  const updateDropTarget = (event: globalThis.MouseEvent) => {
    if (!dragState?.dragging) return
    clearTaskReorderClasses(root)
    dragState.sourceElement.classList.add('task-reorder-source')

    const targetListElement =
      getPointerCompatibleListElement(dragState.clusterElement, dragState.sourceElement, dragState.listKind, event) ??
      getNearestCompatibleListElement(dragState.clusterElement, dragState.sourceElement, dragState.listKind, event)
    if (!targetListElement) {
      dragState.insertIndex = null
      dragState.targetListElement = null
      hideTaskReorderMarker(dragState.marker)
      return
    }

    const nextTarget = getTaskDropTargetFromList(
      dragState.sourceIndex,
      targetListElement,
      dragState.listKind,
      event,
      dragState.targetListElement === targetListElement ? dragState.insertIndex : null,
      targetListElement === dragState.listElement,
    )
    if (!nextTarget) {
      dragState.insertIndex = null
      dragState.targetListElement = null
      hideTaskReorderMarker(dragState.marker)
      return
    }

    dragState.insertIndex = nextTarget.insertIndex
    dragState.targetListElement = nextTarget.listElement
    nextTarget.element.classList.add('task-reorder-target')
    if (dragState.marker) {
      positionTaskReorderMarker(
        dragState.marker,
        nextTarget.element,
        nextTarget.markerY,
      )
    }
  }

  const endDrag = (options: { releaseSelectionAfterBrowserPass?: boolean } = {}) => {
    const shouldClearSelection = Boolean(dragState?.suppressingSelection || dragState?.dragging)
    if (dragState?.ghost) {
      dragState.ghost.remove()
    }
    if (dragState?.marker) {
      dragState.marker.remove()
    }
    clearTaskReorderClasses(root)
    root.classList.remove('task-reorder-pending')
    root.classList.remove('task-reorder-active')
    if (!shouldClearSelection) {
      selectionSuppression.endWithoutClearing()
    } else if (options.releaseSelectionAfterBrowserPass) {
      selectionSuppression.endAfterBrowserPass()
    } else {
      selectionSuppression.endImmediately()
    }
    window.removeEventListener('mousemove', handleMouseMove, true)
    window.removeEventListener('mouseup', handleMouseUp, true)
    window.removeEventListener('blur', handleCancel, true)
    window.removeEventListener('selectstart', handleSelectStart, true)
    window.removeEventListener('dragstart', handleNativeDragStart, true)
    dragState = null
  }

  const handleCancel = () => {
    endDrag()
  }

  const handleMouseMove = (event: globalThis.MouseEvent) => {
    if (!dragState) return

    const decision = getListReorderPointerDecision(event.clientX - dragState.startX, event.clientY - dragState.startY)
    if (!dragState.suppressingSelection && !dragState.dragging && decision.shouldCancelReorder) {
      endDrag()
      return
    }

    if (decision.shouldSuppressSelection && !dragState.suppressingSelection) {
      dragState.suppressingSelection = true
      root.classList.add('task-reorder-pending')
      selectionSuppression.begin()
    }

    if (dragState.suppressingSelection || dragState.dragging) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      selectionSuppression.clearAfterBrowserPass()
    }

    if (!dragState.dragging && !decision.shouldStartDrag) return

    if (!dragState.dragging) {
      dragState.dragging = true
      suppressNextClick = true
      root.classList.add('task-reorder-active')
      dragState.sourceElement.classList.add('task-reorder-source')
      dragState.ghost = createTaskReorderGhost(root, dragState.previewText)
      dragState.marker = createTaskReorderMarker(root)
      selectionSuppression.clearAfterBrowserPass()
    }

    if (dragState.ghost) positionTaskReorderGhost(dragState.ghost, event)
    updateDropTarget(event)
  }

  const handleMouseUp = (event: globalThis.MouseEvent) => {
    if (!dragState) return
    if (!dragState.dragging) {
      const { editor, sourceElement, startedOnTrailingSpace } = dragState
      const view = getWysiwygView(editor)
      const shouldPlaceCaret = Boolean(
        view && shouldUseManualListCaretPlacement(startedOnTrailingSpace, isMouseUpInsideTaskElement(sourceElement, event)),
      )
      if (!shouldPlaceCaret) {
        suppressNextClick = false
      }
      endDrag()
      if (shouldPlaceCaret) {
        const scheduledVersion = manualCaretPlacementVersion
        window.setTimeout(() => {
          const activeEditor = getEditor()
          if (
            !shouldRunDelayedTaskCaretPlacement({
              scheduledVersion,
              currentVersion: manualCaretPlacementVersion,
              sourceConnected: sourceElement.isConnected,
              activeEditorMatches: activeEditor === editor,
              activeViewMatches: getWysiwygView(activeEditor) === view,
            })
          ) {
            return
          }
          placeTaskCaretAtParagraphEnd(view, editor, sourceElement)
        }, 0)
      }
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    suppressNextClick = true

    updateDropTarget(event)
    const { editor, sourceBranch, sourceIndex, insertIndex, listKind, targetListElement } = dragState
    const targetListItems = targetListElement ? getDirectReorderListItems(targetListElement, listKind) : []
    const view = getWysiwygView(editor)
    endDrag({ releaseSelectionAfterBrowserPass: true })
    if (insertIndex !== null && targetListElement && view) {
      const moved = moveCapturedListItemBranchInEditor(
        view,
        sourceBranch,
        sourceIndex,
        targetListElement,
        targetListItems,
        insertIndex,
      )
      if (moved) {
        editor.focus()
        options.onReorderCommitted?.(editor)
        return
      }
    }
  }

  const handleMouseDown = (event: globalThis.MouseEvent) => {
    manualCaretPlacementVersion += 1
    if (event.detail > 1) return

    const editor = getEditor()
    const view = getWysiwygView(editor)
    if (!editor || !view) return

    const source = getListTextDragElement(view, event)
    if (!source) return
    const listElement = source.element.parentElement
    if (!(listElement instanceof HTMLElement)) return
    const sourceIndex = getDirectReorderListItems(listElement, source.kind).indexOf(source.element)
    if (sourceIndex < 0) return
    const sourceBranch = captureListItemBranchInEditor(view, source.element)
    if (!sourceBranch) return
    const clusterElement = getTopReorderListElement(listElement, root)

    const startedOnTrailingSpace = isListItemTrailingEmptySpaceClick(source.element, event)
    if (startedOnTrailingSpace) {
      event.preventDefault()
      suppressNextClick = true
    }

    dragState = {
      editor,
      sourceElement: source.element,
      sourceBranch,
      sourceIndex,
      listElement,
      clusterElement,
      listKind: source.kind,
      insertIndex: null,
      targetListElement: null,
      ghost: null,
      marker: null,
      previewText: getTaskDragPreviewText(source.element, source.kind),
      startX: event.clientX,
      startY: event.clientY,
      startedOnTrailingSpace,
      dragging: false,
      suppressingSelection: false,
    }

    window.addEventListener('mousemove', handleMouseMove, true)
    window.addEventListener('mouseup', handleMouseUp, true)
    window.addEventListener('blur', handleCancel, true)
    window.addEventListener('selectstart', handleSelectStart, true)
    window.addEventListener('dragstart', handleNativeDragStart, true)
  }

  const handleSelectStart = (event: Event) => {
    if (!shouldSuppressListReorderSelectStart(Boolean(dragState?.suppressingSelection || dragState?.dragging))) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    selectionSuppression.clearAfterBrowserPass()
  }

  const handleNativeDragStart = (event: Event) => {
    if (!dragState?.suppressingSelection && !dragState?.dragging) return
    event.preventDefault()
    event.stopPropagation()
    selectionSuppression.clearAfterBrowserPass()
  }

  const handleClick = (event: globalThis.MouseEvent) => {
    if (!suppressNextClick) return
    suppressNextClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  root.addEventListener('mousedown', handleMouseDown, true)
  root.addEventListener('click', handleClick, true)

  return () => {
    manualCaretPlacementVersion += 1
    endDrag()
    root.removeEventListener('mousedown', handleMouseDown, true)
    root.removeEventListener('click', handleClick, true)
  }
}
