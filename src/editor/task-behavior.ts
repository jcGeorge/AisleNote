import type { Editor } from '@toast-ui/editor'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { DASH_LIST_CLASS_NAME, DASH_LIST_MARKER_ATTR, DASH_LIST_MARKER_VALUE } from './list-markers'
import {
  normalizeListReorderText,
  reorderListMarkdownLines,
  type ReorderListKind,
} from './list-reorder-markdown'
import { getWysiwygView } from './prosemirror-utils'

const COMPLETED_TASK_HOLD_MS = 500
const COMPLETED_TASK_POINTER_SLOP_PX = 6
export const COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS = 10 * 60 * 1000
export const COMPLETED_TASK_UNDO_HINT_DETECTION_MS = 60 * 1000
export const COMPLETED_TASK_UNDO_HINT_MESSAGE =
  'hold the task button for half a second to turn off its value, quick tap deletes it.'
export const COMPLETED_TASK_UNDO_HINT_TOAST_DURATION_MS = 5000
const TASK_REORDER_DRAG_SLOP_PX = 8
const TASK_REORDER_PREVIEW_MAX_CHARS = 30
const TASK_REORDER_MARKER_GAP_OFFSET_PX = 4
const TASK_REORDER_SLOT_HYSTERESIS_PX = 6
const TASK_REORDER_MARKER_MIN_WIDTH_PX = 72
const TASK_REORDER_MARKER_EXTRA_WIDTH_PX = 34
const TASK_REORDER_GHOST_CURSOR_X_PERCENT = 25

type TaskListItemHit = {
  node: any
  offset: number
}

type TaskReorderDropTarget = {
  element: HTMLElement
  insertIndex: number
  markerY: number
}

export function getListReorderPointerDecision(distancePx: number): {
  shouldSuppressSelection: boolean
  shouldStartDrag: boolean
} {
  const shouldStartDrag = Number.isFinite(distancePx) && distancePx >= TASK_REORDER_DRAG_SLOP_PX
  return {
    shouldSuppressSelection: shouldStartDrag,
    shouldStartDrag,
  }
}

export function shouldUseManualListCaretPlacement(startedOnTrailingSpace: boolean, pointerUpInsideItem: boolean): boolean {
  return startedOnTrailingSpace && pointerUpInsideItem
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

function getCompletedTaskCheckboxHit(view: any, event: globalThis.MouseEvent): TaskListItemHit | null {
  if (event.button !== 0) return null
  const target = getElementFromEventTarget(event.target)
  if (!target) return null
  const listItemElement = target.closest('li.task-list-item[data-task]')
  if (!(listItemElement instanceof HTMLElement)) return null
  if (!view.dom.contains(listItemElement)) return null
  if (!listItemElement.classList.contains('checked') && !listItemElement.hasAttribute('data-task-checked')) return null
  if (!isTaskCheckboxHit(listItemElement, event)) return null

  const hit = findTaskListItemHit(view, listItemElement, event)
  if (!hit?.node?.attrs?.task || !hit.node.attrs.checked) return null
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
) {
  type PendingTaskAction = {
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
  }

  const handleMouseDown = (event: globalThis.MouseEvent) => {
    const editor = getEditor()
    const view = getWysiwygView(editor)
    if (!editor || !view) return

    const hit = getCompletedTaskCheckboxHit(view, event)
    if (!hit) return

    event.preventDefault()
    event.stopPropagation()
    suppressNextClick = true

    clearPending()
    pending = {
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
      }, COMPLETED_TASK_HOLD_MS),
    }

    window.addEventListener('mouseup', handleMouseUp, true)
    window.addEventListener('mousemove', handleMouseMove, true)
    window.addEventListener('blur', handleCancel, true)
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
    clearPending()
    root.removeEventListener('mousedown', handleMouseDown, true)
    root.removeEventListener('click', handleClick, true)
  }
}

function getListItemParagraphElement(listItemElement: HTMLElement): HTMLElement | null {
  const paragraph = listItemElement.querySelector('p')
  return paragraph instanceof HTMLElement ? paragraph : null
}

function getParagraphLineRects(paragraph: HTMLElement): DOMRect[] {
  const range = document.createRange()
  range.selectNodeContents(paragraph)
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
  range.detach()
  return rects
}

