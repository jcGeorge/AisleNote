import { Editor } from '@toast-ui/editor'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { getWysiwygView } from './prosemirror-utils'

const COMPLETED_TASK_HOLD_MS = 500
const COMPLETED_TASK_POINTER_SLOP_PX = 6
export const COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS = 10 * 60 * 1000
export const COMPLETED_TASK_UNDO_HINT_DETECTION_MS = 60 * 1000
export const COMPLETED_TASK_UNDO_HINT_MESSAGE =
  'hold the task button for half a second to turn off its value, quick tap deletes it.'
export const COMPLETED_TASK_UNDO_HINT_TOAST_DURATION_MS = 5000
const TASK_REORDER_DRAG_SLOP_PX = 8
const TASK_REORDER_SELECTION_SLOP_PX = 2
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

function getTaskParagraphElement(listItemElement: HTMLElement): HTMLElement | null {
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

function isTaskTrailingEmptySpaceClick(listItemElement: HTMLElement, event: globalThis.MouseEvent) {
  const paragraph = getTaskParagraphElement(listItemElement)
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
  const paragraph = getTaskParagraphElement(listItemElement)
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

function placeTaskCaretAtPointerPosition(
  view: any,
  editor: Editor,
  listItemElement: HTMLElement,
  clientX: number,
  clientY: number,
) {
  if (!view.dom.contains(listItemElement)) return

  try {
    const coords = view.posAtCoords({ left: clientX, top: clientY })
    if (!coords) {
      editor.focus()
      return
    }

    const pos = Math.max(0, Math.min(coords.pos, view.state.doc.content.size))
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

function getTaskListTextDragElement(view: any, event: globalThis.MouseEvent): HTMLElement | null {
  if (event.button !== 0) return null
  const target = getElementFromEventTarget(event.target)
  if (!target) return null
  if (target.closest('a, button, input, textarea, select, img')) return null

  const listItemElement = target.closest('li.task-list-item[data-task]')
  if (!(listItemElement instanceof HTMLElement)) return null
  if (!view.dom.contains(listItemElement)) return null
  if (isTaskCheckboxHit(listItemElement, event)) return null

  const textBlock = target.closest('p')
  if (textBlock instanceof HTMLElement && listItemElement.contains(textBlock)) return listItemElement
  if (!isTaskTrailingEmptySpaceClick(listItemElement, event)) return null

  return listItemElement
}

function normalizeTaskReorderText(text: string): string {
  return text
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getTaskMarkdownLineText(line: string): string | null {
  const match = line.match(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+(.*)$/)
  return match ? normalizeTaskReorderText(match[1]) : null
}

function reorderTaskMarkdownLines(
  markdown: string,
  taskElements: HTMLElement[],
  sourceIndex: number,
  insertIndex: number,
): string | null {
  if (sourceIndex < 0 || sourceIndex >= taskElements.length || insertIndex < 0 || insertIndex > taskElements.length) return null

  const adjustedInsertIndex = sourceIndex < insertIndex ? insertIndex - 1 : insertIndex
  if (adjustedInsertIndex === sourceIndex) return null

  const domTaskTexts = taskElements.map((element) =>
    normalizeTaskReorderText(element.querySelector<HTMLElement>('p')?.innerText ?? element.innerText),
  )
  const lines = markdown.split('\n')
  const taskLineInfos = lines
    .map((line, index) => ({
      index,
      text: getTaskMarkdownLineText(line),
    }))
    .filter((info): info is { index: number; text: string } => info.text !== null)

  for (let start = 0; start <= taskLineInfos.length - domTaskTexts.length; start += 1) {
    const candidate = taskLineInfos.slice(start, start + domTaskTexts.length)
    const matches = candidate.every((info, index) => info.text === domTaskTexts[index])
    if (!matches) continue

    const reorderedLines = candidate.map((info) => lines[info.index])
    const [movedLine] = reorderedLines.splice(sourceIndex, 1)
    if (movedLine === undefined) return null
    reorderedLines.splice(adjustedInsertIndex, 0, movedLine)

    const nextLines = [...lines]
    candidate.forEach((info, index) => {
      nextLines[info.index] = reorderedLines[index]
    })
    return nextLines.join('\n')
  }

  return null
}

function clearTaskReorderClasses(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>('.task-reorder-source, .task-reorder-target')
    .forEach((element) => {
      element.classList.remove('task-reorder-source', 'task-reorder-target')
    })
}

function getDirectTaskListItems(listElement: HTMLElement): HTMLElement[] {
  return Array.from(listElement.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.matches('li.task-list-item[data-task]'),
  )
}

function getTaskSlotMarkerY(taskElements: HTMLElement[], insertIndex: number): number {
  const firstRect = taskElements[0]?.getBoundingClientRect()
  const lastRect = taskElements[taskElements.length - 1]?.getBoundingClientRect()
  if (!firstRect || !lastRect) return 0

  if (insertIndex <= 0) return firstRect.top - TASK_REORDER_MARKER_GAP_OFFSET_PX
  if (insertIndex >= taskElements.length) return lastRect.bottom + TASK_REORDER_MARKER_GAP_OFFSET_PX

  const previousRect = taskElements[insertIndex - 1].getBoundingClientRect()
  const nextRect = taskElements[insertIndex].getBoundingClientRect()
  const gap = nextRect.top - previousRect.bottom
  if (gap > 2) return previousRect.bottom + gap / 2

  return nextRect.top - TASK_REORDER_MARKER_GAP_OFFSET_PX
}

function getTaskDropTargetFromList(
  sourceIndex: number,
  listElement: HTMLElement,
  event: globalThis.MouseEvent,
  previousInsertIndex: number | null,
): TaskReorderDropTarget | null {
  const taskElements = getDirectTaskListItems(listElement)
  if (taskElements.length < 2 || sourceIndex < 0) return null

  const centers = taskElements.map((element) => {
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
    element: taskElements[Math.min(insertIndex, taskElements.length - 1)],
    insertIndex,
    markerY: getTaskSlotMarkerY(taskElements, insertIndex),
  }
}

function getTaskDragPreviewText(element: HTMLElement): string {
  const paragraph = element.querySelector<HTMLElement>('p')
  const text = (paragraph?.innerText ?? element.innerText).replace(/\s+/g, ' ').trim()
  if (!text) return 'task'
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
    insertIndex: number | null
    ghost: HTMLElement | null
    marker: HTMLElement | null
    previewText: string
    startX: number
    startY: number
    startedOnTrailingTaskSpace: boolean
    suppressingSelection: boolean
    dragging: boolean
  }

  let dragState: DragState | null = null
  let suppressNextClick = false

  const updateDropTarget = (event: globalThis.MouseEvent) => {
    if (!dragState?.dragging) return
    clearTaskReorderClasses(root)
    dragState.sourceElement.classList.add('task-reorder-source')

    const nextTarget = getTaskDropTargetFromList(dragState.sourceIndex, dragState.listElement, event, dragState.insertIndex)
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
    root.classList.remove('task-reorder-pending')
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
    if (distance >= TASK_REORDER_SELECTION_SLOP_PX) {
      dragState.suppressingSelection = true
      event.preventDefault()
      event.stopPropagation()
      window.getSelection()?.removeAllRanges()
    }
    if (!dragState.dragging && distance < TASK_REORDER_DRAG_SLOP_PX) return

    event.preventDefault()
    event.stopPropagation()
    window.getSelection()?.removeAllRanges()

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
      const { editor, sourceElement, startedOnTrailingTaskSpace } = dragState
      const view = getWysiwygView(editor)
      const shouldPlaceCaret = Boolean(view && isMouseUpInsideTaskElement(sourceElement, event))
      const clientX = event.clientX
      const clientY = event.clientY
      endDrag()
      if (shouldPlaceCaret) {
        window.setTimeout(() => {
          if (startedOnTrailingTaskSpace) {
            placeTaskCaretAtParagraphEnd(view, editor, sourceElement)
            return
          }
          placeTaskCaretAtPointerPosition(view, editor, sourceElement, clientX, clientY)
        }, 0)
      }
      return
    }

    event.preventDefault()
    event.stopPropagation()
    suppressNextClick = true

    const { editor, sourceIndex, insertIndex, listElement } = dragState
    endDrag()
    if (insertIndex !== null) {
      const taskElements = getDirectTaskListItems(listElement)
      const nextMarkdown = reorderTaskMarkdownLines(
        normalizeMarkdownForPersistence(editor.getMarkdown()),
        taskElements,
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

    const sourceElement = getTaskListTextDragElement(view, event)
    if (!sourceElement) return
    const listElement = sourceElement.parentElement
    if (!(listElement instanceof HTMLElement)) return
    const sourceIndex = getDirectTaskListItems(listElement).indexOf(sourceElement)
    if (sourceIndex < 0) return

    event.preventDefault()

    dragState = {
      editor,
      sourceElement,
      sourceIndex,
      listElement,
      insertIndex: null,
      ghost: null,
      marker: null,
      previewText: getTaskDragPreviewText(sourceElement),
      startX: event.clientX,
      startY: event.clientY,
      startedOnTrailingTaskSpace: isTaskTrailingEmptySpaceClick(sourceElement, event),
      suppressingSelection: true,
      dragging: false,
    }
    root.classList.add('task-reorder-pending')

    window.addEventListener('mousemove', handleMouseMove, true)
    window.addEventListener('mouseup', handleMouseUp, true)
    window.addEventListener('blur', handleCancel, true)
    window.addEventListener('selectstart', handleSelectStart, true)
    window.addEventListener('dragstart', handleNativeDragStart, true)
  }

  const handleSelectStart = (event: Event) => {
    if (!dragState) return
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