function getClosestParagraphLineRect(paragraph: HTMLElement, event: globalThis.MouseEvent): DOMRect | null {
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

function getRenderedListItemKind(listItemElement: HTMLElement): ReorderListKind | null {
  if (listItemElement.matches('li.task-list-item[data-task]')) return 'task'
  const listElement = listItemElement.parentElement
  if (!(listElement instanceof HTMLElement)) return null
  return getRenderedListKind(listElement)
}

function getListTextDragElement(
  view: any,
  event: globalThis.MouseEvent,
): { element: HTMLElement; kind: ReorderListKind } | null {
  if (event.button !== 0) return null
  const target = getElementFromEventTarget(event.target)
  if (!target) return null
  if (target.closest('a, button, input, textarea, select, img')) return null

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

function getListItemReorderText(element: HTMLElement): string {
  return normalizeListReorderText(element.querySelector<HTMLElement>('p')?.innerText ?? element.innerText)
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
): TaskReorderDropTarget | null {
  const listItems = getDirectReorderListItems(listElement, kind)
  if (listItems.length < 2 || sourceIndex < 0) return null

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

export function installTaskTextReorderBehavior(root: HTMLElement, getEditor: () => Editor | null) {
  type DragState = {
    editor: Editor
    sourceElement: HTMLElement
    sourceIndex: number
    listElement: HTMLElement
    listKind: ReorderListKind
    insertIndex: number | null
    ghost: HTMLElement | null
    marker: HTMLElement | null
    previewText: string
    startX: number
    startY: number
    startedOnTrailingSpace: boolean
    dragging: boolean
  }

  let dragState: DragState | null = null
  let suppressNextClick = false

  const updateDropTarget = (event: globalThis.MouseEvent) => {
    if (!dragState?.dragging) return
    clearTaskReorderClasses(root)
    dragState.sourceElement.classList.add('task-reorder-source')

    const nextTarget = getTaskDropTargetFromList(
      dragState.sourceIndex,
      dragState.listElement,
      dragState.listKind,
      event,
      dragState.insertIndex,
    )
    if (!nextTarget) {
      dragState.insertIndex = null
      hideTaskReorderMarker(dragState.marker)
      return
    }

    dragState.insertIndex = nextTarget.insertIndex
    nextTarget.element.classList.add('task-reorder-target')
    if (dragState.marker) {
      positionTaskReorderMarker(
        dragState.marker,
        nextTarget.element,
        nextTarget.markerY,
      )
    }
  }

  const endDrag = () => {
    if (dragState?.ghost) {
      dragState.ghost.remove()
    }
    if (dragState?.marker) {
      dragState.marker.remove()
    }
    clearTaskReorderClasses(root)
    root.classList.remove('task-reorder-active')
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

    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY)
    const decision = getListReorderPointerDecision(distance)
    if (!dragState.dragging && !decision.shouldStartDrag) return

    if (decision.shouldSuppressSelection || dragState.dragging) {
      event.preventDefault()
      event.stopPropagation()
      window.getSelection()?.removeAllRanges()
    }

    if (!dragState.dragging) {
      dragState.dragging = true
      suppressNextClick = true
      root.classList.add('task-reorder-active')
      dragState.sourceElement.classList.add('task-reorder-source')
      dragState.ghost = createTaskReorderGhost(root, dragState.previewText)
      dragState.marker = createTaskReorderMarker(root)
      window.getSelection()?.removeAllRanges()
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
        window.setTimeout(() => {
          placeTaskCaretAtParagraphEnd(view, editor, sourceElement)
        }, 0)
      }
      return
    }

    event.preventDefault()
    event.stopPropagation()
    suppressNextClick = true

    const { editor, sourceIndex, insertIndex, listElement, listKind } = dragState
    const listItems = getDirectReorderListItems(listElement, listKind)
    endDrag()
    if (insertIndex !== null) {
      const nextMarkdown = reorderListMarkdownLines(
        normalizeMarkdownForPersistence(editor.getMarkdown()),
        listItems.map(getListItemReorderText),
        listKind,
        sourceIndex,
        insertIndex,
      )
      if (nextMarkdown !== null) {
        editor.setMarkdown(nextMarkdown, false)
        editor.focus()
      }
    }
  }

  const handleMouseDown = (event: globalThis.MouseEvent) => {
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

    const startedOnTrailingSpace = isListItemTrailingEmptySpaceClick(source.element, event)
    if (startedOnTrailingSpace) {
      event.preventDefault()
      suppressNextClick = true
    }

    dragState = {
      editor,
      sourceElement: source.element,
      sourceIndex,
      listElement,
      listKind: source.kind,
      insertIndex: null,
      ghost: null,
      marker: null,
      previewText: getTaskDragPreviewText(source.element, source.kind),
      startX: event.clientX,
      startY: event.clientY,
      startedOnTrailingSpace,
      dragging: false,
    }

    window.addEventListener('mousemove', handleMouseMove, true)
    window.addEventListener('mouseup', handleMouseUp, true)
    window.addEventListener('blur', handleCancel, true)
    window.addEventListener('selectstart', handleSelectStart, true)
    window.addEventListener('dragstart', handleNativeDragStart, true)
  }

  const handleSelectStart = (event: Event) => {
    if (!dragState?.dragging) return
    event.preventDefault()
    event.stopPropagation()
    window.getSelection()?.removeAllRanges()
  }

  const handleNativeDragStart = (event: Event) => {
    if (!dragState) return
    event.preventDefault()
    event.stopPropagation()
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
    endDrag()
    root.removeEventListener('mousedown', handleMouseDown, true)
    root.removeEventListener('click', handleClick, true)
  }
}
