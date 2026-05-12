import { type MouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Editor } from '@toast-ui/editor'
import JSZip from 'jszip'
import '@toast-ui/editor/dist/toastui-editor.css'
import './App.css'
import {
  ARRANGE_DRAG_START_SLOP_PX,
  ARRANGE_PRESS_DELAY_MS,
  ARRANGE_TAP_SLOP_PX,
  DEFAULT_ARRANGE_MODE,
  getArrangeRailInsertionTarget,
  isPointInsideElement,
  moveItemByInsertion,
} from './arrange/arrange-utils'
import { DomainsPage } from './components/domains/DomainsPage'
import { SpacesPage } from './components/spaces/SpacesPage'
import {
  EDITOR_TOOLBAR_ITEMS,
  getMultilineSelectionShortcutDirection,
  headingSpaceShortcutPlugin,
  installClearToolbarButton,
  installHeadingPopupActiveState,
  multiLineSelectionShortcutPlugin,
  thematicBreakShortcutPlugin,
} from './editor/editor-setup'
import {
  buildSplitLineMultiLineState,
  cloneMultiLineEditState,
  findNextWordColumn,
  findPreviousWordColumn,
  getMultiLineColumnOffset,
  getMultiLineHeadColumnOffset,
  getMultiLineSelectionRange,
  getMultiLineSelectionRanges,
  getMultiLineSelectedBlockIndices,
  getMultiLineSplitPlan,
  moveMultiLineCursorState,
  type MultiLineCursorMovement,
  type MultiLineEditInput,
} from './editor/multiline-edit'
import {
  findEditorTextLineRangeIndex,
  getEditorTextLineRanges,
  isCodeBlockTextLineRange,
} from './editor/multiline-ranges'
import {
  buildShortcutFromKeyboardEvent,
  DEFAULT_SHORTCUTS,
  eventMatchesShortcut,
  formatShortcutLabel,
} from './hotkeys/shortcuts'
import {
  convertInternalTabsForExport,
  getIndentPrefixLength,
  getTrailingIndentPrefixLength,
  INDENT_TOKEN,
  materializeHorizontalRuleShortcut,
  mergeLeadingIndentsFromWysiwyg,
  normalizeHeadingMarkers,
  normalizeMarkdownForPersistence,
} from './markdown/markdown-utils'
import {
  clampAutoRemoveDays,
  clampNoteFontScale,
  clampTabButtonScale,
  DEFAULT_AUTO_REMOVE_DAYS,
  DEFAULT_UI_SETTINGS,
  MAX_AUTO_REMOVE_DAYS,
  MAX_NOTE_FONT_SCALE,
  MAX_TAB_BUTTON_SCALE,
  MIN_AUTO_REMOVE_DAYS,
  MIN_NOTE_FONT_SCALE,
  MIN_TAB_BUTTON_SCALE,
  NOTE_FONT_SCALE_STEP,
  TAB_BUTTON_SCALE_STEP,
} from './settings/defaults'
import { applyAutoPurgeToAppState, applyMarkdownToAppState, parseSavedState } from './state/app-state'
import {
  addDomain,
  addSpaceToActiveDomain,
  createDomain,
  insertSpaceAfterInActiveDomain,
  moveSpaceWithinActiveDomain,
  removeSpaceFromActiveDomain,
  renameDomain,
  renameSpaceInActiveDomain,
  setActiveDomain,
  setActiveSpaceInActiveDomain,
  updateActiveSpaceDataInActiveDomain,
  updateSpaceInActiveDomain,
} from './state/domains'
import {
  applyAutoPurgeToWorkspace,
  createId,
  createSpace,
  createSubTab,
  createTab,
  createWorkspaceDataFromTabs,
  duplicateSpace,
} from './state/workspace'
import {
  buildStageManagerSelectionSnapshot,
  createDefaultStageManagerDraft,
  createEmptyStageManagerParentSelection,
  createStageManagerSelectionState,
  normalizeStageManagerParentSelection,
  orderStageManagerSubTabIds,
} from './stage-manager/selection'
import {
  appendSubTabsToParent,
  buildStageManagerMovedSubTabs,
  cloneTabForTransfer,
  cloneSubTabForTransfer,
  createPromotedParentTab,
  stripStageManagerSelectionsFromWorkspace,
} from './stage-manager/transforms'
import { appStateStore } from './storage/app-state-store'
import type {
  AppState,
  AppTheme,
  ArrangeDragItem,
  ArrangeDragSeed,
  ArrangeInsertPosition,
  ArrangeModeState,
  ArrangeScope,
  ArrangeSource,
  ArrangeTapCandidate,
  ArrangeTapCandidateSeed,
  ContextMenuState,
  DeleteTarget,
  DeletedSubTabEntry,
  ImageToolsState,
  InlineCropState,
  LinkPromptState,
  ModalState,
  MultiLineEditState,
  NavLocation,
  PendingContent,
  PendingCreatedEdit,
  SettingsSection,
  ShortcutId,
  Space,
  SpaceArrangeDragPreview,
  SpaceSettings,
  StageManagerAction,
  StageManagerDraft,
  StageManagerParentSelection,
  StageManagerSelectionSnapshot,
  StageManagerSelectionState,
  StageManagerStep,
  StageManagerStrayHandlingMode,
  Tab,
  TabArrangeDragItem,
  TabArrangeDragPreview,
  ToastState,
  ToastTone,
  TrashParentBucket,
  ViewMode,
  WorkspaceData,
} from './types/app'

const TRASH_HOME_ID = '__trash_home__'
const THEME_OPTIONS: Array<{ id: AppTheme; label: string }> = [
  { id: 'dark', label: 'dark' },
  { id: 'light', label: 'light' },
  { id: 'dusk', label: 'dusk' },
]
const COMPLETED_TASK_HOLD_MS = 500
const COMPLETED_TASK_POINTER_SLOP_PX = 6
const COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS = 10 * 60 * 1000
const COMPLETED_TASK_UNDO_HINT_DETECTION_MS = 60 * 1000
const COMPLETED_TASK_UNDO_HINT_MESSAGE =
  'hold the task button for half a second to turn off its value, quick tap deletes it.'
const DEFAULT_TOAST_DURATION_MS = 3000
const HOVERED_TOAST_DURATION_MS = 2000
const COMPLETED_TASK_UNDO_HINT_TOAST_DURATION_MS = 5000
const TASK_REORDER_DRAG_SLOP_PX = 8
const TASK_REORDER_PREVIEW_MAX_CHARS = 30
const TASK_REORDER_MARKER_GAP_OFFSET_PX = 4
const TASK_REORDER_SLOT_HYSTERESIS_PX = 6
const TASK_REORDER_MARKER_MIN_WIDTH_PX = 72
const TASK_REORDER_MARKER_EXTRA_WIDTH_PX = 34
const TASK_REORDER_GHOST_CURSOR_X_PERCENT = 25

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type MultiLineEditHistoryEntry = {
  noteKey: string
  beforeMarkdown: string
  afterMarkdown: string
  beforeState: MultiLineEditState
  afterState: MultiLineEditState
}

type TaskListItemHit = {
  node: any
  offset: number
}

function getWysiwygView(editor: Editor | null): any | null {
  return (editor as any)?.wwEditor?.view ?? null
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

function installCompletedTaskCheckboxBehavior(
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

type TaskReorderDropTarget = {
  element: HTMLElement
  insertIndex: number
  markerY: number
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
  if (!(textBlock instanceof HTMLElement) || !listItemElement.contains(textBlock)) return null

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

function placeTaskCaretAtPoint(view: any, clientX: number, clientY: number) {
  const coords = view.posAtCoords({ left: clientX, top: clientY })
  if (!coords) {
    view.focus()
    return
  }

  const SelectionCtor = view.state.selection.constructor as {
    create?: (doc: unknown, anchor: number, head?: number) => unknown
    near?: (resolvedPos: unknown, bias?: number) => unknown
  }

  let nextSelection: unknown | null = null
  if (typeof SelectionCtor.create === 'function') {
    try {
      nextSelection = SelectionCtor.create(view.state.doc, coords.pos, coords.pos)
    } catch {
      nextSelection = null
    }
  }
  if (!nextSelection && typeof SelectionCtor.near === 'function') {
    try {
      nextSelection = SelectionCtor.near(view.state.doc.resolve(coords.pos), 1)
    } catch {
      nextSelection = null
    }
  }

  if (nextSelection) {
    view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
  }
  view.focus()
}

function installTaskTextReorderBehavior(root: HTMLElement, getEditor: () => Editor | null) {
  type DragState = {
    editor: Editor
    view: any
    sourceElement: HTMLElement
    sourceIndex: number
    listElement: HTMLElement
    insertIndex: number | null
    ghost: HTMLElement | null
    marker: HTMLElement | null
    previewText: string
    startX: number
    startY: number
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
    event.preventDefault()
    event.stopPropagation()
    window.getSelection()?.removeAllRanges()

    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY)
    if (!dragState.dragging && distance < TASK_REORDER_DRAG_SLOP_PX) return

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
      event.preventDefault()
      event.stopPropagation()
      suppressNextClick = true
      const { view, startX, startY } = dragState
      endDrag()
      placeTaskCaretAtPoint(view, startX, startY)
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
    const editor = getEditor()
    const view = getWysiwygView(editor)
    if (!editor || !view) return

    const sourceElement = getTaskListTextDragElement(view, event)
    if (!sourceElement) return
    const listElement = sourceElement.parentElement
    if (!(listElement instanceof HTMLElement)) return
    const sourceIndex = getDirectTaskListItems(listElement).indexOf(sourceElement)
    if (sourceIndex < 0) return

    dragState = {
      editor,
      view,
      sourceElement,
      sourceIndex,
      listElement,
      insertIndex: null,
      ghost: null,
      marker: null,
      previewText: getTaskDragPreviewText(sourceElement),
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    }
    root.classList.add('task-reorder-pending')
    event.preventDefault()
    event.stopPropagation()
    window.getSelection()?.removeAllRanges()

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

let renameInputMeasureContext: CanvasRenderingContext2D | null = null

function App() {
  const initialSerializedState = useMemo(() => appStateStore.load(), [])
  const [state, setState] = useState<AppState>(() => applyAutoPurgeToAppState(parseSavedState(initialSerializedState)))
  const [storageHydrated, setStorageHydrated] = useState(() => typeof appStateStore.hydrate !== 'function')
  const [viewMode, setViewMode] = useState<ViewMode>('main')
  const [editing, setEditing] = useState<{ type: EditableEntityType; id: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('hotkeys')
  const [settingsDaysDraft, setSettingsDaysDraft] = useState<string>(String(DEFAULT_AUTO_REMOVE_DAYS))
  const isMacPlatform = typeof navigator !== 'undefined' ? /mac/i.test(navigator.platform) : false
  const [shortcutDrafts, setShortcutDrafts] = useState<Record<ShortcutId, string>>(DEFAULT_SHORTCUTS)
  const [editingShortcut, setEditingShortcut] = useState<ShortcutId | null>(null)
  const [mouseBackForwardEnabledDraft, setMouseBackForwardEnabledDraft] = useState(true)
  const [genericHistoryHotkeysEnabledDraft, setGenericHistoryHotkeysEnabledDraft] = useState(true)
  const [showParentHomeTabDraft, setShowParentHomeTabDraft] = useState(DEFAULT_UI_SETTINGS.showParentHomeTab)
  const [tabButtonScaleDraft, setTabButtonScaleDraft] = useState(DEFAULT_UI_SETTINGS.tabButtonScale)
  const [noteFontScaleDraft, setNoteFontScaleDraft] = useState(DEFAULT_UI_SETTINGS.noteFontScale)
  const [menuOpen, setMenuOpen] = useState(false)
  const [trashTabId, setTrashTabId] = useState<string>(TRASH_HOME_ID)
  const [trashSubTabId, setTrashSubTabId] = useState<string | null>(null)
  const [arrangeMode, setArrangeMode] = useState<ArrangeModeState>(DEFAULT_ARRANGE_MODE)
  const [stageManagerStep, setStageManagerStep] = useState<StageManagerStep>('select')
  const [stageManagerAction, setStageManagerAction] = useState<StageManagerAction | null>(null)
  const [stageManagerSelections, setStageManagerSelections] = useState<StageManagerSelectionState>({})
  const [stageManagerDraft, setStageManagerDraft] = useState<StageManagerDraft>(createDefaultStageManagerDraft)
  const [arrangeDraggingItem, setArrangeDraggingItem] = useState<ArrangeDragItem | null>(null)
  const [spaceArrangeDragPreview, setSpaceArrangeDragPreview] = useState<SpaceArrangeDragPreview | null>(null)
  const [tabArrangeDragPreview, setTabArrangeDragPreview] = useState<TabArrangeDragPreview | null>(null)
  const [exportStatus, setExportStatus] = useState<string>('')
  const [toast, setToast] = useState<ToastState | null>(null)
  const [toastHovered, setToastHovered] = useState(false)
  const [toastWasHovered, setToastWasHovered] = useState(false)
  const [imageTools, setImageTools] = useState<ImageToolsState>({
    visible: false,
    cropTop: 0,
    cropLeft: 0,
    resizeTop: 0,
    resizeLeft: 0,
  })
  const [inlineCrop, setInlineCrop] = useState<InlineCropState>({
    active: false,
    relX: 0,
    relY: 0,
    relWidth: 1,
    relHeight: 1,
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  })
  const [linkPrompt, setLinkPrompt] = useState<LinkPromptState>({
    open: false,
    top: 0,
    left: 0,
    url: '',
    text: '',
  })
  const linkPromptInputRef = useRef<HTMLInputElement | null>(null)

  const editorMountRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const primaryTabRailRef = useRef<HTMLDivElement | null>(null)
  const subTabRailRef = useRef<HTMLDivElement | null>(null)
  const spacesGridRef = useRef<HTMLDivElement | null>(null)
  const activeImageRef = useRef<HTMLImageElement | null>(null)
  const imageResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const inlineCropDragRef = useRef<{
    mode: 'move' | 'resize' | null
    startX: number
    startY: number
    startRelX: number
    startRelY: number
    startRelWidth: number
    startRelHeight: number
  }>({ mode: null, startX: 0, startY: 0, startRelX: 0, startRelY: 0, startRelWidth: 1, startRelHeight: 1 })

  const pendingContentRef = useRef<PendingContent | null>(null)
  const pendingCreatedEditRef = useRef<PendingCreatedEdit | null>(null)
  const skipRenameBlurRef = useRef<{ type: EditableEntityType; id: string } | null>(null)
  const arrangePressTimerRef = useRef<number | null>(null)
  const arrangeTapCandidateRef = useRef<ArrangeTapCandidate | null>(null)
  const arrangeDragSeedRef = useRef<ArrangeDragSeed | null>(null)
  const spaceArrangeDragRef = useRef<SpaceArrangeDragPreview | null>(null)
  const tabArrangeDragRef = useRef<TabArrangeDragPreview | null>(null)
  const suppressArrangeClickRef = useRef<Set<string>>(new Set())
  const suppressNextSpaceArrangeExitRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const normalizingContentRef = useRef(false)
  const completedTaskDeleteUndoCandidateRef = useRef<{ beforeMarkdown: string; deletedAt: number } | null>(null)
  const completedTaskUndoToastAtRef = useRef(0)
  const lastEditorMarkdownRef = useRef('')
  const multiLineEditRef = useRef<MultiLineEditState | null>(null)
  const multiLineCursorPluginKeyRef = useRef<any>(null)
  const multiLineEditHistoryRef = useRef<MultiLineEditHistoryEntry[]>([])
  const stateRef = useRef(state)
  const initialStateJsonRef = useRef<string>(JSON.stringify(parseSavedState(initialSerializedState)))
  const stateDirtySinceBootRef = useRef(false)

  const activeSpaceIdRef = useRef<string>('')
  const activeTabIdRef = useRef<string>('')
  const activeSubTabIdRef = useRef<string | null>(null)
  const isMainViewRef = useRef(true)
  const navHistoryRef = useRef<NavLocation[]>([])
  const navIndexRef = useRef(-1)
  const isHistoryNavigationRef = useRef(false)
  const lastTabLikeViewRef = useRef<'main' | 'trash'>('main')
  stateRef.current = state

  useEffect(() => {
    if (typeof appStateStore.hydrate !== 'function') return

    let disposed = false
    Promise.resolve(
      appStateStore.hydrate((serializedState) => {
        if (disposed || stateDirtySinceBootRef.current) return
        const nextState = applyAutoPurgeToAppState(parseSavedState(serializedState))
        const nextSerializedState = JSON.stringify(nextState)
        initialStateJsonRef.current = nextSerializedState
        if (nextSerializedState === JSON.stringify(stateRef.current)) return
        setState(nextState)
      }),
    ).finally(() => {
      if (!disposed) {
        setStorageHydrated(true)
      }
    })

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    const sanitizedState = applyAutoPurgeToAppState(state)
    if (sanitizedState !== state) {
      stateRef.current = sanitizedState
      setState(sanitizedState)
      return
    }
    const serializedState = JSON.stringify(sanitizedState)
    stateDirtySinceBootRef.current = serializedState !== initialStateJsonRef.current
    if (!storageHydrated) return
    appStateStore.save(serializedState)
  }, [state, storageHydrated])

  useEffect(() => {
    const runAutoPurgeSweep = () => {
      setState((previous) => applyAutoPurgeToAppState(previous))
    }

    const intervalId = window.setInterval(runAutoPurgeSweep, 60_000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runAutoPurgeSweep()
      }
    }

    window.addEventListener('focus', runAutoPurgeSweep)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', runAutoPurgeSweep)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    const closeOverlays = () => {
      setContextMenu(null)
      setMenuOpen(false)
    }
    window.addEventListener('click', closeOverlays)
    window.addEventListener('resize', closeOverlays)
    window.addEventListener('scroll', closeOverlays, true)
    return () => {
      window.removeEventListener('click', closeOverlays)
      window.removeEventListener('resize', closeOverlays)
      window.removeEventListener('scroll', closeOverlays, true)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    if (toastHovered) return

    const durationMs = toastWasHovered ? HOVERED_TOAST_DURATION_MS : toast.durationMs
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null
      setToast(null)
    }, durationMs)

    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
    }
  }, [toast, toastHovered, toastWasHovered])

  useEffect(() => {
    if (!toast) return
    setToastHovered(false)
    setToastWasHovered(false)
  }, [toast?.id])

  const activeSpace = useMemo(
    () => state.spaces.find((space) => space.id === state.activeSpaceId) ?? state.spaces[0],
    [state.activeSpaceId, state.spaces],
  )

  const workspace = activeSpace.data

  const pushToast = (message: string, tone: ToastTone = 'warning', durationMs = DEFAULT_TOAST_DURATION_MS) => {
    setToast({
      id: Date.now(),
      message,
      tone,
      durationMs,
    })
  }

  const trackCompletedTaskQuickDelete = (beforeMarkdown: string) => {
    completedTaskDeleteUndoCandidateRef.current = {
      beforeMarkdown: normalizeMarkdownForPersistence(beforeMarkdown),
      deletedAt: Date.now(),
    }
  }

  const maybeShowCompletedTaskUndoHint = (markdown: string) => {
    const candidate = completedTaskDeleteUndoCandidateRef.current
    if (!candidate) return

    const now = Date.now()
    if (now - candidate.deletedAt > COMPLETED_TASK_UNDO_HINT_DETECTION_MS) {
      completedTaskDeleteUndoCandidateRef.current = null
      return
    }

    if (normalizeMarkdownForPersistence(markdown) !== candidate.beforeMarkdown) return

    completedTaskDeleteUndoCandidateRef.current = null
    if (now - completedTaskUndoToastAtRef.current < COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS) return

    completedTaskUndoToastAtRef.current = now
    pushToast(COMPLETED_TASK_UNDO_HINT_MESSAGE, 'warning', COMPLETED_TASK_UNDO_HINT_TOAST_DURATION_MS)
  }

  const getStageManagerParentSelection = (tab: Tab) => normalizeStageManagerParentSelection(tab, stageManagerSelections[tab.id])

  const updateStageManagerSelectionForTab = (
    tab: Tab,
    updater: (selection: StageManagerParentSelection) => StageManagerParentSelection,
  ) => {
    setStageManagerSelections((previous) => {
      const currentSelection = normalizeStageManagerParentSelection(tab, previous[tab.id])
      return {
        ...previous,
        [tab.id]: normalizeStageManagerParentSelection(tab, updater(currentSelection)),
      }
    })
  }

  const resetStageManagerState = (tabs: Tab[] = workspace.tabs) => {
    setStageManagerStep('select')
    setStageManagerAction(null)
    setStageManagerSelections(createStageManagerSelectionState(tabs))
    setStageManagerDraft(createDefaultStageManagerDraft())
  }

  const updateStageManagerDraft = (patch: Partial<StageManagerDraft>) => {
    setStageManagerDraft((previous) => ({
      ...previous,
      ...patch,
    }))
  }

  const selectAllStageManagerItems = () => {
    setStageManagerSelections(
      Object.fromEntries(
        workspace.tabs.map((tab) => [
          tab.id,
          {
            mode: 'full',
            selectedSubTabIds: tab.subTabs.map((subTab) => subTab.id),
            cachedPartialSubTabIds: null,
            partialDirection: null,
          } satisfies StageManagerParentSelection,
        ]),
      ),
    )
  }

  const deselectAllStageManagerItems = () => {
    setStageManagerSelections(createStageManagerSelectionState(workspace.tabs))
  }

  const cycleStageManagerParentSelection = (tab: Tab) => {
    updateStageManagerSelectionForTab(tab, (selection) => {
      const allSubTabIds = tab.subTabs.map((subTab) => subTab.id)
      const cachedPartial = selection.mode === 'partial' ? selection.selectedSubTabIds : selection.cachedPartialSubTabIds

      if (selection.mode === 'none') {
        if (cachedPartial && cachedPartial.length > 0) {
          return {
            mode: 'partial',
            selectedSubTabIds: cachedPartial,
            cachedPartialSubTabIds: cachedPartial,
            partialDirection: 'toward-all',
          }
        }

        return {
          mode: 'full',
          selectedSubTabIds: allSubTabIds,
          cachedPartialSubTabIds: null,
          partialDirection: null,
        }
      }

      if (selection.mode === 'full') {
        if (cachedPartial && cachedPartial.length > 0) {
          return {
            mode: 'partial',
            selectedSubTabIds: cachedPartial,
            cachedPartialSubTabIds: cachedPartial,
            partialDirection: 'toward-none',
          }
        }

        return createEmptyStageManagerParentSelection()
      }

      if (selection.partialDirection === 'toward-none') {
        return {
          mode: 'none',
          selectedSubTabIds: [],
          cachedPartialSubTabIds: selection.selectedSubTabIds,
          partialDirection: null,
        }
      }

      return {
        mode: 'full',
        selectedSubTabIds: allSubTabIds,
        cachedPartialSubTabIds: selection.selectedSubTabIds,
        partialDirection: null,
      }
    })
  }

  const toggleStageManagerSubTabSelection = (tab: Tab, subTabId: string) => {
    updateStageManagerSelectionForTab(tab, (selection) => {
      const allSubTabIds = tab.subTabs.map((subTab) => subTab.id)
      const selectedIds = new Set(selection.mode === 'full' ? allSubTabIds : selection.selectedSubTabIds)
      const wasSelected = selectedIds.has(subTabId)
      const selectionBeforeChange = Array.from(selectedIds)

      if (wasSelected) {
        selectedIds.delete(subTabId)
      } else {
        selectedIds.add(subTabId)
      }

      const orderedSelectedIds = orderStageManagerSubTabIds(tab, Array.from(selectedIds))

      if (orderedSelectedIds.length === 0) {
        return {
          mode: 'none',
          selectedSubTabIds: [],
          cachedPartialSubTabIds:
            selectionBeforeChange.length > 0 ? orderStageManagerSubTabIds(tab, selectionBeforeChange) : selection.cachedPartialSubTabIds,
          partialDirection: null,
        }
      }

      if (orderedSelectedIds.length >= allSubTabIds.length) {
        return {
          mode: 'full',
          selectedSubTabIds: allSubTabIds,
          cachedPartialSubTabIds:
            selectionBeforeChange.length > 0 && selectionBeforeChange.length < allSubTabIds.length
              ? orderStageManagerSubTabIds(tab, selectionBeforeChange)
              : selection.cachedPartialSubTabIds,
          partialDirection: null,
        }
      }

      return {
        mode: 'partial',
        selectedSubTabIds: orderedSelectedIds,
        cachedPartialSubTabIds: orderedSelectedIds,
        partialDirection: wasSelected ? 'toward-none' : 'toward-all',
      }
    })
  }

  const getStageManagerActionValidation = (
    action: StageManagerAction,
    snapshot: StageManagerSelectionSnapshot = buildStageManagerSelectionSnapshot(workspace.tabs, stageManagerSelections),
  ) => {
    if (!snapshot.hasSelection) {
      return {
        valid: false,
        message: 'select at least one parent or sub-tab before choosing an action.',
      }
    }

    if (action === 'promote' && snapshot.fullParents.length > 1) {
      return {
        valid: false,
        message: 'multiple parent tabs cannot be promoted at the same time.',
      }
    }

    if (action === 'demote' && snapshot.fullParents.length === 0) {
      return {
        valid: false,
        message: 'demote requires at least one fully selected parent tab.',
      }
    }

    return {
      valid: true,
      message: '',
    }
  }

  const selectStageManagerAction = (action: StageManagerAction) => {
    const snapshot = buildStageManagerSelectionSnapshot(workspace.tabs, stageManagerSelections)
    const validation = getStageManagerActionValidation(action, snapshot)
    if (!validation.valid) {
      setStageManagerAction(null)
      pushToast(validation.message, 'warning')
      return
    }

    setStageManagerAction(action)

    if (action === 'promote' && snapshot.fullParents.length === 1 && stageManagerDraft.newSpaceName.trim().length === 0) {
      updateStageManagerDraft({ newSpaceName: snapshot.fullParents[0].title })
    }
  }

  const clearArrangePressTimer = () => {
    if (arrangePressTimerRef.current !== null) {
      window.clearTimeout(arrangePressTimerRef.current)
      arrangePressTimerRef.current = null
    }
  }

  const clearArrangeTapCandidate = () => {
    arrangeTapCandidateRef.current = null
  }

  const clearArrangeDragSeed = () => {
    arrangeDragSeedRef.current = null
  }

  const startArrangeDragSeed = (key: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    arrangeDragSeedRef.current = {
      key,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const startArrangeTapCandidate = (candidate: ArrangeTapCandidateSeed, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!arrangeMode.active || event.button !== 0) return
    arrangeTapCandidateRef.current = {
      ...candidate,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
    }
  }

  const markArrangeTapDragged = (key: string) => {
    const candidate = arrangeTapCandidateRef.current
    if (!candidate || candidate.key !== key) return
    arrangeTapCandidateRef.current = {
      ...candidate,
      dragged: true,
    }
  }

  const finalizeArrangeTapCandidate = (
    key: string,
    event: ReactPointerEvent<HTMLButtonElement>,
    onActivate: () => void,
  ) => {
    if (!arrangeMode.active) return
    const candidate = arrangeTapCandidateRef.current
    arrangeTapCandidateRef.current = null
    if (!candidate || candidate.key !== key || candidate.dragged) return
    const deltaX = event.clientX - candidate.startX
    const deltaY = event.clientY - candidate.startY
    if (Math.hypot(deltaX, deltaY) > ARRANGE_TAP_SLOP_PX) return
    if (consumeArrangeClickSuppression(key)) return
    onActivate()
  }

  const markArrangeClickSuppressed = (...keys: string[]) => {
    keys.forEach((key) => suppressArrangeClickRef.current.add(key))
  }

  const consumeArrangeClickSuppression = (key: string) => {
    if (!suppressArrangeClickRef.current.has(key)) return false
    suppressArrangeClickRef.current.delete(key)
    return true
  }

  const enterArrangeMode = (source: ArrangeSource, dragItem: ArrangeDragItem | null = null, suppressClickKey?: string) => {
    flushPendingContent()
    clearArrangePressTimer()
    clearArrangeDragSeed()
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    if (suppressClickKey) {
      markArrangeClickSuppressed(suppressClickKey)
    }
    const scope: ArrangeScope | null = viewMode === 'spaces' ? 'spaces' : viewMode === 'main' ? 'tabs' : null
    setArrangeMode({
      active: true,
      scope,
      source,
      dragItem,
      overParentTabId: null,
      overParentInsert: null,
      overSubTabId: null,
      overSubTabInsert: null,
      overSpaceId: null,
      overSpaceInsert: null,
    })
  }

  const exitArrangeMode = () => {
    clearArrangePressTimer()
    clearArrangeTapCandidate()
    clearArrangeDragSeed()
    suppressArrangeClickRef.current.clear()
    spaceArrangeDragRef.current = null
    tabArrangeDragRef.current = null
    suppressNextSpaceArrangeExitRef.current = false
    setArrangeDraggingItem(null)
    setSpaceArrangeDragPreview(null)
    setTabArrangeDragPreview(null)
    setArrangeMode(DEFAULT_ARRANGE_MODE)
  }

  const startArrangePress = (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragItem: ArrangeDragItem | null,
    suppressClickKey: string,
  ) => {
    if ((viewMode !== 'main' && viewMode !== 'spaces') || editing || arrangeMode.active) return
    if (event.button !== 0) return
    clearArrangePressTimer()
    arrangePressTimerRef.current = window.setTimeout(() => {
      arrangePressTimerRef.current = null
      enterArrangeMode('press', dragItem, suppressClickKey)
    }, ARRANGE_PRESS_DELAY_MS)
  }

  const buildArrangeDragItemFromContextMenu = (): ArrangeDragItem | null => {
    if (!contextMenu) return null
    if (contextMenu.type === 'tab') {
      return { type: 'tab', tabId: contextMenu.tabId }
    }
    if (contextMenu.type === 'subtab') {
      return {
        type: 'subtab',
        parentTabId: contextMenu.tabId,
        subTabId: contextMenu.subTabId,
      }
    }
    if (contextMenu.type === 'space') {
      return { type: 'space', spaceId: contextMenu.spaceId }
    }
    return null
  }

  const enterArrangeModeFromContext = () => {
    const dragItem = buildArrangeDragItemFromContextMenu()
    if (!dragItem) return
    enterArrangeMode('context', dragItem)
  }

  const prepareArrangeModeForDrag = (dragItem: ArrangeDragItem) => {
    flushPendingContent()
    clearArrangePressTimer()
    clearArrangeTapCandidate()
    clearArrangeDragSeed()
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    setArrangeDraggingItem(dragItem)
    const scope: ArrangeScope = dragItem.type === 'space' ? 'spaces' : 'tabs'
    setArrangeMode({
      active: true,
      scope,
      source: 'press',
      dragItem,
      overParentTabId: dragItem.type === 'tab' ? dragItem.tabId : null,
      overParentInsert: dragItem.type === 'tab' ? 'after' : null,
      overSubTabId: dragItem.type === 'subtab' ? dragItem.subTabId : null,
      overSubTabInsert: dragItem.type === 'subtab' ? 'after' : null,
      overSpaceId: dragItem.type === 'space' ? dragItem.spaceId : null,
      overSpaceInsert: dragItem.type === 'space' ? 'after' : null,
    })
  }

  const getArrangeSpaceInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    const grid = spacesGridRef.current
    if (!grid) return null
    return getArrangeRailInsertionTarget(
      grid,
      '[data-arrange-space-id]',
      'data-arrange-space-id',
      clientX,
      clientY,
    )
  }

  const clearArrangeSpaceDropTarget = () => {
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            overSpaceId: null,
            overSpaceInsert: null,
          }
        : previous,
    )
  }

  const updateArrangeSpaceDropTarget = (clientX: number, clientY: number) => {
    const insertionTarget = getArrangeSpaceInsertionTargetFromPoint(clientX, clientY)
    if (!insertionTarget) {
      clearArrangeSpaceDropTarget()
      return null
    }

    setArrangeMode((previous) =>
      previous.overSpaceId === insertionTarget.targetId && previous.overSpaceInsert === insertionTarget.position
        ? previous
        : {
            ...previous,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: insertionTarget.targetId,
            overSpaceInsert: insertionTarget.position,
          },
    )
    return insertionTarget
  }

  const clearArrangeSpacePointerDrag = () => {
    spaceArrangeDragRef.current = null
    setSpaceArrangeDragPreview(null)
  }

  const suppressNextSpaceArrangeExitClick = () => {
    suppressNextSpaceArrangeExitRef.current = true
    window.setTimeout(() => {
      suppressNextSpaceArrangeExitRef.current = false
    }, 0)
  }

  const startArrangeSpacePointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, space: Space) => {
    if (viewMode !== 'spaces') return
    const rect = event.currentTarget.getBoundingClientRect()
    const nextDrag: SpaceArrangeDragPreview = {
      spaceId: space.id,
      label: space.name,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }

    clearArrangePressTimer()
    markArrangeTapDragged(`space:${space.id}`)
    prepareArrangeModeForDrag({ type: 'space', spaceId: space.id })
    spaceArrangeDragRef.current = nextDrag
    setSpaceArrangeDragPreview(nextDrag)
    updateArrangeSpaceDropTarget(event.clientX, event.clientY)
  }

  const updateArrangeSpacePointerDrag = (clientX: number, clientY: number) => {
    const drag = spaceArrangeDragRef.current
    if (!drag) return
    const nextDrag: SpaceArrangeDragPreview = {
      ...drag,
      currentX: clientX,
      currentY: clientY,
    }
    spaceArrangeDragRef.current = nextDrag
    setSpaceArrangeDragPreview(nextDrag)
    updateArrangeSpaceDropTarget(clientX, clientY)
  }

  const moveArrangeSpaceToTarget = (
    draggedSpaceId: string,
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    if (draggedSpaceId === insertionTarget.targetId) return
    setState((previous) =>
      moveSpaceWithinActiveDomain(previous, draggedSpaceId, insertionTarget.targetId, insertionTarget.position),
    )
  }

  const finishArrangeSpacePointerDrag = (clientX: number, clientY: number) => {
    const drag = spaceArrangeDragRef.current
    if (!drag) return false

    const insertionTarget = getArrangeSpaceInsertionTargetFromPoint(clientX, clientY)
    markArrangeClickSuppressed(`space:${drag.spaceId}`)
    if (insertionTarget) {
      markArrangeClickSuppressed(`space:${insertionTarget.targetId}`)
      moveArrangeSpaceToTarget(drag.spaceId, insertionTarget)
    }

    suppressNextSpaceArrangeExitClick()
    clearArrangeSpacePointerDrag()
    clearArrangeTapCandidate()
    clearArrangeDragSeed()
    setArrangeDraggingItem(null)
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: null,
            overSpaceInsert: null,
          }
        : previous,
    )
    return true
  }

  const cancelArrangeSpacePointerDrag = () => {
    clearArrangeSpacePointerDrag()
    clearArrangeTapCandidate()
    clearArrangeDragSeed()
    clearArrangePressTimer()
    setArrangeDraggingItem(null)
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overSpaceId: null,
            overSpaceInsert: null,
          }
        : previous,
    )
  }

  const handleArrangeSpacePointerMove = (event: ReactPointerEvent<HTMLButtonElement>, space: Space) => {
    if (event.buttons !== 1) return

    const activeDrag = spaceArrangeDragRef.current
    if (activeDrag?.spaceId === space.id) {
      event.preventDefault()
      markArrangeTapDragged(`space:${space.id}`)
      updateArrangeSpacePointerDrag(event.clientX, event.clientY)
      return
    }

    const seed = arrangeDragSeedRef.current
    if (!seed || seed.key !== `space:${space.id}`) return
    const deltaX = event.clientX - seed.startX
    const deltaY = event.clientY - seed.startY
    if (Math.hypot(deltaX, deltaY) < ARRANGE_DRAG_START_SLOP_PX) return

    event.preventDefault()
    startArrangeSpacePointerDrag(event, space)
  }

  const handleArrangeSpacePointerUp = (event: ReactPointerEvent<HTMLButtonElement>, spaceId: string) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (finishArrangeSpacePointerDrag(event.clientX, event.clientY)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    clearArrangeDragSeed()
    if (arrangeMode.active && arrangeMode.scope === 'spaces') {
      finalizeArrangeTapCandidate(`space:${spaceId}`, event, exitArrangeMode)
      return
    }
    clearArrangePressTimer()
  }

  const getArrangeParentInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    const rail = primaryTabRailRef.current
    if (!rail || !isPointInsideElement(rail, clientX, clientY, 14)) return null
    return getArrangeRailInsertionTarget(rail, '[data-arrange-tab-id]', 'data-arrange-tab-id', clientX, clientY)
  }

  const getArrangeSubTabInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    const rail = subTabRailRef.current
    if (!rail || !isPointInsideElement(rail, clientX, clientY, 14)) return null
    return getArrangeRailInsertionTarget(rail, '[data-arrange-subtab-id]', 'data-arrange-subtab-id', clientX, clientY)
  }

  const clearArrangeTabDropTarget = () => {
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
          }
        : previous,
    )
  }

  const updateArrangeTabDropTarget = (item: TabArrangeDragItem, clientX: number, clientY: number) => {
    if (item.type === 'tab') {
      const parentTarget = getArrangeParentInsertionTargetFromPoint(clientX, clientY)
      if (!parentTarget) {
        clearArrangeTabDropTarget()
        return null
      }

      setArrangeMode((previous) =>
        previous.overParentTabId === parentTarget.targetId && previous.overParentInsert === parentTarget.position
          ? previous
          : {
              ...previous,
              overParentTabId: parentTarget.targetId,
              overParentInsert: parentTarget.position,
              overSubTabId: null,
              overSubTabInsert: null,
            },
      )
      return { type: 'parent' as const, target: parentTarget }
    }

    if (item.type === 'subtab') {
      const parentTarget = getArrangeParentInsertionTargetFromPoint(clientX, clientY)
      if (parentTarget) {
        setArrangeMode((previous) =>
          previous.overParentTabId === parentTarget.targetId &&
          previous.overParentInsert === null &&
          previous.overSubTabId === null &&
          previous.overSubTabInsert === null
            ? previous
            : {
                ...previous,
                overParentTabId: parentTarget.targetId,
                overParentInsert: null,
                overSubTabId: null,
                overSubTabInsert: null,
              },
        )
        return { type: 'parent' as const, target: parentTarget }
      }

      const subTabTarget = getArrangeSubTabInsertionTargetFromPoint(clientX, clientY)
      if (subTabTarget && item.parentTabId === activeTab.id) {
        setArrangeMode((previous) =>
          previous.overSubTabId === subTabTarget.targetId && previous.overSubTabInsert === subTabTarget.position
            ? previous
            : {
                ...previous,
                overParentTabId: null,
                overParentInsert: null,
                overSubTabId: subTabTarget.targetId,
                overSubTabInsert: subTabTarget.position,
              },
        )
        return { type: 'subtab' as const, target: subTabTarget }
      }
    }

    clearArrangeTabDropTarget()
    return null
  }

  const clearArrangeTabPointerDrag = () => {
    tabArrangeDragRef.current = null
    setTabArrangeDragPreview(null)
  }

  const startArrangeTabPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: TabArrangeDragItem,
    label: string,
    variant: TabArrangeDragPreview['variant'],
  ) => {
    if (viewMode !== 'main') return
    const rect = event.currentTarget.getBoundingClientRect()
    const nextDrag: TabArrangeDragPreview = {
      item,
      label,
      variant,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }

    clearArrangePressTimer()
    markArrangeTapDragged(item.type === 'tab' ? `tab:${item.tabId}` : `subtab:${item.subTabId}`)
    prepareArrangeModeForDrag(item)
    tabArrangeDragRef.current = nextDrag
    setTabArrangeDragPreview(nextDrag)
    updateArrangeTabDropTarget(item, event.clientX, event.clientY)
  }

  const updateArrangeTabPointerDrag = (clientX: number, clientY: number) => {
    const drag = tabArrangeDragRef.current
    if (!drag) return
    const nextDrag: TabArrangeDragPreview = {
      ...drag,
      currentX: clientX,
      currentY: clientY,
    }
    tabArrangeDragRef.current = nextDrag
    setTabArrangeDragPreview(nextDrag)
    updateArrangeTabDropTarget(drag.item, clientX, clientY)
  }

  const moveArrangeParentTabToTarget = (
    draggedTabId: string,
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    if (draggedTabId === insertionTarget.targetId) return
    updateActiveSpaceData((data) => {
      const fromIndex = data.tabs.findIndex((tab) => tab.id === draggedTabId)
      const toIndex = data.tabs.findIndex((tab) => tab.id === insertionTarget.targetId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return data
      return {
        ...data,
        tabs: moveItemByInsertion(data.tabs, fromIndex, toIndex, insertionTarget.position),
      }
    })
  }

  const moveArrangeSubTabToParent = (sourceParentTabId: string, subTabId: string, targetParentTabId: string) => {
    if (sourceParentTabId === targetParentTabId) return
    updateActiveSpaceData((data) => {
      const sourceParent = data.tabs.find((tab) => tab.id === sourceParentTabId)
      const targetParent = data.tabs.find((tab) => tab.id === targetParentTabId)
      if (!sourceParent || !targetParent) return data
      const movedSubTab = sourceParent.subTabs.find((subTab) => subTab.id === subTabId)
      if (!movedSubTab || targetParent.subTabs.some((subTab) => subTab.id === subTabId)) return data

      return {
        ...data,
        tabs: data.tabs.map((tab) => {
          if (tab.id === sourceParentTabId) {
            return {
              ...tab,
              activeSubTabId: tab.activeSubTabId === subTabId ? null : tab.activeSubTabId,
              subTabs: tab.subTabs.filter((subTab) => subTab.id !== subTabId),
            }
          }
          if (tab.id === targetParentTabId) {
            return {
              ...tab,
              subTabs: [...tab.subTabs, movedSubTab],
            }
          }
          return tab
        }),
      }
    })
  }

  const moveArrangeSubTabToTarget = (
    parentTabId: string,
    subTabId: string,
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    if (subTabId === insertionTarget.targetId) return
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== parentTabId) return tab
        const fromIndex = tab.subTabs.findIndex((subTab) => subTab.id === subTabId)
        const toIndex = tab.subTabs.findIndex((subTab) => subTab.id === insertionTarget.targetId)
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return tab
        return {
          ...tab,
          subTabs: moveItemByInsertion(tab.subTabs, fromIndex, toIndex, insertionTarget.position),
        }
      }),
    }))
  }

  const finishArrangeTabPointerDrag = (clientX: number, clientY: number) => {
    const drag = tabArrangeDragRef.current
    if (!drag) return false

    const { item } = drag
    if (item.type === 'tab') {
      const parentTarget = getArrangeParentInsertionTargetFromPoint(clientX, clientY)
      markArrangeClickSuppressed(`tab:${item.tabId}`)
      if (parentTarget) {
        markArrangeClickSuppressed(`tab:${parentTarget.targetId}`)
        moveArrangeParentTabToTarget(item.tabId, parentTarget)
      }
    } else if (item.type === 'subtab') {
      const parentTarget = getArrangeParentInsertionTargetFromPoint(clientX, clientY)
      markArrangeClickSuppressed(`subtab:${item.subTabId}`)
      if (parentTarget) {
        markArrangeClickSuppressed(`tab:${parentTarget.targetId}`)
        moveArrangeSubTabToParent(item.parentTabId, item.subTabId, parentTarget.targetId)
      } else {
        const subTabTarget = getArrangeSubTabInsertionTargetFromPoint(clientX, clientY)
        if (subTabTarget && item.parentTabId === activeTab.id) {
          markArrangeClickSuppressed(`subtab:${subTabTarget.targetId}`)
          moveArrangeSubTabToTarget(item.parentTabId, item.subTabId, subTabTarget)
        }
      }
    }

    clearArrangeTabPointerDrag()
    clearArrangeTapCandidate()
    clearArrangeDragSeed()
    setArrangeDraggingItem(null)
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: null,
            overSpaceInsert: null,
          }
        : previous,
    )
    return true
  }

  const cancelArrangeTabPointerDrag = () => {
    clearArrangeTabPointerDrag()
    clearArrangeTapCandidate()
    clearArrangeDragSeed()
    clearArrangePressTimer()
    setArrangeDraggingItem(null)
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
          }
        : previous,
    )
  }

  const handleArrangeTabPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: TabArrangeDragItem,
    label: string,
    variant: TabArrangeDragPreview['variant'],
  ) => {
    if (event.buttons !== 1) return

    const activeDrag = tabArrangeDragRef.current
    if (activeDrag) {
      event.preventDefault()
      const key = activeDrag.item.type === 'tab' ? `tab:${activeDrag.item.tabId}` : `subtab:${activeDrag.item.subTabId}`
      markArrangeTapDragged(key)
      updateArrangeTabPointerDrag(event.clientX, event.clientY)
      return
    }

    const key = item.type === 'tab' ? `tab:${item.tabId}` : `subtab:${item.subTabId}`
    const seed = arrangeDragSeedRef.current
    if (!seed || seed.key !== key) return
    const deltaX = event.clientX - seed.startX
    const deltaY = event.clientY - seed.startY
    if (Math.hypot(deltaX, deltaY) < ARRANGE_DRAG_START_SLOP_PX) return

    event.preventDefault()
    startArrangeTabPointerDrag(event, item, label, variant)
  }

  const handleArrangeTabPointerUp = (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: string,
    onTapWhileArranging: () => void,
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (finishArrangeTabPointerDrag(event.clientX, event.clientY)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    clearArrangeDragSeed()
    if (arrangeMode.active) {
      finalizeArrangeTapCandidate(key, event, onTapWhileArranging)
      return
    }
    clearArrangePressTimer()
  }

  useEffect(() => {
    if (viewMode === 'settings') {
      setSettingsDaysDraft(String(activeSpace.settings.autoRemoveDeletedDays))
      setShortcutDrafts(state.hotkeys.shortcuts)
      setMouseBackForwardEnabledDraft(state.hotkeys.enableMouseBackForward)
      setGenericHistoryHotkeysEnabledDraft(state.hotkeys.enableGenericHistoryHotkeys)
      setShowParentHomeTabDraft(state.ui.showParentHomeTab)
      setTabButtonScaleDraft(state.ui.tabButtonScale)
      setNoteFontScaleDraft(state.ui.noteFontScale)
      setEditingShortcut(null)
    }
  }, [
    viewMode,
    activeSpace.settings.autoRemoveDeletedDays,
    state.hotkeys,
    state.ui.showParentHomeTab,
    state.ui.tabButtonScale,
    state.ui.noteFontScale,
  ])

  useEffect(() => () => clearArrangePressTimer(), [])

  useEffect(() => {
    if (viewMode === 'main') return
    setArrangeMode((previous) => (previous.active ? DEFAULT_ARRANGE_MODE : previous))
  }, [viewMode])

  useEffect(() => {
    if (viewMode === 'stage-manager') return
    setStageManagerStep('select')
    setStageManagerAction(null)
    setStageManagerSelections({})
    setStageManagerDraft(createDefaultStageManagerDraft())
  }, [viewMode])

  const activeTab = useMemo(
    () => workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ?? workspace.tabs[0],
    [workspace.activeTabId, workspace.tabs],
  )

  const activeSubTab = useMemo(
    () =>
      activeTab.activeSubTabId
        ? activeTab.subTabs.find((sub) => sub.id === activeTab.activeSubTabId) ?? null
        : null,
    [activeTab],
  )

  const stageManagerSelectionSnapshot = useMemo(
    () => buildStageManagerSelectionSnapshot(workspace.tabs, stageManagerSelections),
    [workspace.tabs, stageManagerSelections],
  )
  const stageManagerSelectionCounts = useMemo(
    () => ({
      fullParentCount: stageManagerSelectionSnapshot.fullParents.length,
      partialParentCount: stageManagerSelectionSnapshot.partialParents.length,
      selectedSubTabCount:
        stageManagerSelectionSnapshot.fullParents.reduce((count, tab) => count + tab.subTabs.length, 0) +
        stageManagerSelectionSnapshot.looseSubTabs.length,
      hasSelection: stageManagerSelectionSnapshot.hasSelection,
    }),
    [stageManagerSelectionSnapshot],
  )
  const stageManagerOtherSpaces = useMemo(
    () => state.spaces.filter((space) => space.id !== activeSpace.id),
    [activeSpace.id, state.spaces],
  )
  const stageManagerPromoteDestinationSpaces = state.spaces
  const stageManagerDemoteParentOptions = useMemo(
    () => workspace.tabs.filter((tab) => !stageManagerSelectionSnapshot.fullParentIds.has(tab.id)),
    [stageManagerSelectionSnapshot.fullParentIds, workspace.tabs],
  )
  const stageManagerSelectedPromoteSpace =
    stageManagerDraft.promoteSpaceMode === 'existing'
      ? stageManagerPromoteDestinationSpaces.find((space) => space.id === stageManagerDraft.promoteSpaceId) ?? null
      : null
  const stageManagerSelectedMigrateSpace =
    stageManagerDraft.migrateSpaceMode === 'existing'
      ? stageManagerOtherSpaces.find((space) => space.id === stageManagerDraft.migrateSpaceId) ?? null
      : null
  const stageManagerSelectedMigrateParentSpace =
    stageManagerDraft.migrateParentSpaceMode === 'current'
      ? activeSpace
      : stageManagerDraft.migrateParentSpaceMode === 'existing'
        ? state.spaces.find((space) => space.id === stageManagerDraft.migrateParentSpaceId) ?? null
        : null
  const stageManagerMigrateParentOptions = useMemo(() => {
    const destinationSpace = stageManagerSelectedMigrateParentSpace
    if (!destinationSpace) return []
    return destinationSpace.data.tabs.filter(
      (tab) => destinationSpace.id !== activeSpace.id || !stageManagerSelectionSnapshot.fullParentIds.has(tab.id),
    )
  }, [activeSpace.id, stageManagerSelectedMigrateParentSpace, stageManagerSelectionSnapshot.fullParentIds])
  const stageManagerStrayExistingParentOptions = useMemo(() => {
    const destinationSpace = stageManagerSelectedMigrateSpace
    if (!destinationSpace) return []
    return destinationSpace.data.tabs
  }, [stageManagerSelectedMigrateSpace])
  const stageManagerStrayHandlingSelectValue =
    stageManagerDraft.strayHandlingMode === 'selected-parent'
      ? `selected-parent:${stageManagerDraft.straySelectedParentId}`
      : stageManagerDraft.strayHandlingMode

  useEffect(() => {
    if (viewMode !== 'stage-manager') return

    setStageManagerDraft((previous) => {
      let changed = false
      let next = previous

      if (previous.promoteSpaceId && !stageManagerPromoteDestinationSpaces.some((space) => space.id === previous.promoteSpaceId)) {
        next = { ...next, promoteSpaceId: '' }
        changed = true
      }

      if (previous.demoteParentId && !stageManagerDemoteParentOptions.some((tab) => tab.id === previous.demoteParentId)) {
        next = { ...next, demoteParentId: '' }
        changed = true
      }

      if (previous.migrateSpaceId && !stageManagerOtherSpaces.some((space) => space.id === previous.migrateSpaceId)) {
        next = { ...next, migrateSpaceId: '' }
        changed = true
      }

      if (
        previous.migrateParentSpaceId &&
        previous.migrateParentSpaceMode === 'existing' &&
        !stageManagerOtherSpaces.some((space) => space.id === previous.migrateParentSpaceId)
      ) {
        next = { ...next, migrateParentSpaceId: '' }
        changed = true
      }

      if (previous.migrateParentId && !stageManagerMigrateParentOptions.some((tab) => tab.id === previous.migrateParentId)) {
        next = { ...next, migrateParentId: '' }
        changed = true
      }

      if (
        previous.straySelectedParentId &&
        !stageManagerSelectionSnapshot.fullParents.some((tab) => tab.id === previous.straySelectedParentId)
      ) {
        next = {
          ...next,
          straySelectedParentId: '',
          strayHandlingMode: previous.strayHandlingMode === 'selected-parent' ? 'promote' : previous.strayHandlingMode,
        }
        changed = true
      }

      if (
        previous.strayExistingParentId &&
        !stageManagerStrayExistingParentOptions.some((tab) => tab.id === previous.strayExistingParentId)
      ) {
        next = { ...next, strayExistingParentId: '' }
        changed = true
      }

      return changed ? next : previous
    })
  }, [
    viewMode,
    stageManagerDemoteParentOptions,
    stageManagerMigrateParentOptions,
    stageManagerOtherSpaces,
    stageManagerPromoteDestinationSpaces,
    stageManagerSelectionSnapshot.fullParents,
    stageManagerStrayExistingParentOptions,
  ])

  useEffect(() => {
    if (!arrangeMode.active || arrangeMode.scope !== 'tabs' || viewMode !== 'main') return

    setArrangeMode((previous) => {
      if (!previous.active) return previous

      const validParentTabIds = new Set(workspace.tabs.map((tab) => tab.id))
      let nextDragItem = previous.dragItem
      let nextOverParentTabId = previous.overParentTabId
      let nextOverParentInsert = previous.overParentInsert
      let nextOverSubTabId = previous.overSubTabId
      let nextOverSubTabInsert = previous.overSubTabInsert

      if (nextDragItem?.type === 'tab' && !validParentTabIds.has(nextDragItem.tabId)) {
        nextDragItem = null
      }

      const currentDragItem = nextDragItem
      if (currentDragItem?.type === 'subtab') {
        const sourceParent = workspace.tabs.find((tab) => tab.id === currentDragItem.parentTabId)
        if (!sourceParent || !sourceParent.subTabs.some((subTab) => subTab.id === currentDragItem.subTabId)) {
          nextDragItem = null
        }
      }

      if (nextOverParentTabId && !validParentTabIds.has(nextOverParentTabId)) {
        nextOverParentTabId = null
        nextOverParentInsert = null
      }

      if (nextOverSubTabId && !activeTab.subTabs.some((subTab) => subTab.id === nextOverSubTabId)) {
        nextOverSubTabId = null
        nextOverSubTabInsert = null
      }

      if (nextDragItem?.type !== 'tab' && nextOverParentInsert) {
        nextOverParentInsert = null
      }

      if (nextDragItem?.type !== 'subtab' && nextOverSubTabInsert) {
        nextOverSubTabInsert = null
      }

      if (
        nextDragItem === previous.dragItem &&
        nextOverParentTabId === previous.overParentTabId &&
        nextOverParentInsert === previous.overParentInsert &&
        nextOverSubTabId === previous.overSubTabId &&
        nextOverSubTabInsert === previous.overSubTabInsert
      ) {
        return previous
      }

      return {
        ...previous,
        dragItem: nextDragItem,
        overParentTabId: nextOverParentTabId,
        overParentInsert: nextOverParentInsert,
        overSubTabId: nextOverSubTabId,
        overSubTabInsert: nextOverSubTabInsert,
      }
    })
  }, [arrangeMode.active, arrangeMode.scope, viewMode, workspace.tabs, activeTab.subTabs])

  useEffect(() => {
    if (!arrangeMode.active || arrangeMode.scope !== 'spaces' || viewMode !== 'spaces') return

    setArrangeMode((previous) => {
      if (!previous.active || previous.scope !== 'spaces') return previous

      const validSpaceIds = new Set(state.spaces.map((space) => space.id))
      let nextDragItem = previous.dragItem
      let nextOverSpaceId = previous.overSpaceId
      let nextOverSpaceInsert = previous.overSpaceInsert

      if (nextDragItem?.type === 'space' && !validSpaceIds.has(nextDragItem.spaceId)) {
        nextDragItem = null
      }

      if (nextOverSpaceId && !validSpaceIds.has(nextOverSpaceId)) {
        nextOverSpaceId = null
        nextOverSpaceInsert = null
      }

      if (nextDragItem?.type !== 'space' && nextOverSpaceInsert) {
        nextOverSpaceInsert = null
      }

      if (
        nextDragItem === previous.dragItem &&
        nextOverSpaceId === previous.overSpaceId &&
        nextOverSpaceInsert === previous.overSpaceInsert
      ) {
        return previous
      }

      return {
        ...previous,
        dragItem: nextDragItem,
        overSpaceId: nextOverSpaceId,
        overSpaceInsert: nextOverSpaceInsert,
      }
    })
  }, [arrangeMode.active, arrangeMode.scope, viewMode, state.spaces])

  const activeContent = activeSubTab ? activeSubTab.content : activeTab.homeContent

  const trashParentTabs = useMemo(() => {
    const buckets: TrashParentBucket[] = workspace.deletedTabs.map((entry) => ({
      id: entry.id,
      title: entry.tab.title,
      source: 'deleted-tab',
      deletedTabEntryId: entry.id,
      parentTabId: entry.tab.id,
      homeContent: entry.tab.homeContent,
      subTabs: entry.tab.subTabs,
    }))

    const deletedParentIds = new Set(workspace.deletedTabs.map((entry) => entry.tab.id))
    const subtabsOnlyMap = new Map<string, { title: string; entries: DeletedSubTabEntry[] }>()
    for (const entry of workspace.deletedSubTabs) {
      if (deletedParentIds.has(entry.parentTabId)) continue
      if (!subtabsOnlyMap.has(entry.parentTabId)) {
        subtabsOnlyMap.set(entry.parentTabId, { title: entry.parentTabTitle, entries: [] })
      }
      subtabsOnlyMap.get(entry.parentTabId)?.entries.push(entry)
    }

    for (const [parentTabId, group] of subtabsOnlyMap.entries()) {
      buckets.push({
        id: `subtabs-only-${parentTabId}`,
        title: group.title,
        source: 'subtabs-only',
        deletedTabEntryId: null,
        parentTabId,
        homeContent: `# ${group.title}\n\ndeleted sub-tabs from this tab are shown below.`,
        subTabs: group.entries.map((entry) => ({
          id: entry.id,
          title: entry.subTab.title,
          content: entry.subTab.content,
        })),
      })
    }

    return buckets
  }, [workspace.deletedTabs, workspace.deletedSubTabs])

  const selectedTrashTab = useMemo(
    () => (trashTabId === TRASH_HOME_ID ? null : trashParentTabs.find((entry) => entry.id === trashTabId) ?? null),
    [trashTabId, trashParentTabs],
  )

  const trashSubTabs = useMemo(() => (selectedTrashTab ? selectedTrashTab.subTabs : []), [selectedTrashTab])

  const selectedTrashSubTab = useMemo(
    () => (trashSubTabId ? trashSubTabs.find((sub) => sub.id === trashSubTabId) ?? null : null),
    [trashSubTabId, trashSubTabs],
  )

  const trashHomeContent = `# Trash\n\nItems moved here are pending deletion.\n\n- Use **Restore All** to move everything back into notes.\n- Use **delete all** to permanently remove all items in Trash.\n- This Trash note is read-only.`

  const trashContent = selectedTrashSubTab
    ? selectedTrashSubTab.content
    : selectedTrashTab
      ? selectedTrashTab.homeContent
      : trashHomeContent

  const displayContent = viewMode === 'trash' ? trashContent : activeContent

  activeSpaceIdRef.current = activeSpace.id
  activeTabIdRef.current = activeTab.id
  activeSubTabIdRef.current = activeSubTab?.id ?? null
  isMainViewRef.current = viewMode === 'main'

  const updateActiveSpaceData = (updater: (data: WorkspaceData) => WorkspaceData) => {
    setState((previous) => {
      const sanitizedPrevious = applyAutoPurgeToAppState(previous)
      return updateActiveSpaceDataInActiveDomain(sanitizedPrevious, updater)
    })
  }

  const areNavLocationsEqual = (a: NavLocation, b: NavLocation) =>
    a.viewMode === b.viewMode &&
    a.activeSpaceId === b.activeSpaceId &&
    a.mainTabId === b.mainTabId &&
    a.mainSubTabId === b.mainSubTabId &&
    a.trashTabId === b.trashTabId &&
    a.trashSubTabId === b.trashSubTabId

  const buildNavLocation = (): NavLocation => ({
    viewMode,
    activeSpaceId: activeSpace.id,
    mainTabId: workspace.activeTabId,
    mainSubTabId: activeTab.activeSubTabId,
    trashTabId,
    trashSubTabId,
  })

  const applyNavLocation = (location: NavLocation) => {
    setState((previous) => {
      const projected = setActiveSpaceInActiveDomain(previous, location.activeSpaceId)
      const fallbackSpace = projected.spaces[0]
      const resolvedSpace =
        projected.spaces.find((space) => space.id === location.activeSpaceId) ?? fallbackSpace
      const resolvedSpaceId = resolvedSpace?.id ?? projected.activeSpaceId

      return updateSpaceInActiveDomain(setActiveSpaceInActiveDomain(projected, resolvedSpaceId), resolvedSpaceId, (space) => {
        const data = space.data
        const resolvedTabId = data.tabs.some((tab) => tab.id === location.mainTabId)
          ? location.mainTabId
          : data.tabs[0]?.id ?? data.activeTabId

        const tabs = data.tabs.map((tab) => {
          if (tab.id !== resolvedTabId) return tab
          const resolvedSubTabId =
            location.mainSubTabId && tab.subTabs.some((sub) => sub.id === location.mainSubTabId)
              ? location.mainSubTabId
              : null
          return tab.activeSubTabId === resolvedSubTabId ? tab : { ...tab, activeSubTabId: resolvedSubTabId }
        })

        return {
          ...space,
          data: {
            ...data,
            activeTabId: resolvedTabId,
            tabs,
          },
        }
      })
    })

    setTrashTabId(location.trashTabId)
    setTrashSubTabId(location.trashSubTabId)
    setViewMode(location.viewMode)
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const navigateHistoryBy = (delta: number) => {
    const history = navHistoryRef.current
    if (history.length === 0) return
    const nextIndex = navIndexRef.current + delta
    if (nextIndex < 0 || nextIndex >= history.length) return
    flushPendingContent()
    navIndexRef.current = nextIndex
    isHistoryNavigationRef.current = true
    applyNavLocation(history[nextIndex])
  }

  const navigateToLastTabLikeLocation = () => {
    const history = navHistoryRef.current
    for (let index = navIndexRef.current - 1; index >= 0; index -= 1) {
      const candidate = history[index]
      if (candidate.viewMode !== 'main' && candidate.viewMode !== 'trash') continue
      flushPendingContent()
      navIndexRef.current = index
      isHistoryNavigationRef.current = true
      applyNavLocation(candidate)
      return true
    }
    return false
  }

  const applyContentToTarget = (spaceId: string, tabId: string, subTabId: string | null, markdown: string) => {
    setState((previous) => applyMarkdownToAppState(previous, spaceId, tabId, subTabId, markdown))
  }

  const buildStateWithLatestEditorContent = () => {
    let nextState = stateRef.current
    const pending = pendingContentRef.current
    if (pending) {
      return applyAutoPurgeToAppState(
        applyMarkdownToAppState(nextState, pending.spaceId, pending.tabId, pending.subTabId, pending.markdown),
      )
    }

    if (!isMainViewRef.current) return applyAutoPurgeToAppState(nextState)

    if (!editorRef.current) return applyAutoPurgeToAppState(nextState)
    const markdown = lastEditorMarkdownRef.current

    nextState = applyMarkdownToAppState(
      nextState,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      markdown,
    )
    return applyAutoPurgeToAppState(nextState)
  }

  const persistLatestStateSnapshot = () => {
    const latestState = buildStateWithLatestEditorContent()
    appStateStore.save(JSON.stringify(latestState))
  }

  useEffect(() => {
    window.__tabsGetLatestAppState = () => JSON.stringify(buildStateWithLatestEditorContent())
    return () => {
      delete window.__tabsGetLatestAppState
    }
  }, [])

  const flushPendingContent = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    if (pendingContentRef.current) {
      const pending = pendingContentRef.current
      pendingContentRef.current = null
      applyContentToTarget(pending.spaceId, pending.tabId, pending.subTabId, pending.markdown)
      return
    }

    if (!isMainViewRef.current) return

    if (!editorRef.current) return
    const markdown = lastEditorMarkdownRef.current
    applyContentToTarget(activeSpaceIdRef.current, activeTabIdRef.current, activeSubTabIdRef.current, markdown)
  }

  const scheduleContentCommit = (markdown: string, spaceId: string, tabId: string, subTabId: string | null) => {
    const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
    lastEditorMarkdownRef.current = normalizedMarkdown
    pendingContentRef.current = { spaceId, tabId, subTabId, markdown: normalizedMarkdown }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      if (!pendingContentRef.current) return
      const next = pendingContentRef.current
      pendingContentRef.current = null
      applyContentToTarget(next.spaceId, next.tabId, next.subTabId, next.markdown)
    }, 180)
  }

  const isTrashHomeSelected = viewMode === 'trash' && trashTabId === TRASH_HOME_ID
  const isEditorView = viewMode === 'main' || (viewMode === 'trash' && !isTrashHomeSelected)

  const commitCurrentEditorContent = () => {
    if (!isMainViewRef.current) return
    if (!editorRef.current) return
    const markdown = lastEditorMarkdownRef.current
    scheduleContentCommit(markdown, activeSpaceIdRef.current, activeTabIdRef.current, activeSubTabIdRef.current)
  }

  const focusEditorAtDocumentStart = () => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null

    const view = currentEditor?.wwEditor?.view
    if (!currentEditor || !view) {
      currentEditor?.focus()
      return
    }

    const firstPos = Math.min(1, Math.max(0, view.state.doc.content.size))
    const SelectionCtor = view.state.selection.constructor as {
      create?: (doc: unknown, anchor: number, head?: number) => unknown
    }

    if (typeof SelectionCtor.create === 'function') {
      const nextSelection = SelectionCtor.create(view.state.doc, firstPos, firstPos)
      view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
    }

    currentEditor.focus()
  }

  const clearActiveNoteContent = () => {
    if (!isMainViewRef.current) return
    const currentEditor = editorRef.current
    if (!currentEditor) return

    closeImageTools()
    closeLinkPrompt()
    clearMultiLineEdit(false)
    setContextMenu(null)

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    pendingContentRef.current = null
    normalizingContentRef.current = false
    lastEditorMarkdownRef.current = ''
    currentEditor.setMarkdown('', false)
    scheduleContentCommit('', activeSpaceIdRef.current, activeTabIdRef.current, activeSubTabIdRef.current)

    window.requestAnimationFrame(() => {
      focusEditorAtDocumentStart()
    })
  }

  const getActiveNoteHistoryKey = () =>
    [activeSpaceIdRef.current, activeTabIdRef.current, activeSubTabIdRef.current ?? '__home__'].join('::')

  const getNormalizedEditorMarkdown = (editor: Editor) =>
    normalizeMarkdownForPersistence(mergeLeadingIndentsFromWysiwyg(editor, editor.getMarkdown()))

  const recordMultiLineEditHistory = (
    beforeMarkdown: string,
    beforeState: MultiLineEditState,
    afterMarkdown: string,
    afterState: MultiLineEditState,
  ) => {
    if (beforeMarkdown === afterMarkdown) return
    multiLineEditHistoryRef.current = [
      ...multiLineEditHistoryRef.current.slice(-99),
      {
        noteKey: getActiveNoteHistoryKey(),
        beforeMarkdown,
        afterMarkdown,
        beforeState: cloneMultiLineEditState(beforeState),
        afterState: cloneMultiLineEditState(afterState),
      },
    ]
  }

  const scheduleMultiLineHistoryRestore = (direction: 'undo' | 'redo') => {
    const noteKey = getActiveNoteHistoryKey()
    window.requestAnimationFrame(() => {
      if (noteKey !== getActiveNoteHistoryKey()) return
      const currentEditor = editorRef.current
      if (!currentEditor) return

      const markdown = getNormalizedEditorMarkdown(currentEditor)
      const entries = multiLineEditHistoryRef.current
      const entry = [...entries]
        .reverse()
        .find((candidate) =>
          candidate.noteKey === noteKey &&
          (direction === 'undo' ? candidate.beforeMarkdown === markdown : candidate.afterMarkdown === markdown),
        )
      if (!entry) return

      multiLineEditRef.current = cloneMultiLineEditState(direction === 'undo' ? entry.beforeState : entry.afterState)
      syncMultiLineEditVisualSelection()
    })
  }

  const getEditorHistoryDirection = (event: KeyboardEvent): 'undo' | 'redo' | null => {
    const key = event.key.toLowerCase()
    const isMod = isMacPlatform ? event.metaKey : event.ctrlKey
    if (!isMod || event.altKey) return null
    if (key === 'z' && !event.shiftKey) return 'undo'
    if (key === 'z' && event.shiftKey) return 'redo'
    if (!isMacPlatform && key === 'y' && !event.shiftKey) return 'redo'
    return null
  }

  useEffect(() => {
    const flushOnExit = () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      persistLatestStateSnapshot()
    }

    window.addEventListener('beforeunload', flushOnExit)
    window.addEventListener('pagehide', flushOnExit)
    return () => {
      window.removeEventListener('beforeunload', flushOnExit)
      window.removeEventListener('pagehide', flushOnExit)
    }
  }, [])

  const tryApplyMultilineIndent = (outdent: boolean) => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null

    const view = currentEditor?.wwEditor?.view
    if (!currentEditor || !view) {
      return false
    }

    const { state } = view
    const { from, to, $from } = state.selection
    const isCollapsedSelection = from === to
    const selectedText = state.doc.textBetween(from, to, '\n')

    if (!selectedText.includes('\n')) {
      let tr: any = state.tr

      if (outdent) {
        const parentText = $from.parent.textContent ?? ''
        const parentStart = $from.start()
        const offsetInParent = Math.max(0, from - parentStart)
        const beforeCursor = parentText.slice(0, offsetInParent)
        const inlinePrefixLength = getTrailingIndentPrefixLength(beforeCursor)
        if (inlinePrefixLength > 0) {
          tr = tr.delete(from - inlinePrefixLength, from)
        } else {
          const linePrefixLength = getIndentPrefixLength(parentText)
          if (linePrefixLength <= 0) return false
          tr = tr.delete(parentStart, parentStart + linePrefixLength)
        }
      } else if (isCollapsedSelection) {
        tr = tr.insertText(INDENT_TOKEN, from)
      } else {
        tr = tr.insertText(INDENT_TOKEN, from)
      }

      const nextCaret = tr.mapping.map(from, 1)
      const nextFrom = tr.mapping.map(from, 1)
      const nextTo = tr.mapping.map(to, 1)
      view.dispatch(tr)
      const markdownAfterInlineIndent = normalizeMarkdownForPersistence(
        mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
      )
      lastEditorMarkdownRef.current = markdownAfterInlineIndent
      scheduleContentCommit(
        markdownAfterInlineIndent,
        activeSpaceIdRef.current,
        activeTabIdRef.current,
        activeSubTabIdRef.current,
      )
      window.requestAnimationFrame(() => {
        if (isCollapsedSelection) {
          ;(currentEditor as any).setSelection?.(nextCaret, nextCaret)
        } else {
          ;(currentEditor as any).setSelection?.(nextFrom, nextTo)
        }
        currentEditor.focus()
      })
      return true
    }

    const blockTargets: Array<{ pos: number; removeLength: number }> = []
    const seenBlockPositions = new Set<number>()
    const addBlockTarget = (node: any, contentStartPos: number) => {
      if (!node?.isTextblock || seenBlockPositions.has(contentStartPos)) return
      seenBlockPositions.add(contentStartPos)
      const text = node.textContent ?? ''
      const removeLength = outdent ? getIndentPrefixLength(text) : 0
      if (!outdent || removeLength > 0) {
        blockTargets.push({ pos: contentStartPos, removeLength })
      }
    }

    if (from === to) {
      addBlockTarget($from.parent, $from.start())
    } else {
      state.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (!node.isTextblock) return
        addBlockTarget(node, pos + 1)
        return false
      })
      if (blockTargets.length === 0) {
        addBlockTarget($from.parent, $from.start())
      }
    }

    if (blockTargets.length === 0) return false

    let tr: any = state.tr
    for (const target of [...blockTargets].sort((a, b) => b.pos - a.pos)) {
      tr = outdent ? tr.delete(target.pos, target.pos + target.removeLength) : tr.insertText(INDENT_TOKEN, target.pos)
    }

    const nextFrom = tr.mapping.map(from, -1)
    const nextTo = tr.mapping.map(to, 1)
    const nextCaret = tr.mapping.map(from, outdent ? -1 : 1)
    view.dispatch(tr)
    const markdownAfterIndent = normalizeMarkdownForPersistence(
      mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
    )
    lastEditorMarkdownRef.current = markdownAfterIndent
    scheduleContentCommit(
      markdownAfterIndent,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
    )
    window.requestAnimationFrame(() => {
      if (isCollapsedSelection) {
        ;(currentEditor as any).setSelection?.(nextCaret, nextCaret)
      } else {
        ;(currentEditor as any).setSelection?.(nextFrom, nextTo)
      }
      currentEditor.focus()
    })
    return true
  }

  const setMultiLineCursorWidgets = (view: any, positions: number[], selections: Array<{ from: number; to: number }> = []) => {
    const pluginKey = multiLineCursorPluginKeyRef.current
    if (!pluginKey) return
    view.dispatch(view.state.tr.setMeta(pluginKey, { cursors: positions, selections }).setMeta('addToHistory', false))
  }

  const clearMultiLineEdit = (collapseToHead = false) => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null
    const view = currentEditor?.wwEditor?.view
    const previous = multiLineEditRef.current
    multiLineEditRef.current = null
    if (view) {
      setMultiLineCursorWidgets(view, [])
    }
    if (!collapseToHead || !view || !previous) return

    const blockRanges = getEditorTextLineRanges(view)
    const clampedHeadIndex = Math.max(0, Math.min(blockRanges.length - 1, previous.headBlockIndex))
    const headRange = blockRanges[clampedHeadIndex]
    if (!headRange) return
    const caretPos = Math.min(headRange.end, headRange.start + getMultiLineColumnOffset(previous, clampedHeadIndex, headRange))
    const SelectionCtor = view.state.selection.constructor as {
      create?: (doc: unknown, anchor: number, head?: number) => unknown
    }
    if (typeof SelectionCtor.create !== 'function') return
    const nextSelection = SelectionCtor.create(view.state.doc, caretPos, caretPos)
    view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
  }

  const syncMultiLineEditVisualSelection = () => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null
    const view = currentEditor?.wwEditor?.view
    const multiLineEdit = multiLineEditRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) {
      multiLineEditRef.current = null
      return false
    }

    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length === 0) {
      multiLineEditRef.current = null
      setMultiLineCursorWidgets(view, [])
      return false
    }

    const anchorIndex = selectedIndices.includes(multiLineEdit.anchorBlockIndex)
      ? multiLineEdit.anchorBlockIndex
      : selectedIndices[0]
    const headIndex = selectedIndices.includes(multiLineEdit.headBlockIndex)
      ? multiLineEdit.headBlockIndex
      : selectedIndices[selectedIndices.length - 1]
    const anchorRange = blockRanges[anchorIndex]
    const headRange = blockRanges[headIndex]
    if (!anchorRange || !headRange) {
      multiLineEditRef.current = null
      return false
    }

    if (selectedIndices.length < 2) {
      multiLineEditRef.current = null
      setMultiLineCursorWidgets(view, [])
      const caretPos = Math.min(headRange.end, headRange.start + getMultiLineColumnOffset(multiLineEdit, headIndex, headRange))
      const SelectionCtor = view.state.selection.constructor as {
        create?: (doc: unknown, anchor: number, head?: number) => unknown
      }
      if (typeof SelectionCtor.create !== 'function') return false
      const nextSelection = SelectionCtor.create(view.state.doc, caretPos, caretPos)
      view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
      return false
    }

    const selectionAnchorOffsets = selectedIndices.reduce<Record<number, number>>((acc, blockIndex) => {
      const rawOffset = multiLineEdit.selectionAnchorOffsets?.[blockIndex]
      const range = blockRanges[blockIndex]
      if (typeof rawOffset === 'number' && range) {
        acc[blockIndex] = Math.max(0, Math.min(range.length, rawOffset))
      }
      return acc
    }, {})
    const normalizedMultiLineEdit: MultiLineEditState = {
      ...multiLineEdit,
      anchorBlockIndex: anchorIndex,
      headBlockIndex: headIndex,
      cursorBlockIndices: multiLineEdit.cursorBlockIndices ? selectedIndices : undefined,
      selectionAnchorOffsets: Object.keys(selectionAnchorOffsets).length > 0 ? selectionAnchorOffsets : undefined,
    }
    multiLineEditRef.current = normalizedMultiLineEdit

    const headOffset = getMultiLineColumnOffset(normalizedMultiLineEdit, headIndex, headRange)
    const headPos = Math.min(headRange.end, headRange.start + headOffset)
    const cursorPositions = selectedIndices
      .map((blockIndex) => {
        const range = blockRanges[blockIndex]
        return range ? Math.min(range.end, range.start + getMultiLineColumnOffset(normalizedMultiLineEdit, blockIndex, range)) : null
      })
      .filter((pos): pos is number => typeof pos === 'number' && pos !== headPos)
    const selectionDecorations = getMultiLineSelectionRanges(normalizedMultiLineEdit, selectedIndices, blockRanges).map(
      ({ from, to }) => ({ from, to }),
    )

    const SelectionCtor = view.state.selection.constructor as {
      create?: (doc: unknown, anchor: number, head?: number) => unknown
    }
    if (typeof SelectionCtor.create !== 'function') return false
    const nextSelection = SelectionCtor.create(view.state.doc, headPos, headPos)
    let tr = view.state.tr.setSelection(nextSelection).setMeta('addToHistory', false).scrollIntoView()
    const pluginKey = multiLineCursorPluginKeyRef.current
    if (pluginKey) {
      tr = tr.setMeta(pluginKey, { cursors: cursorPositions, selections: selectionDecorations })
    }
    view.dispatch(tr)
    currentEditor.focus()
    return true
  }

  const tryExpandMultilineSelection = (direction: 'up' | 'down') => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
          setSelection?: (start: number, end: number) => void
        })
      | null

    const view = currentEditor?.wwEditor?.view
    if (!currentEditor || !view) {
      return false
    }

    const { state } = view
    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) return false

    const existing = multiLineEditRef.current
    if (existing) {
      if (existing.cursorBlockIndices?.length) {
        const existingIndices = getMultiLineSelectedBlockIndices(existing, blockRanges)
        const nextHeadIndex =
          direction === 'down'
            ? Math.min(blockRanges.length - 1, existing.headBlockIndex + 1)
            : Math.max(0, existing.headBlockIndex - 1)
        if (nextHeadIndex === existing.headBlockIndex || existingIndices.includes(nextHeadIndex)) return false
        const nextHeadRange = blockRanges[nextHeadIndex]
        if (!nextHeadRange) return false
        const nextColumn = Math.min(nextHeadRange.length, getMultiLineHeadColumnOffset(existing, blockRanges))
        multiLineEditRef.current = {
          ...existing,
          headBlockIndex: nextHeadIndex,
          columnOffset: nextColumn,
          columnOffsets: {
            ...(existing.columnOffsets ?? {}),
            [nextHeadIndex]: nextColumn,
          },
          cursorBlockIndices: [...existingIndices, nextHeadIndex].sort((a, b) => a - b),
        }
        return syncMultiLineEditVisualSelection()
      }

      const nextHeadIndex =
        direction === 'down'
          ? Math.min(blockRanges.length - 1, existing.headBlockIndex + 1)
          : Math.max(0, existing.headBlockIndex - 1)
      if (nextHeadIndex === existing.headBlockIndex) return false
      multiLineEditRef.current = {
        ...existing,
        headBlockIndex: nextHeadIndex,
      }
      return syncMultiLineEditVisualSelection()
    }

    const headBlockIndex = findEditorTextLineRangeIndex(blockRanges, state.selection.head)
    if (headBlockIndex < 0) return false

    const targetIndex =
      direction === 'down'
        ? Math.min(blockRanges.length - 1, headBlockIndex + 1)
        : Math.max(0, headBlockIndex - 1)
    if (targetIndex === headBlockIndex) return false

    const currentHeadBlock = blockRanges[headBlockIndex]
    const columnOffset = Math.max(0, Math.min(currentHeadBlock.length, state.selection.head - currentHeadBlock.start))
    multiLineEditRef.current = {
      anchorBlockIndex: headBlockIndex,
      headBlockIndex: targetIndex,
      columnOffset,
    }
    return syncMultiLineEditVisualSelection()
  }

  useEffect(() => {
    window.__tabsHandleMultilineShortcut = (direction) => {
      if (!isEditorView) return false
      return tryExpandMultilineSelection(direction)
    }
    return () => {
      if (window.__tabsHandleMultilineShortcut) {
        delete window.__tabsHandleMultilineShortcut
      }
    }
  }, [isEditorView])

  const tryApplyMultiLineEditInput = (input: MultiLineEditInput) => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null
    const view = currentEditor?.wwEditor?.view
    const multiLineEdit = multiLineEditRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) {
      multiLineEditRef.current = null
      return false
    }

    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length < 2) {
      clearMultiLineEdit(true)
      return false
    }

    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    let tr = view.state.tr
    let changed = false
    const nextColumnOffsets: Record<number, number> = { ...(multiLineEdit.columnOffsets ?? {}) }

    for (const blockIndex of [...selectedIndices].sort((a, b) => b - a)) {
      const range = blockRanges[blockIndex]
      if (!range) continue
      const currentOffset = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)
      const cursorPos = Math.min(range.end, range.start + currentOffset)
      const selectionRange = getMultiLineSelectionRange(multiLineEdit, blockIndex, range)

      if (selectionRange && input.type !== 'split-line') {
        const mappedFrom = tr.mapping.map(selectionRange.from, -1)
        const mappedTo = tr.mapping.map(selectionRange.to, 1)
        if (input.type === 'insert-text') {
          tr = tr.insertText(input.text, mappedFrom, mappedTo)
          nextColumnOffsets[blockIndex] = selectionRange.fromOffset + input.text.length
        } else {
          tr = tr.delete(mappedFrom, mappedTo)
          nextColumnOffsets[blockIndex] = selectionRange.fromOffset
        }
        changed = true
        continue
      }

      if (input.type === 'insert-text') {
        tr = tr.insertText(input.text, cursorPos, cursorPos)
        nextColumnOffsets[blockIndex] = currentOffset + input.text.length
        changed = true
        continue
      }

      if (input.type === 'backspace') {
        if (cursorPos <= range.start) continue
        tr = tr.delete(cursorPos - 1, cursorPos)
        nextColumnOffsets[blockIndex] = Math.max(0, currentOffset - 1)
        changed = true
        continue
      }

      if (input.type === 'delete') {
        if (cursorPos >= range.end) continue
        tr = tr.delete(cursorPos, cursorPos + 1)
        changed = true
        continue
      }

      if (input.type === 'delete-word-backward') {
        const nextOffset = findPreviousWordColumn(range.text, currentOffset)
        if (nextOffset === currentOffset) continue
        tr = tr.delete(range.start + nextOffset, cursorPos)
        nextColumnOffsets[blockIndex] = nextOffset
        changed = true
        continue
      }

      if (input.type === 'delete-word-forward') {
        const nextOffset = findNextWordColumn(range.text, currentOffset)
        if (nextOffset === currentOffset) continue
        tr = tr.delete(cursorPos, range.start + nextOffset)
        changed = true
        continue
      }

      if (input.type === 'delete-to-line-start') {
        if (currentOffset <= 0) continue
        tr = tr.delete(range.start, cursorPos)
        nextColumnOffsets[blockIndex] = 0
        changed = true
        continue
      }

      if (input.type === 'delete-to-line-end') {
        if (currentOffset >= range.length) continue
        tr = tr.delete(cursorPos, range.end)
        changed = true
        continue
      }

      if (input.type === 'split-line') {
        const splitPos = selectionRange?.from ?? cursorPos
        const splitOffset = selectionRange?.fromOffset ?? currentOffset
        if (selectionRange) {
          const mappedFrom = tr.mapping.map(selectionRange.from, -1)
          const mappedTo = tr.mapping.map(selectionRange.to, 1)
          tr = tr.delete(mappedFrom, mappedTo)
          nextColumnOffsets[blockIndex] = splitOffset
        }
        const mappedPos = tr.mapping.map(splitPos, 1)
        if (isCodeBlockTextLineRange(range)) {
          tr = tr.insertText('\n', mappedPos, mappedPos)
          changed = true
          continue
        }
        const splitPlan = getMultiLineSplitPlan(tr.doc, mappedPos)
        if (!splitPlan) continue
        tr = tr.split(mappedPos, splitPlan.depth, splitPlan.typesAfter)
        changed = true
      }
    }

    if (!changed) return false

    let nextMultiLineEditState: MultiLineEditState | null = null
    view.dispatch(tr.scrollIntoView())
    if (input.type === 'split-line') {
      nextMultiLineEditState = buildSplitLineMultiLineState(multiLineEdit, selectedIndices)
    } else {
      nextMultiLineEditState = {
        ...multiLineEdit,
        columnOffset: nextColumnOffsets[multiLineEdit.headBlockIndex] ?? multiLineEdit.columnOffset,
        columnOffsets: nextColumnOffsets,
        selectionAnchorOffsets: undefined,
      }
    }

    multiLineEditRef.current = nextMultiLineEditState
    syncMultiLineEditVisualSelection()
    const markdownAfterMultiLineEdit = getNormalizedEditorMarkdown(currentEditor)
    lastEditorMarkdownRef.current = markdownAfterMultiLineEdit
    scheduleContentCommit(
      markdownAfterMultiLineEdit,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
    )
    if (multiLineEditRef.current) {
      recordMultiLineEditHistory(beforeMarkdown, beforeState, markdownAfterMultiLineEdit, multiLineEditRef.current)
    }
    currentEditor.focus()
    return true
  }

  const tryMoveMultiLineCursors = (movement: MultiLineCursorMovement, extendSelection = false) => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null
    const view = currentEditor?.wwEditor?.view
    const multiLineEdit = multiLineEditRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) {
      multiLineEditRef.current = null
      return false
    }

    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length < 2) {
      clearMultiLineEdit(true)
      return false
    }

    const nextState = moveMultiLineCursorState(multiLineEdit, selectedIndices, blockRanges, movement, { extendSelection })
    if (!nextState) return false
    multiLineEditRef.current = nextState
    syncMultiLineEditVisualSelection()
    return true
  }

  const getActiveMultiLineSelectionContext = () => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null
    const view = currentEditor?.wwEditor?.view
    const multiLineEdit = multiLineEditRef.current
    if (!currentEditor || !view || !multiLineEdit) return null

    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) return null
    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length < 2) return null
    const selectionRanges = getMultiLineSelectionRanges(multiLineEdit, selectedIndices, blockRanges)
    if (selectionRanges.length === 0) return null

    return {
      currentEditor,
      view,
      multiLineEdit,
      selectedIndices,
      selectionRanges,
    }
  }

  const writeClipboardText = (clipboardData: DataTransfer | null, text: string) => {
    if (clipboardData) {
      clipboardData.setData('text/plain', text)
      return true
    }
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text)
      return true
    }
    return false
  }

  const copyMultiLineSelectionToClipboard = (clipboardData: DataTransfer | null) => {
    const context = getActiveMultiLineSelectionContext()
    if (!context) return false

    const text = context.selectionRanges.map((range) => range.text).join('\n')
    return writeClipboardText(clipboardData, text)
  }

  const cutMultiLineSelectionToClipboard = (clipboardData: DataTransfer | null) => {
    const context = getActiveMultiLineSelectionContext()
    if (!context) return false

    const text = context.selectionRanges.map((range) => range.text).join('\n')
    if (!writeClipboardText(clipboardData, text)) return false

    const { currentEditor, view, multiLineEdit, selectionRanges } = context
    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    const nextColumnOffsets: Record<number, number> = { ...(multiLineEdit.columnOffsets ?? {}) }
    let tr = view.state.tr

    for (const selectionRange of [...selectionRanges].sort((a, b) => b.from - a.from)) {
      const mappedFrom = tr.mapping.map(selectionRange.from, -1)
      const mappedTo = tr.mapping.map(selectionRange.to, 1)
      tr = tr.delete(mappedFrom, mappedTo)
      nextColumnOffsets[selectionRange.blockIndex] = selectionRange.fromOffset
    }

    view.dispatch(tr.scrollIntoView())
    multiLineEditRef.current = {
      ...multiLineEdit,
      columnOffset: nextColumnOffsets[multiLineEdit.headBlockIndex] ?? multiLineEdit.columnOffset,
      columnOffsets: nextColumnOffsets,
      selectionAnchorOffsets: undefined,
    }
    syncMultiLineEditVisualSelection()

    const markdownAfterCut = getNormalizedEditorMarkdown(currentEditor)
    lastEditorMarkdownRef.current = markdownAfterCut
    scheduleContentCommit(
      markdownAfterCut,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
    )
    if (multiLineEditRef.current) {
      recordMultiLineEditHistory(beforeMarkdown, beforeState, markdownAfterCut, multiLineEditRef.current)
    }
    currentEditor.focus()
    return true
  }

  const isLikelyUrl = (value: string) => {
    try {
      const normalized = value.trim()
      const url = new URL(normalized)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  const openLinkPrompt = (url: string, top: number, left: number, text?: string) => {
    setLinkPrompt({
      open: true,
      top,
      left,
      url,
      text: text && text.trim().length > 0 ? text : '',
    })
    window.setTimeout(() => {
      const input = linkPromptInputRef.current
      if (!input) return
      input.focus()
      input.select()
    }, 10)
  }

  const closeLinkPrompt = () => {
    setLinkPrompt({ open: false, top: 0, left: 0, url: '', text: '' })
  }

  const insertNamedLinkFromPrompt = () => {
    if (!linkPrompt.url) return
    const label = linkPrompt.text.trim() || linkPrompt.url
    const markdownLink = `[${label}](${linkPrompt.url})`
    editorRef.current?.focus()
    document.execCommand('insertText', false, markdownLink)
    closeLinkPrompt()
    commitCurrentEditorContent()
  }

  const closeImageTools = () => {
    activeImageRef.current = null
    imageResizeRef.current = null
    inlineCropDragRef.current = {
      mode: null,
      startX: 0,
      startY: 0,
      startRelX: 0,
      startRelY: 0,
      startRelWidth: 1,
      startRelHeight: 1,
    }
    setInlineCrop({ active: false, relX: 0, relY: 0, relWidth: 1, relHeight: 1, top: 0, left: 0, width: 0, height: 0 })
    setImageTools({ visible: false, cropTop: 0, cropLeft: 0, resizeTop: 0, resizeLeft: 0 })
  }

  const refreshImageToolsPosition = () => {
    const image = activeImageRef.current
    if (!image || !image.isConnected) {
      closeImageTools()
      return
    }
    const rect = image.getBoundingClientRect()
    setImageTools({
      visible: true,
      cropTop: Math.max(8, rect.top + 4),
      cropLeft: Math.max(8, rect.left + 4),
      resizeTop: Math.max(8, rect.bottom - 2),
      resizeLeft: Math.max(8, rect.right - 2),
    })

    setInlineCrop((previous) => {
      if (!previous.active) return previous
      const width = Math.max(24, previous.relWidth * rect.width)
      const height = Math.max(24, previous.relHeight * rect.height)
      const x = Math.max(0, Math.min(rect.width - width, previous.relX * rect.width))
      const y = Math.max(0, Math.min(rect.height - height, previous.relY * rect.height))
      return {
        ...previous,
        relX: rect.width > 0 ? x / rect.width : 0,
        relY: rect.height > 0 ? y / rect.height : 0,
        relWidth: rect.width > 0 ? width / rect.width : previous.relWidth,
        relHeight: rect.height > 0 ? height / rect.height : previous.relHeight,
        top: rect.top + y,
        left: rect.left + x,
        width,
        height,
      }
    })
  }

  const selectImageForTools = (image: HTMLImageElement) => {
    activeImageRef.current = image
    refreshImageToolsPosition()
  }

  const buildClipboardImagePayload = async (image: HTMLImageElement) => {
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('image load failed'))
      })
    }

    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (width <= 0 || height <= 0) return null

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null

    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png')
    })
    if (!blob) return null

    return {
      blob,
      dataUrl: canvas.toDataURL('image/png'),
    }
  }

  const copySelectedImageToClipboard = async () => {
    const image = activeImageRef.current
    if (!image) {
      pushToast('no image selected to copy.', 'warning')
      return false
    }

    try {
      const payload = await buildClipboardImagePayload(image)
      if (!payload) throw new Error('clipboard image payload failed')

      if (window.electronAPI?.copyImageDataUrl) {
        const result = await window.electronAPI.copyImageDataUrl(payload.dataUrl)
        if (!result?.ok) {
          throw new Error(result?.error ?? 'clipboard write failed')
        }
      } else if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ [payload.blob.type]: payload.blob })])
      } else {
        throw new Error('clipboard image write unsupported')
      }

      pushToast('image copied.', 'success')
      return true
    } catch {
      pushToast('could not copy image.', 'warning')
      return false
    }
  }

  const beginImageResize = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (inlineCrop.active) return
    const image = activeImageRef.current
    if (!image || !image.isConnected) return
    imageResizeRef.current = {
      startX: event.clientX,
      startWidth: image.getBoundingClientRect().width || image.width || image.naturalWidth || 160,
    }
  }

  const continueImageResize = (clientX: number) => {
    const image = activeImageRef.current
    const resize = imageResizeRef.current
    if (!image || !resize) return
    const nextWidth = Math.max(80, Math.round(resize.startWidth + (clientX - resize.startX)))
    image.style.width = `${nextWidth}px`
    image.style.maxWidth = '100%'
    image.style.height = 'auto'
    image.setAttribute('width', String(nextWidth))
    refreshImageToolsPosition()
  }

  const startInlineCrop = () => {
    const image = activeImageRef.current
    if (!image || !image.isConnected) return
    const rect = image.getBoundingClientRect()
    setInlineCrop({
      active: true,
      relX: 0,
      relY: 0,
      relWidth: 1,
      relHeight: 1,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    })
  }

  const cancelInlineCrop = () => {
    inlineCropDragRef.current = {
      mode: null,
      startX: 0,
      startY: 0,
      startRelX: 0,
      startRelY: 0,
      startRelWidth: 1,
      startRelHeight: 1,
    }
    setInlineCrop((previous) => ({ ...previous, active: false, top: 0, left: 0, width: 0, height: 0 }))
  }

  const applyInlineCrop = async () => {
    const image = activeImageRef.current
    if (!image || !inlineCrop.active || !image.src) return

    const sourceImage = new Image()
    sourceImage.src = image.src
    await new Promise<void>((resolve, reject) => {
      sourceImage.onload = () => resolve()
      sourceImage.onerror = () => reject(new Error('image load failed'))
    })

    const naturalWidth = sourceImage.naturalWidth
    const naturalHeight = sourceImage.naturalHeight
    if (naturalWidth <= 0 || naturalHeight <= 0) return

    const rect = image.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const widthPx = inlineCrop.width
    const heightPx = inlineCrop.height
    const xPx = inlineCrop.left - rect.left
    const yPx = inlineCrop.top - rect.top

    const sourceX = Math.max(0, Math.min(naturalWidth, (xPx / rect.width) * naturalWidth))
    const sourceY = Math.max(0, Math.min(naturalHeight, (yPx / rect.height) * naturalHeight))
    const sourceWidth = Math.max(8, Math.min((widthPx / rect.width) * naturalWidth, naturalWidth - sourceX))
    const sourceHeight = Math.max(8, Math.min((heightPx / rect.height) * naturalHeight, naturalHeight - sourceY))
    const outputWidth = Math.max(8, Math.round(sourceWidth))
    const outputHeight = Math.max(8, Math.round(sourceHeight))

    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) return

    context.drawImage(sourceImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight)
    const nextDataUrl = canvas.toDataURL('image/png')

    const renderedWidth = inlineCrop.width
    const renderedHeight = inlineCrop.height
    image.src = nextDataUrl
    image.style.width = `${Math.round(renderedWidth)}px`
    image.style.height = `${Math.round(renderedHeight)}px`
    image.setAttribute('width', String(Math.round(renderedWidth)))
    image.setAttribute('height', String(Math.round(renderedHeight)))
    image.style.maxWidth = 'none'
    cancelInlineCrop()
    refreshImageToolsPosition()
    commitCurrentEditorContent()
  }

  const beginInlineCropDrag = (mode: 'move' | 'resize', event: React.PointerEvent<HTMLElement>) => {
    if (!inlineCrop.active) return
    event.preventDefault()
    event.stopPropagation()
    inlineCropDragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startRelX: inlineCrop.relX,
      startRelY: inlineCrop.relY,
      startRelWidth: inlineCrop.relWidth,
      startRelHeight: inlineCrop.relHeight,
    }
  }

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (imageResizeRef.current) {
        continueImageResize(event.clientX)
      }

      const drag = inlineCropDragRef.current
      if (!drag.mode || !inlineCrop.active) return
      const image = activeImageRef.current
      if (!image || !image.isConnected) return
      const rect = image.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const startX = drag.startRelX * rect.width
      const startY = drag.startRelY * rect.height
      const startWidth = Math.max(24, drag.startRelWidth * rect.width)
      const startHeight = Math.max(24, drag.startRelHeight * rect.height)
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY

      if (drag.mode === 'move') {
        const nextX = Math.max(0, Math.min(rect.width - startWidth, startX + dx))
        const nextY = Math.max(0, Math.min(rect.height - startHeight, startY + dy))
        setInlineCrop((previous) => ({
          ...previous,
          relX: rect.width > 0 ? nextX / rect.width : 0,
          relY: rect.height > 0 ? nextY / rect.height : 0,
          top: rect.top + nextY,
          left: rect.left + nextX,
          width: startWidth,
          height: startHeight,
        }))
        return
      }

      const nextWidth = Math.max(24, Math.min(rect.width - startX, startWidth + dx))
      const nextHeight = Math.max(24, Math.min(rect.height - startY, startHeight + dy))
      setInlineCrop((previous) => ({
        ...previous,
        relWidth: rect.width > 0 ? nextWidth / rect.width : previous.relWidth,
        relHeight: rect.height > 0 ? nextHeight / rect.height : previous.relHeight,
        top: rect.top + startY,
        left: rect.left + startX,
        width: nextWidth,
        height: nextHeight,
      }))
    }

    const handlePointerUp = () => {
      if (imageResizeRef.current) {
        imageResizeRef.current = null
        commitCurrentEditorContent()
      }
      inlineCropDragRef.current = {
        mode: null,
        startX: 0,
        startY: 0,
        startRelX: 0,
        startRelY: 0,
        startRelWidth: 1,
        startRelHeight: 1,
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [inlineCrop.active])

  useEffect(() => {
    if (!isEditorView) return
    if (!editorMountRef.current || editorRef.current) return

    lastEditorMarkdownRef.current = displayContent
    editorRef.current = new Editor({
      el: editorMountRef.current,
      initialValue: displayContent,
      initialEditType: 'wysiwyg',
      previewStyle: 'tab',
      hideModeSwitch: true,
      toolbarItems: EDITOR_TOOLBAR_ITEMS,
      height: '100%',
      usageStatistics: false,
      plugins: [
        headingSpaceShortcutPlugin,
        thematicBreakShortcutPlugin,
        (context: {
          pmState: {
            PluginKey: new (name?: string) => {
              getState: (state: unknown) =>
                | {
                    cursors: number[]
                    selections: Array<{ from: number; to: number }>
                  }
                | undefined
            }
            Plugin: new (spec: {
              key?: unknown
              state?: {
                init: () => {
                  cursors: number[]
                  selections: Array<{ from: number; to: number }>
                }
                apply: (
                  tr: { getMeta: (key: unknown) => unknown },
                  previous: {
                    cursors: number[]
                    selections: Array<{ from: number; to: number }>
                  },
                ) => {
                  cursors: number[]
                  selections: Array<{ from: number; to: number }>
                }
              }
              props?: {
                decorations?: (state: unknown) => unknown
                handleDOMEvents?: {
                  keydown?: (view: unknown, event: KeyboardEvent) => boolean
                }
              }
            }) => unknown
          }
          pmView: {
            Decoration: {
              inline: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
              widget: (pos: number, toDOM: () => HTMLElement, spec?: Record<string, unknown>) => unknown
            }
            DecorationSet: {
              create: (doc: unknown, decorations: unknown[]) => unknown
            }
          }
          pmKeymap: { keymap: (bindings: Record<string, unknown>) => unknown }
        }) =>
          multiLineSelectionShortcutPlugin({
            ...context,
            onExpand: tryExpandMultilineSelection,
            onPluginKeyReady: (pluginKey) => {
              multiLineCursorPluginKeyRef.current = pluginKey
            },
          }),
      ],
      hooks: {
        addImageBlobHook: (blob: Blob | File, callback: (url: string, text?: string) => void) => {
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : ''
            if (!dataUrl) return
            callback(dataUrl, blob instanceof File ? blob.name : 'image')
            window.setTimeout(() => commitCurrentEditorContent(), 30)
          }
          reader.readAsDataURL(blob)
        },
      },
      events: {
        change: () => {
          if (!isMainViewRef.current) return
          const currentEditor = editorRef.current
          if (!currentEditor) return
          const markdown = normalizeMarkdownForPersistence(
            mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
          )
          const previousMarkdown = lastEditorMarkdownRef.current

          if (normalizingContentRef.current) {
            normalizingContentRef.current = false
            const normalizedMarkdown = lastEditorMarkdownRef.current
            scheduleContentCommit(
              normalizedMarkdown,
              activeSpaceIdRef.current,
              activeTabIdRef.current,
              activeSubTabIdRef.current,
            )
            return
          }

          const normalized = normalizeHeadingMarkers(markdown)
          if (normalized !== markdown) {
            lastEditorMarkdownRef.current = normalized
            scheduleContentCommit(normalized, activeSpaceIdRef.current, activeTabIdRef.current, activeSubTabIdRef.current)
            return
          }

          const materializedHorizontalRule = materializeHorizontalRuleShortcut(previousMarkdown, markdown)
          if (materializedHorizontalRule && materializedHorizontalRule !== markdown) {
            normalizingContentRef.current = true
            lastEditorMarkdownRef.current = materializedHorizontalRule
            currentEditor.setMarkdown(materializedHorizontalRule, false)
            return
          }

          maybeShowCompletedTaskUndoHint(markdown)
          lastEditorMarkdownRef.current = markdown
          scheduleContentCommit(markdown, activeSpaceIdRef.current, activeTabIdRef.current, activeSubTabIdRef.current)
        },
      },
    })

    installClearToolbarButton(editorMountRef.current, clearActiveNoteContent)
    const cleanupHeadingPopupActiveState = installHeadingPopupActiveState(editorMountRef.current, () => editorRef.current)
    const cleanupCompletedTaskCheckboxBehavior = installCompletedTaskCheckboxBehavior(
      editorMountRef.current,
      () => editorRef.current,
      trackCompletedTaskQuickDelete,
    )
    const cleanupTaskTextReorderBehavior = installTaskTextReorderBehavior(editorMountRef.current, () => editorRef.current)

    return () => {
      cleanupTaskTextReorderBehavior()
      cleanupCompletedTaskCheckboxBehavior()
      cleanupHeadingPopupActiveState()
      flushPendingContent()
      closeImageTools()
      try {
        editorRef.current?.destroy()
      } catch {
        // Toast UI can throw during teardown if the toolbar DOM was customized.
      }
      editorRef.current = null
      multiLineCursorPluginKeyRef.current = null
      if (editorMountRef.current) {
        editorMountRef.current.innerHTML = ''
      }
    }
  }, [isEditorView])

  useEffect(() => {
    if (viewMode !== 'main') {
      clearMultiLineEdit(false)
      closeImageTools()
      closeLinkPrompt()
      return
    }

    const root = editorMountRef.current
    if (!root) return

    const handlePointerDown = (event: Event) => {
      clearMultiLineEdit(false)
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        closeImageTools()
        closeLinkPrompt()
        return
      }
      if (
        target.closest('.image-tools') ||
        target.closest('.image-resize-handle') ||
        target.closest('.inline-crop-box') ||
        target.closest('.inline-crop-resize-handle') ||
        target.closest('.link-prompt')
      ) {
        return
      }
      const image = target.closest('img')
      if (image instanceof HTMLImageElement) {
        selectImageForTools(image)
        return
      }
      const anchor = target.closest('a')
      if (anchor instanceof HTMLAnchorElement) {
        event.preventDefault()
        const rect = anchor.getBoundingClientRect()
        const href = anchor.getAttribute('href') ?? ''
        const text = anchor.textContent ?? ''
        openLinkPrompt(href, Math.max(8, rect.bottom + 6), Math.max(8, rect.left), text)
        return
      }
      closeImageTools()
      closeLinkPrompt()
    }

    const handleContextMenu = (event: Event) => {
      const mouseEvent = event as globalThis.MouseEvent
      const target = mouseEvent.target
      if (!(target instanceof HTMLElement)) return
      const image = target.closest('img')
      if (!(image instanceof HTMLImageElement)) return
      mouseEvent.preventDefault()
      selectImageForTools(image)
      setContextMenu({
        type: 'image',
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
      })
    }

    const handleScrollOrResize = () => {
      if (!activeImageRef.current) return
      refreshImageToolsPosition()
    }

    const handlePaste = (event: Event) => {
      const pasteEvent = event as ClipboardEvent
      if (multiLineEditRef.current) {
        const text = pasteEvent.clipboardData?.getData('text/plain') ?? ''
        if (text.length > 0 && tryApplyMultiLineEditInput({ type: 'insert-text', text })) {
          pasteEvent.preventDefault()
          return
        }
      }
      const text = pasteEvent.clipboardData?.getData('text/plain')?.trim() ?? ''
      if (!text || !isLikelyUrl(text)) return

      const selection = window.getSelection()
      if (!selection || !selection.rangeCount) return
      const rangeRect = selection.getRangeAt(0).getBoundingClientRect()
      pasteEvent.preventDefault()
      openLinkPrompt(
        text,
        Math.max(8, rangeRect.bottom + 8),
        Math.max(8, rangeRect.left),
        '',
      )
    }

    const handleCopy = (event: Event) => {
      const clipboardEvent = event as ClipboardEvent
      if (copyMultiLineSelectionToClipboard(clipboardEvent.clipboardData)) {
        clipboardEvent.preventDefault()
        return
      }
      const selection = window.getSelection()
      const hasTextSelection = Boolean(selection && selection.toString().trim().length > 0)
      if (!activeImageRef.current || hasTextSelection) return
      clipboardEvent.preventDefault()
      void copySelectedImageToClipboard()
    }

    const handleCut = (event: Event) => {
      const clipboardEvent = event as ClipboardEvent
      if (!cutMultiLineSelectionToClipboard(clipboardEvent.clipboardData)) return
      clipboardEvent.preventDefault()
      clipboardEvent.stopPropagation()
    }

    const handleKeyDown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent
      const editorHistoryDirection = getEditorHistoryDirection(keyboardEvent)
      if (editorHistoryDirection) {
        scheduleMultiLineHistoryRestore(editorHistoryDirection)
      }

      const multiLineDirection = getMultilineSelectionShortcutDirection(keyboardEvent)
      if (multiLineDirection) {
        const handled = tryExpandMultilineSelection(multiLineDirection)
        if (handled) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
        }
        return
      }
      if (multiLineEditRef.current) {
        let handled = false
        if (keyboardEvent.key === 'Backspace') {
          if (keyboardEvent.metaKey) {
            handled = tryApplyMultiLineEditInput({ type: 'delete-to-line-start' }) || true
          } else if (keyboardEvent.altKey) {
            handled = tryApplyMultiLineEditInput({ type: 'delete-word-backward' }) || true
          } else {
            handled = tryApplyMultiLineEditInput({ type: 'backspace' }) || true
          }
        } else if (keyboardEvent.key === 'Delete') {
          if (keyboardEvent.metaKey) {
            handled = tryApplyMultiLineEditInput({ type: 'delete-to-line-end' }) || true
          } else if (keyboardEvent.altKey) {
            handled = tryApplyMultiLineEditInput({ type: 'delete-word-forward' }) || true
          } else {
            handled = tryApplyMultiLineEditInput({ type: 'delete' }) || true
          }
        } else if (keyboardEvent.key === 'Enter') {
          handled = tryApplyMultiLineEditInput({ type: 'split-line' })
        } else if (keyboardEvent.key === 'Escape') {
          clearMultiLineEdit(true)
          handled = true
        } else if (keyboardEvent.key === 'Tab' && !keyboardEvent.metaKey && !keyboardEvent.ctrlKey && !keyboardEvent.altKey) {
          handled = keyboardEvent.shiftKey
            ? tryApplyMultiLineEditInput({ type: 'backspace' })
            : tryApplyMultiLineEditInput({ type: 'insert-text', text: INDENT_TOKEN })
        } else if (keyboardEvent.key === 'ArrowLeft') {
          handled = tryMoveMultiLineCursors(
            keyboardEvent.altKey ? 'word-left' : keyboardEvent.metaKey || keyboardEvent.ctrlKey ? 'line-start' : 'left',
            keyboardEvent.shiftKey,
          )
        } else if (keyboardEvent.key === 'ArrowRight') {
          handled = tryMoveMultiLineCursors(
            keyboardEvent.altKey ? 'word-right' : keyboardEvent.metaKey || keyboardEvent.ctrlKey ? 'line-end' : 'right',
            keyboardEvent.shiftKey,
          )
        } else if (keyboardEvent.key === 'ArrowUp') {
          handled = tryMoveMultiLineCursors('up')
        } else if (keyboardEvent.key === 'ArrowDown') {
          handled = tryMoveMultiLineCursors('down')
        } else if (keyboardEvent.key === 'Home') {
          handled = tryMoveMultiLineCursors('line-start', keyboardEvent.shiftKey)
        } else if (keyboardEvent.key === 'End') {
          handled = tryMoveMultiLineCursors('line-end', keyboardEvent.shiftKey)
        } else if (
          keyboardEvent.key.length === 1 &&
          !keyboardEvent.metaKey &&
          !keyboardEvent.ctrlKey &&
          !keyboardEvent.altKey
        ) {
          handled = tryApplyMultiLineEditInput({ type: 'insert-text', text: keyboardEvent.key })
        } else if (keyboardEvent.key === 'PageUp' || keyboardEvent.key === 'PageDown') {
          handled = true
        }
        if (handled) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          return
        }
      }
      if (keyboardEvent.key !== 'Tab' || keyboardEvent.altKey || keyboardEvent.ctrlKey || keyboardEvent.metaKey) return
      const handled = tryApplyMultilineIndent(keyboardEvent.shiftKey)
      if (!handled) return
      keyboardEvent.preventDefault()
      keyboardEvent.stopPropagation()
    }

    const handleBeforeInput = (event: Event) => {
      const inputEvent = event as InputEvent
      if (inputEvent.inputType === 'historyUndo' || inputEvent.inputType === 'historyRedo') {
        scheduleMultiLineHistoryRestore(inputEvent.inputType === 'historyUndo' ? 'undo' : 'redo')
        return
      }
      if (!multiLineEditRef.current) return
      if (inputEvent.isComposing) return
      if (inputEvent.inputType === 'insertText' || inputEvent.inputType === 'insertCompositionText') {
        const text = inputEvent.data ?? ''
        if (!text) return
        const handled = tryApplyMultiLineEditInput({ type: 'insert-text', text })
        if (!handled) return
        inputEvent.preventDefault()
        inputEvent.stopPropagation()
      }
    }

    root.addEventListener('pointerdown', handlePointerDown, true)
    root.addEventListener('contextmenu', handleContextMenu, true)
    root.addEventListener('paste', handlePaste, true)
    root.addEventListener('copy', handleCopy, true)
    root.addEventListener('cut', handleCut, true)
    root.addEventListener('keydown', handleKeyDown, true)
    root.addEventListener('beforeinput', handleBeforeInput, true)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      root.removeEventListener('pointerdown', handlePointerDown, true)
      root.removeEventListener('contextmenu', handleContextMenu, true)
      root.removeEventListener('paste', handlePaste, true)
      root.removeEventListener('copy', handleCopy, true)
      root.removeEventListener('cut', handleCut, true)
      root.removeEventListener('keydown', handleKeyDown, true)
      root.removeEventListener('beforeinput', handleBeforeInput, true)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [viewMode, displayContent])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const instance = editorRef.current
    if (!instance) return

    const existing = instance.getMarkdown()
    if (existing !== displayContent) {
      lastEditorMarkdownRef.current = displayContent
      instance.setMarkdown(displayContent, false)
    }
  }, [displayContent, viewMode, activeSpace.id, activeTab.id, activeSubTab?.id, trashTabId, trashSubTabId])

  const commitRename = (type: EditableEntityType, id: string, nextTitle: string) => {
    if (type === 'tab' || type === 'subtab') {
      flushPendingContent()
    }
    const title = nextTitle.trim()
    setEditing(null)
    if (
      (type === 'tab' || type === 'subtab') &&
      pendingCreatedEditRef.current?.type === type &&
      pendingCreatedEditRef.current.id === id
    ) {
      pendingCreatedEditRef.current = null
    }
    if (!title) return

    if (type === 'domain') {
      setState((previous) => renameDomain(previous, id, title))
      return
    }

    if (type === 'space') {
      setState((previous) => renameSpaceInActiveDomain(previous, id, title))
      return
    }

    const focusEditorSoon = () => {
      if (viewMode !== 'main') return
      window.requestAnimationFrame(() => {
        editorRef.current?.focus()
      })
    }

    if (type === 'tab') {
      updateActiveSpaceData((data) => ({
        ...data,
        tabs: data.tabs.map((tab) => (tab.id === id ? { ...tab, title } : tab)),
      }))
      focusEditorSoon()
      return
    }

    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== data.activeTabId) return tab
        return {
          ...tab,
          subTabs: tab.subTabs.map((sub) => {
            if (sub.id !== id) return sub
            const pending = pendingContentRef.current
            const pendingMatches =
              pending &&
              pending.spaceId === activeSpaceIdRef.current &&
              pending.tabId === data.activeTabId &&
              pending.subTabId === id
            const latest = pendingMatches ? pending.markdown : editorRef.current ? lastEditorMarkdownRef.current : sub.content
            return { ...sub, title, content: latest }
          }),
        }
      }),
    }))

    pendingContentRef.current = null
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    focusEditorSoon()
  }

  const shouldSkipRenameBlur = (type: EditableEntityType, id: string) => {
    const next = skipRenameBlurRef.current
    if (!next || next.type !== type || next.id !== id) return false
    skipRenameBlurRef.current = null
    return true
  }

  const discardPendingCreatedEdit = (type: 'tab' | 'subtab', id: string) => {
    const pending = pendingCreatedEditRef.current
    if (!pending || pending.type !== type || pending.id !== id) {
      setEditing(null)
      return
    }

    pendingCreatedEditRef.current = null
    setEditing(null)

    if (pending.type === 'tab') {
      updateActiveSpaceData((data) => {
        const remainingTabs = data.tabs.filter((tab) => tab.id !== id)
        const fallbackTabId =
          remainingTabs.find((tab) => tab.id === pending.previousTabId)?.id ?? remainingTabs[0]?.id ?? data.activeTabId
        return {
          ...data,
          activeTabId: fallbackTabId,
          tabs: remainingTabs,
        }
      })
      return
    }

    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== pending.parentTabId) return tab
        const remainingSubTabs = tab.subTabs.filter((subTab) => subTab.id !== id)
        const fallbackSubTabId =
          remainingSubTabs.find((subTab) => subTab.id === pending.previousSubTabId)?.id ?? null
        return {
          ...tab,
          activeSubTabId: fallbackSubTabId,
          subTabs: remainingSubTabs,
        }
      }),
    }))
  }

  const cancelRename = (type: EditableEntityType, id: string) => {
    skipRenameBlurRef.current = { type, id }
    if (type === 'space' || type === 'domain') {
      setEditing(null)
      return
    }
    discardPendingCreatedEdit(type, id)
  }

  const addTab = () => {
    flushPendingContent()
    const newTab = {
      ...createTab('tab'),
      homeContent: '',
    }

    updateActiveSpaceData((data) => ({
      ...data,
      activeTabId: newTab.id,
      tabs: [...data.tabs, newTab],
    }))

    pendingCreatedEditRef.current = { type: 'tab', id: newTab.id, previousTabId: workspace.activeTabId }
    setEditing({ type: 'tab', id: newTab.id })
  }

  const addSubTab = () => {
    flushPendingContent()
    const newSubTab = createSubTab('tab', '')

    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) =>
        tab.id === data.activeTabId
          ? { ...tab, activeSubTabId: newSubTab.id, subTabs: [...tab.subTabs, newSubTab] }
          : tab,
      ),
    }))

    pendingCreatedEditRef.current = {
      type: 'subtab',
      id: newSubTab.id,
      parentTabId: activeTab.id,
      previousSubTabId: activeTab.activeSubTabId,
    }
    setEditing({ type: 'subtab', id: newSubTab.id })
  }

  const selectTab = (tabId: string) => {
    if (activeTab.id === tabId && activeTab.activeSubTabId === null) return
    flushPendingContent()
    updateActiveSpaceData((data) => ({
      ...data,
      activeTabId: tabId,
      tabs: data.tabs.map((tab) => (tab.id === tabId ? { ...tab, activeSubTabId: null } : tab)),
    }))
  }

  const selectSubTab = (subTabId: string) => {
    if (activeTab.activeSubTabId === subTabId) return
    flushPendingContent()
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) =>
        tab.id === data.activeTabId ? { ...tab, activeSubTabId: subTabId } : tab,
      ),
    }))
  }

  const selectParentHomeTab = () => {
    if (activeTab.activeSubTabId === null) return
    flushPendingContent()
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) =>
        tab.id === data.activeTabId ? { ...tab, activeSubTabId: null } : tab,
      ),
    }))
  }

  const openSpace = (spaceId: string) => {
    flushPendingContent()
    if (arrangeMode.active) {
      exitArrangeMode()
    }
    setState((previous) => setActiveSpaceInActiveDomain(previous, spaceId))
    setViewMode('main')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const addSpace = () => {
    flushPendingContent()
    const newSpace = createSpace('New Space')
    setState((previous) => addSpaceToActiveDomain(previous, newSpace))
    setViewMode('spaces')
    setEditing({ type: 'space', id: newSpace.id })
    setMenuOpen(false)
  }

  const duplicateSpaceFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'space') return
    const sourceSpace = state.spaces.find((space) => space.id === contextMenu.spaceId)
    if (!sourceSpace) {
      setContextMenu(null)
      return
    }

    const duplicatedSpace = duplicateSpace(sourceSpace, state.spaces.map((space) => space.name))

    setState((previous) => insertSpaceAfterInActiveDomain(previous, sourceSpace.id, duplicatedSpace))

    setViewMode('spaces')
    setEditing({ type: 'space', id: duplicatedSpace.id })
    setMenuOpen(false)
    setContextMenu(null)
  }

  const openSpacesView = () => {
    flushPendingContent()
    if (arrangeMode.active) {
      exitArrangeMode()
    }
    setViewMode('spaces')
    setMenuOpen(false)
    setContextMenu(null)
  }

  const openDomainsView = () => {
    flushPendingContent()
    if (arrangeMode.active) {
      exitArrangeMode()
    }
    setViewMode('domains')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const openDomain = (domainId: string) => {
    flushPendingContent()
    if (arrangeMode.active) {
      exitArrangeMode()
    }
    setState((previous) => setActiveDomain(previous, domainId))
    setViewMode('spaces')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const addDomainFromPage = () => {
    flushPendingContent()
    const newDomain = createDomain('New Domain')
    setState((previous) => addDomain(previous, newDomain))
    setViewMode('domains')
    setEditing({ type: 'domain', id: newDomain.id })
    setMenuOpen(false)
    setContextMenu(null)
  }

  const toggleTrashView = () => {
    flushPendingContent()
    setMenuOpen(false)
    setContextMenu(null)

    setViewMode((previous) => {
      if (previous === 'trash') return 'main'
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
      return 'trash'
    })
  }

  const openSettings = () => {
    if (viewMode === 'spaces' || viewMode === 'domains') return
    flushPendingContent()
    setMenuOpen(false)
    setContextMenu(null)
    setViewMode('settings')
  }

  const openStageManager = () => {
    if (viewMode !== 'main') return
    flushPendingContent()
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    exitArrangeMode()
    resetStageManagerState()
    setViewMode('stage-manager')
  }

  const returnToLastTabLikeView = () => {
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    if (navigateToLastTabLikeLocation()) return
    setViewMode(lastTabLikeViewRef.current)
  }

  const endStageManager = () => {
    resetStageManagerState()
    returnToLastTabLikeView()
  }

  const closeSettingsView = () => {
    returnToLastTabLikeView()
  }

  const commitImmediateSettingsState = (buildNextState: (previous: AppState) => AppState) => {
    const nextState = applyAutoPurgeToAppState(buildNextState(stateRef.current))
    stateRef.current = nextState
    setState(nextState)
    if (storageHydrated) {
      appStateStore.save(JSON.stringify(nextState))
    }
  }

  const updateAutoRemoveDaysSetting = (rawValue: string, normalizeInvalid = false) => {
    setSettingsDaysDraft(rawValue)
    const parsed = Number.parseInt(rawValue, 10)
    if (!Number.isFinite(parsed)) {
      if (normalizeInvalid) {
        setSettingsDaysDraft(String(activeSpace.settings.autoRemoveDeletedDays))
      }
      return
    }

    const nextDays = clampAutoRemoveDays(parsed)
    commitImmediateSettingsState((previous) =>
      updateSpaceInActiveDomain(previous, previous.activeSpaceId, (space) => ({
        ...space,
        settings: { ...space.settings, autoRemoveDeletedDays: nextDays },
        data: applyAutoPurgeToWorkspace(space.data, nextDays),
      })),
    )
    if (String(nextDays) !== rawValue.trim()) {
      setSettingsDaysDraft(String(nextDays))
    }
  }

  const updateMouseBackForwardSetting = (checked: boolean) => {
    setMouseBackForwardEnabledDraft(checked)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      hotkeys: {
        ...previous.hotkeys,
        enableMouseBackForward: checked,
      },
    }))
  }

  const updateGenericHistoryHotkeysSetting = (checked: boolean) => {
    setGenericHistoryHotkeysEnabledDraft(checked)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      hotkeys: {
        ...previous.hotkeys,
        enableGenericHistoryHotkeys: checked,
      },
    }))
  }

  const updateShowParentHomeTabSetting = (checked: boolean) => {
    setShowParentHomeTabDraft(checked)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        showParentHomeTab: checked,
      },
    }))
  }

  const updateTabButtonScaleSetting = (rawValue: string) => {
    const nextScale = clampTabButtonScale(Number.parseFloat(rawValue))
    setTabButtonScaleDraft(nextScale)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        tabButtonScale: nextScale,
      },
    }))
  }

  const updateNoteFontScaleSetting = (rawValue: string) => {
    const nextScale = clampNoteFontScale(Number.parseFloat(rawValue))
    setNoteFontScaleDraft(nextScale)
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        noteFontScale: nextScale,
      },
    }))
  }

  const updateThemeSetting = (theme: AppTheme) => {
    commitImmediateSettingsState((previous) => (previous.theme === theme ? previous : { ...previous, theme }))
  }

  const updateShortcutSetting = (shortcutId: ShortcutId, nextShortcut: string) => {
    setShortcutDrafts((previous) => ({ ...previous, [shortcutId]: nextShortcut }))
    commitImmediateSettingsState((previous) => ({
      ...previous,
      hotkeys: {
        ...previous.hotkeys,
        shortcuts: {
          ...previous.hotkeys.shortcuts,
          [shortcutId]: nextShortcut,
        },
      },
    }))
  }

  const updateStageManagerOpenDestinationSetting = (checked: boolean) => {
    commitImmediateSettingsState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        stageManagerOpenDestinationAfterApply: checked,
      },
    }))
  }

  const handleStageManagerParentClick = (tab: Tab) => {
    if (stageManagerStep !== 'select') {
      pushToast('go back to the selection step to change selected items.', 'error')
      return
    }

    if (workspace.activeTabId !== tab.id) {
      selectTab(tab.id)
      return
    }

    cycleStageManagerParentSelection(tab)
  }

  const handleStageManagerSubTabClick = (tab: Tab, subTabId: string) => {
    if (stageManagerStep !== 'select') {
      pushToast('go back to the selection step to change selected items.', 'error')
      return
    }

    toggleStageManagerSubTabSelection(tab, subTabId)
  }

  const handleStageManagerHomeClick = () => {
    if (stageManagerStep !== 'select') {
      pushToast('go back to the selection step to change selected items.', 'error')
      return
    }

    pushToast('home is selected automatically when the parent tab is fully selected.', 'error')
  }

  const getStageManagerConfigureValidation = () => {
    if (!stageManagerAction) {
      return {
        valid: false,
        message: 'choose a director action before continuing.',
      }
    }

    if (stageManagerAction === 'promote') {
      if (stageManagerSelectionSnapshot.fullParents.length === 1) {
        if (!stageManagerDraft.newSpaceName.trim()) {
          return {
            valid: false,
            message: 'name the new space for this promoted parent tab before continuing.',
          }
        }

        return { valid: true, message: '' }
      }

      if (stageManagerDraft.promoteSpaceMode === 'existing') {
        if (!stageManagerSelectedPromoteSpace) {
          return {
            valid: false,
            message: 'choose the destination space for the promoted sub-tabs before continuing.',
          }
        }
      } else if (!stageManagerDraft.newSpaceName.trim()) {
        return {
          valid: false,
          message: 'name the new destination space for the promoted sub-tabs before continuing.',
        }
      }

      return { valid: true, message: '' }
    }

    if (stageManagerAction === 'demote') {
      if (stageManagerDraft.demoteParentMode === 'existing') {
        if (!stageManagerDraft.demoteParentId) {
          return {
            valid: false,
            message: 'choose the parent tab that will receive the demoted items before continuing.',
          }
        }

        if (!stageManagerDemoteParentOptions.some((tab) => tab.id === stageManagerDraft.demoteParentId)) {
          return {
            valid: false,
            message: 'choose a valid destination parent for the demoted items before continuing.',
          }
        }

        if (stageManagerSelectionSnapshot.fullParentIds.has(stageManagerDraft.demoteParentId)) {
          return {
            valid: false,
            message: 'a selected parent tab cannot receive demoted items. choose a different destination parent.',
          }
        }
      } else if (!stageManagerDraft.demoteNewParentName.trim()) {
        return {
          valid: false,
          message: 'name the new parent tab that will receive the demoted items before continuing.',
        }
      }

      return { valid: true, message: '' }
    }

    if (stageManagerAction === 'migrate') {
      if (stageManagerDraft.migrateTarget === 'space') {
        if (stageManagerDraft.migrateSpaceMode === 'existing') {
          if (!stageManagerSelectedMigrateSpace) {
            return {
              valid: false,
              message: 'choose the destination space for this migration before continuing.',
            }
          }
        } else if (!stageManagerDraft.newSpaceName.trim()) {
          return {
            valid: false,
            message: 'name the new destination space before continuing.',
          }
        }

        if (stageManagerSelectionSnapshot.looseSubTabs.length > 0) {
          if (stageManagerDraft.strayHandlingMode === 'selected-parent') {
            if (!stageManagerDraft.straySelectedParentId || !stageManagerSelectionSnapshot.fullParentIds.has(stageManagerDraft.straySelectedParentId)) {
              return {
                valid: false,
                message: 'choose which selected parent should receive the stray sub-tabs before continuing.',
              }
            }
          } else if (stageManagerDraft.strayHandlingMode === 'existing-parent') {
            if (stageManagerDraft.migrateSpaceMode !== 'existing') {
              return {
                valid: false,
                message: 'existing destination parents are only available when migrating into an existing space.',
              }
            }
            if (
              !stageManagerDraft.strayExistingParentId ||
              !stageManagerStrayExistingParentOptions.some((tab) => tab.id === stageManagerDraft.strayExistingParentId)
            ) {
              return {
                valid: false,
                message: 'choose the destination parent for the stray sub-tabs before continuing.',
              }
            }
          } else if (stageManagerDraft.strayHandlingMode === 'new-parent' && !stageManagerDraft.strayNewParentName.trim()) {
            return {
              valid: false,
              message: 'name the new destination parent for the stray sub-tabs before continuing.',
            }
          }
        }

        return { valid: true, message: '' }
      }

      if (stageManagerDraft.migrateParentSpaceMode === 'existing' && !stageManagerDraft.migrateParentSpaceId) {
        return {
          valid: false,
          message: 'choose the destination space that contains the target parent before continuing.',
        }
      }

      if (stageManagerDraft.migrateParentSpaceMode === 'new') {
        if (!stageManagerDraft.newSpaceName.trim()) {
          return {
            valid: false,
            message: 'name the new destination space before continuing.',
          }
        }

        if (!stageManagerDraft.migrateNewParentName.trim()) {
          return {
            valid: false,
            message: 'name the new destination parent before continuing.',
          }
        }

        return { valid: true, message: '' }
      }

      if (stageManagerDraft.migrateParentMode === 'existing') {
        if (!stageManagerDraft.migrateParentId) {
          return {
            valid: false,
            message: 'choose the destination parent before continuing.',
          }
        }

        if (!stageManagerMigrateParentOptions.some((tab) => tab.id === stageManagerDraft.migrateParentId)) {
          return {
            valid: false,
            message: 'choose a valid destination parent before continuing.',
          }
        }

        if (
          stageManagerSelectedMigrateParentSpace?.id === activeSpace.id &&
          stageManagerSelectionSnapshot.fullParentIds.has(stageManagerDraft.migrateParentId)
        ) {
          return {
            valid: false,
            message: 'a selected parent tab cannot receive migrated items. choose a different destination parent.',
          }
        }
      } else if (!stageManagerDraft.migrateNewParentName.trim()) {
        return {
          valid: false,
          message: 'name the new destination parent before continuing.',
        }
      }

      return { valid: true, message: '' }
    }

    return { valid: true, message: '' }
  }

  const getStageManagerReviewDetails = () => {
    if (!stageManagerAction) return ['action: none selected']

    const details = [
      `selected parent tabs: ${stageManagerSelectionCounts.fullParentCount}`,
      `selected sub-tabs: ${stageManagerSelectionCounts.selectedSubTabCount}`,
      `action: ${stageManagerAction.replace('-', ' ')}`,
    ]

    if (stageManagerAction === 'promote') {
      if (stageManagerSelectionSnapshot.fullParents.length === 1) {
        details.push(`new space: ${sanitizeName(stageManagerDraft.newSpaceName || stageManagerSelectionSnapshot.fullParents[0].title)}`)
      } else if (stageManagerDraft.promoteSpaceMode === 'existing') {
        details.push(`destination space: ${stageManagerSelectedPromoteSpace?.name ?? 'none selected'}`)
      } else {
        details.push(`new space: ${sanitizeName(stageManagerDraft.newSpaceName || 'untitled')}`)
      }
    } else if (stageManagerAction === 'demote') {
      if (stageManagerDraft.demoteParentMode === 'existing') {
        details.push(
          `destination parent: ${
            stageManagerDemoteParentOptions.find((tab) => tab.id === stageManagerDraft.demoteParentId)?.title ?? 'none selected'
          }`,
        )
      } else {
        details.push(`new parent: ${sanitizeName(stageManagerDraft.demoteNewParentName || 'untitled')}`)
      }
    } else if (stageManagerAction === 'migrate') {
      if (stageManagerDraft.migrateTarget === 'space') {
        if (stageManagerDraft.migrateSpaceMode === 'existing') {
          details.push(`destination space: ${stageManagerSelectedMigrateSpace?.name ?? 'none selected'}`)
        } else {
          details.push(`new space: ${sanitizeName(stageManagerDraft.newSpaceName || 'untitled')}`)
        }
        if (stageManagerSelectionSnapshot.looseSubTabs.length > 0) {
          if (stageManagerDraft.strayHandlingMode === 'promote') {
            details.push('stray sub-tabs: promote to own prime tabs')
          } else if (stageManagerDraft.strayHandlingMode === 'selected-parent') {
            details.push(
              `stray sub-tabs: include under ${
                stageManagerSelectionSnapshot.fullParents.find((tab) => tab.id === stageManagerDraft.straySelectedParentId)?.title ??
                'selected parent'
              }`,
            )
          } else if (stageManagerDraft.strayHandlingMode === 'existing-parent') {
            details.push(
              `stray sub-tabs: include under ${
                stageManagerStrayExistingParentOptions.find((tab) => tab.id === stageManagerDraft.strayExistingParentId)?.title ??
                'existing parent'
              }`,
            )
          } else {
            details.push(`stray sub-tabs: include under new parent ${sanitizeName(stageManagerDraft.strayNewParentName || 'untitled')}`)
          }
        }
      } else {
        if (stageManagerDraft.migrateParentSpaceMode === 'current') {
          details.push(`destination space: ${activeSpace.name}`)
        } else if (stageManagerDraft.migrateParentSpaceMode === 'existing') {
          details.push(
            `destination space: ${
              state.spaces.find((space) => space.id === stageManagerDraft.migrateParentSpaceId)?.name ?? 'none selected'
            }`,
          )
        } else {
          details.push(`new space: ${sanitizeName(stageManagerDraft.newSpaceName || 'untitled')}`)
        }

        if (stageManagerDraft.migrateParentSpaceMode === 'new' || stageManagerDraft.migrateParentMode === 'new') {
          details.push(`destination parent: ${sanitizeName(stageManagerDraft.migrateNewParentName || 'untitled')}`)
        } else {
          details.push(
            `destination parent: ${
              stageManagerMigrateParentOptions.find((tab) => tab.id === stageManagerDraft.migrateParentId)?.title ?? 'none selected'
            }`,
          )
        }
      }
    } else if (stageManagerAction === 'mass-delete') {
      details.push(`mode: ${stageManagerDraft.massDeleteMode === 'trash' ? 'move to trash' : 'delete for real'}`)
    }

    return details
  }

  const getStageManagerReviewWarning = () => {
    if (stageManagerAction === 'mass-delete' && stageManagerDraft.massDeleteMode === 'permanent') {
      return 'This will permanently delete the current selection.'
    }
    if (stageManagerAction === 'migrate' && stageManagerDraft.migrateTarget === 'parent') {
      return 'Moving a parent into another parent demotes it into a sub-tab under that destination parent.'
    }
    if (stageManagerAction === 'demote') {
      return 'Each demoted parent becomes one sub-tab whose content comes from that parent home note.'
    }
    return ''
  }

  const getStageManagerApplyToastMessage = () => {
    if (stageManagerAction === 'mass-delete') {
      return stageManagerDraft.massDeleteMode === 'trash' ? 'selected items have been moved to trash.' : 'selected items have been deleted.'
    }
    if (stageManagerAction === 'promote') return 'selected items have been promoted.'
    if (stageManagerAction === 'demote') return 'selected items have been demoted.'
    if (stageManagerAction === 'migrate') return 'selected items have been migrated.'
    return 'director changes applied.'
  }

  const finishStageManagerApply = (nextState: AppState, toastMessage: string, tone: ToastTone = 'success') => {
    const sanitizedState = applyAutoPurgeToAppState(nextState)
    stateRef.current = sanitizedState
    setState(sanitizedState)
    if (storageHydrated) {
      appStateStore.save(JSON.stringify(sanitizedState))
    }
    setViewMode('main')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    setToast({
      id: Date.now(),
      message: toastMessage,
      tone,
      durationMs: DEFAULT_TOAST_DURATION_MS,
    })
  }

  const handleStageManagerApply = () => {
    if (!stageManagerAction) {
      pushToast('choose a director action before applying.', 'warning')
      return
    }

    const validation = getStageManagerConfigureValidation()
    if (!validation.valid) {
      pushToast(validation.message, 'warning')
      return
    }

    const latestState = buildStateWithLatestEditorContent()
    const currentSpace = latestState.spaces.find((space) => space.id === latestState.activeSpaceId)
    if (!currentSpace) return

    const snapshot = buildStageManagerSelectionSnapshot(currentSpace.data.tabs, stageManagerSelections)
    if (!snapshot.hasSelection) {
      pushToast('select at least one parent or sub-tab before applying director.', 'warning')
      return
    }

    if (stageManagerAction === 'mass-delete') {
      const nextSpaces = latestState.spaces.map((space) => {
        if (space.id !== latestState.activeSpaceId) return space

        const deletedTabs =
          stageManagerDraft.massDeleteMode === 'trash'
            ? [
                ...space.data.deletedTabs.map((entry) => ({ ...entry, tab: cloneTabForTransfer(entry.tab) })),
                ...snapshot.fullParents.map((tab) => ({
                  id: createId(),
                  tab: cloneTabForTransfer(tab),
                  deletedAt: Date.now(),
                })),
              ]
            : space.data.deletedTabs.map((entry) => ({ ...entry, tab: cloneTabForTransfer(entry.tab) }))

        const deletedSubTabs =
          stageManagerDraft.massDeleteMode === 'trash'
            ? [
                ...space.data.deletedSubTabs.map((entry) => ({ ...entry, subTab: cloneSubTabForTransfer(entry.subTab) })),
                ...snapshot.looseSubTabs.map(({ parentTab, subTab }) => ({
                  id: createId(),
                  parentTabId: parentTab.id,
                  parentTabTitle: parentTab.title,
                  subTab: cloneSubTabForTransfer(subTab),
                  deletedAt: Date.now(),
                })),
              ]
            : space.data.deletedSubTabs.map((entry) => ({ ...entry, subTab: cloneSubTabForTransfer(entry.subTab) }))

        const stripped = stripStageManagerSelectionsFromWorkspace(space.data, snapshot)
        return {
          ...space,
          data: createWorkspaceDataFromTabs(stripped.tabs, {
            activeTabId: stripped.activeTabId,
            deletedTabs,
            deletedSubTabs,
          }),
        }
      })

      finishStageManagerApply(
        {
          ...latestState,
          spaces: nextSpaces,
        },
        getStageManagerApplyToastMessage(),
      )
      return
    }

    if (stageManagerAction === 'promote') {
      const loosePromotedTabs = snapshot.looseSubTabs.map(({ subTab }) => createPromotedParentTab(subTab))
      const strippedCurrentData = stripStageManagerSelectionsFromWorkspace(currentSpace.data, snapshot)
      const nextSpaces = latestState.spaces.map((space) =>
        space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
      )

      if (snapshot.fullParents.length === 1) {
        const promotedParent = snapshot.fullParents[0]
        const mainTab: Tab = {
          id: createId(),
          title: 'main',
          homeContent: promotedParent.homeContent,
          activeSubTabId: null,
          subTabs: [],
        }
        const movedTabs = [
          mainTab,
          ...promotedParent.subTabs.map((subTab) => createPromotedParentTab(subTab)),
          ...loosePromotedTabs,
        ]
        const newSpaceId = createId()
        const newSpace: Space = {
          id: newSpaceId,
          name: sanitizeName(stageManagerDraft.newSpaceName || promotedParent.title),
          settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
          data: createWorkspaceDataFromTabs(movedTabs, { activeTabId: mainTab.id }),
        }

        finishStageManagerApply(
          {
            ...latestState,
            activeSpaceId: state.ui.stageManagerOpenDestinationAfterApply ? newSpace.id : latestState.activeSpaceId,
            spaces: [...nextSpaces, newSpace],
          },
          getStageManagerApplyToastMessage(),
        )
        return
      }

      if (stageManagerDraft.promoteSpaceMode === 'new') {
        const firstTabId = loosePromotedTabs[0]?.id ?? null
        const newSpace: Space = {
          id: createId(),
          name: sanitizeName(stageManagerDraft.newSpaceName || 'untitled'),
          settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
          data: createWorkspaceDataFromTabs(loosePromotedTabs, { activeTabId: firstTabId ?? undefined }),
        }

        finishStageManagerApply(
          {
            ...latestState,
            activeSpaceId: state.ui.stageManagerOpenDestinationAfterApply ? newSpace.id : latestState.activeSpaceId,
            spaces: [...nextSpaces, newSpace],
          },
          getStageManagerApplyToastMessage(),
        )
        return
      }

      const destinationSpaceId = stageManagerDraft.promoteSpaceId
      const destinationFirstTabId = loosePromotedTabs[0]?.id ?? null
      finishStageManagerApply(
        {
          ...latestState,
          activeSpaceId:
            state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId
              ? destinationSpaceId
              : latestState.activeSpaceId,
          spaces: nextSpaces.map((space) => {
            if (space.id !== destinationSpaceId) return space
            const destinationTabs = [...space.data.tabs.map(cloneTabForTransfer), ...loosePromotedTabs]
            return {
              ...space,
              data: createWorkspaceDataFromTabs(destinationTabs, {
                activeTabId:
                  state.ui.stageManagerOpenDestinationAfterApply && destinationFirstTabId
                    ? destinationFirstTabId
                    : space.data.activeTabId,
                deletedTabs: space.data.deletedTabs,
                deletedSubTabs: space.data.deletedSubTabs,
              }),
            }
          }),
        },
        getStageManagerApplyToastMessage(),
      )
      return
    }

    if (stageManagerAction === 'demote') {
      const movedSubTabs = buildStageManagerMovedSubTabs(snapshot)
      const strippedCurrentData = stripStageManagerSelectionsFromWorkspace(currentSpace.data, snapshot)

      let destinationParentId: string
      let nextCurrentTabs: Tab[]
      if (stageManagerDraft.demoteParentMode === 'new') {
        destinationParentId = createId()
        const newParent: Tab = {
          id: destinationParentId,
          title: sanitizeName(stageManagerDraft.demoteNewParentName || 'untitled'),
          homeContent: '',
          activeSubTabId: null,
          subTabs: movedSubTabs.map(cloneSubTabForTransfer),
        }
        nextCurrentTabs = [...strippedCurrentData.tabs.map(cloneTabForTransfer), newParent]
      } else {
        destinationParentId = stageManagerDraft.demoteParentId
        nextCurrentTabs = appendSubTabsToParent(
          strippedCurrentData.tabs,
          destinationParentId,
          movedSubTabs,
          state.ui.stageManagerOpenDestinationAfterApply,
        )
      }

      finishStageManagerApply(
        {
          ...latestState,
          spaces: latestState.spaces.map((space) =>
            space.id !== currentSpace.id
              ? space
              : {
                  ...space,
                  data: createWorkspaceDataFromTabs(nextCurrentTabs, {
                    activeTabId:
                      state.ui.stageManagerOpenDestinationAfterApply && destinationParentId
                        ? destinationParentId
                        : strippedCurrentData.activeTabId,
                    deletedTabs: strippedCurrentData.deletedTabs,
                    deletedSubTabs: strippedCurrentData.deletedSubTabs,
                  }),
                },
          ),
        },
        getStageManagerApplyToastMessage(),
      )
      return
    }

    const strippedCurrentData = stripStageManagerSelectionsFromWorkspace(currentSpace.data, snapshot)
    const movedParentTabs = snapshot.fullParents.map(cloneTabForTransfer)
    const looseMovedSubTabs = snapshot.looseSubTabs.map(({ subTab }) => cloneSubTabForTransfer(subTab))

    if (stageManagerDraft.migrateTarget === 'space') {
      const movedParentCopies = movedParentTabs.map(cloneTabForTransfer)
      const additionalDestinationTabs: Tab[] = []

      if (snapshot.looseSubTabs.length > 0) {
        if (stageManagerDraft.strayHandlingMode === 'promote') {
          additionalDestinationTabs.push(...looseMovedSubTabs.map((subTab) => createPromotedParentTab(subTab)))
        } else if (stageManagerDraft.strayHandlingMode === 'selected-parent') {
          const targetParentId = stageManagerDraft.straySelectedParentId
          const targetIndex = movedParentCopies.findIndex((tab) => tab.id === targetParentId)
          if (targetIndex >= 0) {
            movedParentCopies[targetIndex] = {
              ...movedParentCopies[targetIndex],
              subTabs: [...movedParentCopies[targetIndex].subTabs, ...looseMovedSubTabs.map(cloneSubTabForTransfer)],
            }
          }
        } else if (stageManagerDraft.strayHandlingMode === 'new-parent') {
          additionalDestinationTabs.push({
            id: createId(),
            title: sanitizeName(stageManagerDraft.strayNewParentName || 'untitled'),
            homeContent: '',
            activeSubTabId: null,
            subTabs: looseMovedSubTabs.map(cloneSubTabForTransfer),
          })
        }
      }

      if (stageManagerDraft.migrateSpaceMode === 'new') {
        const newSpaceId = createId()
        const destinationTabs =
          stageManagerDraft.strayHandlingMode === 'existing-parent'
            ? [...movedParentCopies]
            : [...movedParentCopies, ...additionalDestinationTabs]
        const fallbackTab = destinationTabs[0]?.id
        const newSpace: Space = {
          id: newSpaceId,
          name: sanitizeName(stageManagerDraft.newSpaceName || 'untitled'),
          settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
          data: createWorkspaceDataFromTabs(destinationTabs, { activeTabId: fallbackTab }),
        }

        finishStageManagerApply(
          {
            ...latestState,
            activeSpaceId: state.ui.stageManagerOpenDestinationAfterApply ? newSpace.id : latestState.activeSpaceId,
            spaces: [
              ...latestState.spaces.map((space) =>
                space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
              ),
              newSpace,
            ],
          },
          getStageManagerApplyToastMessage(),
        )
        return
      }

      const destinationSpaceId = stageManagerDraft.migrateSpaceId
      finishStageManagerApply(
        {
          ...latestState,
          activeSpaceId:
            state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId
              ? destinationSpaceId
              : latestState.activeSpaceId,
          spaces: latestState.spaces.map((space) => {
            if (space.id === currentSpace.id) {
              return { ...space, data: strippedCurrentData }
            }
            if (space.id !== destinationSpaceId) return space

            let destinationTabs = [...space.data.tabs.map(cloneTabForTransfer), ...movedParentCopies]
            let destinationActiveTabId = state.ui.stageManagerOpenDestinationAfterApply
              ? movedParentCopies[0]?.id ?? additionalDestinationTabs[0]?.id ?? space.data.activeTabId
              : space.data.activeTabId

            if (stageManagerDraft.strayHandlingMode === 'existing-parent') {
              destinationTabs = appendSubTabsToParent(
                destinationTabs,
                stageManagerDraft.strayExistingParentId,
                looseMovedSubTabs,
                state.ui.stageManagerOpenDestinationAfterApply,
              )
              if (state.ui.stageManagerOpenDestinationAfterApply) {
                destinationActiveTabId = stageManagerDraft.strayExistingParentId
              }
            } else {
              destinationTabs = [...destinationTabs, ...additionalDestinationTabs]
            }

            return {
              ...space,
              data: createWorkspaceDataFromTabs(destinationTabs, {
                activeTabId: destinationActiveTabId,
                deletedTabs: space.data.deletedTabs,
                deletedSubTabs: space.data.deletedSubTabs,
              }),
            }
          }),
        },
        getStageManagerApplyToastMessage(),
      )
      return
    }

    const movedSubTabs = buildStageManagerMovedSubTabs(snapshot)

    if (stageManagerDraft.migrateParentSpaceMode === 'current') {
      let destinationParentId: string
      let destinationTabs: Tab[]
      if (stageManagerDraft.migrateParentMode === 'new') {
        destinationParentId = createId()
        const newParent: Tab = {
          id: destinationParentId,
          title: sanitizeName(stageManagerDraft.migrateNewParentName || 'untitled'),
          homeContent: '',
          activeSubTabId: null,
          subTabs: movedSubTabs.map(cloneSubTabForTransfer),
        }
        destinationTabs = [...strippedCurrentData.tabs.map(cloneTabForTransfer), newParent]
      } else {
        destinationParentId = stageManagerDraft.migrateParentId
        destinationTabs = appendSubTabsToParent(
          strippedCurrentData.tabs,
          destinationParentId,
          movedSubTabs,
          state.ui.stageManagerOpenDestinationAfterApply,
        )
      }

      finishStageManagerApply(
        {
          ...latestState,
          spaces: latestState.spaces.map((space) =>
            space.id !== currentSpace.id
              ? space
              : {
                  ...space,
                  data: createWorkspaceDataFromTabs(destinationTabs, {
                    activeTabId:
                      state.ui.stageManagerOpenDestinationAfterApply && destinationParentId
                        ? destinationParentId
                        : strippedCurrentData.activeTabId,
                    deletedTabs: strippedCurrentData.deletedTabs,
                    deletedSubTabs: strippedCurrentData.deletedSubTabs,
                  }),
                },
          ),
        },
        getStageManagerApplyToastMessage(),
      )
      return
    }

    if (stageManagerDraft.migrateParentSpaceMode === 'new') {
      const destinationParentId = createId()
      const newSpaceId = createId()
      const newParent: Tab = {
        id: destinationParentId,
        title: sanitizeName(stageManagerDraft.migrateNewParentName || 'untitled'),
        homeContent: '',
        activeSubTabId: null,
        subTabs: movedSubTabs.map(cloneSubTabForTransfer),
      }
      const newSpace: Space = {
        id: newSpaceId,
        name: sanitizeName(stageManagerDraft.newSpaceName || 'untitled'),
        settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
        data: createWorkspaceDataFromTabs([newParent], { activeTabId: destinationParentId }),
      }

      finishStageManagerApply(
        {
          ...latestState,
          activeSpaceId: state.ui.stageManagerOpenDestinationAfterApply ? newSpace.id : latestState.activeSpaceId,
          spaces: [
            ...latestState.spaces.map((space) =>
              space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
            ),
            newSpace,
          ],
        },
        getStageManagerApplyToastMessage(),
      )
      return
    }

    const destinationSpaceId = stageManagerDraft.migrateParentSpaceId
    finishStageManagerApply(
      {
        ...latestState,
        activeSpaceId:
          state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId
            ? destinationSpaceId
            : latestState.activeSpaceId,
        spaces: latestState.spaces.map((space) => {
          if (space.id === currentSpace.id) {
            return { ...space, data: strippedCurrentData }
          }
          if (space.id !== destinationSpaceId) return space

          let destinationParentId: string
          let destinationTabs: Tab[]
          if (stageManagerDraft.migrateParentMode === 'new') {
            destinationParentId = createId()
            const newParent: Tab = {
              id: destinationParentId,
              title: sanitizeName(stageManagerDraft.migrateNewParentName || 'untitled'),
              homeContent: '',
              activeSubTabId: null,
              subTabs: movedSubTabs.map(cloneSubTabForTransfer),
            }
            destinationTabs = [...space.data.tabs.map(cloneTabForTransfer), newParent]
          } else {
            destinationParentId = stageManagerDraft.migrateParentId
            destinationTabs = appendSubTabsToParent(
              space.data.tabs,
              destinationParentId,
              movedSubTabs,
              state.ui.stageManagerOpenDestinationAfterApply,
            )
          }

          return {
            ...space,
            data: createWorkspaceDataFromTabs(destinationTabs, {
              activeTabId:
                state.ui.stageManagerOpenDestinationAfterApply && destinationParentId
                  ? destinationParentId
                  : space.data.activeTabId,
              deletedTabs: space.data.deletedTabs,
              deletedSubTabs: space.data.deletedSubTabs,
            }),
          }
        }),
      },
      getStageManagerApplyToastMessage(),
    )
  }

  const handleStageManagerPrevious = () => {
    if (stageManagerStep === 'select') return
    if (stageManagerStep === 'action') {
      setStageManagerStep('select')
      return
    }
    if (stageManagerStep === 'configure') {
      setStageManagerStep('action')
      return
    }
    setStageManagerStep('configure')
  }

  const handleStageManagerNext = () => {
    if (stageManagerStep === 'select') {
      if (!stageManagerSelectionSnapshot.hasSelection) {
        pushToast('select at least one parent or sub-tab before continuing.', 'warning')
        return
      }
      setStageManagerStep('action')
      return
    }

    if (stageManagerStep === 'action') {
      if (!stageManagerAction) {
        pushToast('choose a director action before continuing.', 'warning')
        return
      }
      const validation = getStageManagerActionValidation(stageManagerAction, stageManagerSelectionSnapshot)
      if (!validation.valid) {
        setStageManagerAction(null)
        pushToast(validation.message, 'warning')
        return
      }
      setStageManagerStep('configure')
      return
    }

    if (stageManagerStep === 'configure') {
      const validation = getStageManagerConfigureValidation()
      if (!validation.valid) {
        pushToast(validation.message, 'warning')
        return
      }
      setStageManagerStep('review')
      return
    }

    pushToast('director execution will be added in the next chunk.', 'warning')
  }

  const sanitizeName = (value: string): string => {
    const safe = value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ')
    return safe.length > 0 ? safe : 'untitled'
  }

  const decodeDataUrl = (dataUrl: string): Uint8Array | null => {
    const commaIndex = dataUrl.indexOf(',')
    if (commaIndex < 0) return null
    const base64 = dataUrl.slice(commaIndex + 1)
    try {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      return bytes
    } catch {
      return null
    }
  }

  const rewriteMarkdownImages = (markdown: string, spaceFolder: string, imageBank: Map<string, Uint8Array>) => {
    let counter = imageBank.size + 1
    const exportReadyMarkdown = convertInternalTabsForExport(markdown)
    const nextMarkdown = exportReadyMarkdown.replace(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/g, (_all, alt: string, src: string) => {
      const extensionMatch = src.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/)
      const extRaw = extensionMatch?.[1]?.toLowerCase() ?? 'png'
      const ext = extRaw === 'jpeg' ? 'jpg' : extRaw.replace(/[^a-z0-9]/g, '') || 'png'
      const fileName = `image-${String(counter).padStart(4, '0')}.${ext}`
      counter += 1
      const bytes = decodeDataUrl(src)
      if (bytes) {
        imageBank.set(`${spaceFolder}/assets/${fileName}`, bytes)
      }
      return `![${alt}](${`assets/${fileName}`})`
    })
    return nextMarkdown
  }

  const exportData = async (scope: 'space' | 'all', spaceId?: string) => {
    try {
      setExportStatus('building export...')
      const latestState = buildStateWithLatestEditorContent()
      let exportState: AppState
      let defaultName: string
      let spacesToExport: Space[]

      if (scope === 'space') {
        const selectedSpace =
          latestState.spaces.find((space) => space.id === (spaceId ?? latestState.activeSpaceId)) ??
          latestState.spaces.find((space) => space.id === latestState.activeSpaceId) ??
          latestState.spaces[0]
        if (!selectedSpace) {
          setExportStatus('export failed')
          return
        }
        exportState = {
          ...latestState,
          activeSpaceId: selectedSpace.id,
          spaces: [selectedSpace],
        }
        defaultName = `${sanitizeName(selectedSpace.name)}-export.zip`
        spacesToExport = [selectedSpace]
      } else {
        exportState = latestState
        defaultName = 'notes-export-all.zip'
        spacesToExport = exportState.spaces
      }

      if (window.electronAPI?.exportAppState) {
        const result = await window.electronAPI.exportAppState({
          defaultPath: defaultName,
          serializedState: JSON.stringify(exportState),
        })
        if (result?.canceled) {
          setExportStatus('export canceled')
          return
        }
        if (result?.error) {
          setExportStatus('export failed')
          return
        }
        setExportStatus('export saved')
        return
      }

      const zip = new JSZip()
      const imageBank = new Map<string, Uint8Array>()
      const manifest = {
        exportedAt: new Date().toISOString(),
        scope,
        version: 1,
        theme: exportState.theme,
        spaces: [] as Array<{
          id: string
          name: string
          settings: SpaceSettings
          activeTabId: string
          tabs: Array<{ id: string; title: string; homeNote: string; subTabs: Array<{ id: string; title: string; file: string }> }>
        }>,
      }

      for (const space of spacesToExport) {
        const spaceFolder = `spaces/${sanitizeName(space.name)}-${space.id.slice(0, 8)}`
        const tabManifest: Array<{ id: string; title: string; homeNote: string; subTabs: Array<{ id: string; title: string; file: string }> }> = []

        for (const tab of space.data.tabs) {
          const tabFolder = `${spaceFolder}/${sanitizeName(tab.title)}-${tab.id.slice(0, 8)}`
          const homeMarkdown = rewriteMarkdownImages(tab.homeContent ?? '', spaceFolder, imageBank)
          zip.file(`${tabFolder}/home.md`, homeMarkdown)

          const subManifest: Array<{ id: string; title: string; file: string }> = []
          tab.subTabs.forEach((subTab, index) => {
            const subFileName = `${String(index + 1).padStart(2, '0')}-${sanitizeName(subTab.title)}.md`
            const rewritten = rewriteMarkdownImages(subTab.content ?? '', spaceFolder, imageBank)
            zip.file(`${tabFolder}/${subFileName}`, rewritten)
            subManifest.push({ id: subTab.id, title: subTab.title, file: subFileName })
          })

          tabManifest.push({
            id: tab.id,
            title: tab.title,
            homeNote: 'home.md',
            subTabs: subManifest,
          })
        }

        manifest.spaces.push({
          id: space.id,
          name: space.name,
          settings: space.settings,
          activeTabId: space.data.activeTabId,
          tabs: tabManifest,
        })
      }

      imageBank.forEach((bytes, path) => {
        zip.file(path, bytes)
      })
      zip.file('manifest.json', JSON.stringify(manifest, null, 2))
      zip.file(
        'README.txt',
        'This export contains markdown notes by space/tab and a manifest.json with metadata. Images are in assets/.',
      )

      const zipBytes = await zip.generateAsync({ type: 'uint8array' })
      const exportArray = Uint8Array.from(zipBytes)
      const exportBuffer = exportArray.buffer as ArrayBuffer

      if (window.electronAPI?.saveFile) {
        const result = await window.electronAPI.saveFile({
          defaultPath: defaultName,
          data: exportBuffer,
        })
        if (result?.canceled) {
          setExportStatus('export canceled')
          return
        }
        setExportStatus('export saved')
        return
      }

      const blob = new Blob([exportBuffer], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = defaultName
      anchor.click()
      URL.revokeObjectURL(url)
      setExportStatus('export saved')
    } catch {
      setExportStatus('export failed')
    }
  }

  const getShortcutIndex = (key: string): number | null => {
    if (key >= '1' && key <= '9') return Number(key) - 1
    if (key === '0') return 9
    return null
  }

  const autoSizeRenameInput = (input: HTMLInputElement) => {
    if (!renameInputMeasureContext) {
      renameInputMeasureContext = document.createElement('canvas').getContext('2d')
    }

    const computed = window.getComputedStyle(input)
    const minWidth = Number.parseFloat(computed.minWidth) || 0
    const maxWidth = Number.parseFloat(computed.maxWidth) || Number.POSITIVE_INFINITY
    const horizontalChrome =
      (Number.parseFloat(computed.paddingLeft) || 0) +
      (Number.parseFloat(computed.paddingRight) || 0) +
      (Number.parseFloat(computed.borderLeftWidth) || 0) +
      (Number.parseFloat(computed.borderRightWidth) || 0)

    const value = input.value || ' '
    const context = renameInputMeasureContext
    if (!context) {
      input.style.width = `${Math.max(minWidth, 0)}px`
      return
    }

    context.font = computed.font
    const letterSpacing = Number.parseFloat(computed.letterSpacing)
    const extraLetterSpacing = Number.isFinite(letterSpacing) ? Math.max(0, value.length - 1) * letterSpacing : 0
    const textWidth = context.measureText(value).width + extraLetterSpacing
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, Math.ceil(textWidth + horizontalChrome + 2)))
    input.style.width = `${nextWidth}px`
  }

  const openContextMenuForTab = (event: MouseEvent<HTMLButtonElement>, tabId: string) => {
    if (viewMode !== 'main') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'tab', tabId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForSubTab = (event: MouseEvent<HTMLButtonElement>, tabId: string, subTabId: string) => {
    if (viewMode !== 'main') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'subtab', tabId, subTabId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForTrashTab = (event: MouseEvent<HTMLButtonElement>, trashParent: TrashParentBucket) => {
    if (viewMode !== 'trash') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({
      type: 'trash-tab',
      source: trashParent.source,
      deletedTabEntryId: trashParent.deletedTabEntryId,
      parentTabId: trashParent.parentTabId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openContextMenuForTrashSubTab = (
    event: MouseEvent<HTMLButtonElement>,
    trashParent: TrashParentBucket,
    currentSubTabId: string,
  ) => {
    if (viewMode !== 'trash') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({
      type: 'trash-subtab',
      source: trashParent.source,
      deletedTabEntryId: trashParent.deletedTabEntryId,
      parentTabId: trashParent.parentTabId,
      subTabId: currentSubTabId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openContextMenuForSpace = (event: MouseEvent<HTMLButtonElement>, spaceId: string) => {
    if (viewMode !== 'spaces') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'space', spaceId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForDomain = (event: MouseEvent<HTMLButtonElement>, domainId: string) => {
    if (viewMode !== 'domains') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'domain', domainId, x: event.clientX, y: event.clientY })
  }

  const buildDeleteTargetFromContextMenu = (): DeleteTarget | null => {
    if (!contextMenu) return null
    return contextMenu.type === 'tab'
      ? { type: 'tab', tabId: contextMenu.tabId }
      : contextMenu.type === 'subtab'
        ? { type: 'subtab', tabId: contextMenu.tabId, subTabId: contextMenu.subTabId }
        : contextMenu.type === 'image' || contextMenu.type === 'domain'
          ? null
        : contextMenu.type === 'trash-tab'
          ? {
              type: 'trash-tab',
              source: contextMenu.source,
              deletedTabEntryId: contextMenu.deletedTabEntryId,
              parentTabId: contextMenu.parentTabId,
            }
          : contextMenu.type === 'trash-subtab'
            ? {
                type: 'trash-subtab',
                source: contextMenu.source,
                deletedTabEntryId: contextMenu.deletedTabEntryId,
                parentTabId: contextMenu.parentTabId,
                subTabId: contextMenu.subTabId,
              }
            : { type: 'space', spaceId: contextMenu.spaceId }
  }

  const openDeleteModalFromContext = (permanent: boolean) => {
    const target = buildDeleteTargetFromContextMenu()
    if (!target) return
    setModal({ type: 'delete-target', target, permanent })
    setContextMenu(null)
  }

  const deleteFromContext = () => {
    const target = buildDeleteTargetFromContextMenu()
    if (!target) return
    setContextMenu(null)
    deleteTarget(target, false)
  }

  const beginRenameSpaceFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'space') return
    setEditing({ type: 'space', id: contextMenu.spaceId })
    setContextMenu(null)
  }

  const beginRenameDomainFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'domain') return
    setEditing({ type: 'domain', id: contextMenu.domainId })
    setContextMenu(null)
  }

  const deleteSpace = (spaceId: string) => {
    setState((previous) => removeSpaceFromActiveDomain(previous, spaceId))
  }

  const deleteTarget = (target: DeleteTarget, permanent: boolean) => {
    flushPendingContent()
    let nextToastMessage: string | null = null

    if (target.type === 'space') {
      deleteSpace(target.spaceId)
      return
    }

    updateActiveSpaceData((data) => {
      if (target.type === 'trash-tab') {
        if (target.source === 'subtabs-only') {
          return {
            ...data,
            deletedSubTabs: data.deletedSubTabs.filter((entry) => entry.parentTabId !== target.parentTabId),
          }
        }

        return {
          ...data,
          deletedTabs: data.deletedTabs.filter((entry) => entry.id !== target.deletedTabEntryId),
        }
      }

      if (target.type === 'trash-subtab') {
        if (target.source === 'deleted-tab' && target.deletedTabEntryId) {
          return {
            ...data,
            deletedTabs: data.deletedTabs.map((entry) =>
              entry.id !== target.deletedTabEntryId
                ? entry
                : {
                    ...entry,
                    tab: {
                      ...entry.tab,
                      subTabs: entry.tab.subTabs.filter((sub) => sub.id !== target.subTabId),
                    },
                  },
            ),
          }
        }

        return {
          ...data,
          deletedSubTabs: data.deletedSubTabs.filter((entry) => entry.id !== target.subTabId),
        }
      }

      if (target.type === 'tab') {
        const tabToDelete = data.tabs.find((tab) => tab.id === target.tabId)
        if (!tabToDelete) return data
        if (!permanent) {
          nextToastMessage = 'tab has been moved to trash.'
        }

        const remaining = data.tabs.filter((tab) => tab.id !== target.tabId)
        const deletedTabs = permanent
          ? data.deletedTabs
          : [
              ...data.deletedTabs,
              {
                id: createId(),
                tab: tabToDelete,
                deletedAt: Date.now(),
              },
            ]

        if (remaining.length === 0) {
          const fallback = createTab('tab')
          return {
            ...data,
            activeTabId: fallback.id,
            tabs: [fallback],
            deletedTabs,
          }
        }

        const nextActiveId = data.activeTabId === target.tabId ? remaining[0].id : data.activeTabId
        return {
          ...data,
          activeTabId: nextActiveId,
          tabs: remaining.map((tab) => (tab.id === nextActiveId ? { ...tab, activeSubTabId: null } : tab)),
          deletedTabs,
        }
      }

      const parent = data.tabs.find((tab) => tab.id === target.tabId)
      if (!parent) return data
      const subToDelete = parent.subTabs.find((sub) => sub.id === target.subTabId)
      if (!subToDelete) return data
      if (!permanent) {
        nextToastMessage = 'tab has been moved to trash.'
      }

      return {
        ...data,
        tabs: data.tabs.map((tab) =>
          tab.id === target.tabId
            ? {
                ...tab,
                activeSubTabId: tab.activeSubTabId === target.subTabId ? null : tab.activeSubTabId,
                subTabs: tab.subTabs.filter((sub) => sub.id !== target.subTabId),
              }
            : tab,
        ),
        deletedSubTabs: permanent
          ? data.deletedSubTabs
          : [
              ...data.deletedSubTabs,
              {
                id: createId(),
                parentTabId: parent.id,
                parentTabTitle: parent.title,
                subTab: subToDelete,
                deletedAt: Date.now(),
              },
            ],
      }
    })
    if (target.type === 'trash-tab') {
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
    }
    if (target.type === 'trash-subtab') {
      setTrashSubTabId(null)
    }
    if (nextToastMessage) {
      setToast({
        id: Date.now(),
        message: nextToastMessage,
        tone: 'success',
        durationMs: DEFAULT_TOAST_DURATION_MS,
      })
    }
  }

  const restoreAllTrash = () => {
    updateActiveSpaceData((data) => {
      let tabs = [...data.tabs]
      for (const entry of data.deletedTabs) {
        if (tabs.some((tab) => tab.id === entry.tab.id)) continue
        tabs = [...tabs, entry.tab]
      }

      for (const entry of data.deletedSubTabs) {
        const parentIndex = tabs.findIndex((tab) => tab.id === entry.parentTabId)
        if (parentIndex >= 0) {
          const parent = tabs[parentIndex]
          if (!parent.subTabs.some((sub) => sub.id === entry.subTab.id)) {
            tabs[parentIndex] = { ...parent, subTabs: [...parent.subTabs, entry.subTab] }
          }
        } else {
          tabs = [
            ...tabs,
            {
              id: entry.parentTabId,
              title: entry.parentTabTitle,
              homeContent: '',
              activeSubTabId: null,
              subTabs: [entry.subTab],
            },
          ]
        }
      }

      return {
        ...data,
        activeTabId: tabs.some((tab) => tab.id === data.activeTabId) ? data.activeTabId : tabs[0].id,
        tabs,
        deletedTabs: [],
        deletedSubTabs: [],
      }
    })

    setTrashTabId(TRASH_HOME_ID)
    setTrashSubTabId(null)
  }

  const deleteAllTrash = () => {
    updateActiveSpaceData((data) => ({ ...data, deletedTabs: [], deletedSubTabs: [] }))
    setTrashTabId(TRASH_HOME_ID)
    setTrashSubTabId(null)
  }

  const confirmModal = () => {
    if (!modal) return

    if (modal.type === 'export-space') {
      const spaceId = modal.spaceId
      setModal(null)
      void exportData('space', spaceId)
      return
    }

    if (modal.type === 'delete-target') {
      deleteTarget(modal.target, modal.permanent)
    }

    if (modal.type === 'trash-restore-all') restoreAllTrash()
    if (modal.type === 'trash-delete-all') deleteAllTrash()

    setModal(null)
  }

  const modalText = (() => {
    if (!modal) return { title: '', body: '', action: 'confirm' }

    if (modal.type === 'trash-delete-all') {
      return {
        title: 'delete all trash?',
        body: 'this permanently removes every deleted tab and sub-tab in this space.',
        action: 'delete all',
      }
    }

    if (modal.type === 'trash-restore-all') {
      return {
        title: 'restore all trash?',
        body: 'this restores every deleted tab and sub-tab in this space.',
        action: 'restore all',
      }
    }

    if (modal.type === 'export-space') {
      return {
        title: 'export space',
        body: 'choose the space to export. the current space is selected by default.',
        action: 'export',
      }
    }

    if (modal.target.type === 'space') {
      if (state.spaces.length <= 1) {
        return {
          title: 'cannot delete space',
          body: 'at least one space must remain.',
          action: 'ok',
        }
      }
      return {
        title: 'delete space?',
        body: 'deleted spaces cannot be recovered, are you sure you want to do this?',
        action: 'delete space',
      }
    }

    if (modal.target.type === 'trash-tab' && modal.target.source === 'subtabs-only') {
      return {
        title: 'delete sub-tabs for real?',
        body: 'this permanently deletes the trashed sub-tabs under this tab. The parent tab (and its other sub-tabs) will remain.',
        action: 'delete for real',
      }
    }

    return modal.permanent
      ? {
          title: 'delete for real?',
          body: 'this permanently deletes the selected item and skips trash.',
          action: 'delete for real',
        }
      : {
          title: 'move to trash?',
          body: 'this moves the selected item into trash.',
          action: 'delete',
        }
  })()

  const editorReadOnly = viewMode !== 'main'

  const canDeleteSpace = state.spaces.length > 1

  useEffect(() => {
    if (viewMode === 'main' || viewMode === 'trash') {
      lastTabLikeViewRef.current = viewMode
    }
  }, [viewMode])

  useEffect(() => {
    const snapshot = buildNavLocation()
    const history = navHistoryRef.current

    if (isHistoryNavigationRef.current) {
      isHistoryNavigationRef.current = false
      return
    }

    if (history.length === 0) {
      history.push(snapshot)
      navIndexRef.current = 0
      return
    }

    const activeHistory = history.slice(0, navIndexRef.current + 1)
    const current = activeHistory[activeHistory.length - 1]
    if (current && areNavLocationsEqual(current, snapshot)) return

    const collapsedHistory = activeHistory.filter((entry) => !areNavLocationsEqual(entry, snapshot))
    history.splice(0, history.length, ...collapsedHistory, snapshot)
    navIndexRef.current = history.length - 1
  }, [viewMode, activeSpace.id, workspace.activeTabId, activeTab.activeSubTabId, trashTabId, trashSubTabId])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (viewMode === 'settings' && editingShortcut) {
        event.preventDefault()
        if (event.key === 'Escape') {
          setEditingShortcut(null)
          return
        }
        const nextShortcut = buildShortcutFromKeyboardEvent(event, isMacPlatform)
        if (!nextShortcut) return
        updateShortcutSetting(editingShortcut, nextShortcut)
        setEditingShortcut(null)
        return
      }

      if (arrangeMode.active && event.key === 'Escape') {
        event.preventDefault()
        exitArrangeMode()
        return
      }

      const isSettingsShortcut =
        isMacPlatform &&
        event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === ',' || event.code === 'Comma')
      if (isSettingsShortcut) {
        event.preventDefault()
        openSettings()
        return
      }

      const isCommandBracketBack =
        event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === '['
      const isCommandBracketForward =
        event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === ']'
      const isAltArrowBack =
        !isMacPlatform && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.key === 'ArrowLeft'
      const isAltArrowForward =
        !isMacPlatform && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.key === 'ArrowRight'
      const isBrowserBackKey = event.key === 'BrowserBack'
      const isBrowserForwardKey = event.key === 'BrowserForward'

      if (
        state.hotkeys.enableGenericHistoryHotkeys &&
        (isCommandBracketBack || isAltArrowBack || isBrowserBackKey)
      ) {
        event.preventDefault()
        navigateHistoryBy(-1)
        return
      }

      if (
        state.hotkeys.enableGenericHistoryHotkeys &&
        (isCommandBracketForward || isAltArrowForward || isBrowserForwardKey)
      ) {
        event.preventDefault()
        navigateHistoryBy(1)
        return
      }

      const isTabTrashShortcut = eventMatchesShortcut(event, state.hotkeys.shortcuts.toggleTabTrash, isMacPlatform)
      if (isTabTrashShortcut) {
        event.preventDefault()
        if (viewMode === 'spaces' && arrangeMode.active && arrangeMode.scope === 'spaces') {
          return
        }
        if (viewMode === 'main' || viewMode === 'trash') {
          toggleTrashView()
          return
        }
        if (navigateToLastTabLikeLocation()) return
        setViewMode(lastTabLikeViewRef.current)
        setMenuOpen(false)
        setContextMenu(null)
        return
      }

      const isHistoryBackShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === 'Backquote'
      if (isHistoryBackShortcut) {
        event.preventDefault()
        navigateHistoryBy(-1)
        return
      }

      const isHistoryForwardShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && event.shiftKey && event.code === 'Backquote'
      if (isHistoryForwardShortcut) {
        event.preventDefault()
        navigateHistoryBy(1)
        return
      }

      const isSpacesShortcut = eventMatchesShortcut(event, state.hotkeys.shortcuts.openSpaces, isMacPlatform)
      if (isSpacesShortcut) {
        event.preventDefault()
        openSpacesView()
        return
      }

      const isDomainsShortcut = eventMatchesShortcut(event, state.hotkeys.shortcuts.openDomains, isMacPlatform)
      if (isDomainsShortcut) {
        event.preventDefault()
        openDomainsView()
        return
      }

      if (viewMode !== 'main') return

      if (arrangeMode.active) return

      const isCommandNewTab = eventMatchesShortcut(event, state.hotkeys.shortcuts.newTab, isMacPlatform)
      if (isCommandNewTab) {
        event.preventDefault()
        addTab()
        return
      }

      const isCommandNewSubTab = eventMatchesShortcut(event, state.hotkeys.shortcuts.newSubTab, isMacPlatform)
      if (isCommandNewSubTab) {
        event.preventDefault()
        addSubTab()
        return
      }

      const shortcutIndex = getShortcutIndex(event.key)
      const usesCommand = event.metaKey && !event.ctrlKey && !event.altKey
      const childJumpModifierMatch = usesCommand

      if (childJumpModifierMatch && !event.shiftKey && shortcutIndex !== null) {
        event.preventDefault()

        const childTargets: Array<string | null> = [null, ...activeTab.subTabs.map((sub) => sub.id)]
        const nextChild = childTargets[shortcutIndex]
        if (nextChild === undefined) return
        if (nextChild === null) {
          selectTab(activeTab.id)
          return
        }
        selectSubTab(nextChild)
        return
      }

      const childTargets: Array<string | null> = [null, ...activeTab.subTabs.map((sub) => sub.id)]
      if (childTargets.length === 0) return

      const isCycleNextShortcut = eventMatchesShortcut(event, state.hotkeys.shortcuts.cycleSubTabNext, isMacPlatform)
      const isCyclePrevShortcut = eventMatchesShortcut(event, state.hotkeys.shortcuts.cycleSubTabPrev, isMacPlatform)
      if (!isCycleNextShortcut && !isCyclePrevShortcut) return

      event.preventDefault()

      const currentIndex = activeTab.activeSubTabId ? childTargets.findIndex((id) => id === activeTab.activeSubTabId) : 0
      const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0
      const direction = isCyclePrevShortcut ? -1 : 1
      const nextIndex = (safeCurrentIndex + direction + childTargets.length) % childTargets.length
      const nextChild = childTargets[nextIndex]

      if (nextChild === null) {
        selectTab(activeTab.id)
        return
      }

      selectSubTab(nextChild)
    }

    const handleMouseNavigation = (event: globalThis.MouseEvent) => {
      if (!state.hotkeys.enableMouseBackForward) return
      if (event.button === 3) {
        event.preventDefault()
        navigateHistoryBy(-1)
        return
      }
      if (event.button === 4) {
        event.preventDefault()
        navigateHistoryBy(1)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('mouseup', handleMouseNavigation)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('mouseup', handleMouseNavigation)
    }
  }, [viewMode, workspace.tabs, activeTab.id, activeTab.subTabs, activeTab.activeSubTabId, editingShortcut, isMacPlatform, state.hotkeys, arrangeMode.active])

  const primaryTablistProps =
    viewMode === 'settings'
      ? {}
      : ({
          role: 'tablist',
          'aria-label': 'Primary tabs',
        } as const)

  const topbarActions =
    [
      ...(viewMode === 'trash'
        ? [
            {
              key: 'trash-home',
              label: 'trash',
              selected: trashTabId === TRASH_HOME_ID,
              className: 'btn btn-sm tab-btn trash-home-tab topbar-action-btn',
              onClick: () => {
                setTrashTabId(TRASH_HOME_ID)
                setTrashSubTabId(null)
              },
            },
          ]
        : []),
      ...(viewMode === 'settings'
        ? [
            {
              key: 'settings-view',
              label: 'settings',
              selected: false,
              className: 'btn btn-sm tab-btn topbar-action-btn topbar-context-btn',
              onClick: closeSettingsView,
            },
          ]
        : []),
      ...(viewMode === 'stage-manager'
        ? [
            {
              key: 'end-stage-manager',
              label: 'director',
              selected: false,
              className: 'btn btn-sm tab-btn topbar-action-btn topbar-context-btn',
              onClick: endStageManager,
            },
          ]
        : []),
      ...(arrangeMode.active && arrangeMode.scope === 'tabs'
        ? [
            {
              key: 'end-arrangement',
              label: 'arrangement',
              selected: false,
              className: 'btn btn-sm tab-btn topbar-action-btn topbar-context-btn',
              onClick: exitArrangeMode,
            },
          ]
        : []),
    ]
  const topbarShowsCloseControl =
    viewMode === 'settings' || viewMode === 'stage-manager' || (arrangeMode.active && arrangeMode.scope === 'tabs')

  const isNoteWorkspaceView = viewMode === 'main' || viewMode === 'stage-manager'
  const stageManagerStepLabels: Array<[StageManagerStep, string]> = [
    ['select', 'select items'],
    ['action', 'choose action'],
    ['configure', 'configure'],
    ['review', 'review'],
  ]
  const arrangeableParentTabClassName = arrangeMode.active && arrangeMode.scope === 'tabs' && viewMode === 'main' ? 'is-arrangeable' : ''
  const arrangeableSubTabClassName = arrangeMode.active && arrangeMode.scope === 'tabs' && viewMode === 'main' ? 'is-arrangeable' : ''
  const draggingParentTabId =
    arrangeMode.active && arrangeDraggingItem?.type === 'tab' ? arrangeDraggingItem.tabId : null
  const draggingSubTabId =
    arrangeMode.active && arrangeDraggingItem?.type === 'subtab' ? arrangeDraggingItem.subTabId : null
  const arrangeableSpaceClassName = arrangeMode.active && arrangeMode.scope === 'spaces' && viewMode === 'spaces' ? 'is-arrangeable' : ''
  const draggingSpaceId =
    arrangeMode.active && arrangeDraggingItem?.type === 'space' ? arrangeDraggingItem.spaceId : null

  return (
    <main
      className={`app-shell theme-${state.theme} ${viewMode === 'trash' ? 'view-trash' : 'view-main'}`}
      style={
        {
          '--tab-button-scale': String(state.ui.tabButtonScale),
          '--note-font-scale': String(state.ui.noteFontScale),
        } as React.CSSProperties
      }
    >
      {viewMode !== 'spaces' && viewMode !== 'domains' && (
        <header className={`tabbar ${arrangeMode.active && viewMode === 'main' ? 'is-arranging' : ''}`}>
          <div className="tabbar-row">
            <div
              ref={primaryTabRailRef}
              className="tabbar-scroll tabbar-primary"
              {...primaryTablistProps}
            >
              {isNoteWorkspaceView &&
                workspace.tabs.map((tab) =>
                  editing?.type === 'tab' && editing.id === tab.id ? (
                    <input
                      key={tab.id}
                    className="tab-rename-input"
                    defaultValue={tab.title}
                    autoFocus
                    onFocus={(event) => {
                      autoSizeRenameInput(event.currentTarget)
                      event.currentTarget.select()
                    }}
                    onInput={(event) => autoSizeRenameInput(event.currentTarget)}
                    onBlur={(event) => {
                      if (shouldSkipRenameBlur('tab', tab.id)) return
                      commitRename('tab', tab.id, event.target.value)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename('tab', tab.id, (event.target as HTMLInputElement).value)
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelRename('tab', tab.id)
                      }
                    }}
                    />
                  ) : (
                    (() => {
                      const stageManagerSelection = viewMode === 'stage-manager' ? getStageManagerParentSelection(tab) : null
                      const isArrangeMoveTarget =
                        arrangeMode.active &&
                        arrangeMode.dragItem?.type === 'subtab' &&
                        arrangeMode.overParentTabId === tab.id
                      const isArrangeBeforeTarget =
                        arrangeMode.active &&
                        arrangeMode.dragItem?.type === 'tab' &&
                        arrangeMode.overParentTabId === tab.id &&
                        arrangeMode.overParentInsert === 'before'
                      const isArrangeAfterTarget =
                        arrangeMode.active &&
                        arrangeMode.dragItem?.type === 'tab' &&
                        arrangeMode.overParentTabId === tab.id &&
                        arrangeMode.overParentInsert === 'after'
                      return (
                        <button
                          key={tab.id}
                          data-arrange-tab-id={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={tab.id === activeTab.id}
                          draggable={false}
                          className={`btn btn-sm ${tab.id === activeTab.id ? 'btn-primary' : 'btn-outline-secondary'} tab-btn parent-tab-btn ${arrangeableParentTabClassName} ${isArrangeMoveTarget ? 'is-arrange-target' : ''} ${isArrangeBeforeTarget ? 'is-arrange-target-before' : ''} ${isArrangeAfterTarget ? 'is-arrange-target-after' : ''} ${draggingParentTabId === tab.id ? 'is-dragging' : ''} ${
                            stageManagerSelection?.mode === 'partial' ? 'stage-manager-parent-partial' : ''
                          } ${stageManagerSelection?.mode === 'full' ? 'stage-manager-parent-full' : ''}`}
                          onClick={() => {
                            if (viewMode === 'stage-manager') {
                              handleStageManagerParentClick(tab)
                              return
                            }
                            if (consumeArrangeClickSuppression(`tab:${tab.id}`)) return
                            selectTab(tab.id)
                          }}
                          onDoubleClick={() => {
                            if (viewMode !== 'main' || arrangeMode.active) return
                            setEditing({ type: 'tab', id: tab.id })
                          }}
                          onContextMenu={(event) => {
                            if (viewMode !== 'main') return
                            openContextMenuForTab(event, tab.id)
                          }}
                          onPointerDown={(event) => {
                            if (viewMode !== 'main') return
                            if (event.button === 0) {
                              event.currentTarget.setPointerCapture(event.pointerId)
                            }
                            startArrangeDragSeed(`tab:${tab.id}`, event)
                            if (arrangeMode.active) {
                              startArrangeTapCandidate({ key: `tab:${tab.id}`, type: 'tab', tabId: tab.id }, event)
                              return
                            }
                            startArrangePress(event, { type: 'tab', tabId: tab.id }, `tab:${tab.id}`)
                          }}
                          onPointerMove={(event) =>
                            handleArrangeTabPointerMove(event, { type: 'tab', tabId: tab.id }, tab.title, 'parent')
                          }
                          onPointerUp={(event) => {
                            if (viewMode !== 'main') return
                            handleArrangeTabPointerUp(event, `tab:${tab.id}`, () => selectTab(tab.id))
                          }}
                          onPointerLeave={() => {
                            if (viewMode !== 'main') return
                            if (!arrangeMode.active) {
                              clearArrangePressTimer()
                            }
                          }}
                          onPointerCancel={() => {
                            if (viewMode !== 'main') return
                            cancelArrangeTabPointerDrag()
                          }}
                        >
                          {tab.title}
                        </button>
                      )
                    })()
                  ),
                )}

              {viewMode === 'trash' && (
                <>
                  {trashParentTabs.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      role="tab"
                      aria-selected={trashTabId === entry.id}
                      className={`btn btn-sm tab-btn trash-parent-tab ${trashTabId === entry.id ? 'is-selected' : ''}`}
                      onClick={() => {
                        setTrashTabId(entry.id)
                        setTrashSubTabId(null)
                      }}
                      onContextMenu={(event) => openContextMenuForTrashTab(event, entry)}
                    >
                      {entry.title}
                    </button>
                  ))}
                </>
              )}

              {viewMode === 'main' && !arrangeMode.active && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light add-tab-btn"
                  onClick={addTab}
                  title="Add tab"
                >
                  +
                </button>
              )}
            </div>

            <div className="tabbar-controls">
              {topbarActions.length > 0 && (
                <div className="topbar-actions" role="group" aria-label="Top bar actions">
                  {topbarActions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      aria-pressed={action.selected}
                      className={`${action.className} ${action.selected ? 'is-selected' : ''}`}
                      onClick={action.onClick}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="menu-wrap" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className={`menu-btn ${topbarShowsCloseControl ? 'is-close' : ''}`}
                  onClick={() => {
                    if (arrangeMode.active) {
                      exitArrangeMode()
                      return
                    }
                    if (viewMode === 'stage-manager') {
                      endStageManager()
                      return
                    }
                    if (viewMode === 'settings') {
                      closeSettingsView()
                      return
                    }
                    setMenuOpen((open) => !open)
                  }}
                  aria-label={topbarShowsCloseControl ? 'Close' : 'Menu'}
                >
                  <span className="menu-btn-line" />
                  <span className="menu-btn-line" />
                </button>
                {!topbarShowsCloseControl && menuOpen && (
                  <div className="menu-dropdown">
                    <button type="button" className="menu-item" onClick={openDomainsView}>
                      domains
                    </button>
                    <button type="button" className="menu-item" onClick={openSpacesView}>
                      spaces
                    </button>
                    {viewMode === 'main' && (
                      <button type="button" className="menu-item" onClick={openStageManager}>
                        director
                      </button>
                    )}
                    <button type="button" className="menu-item" onClick={toggleTrashView}>
                      {viewMode === 'trash' ? 'tabs' : 'trash'}
                    </button>
                    <button type="button" className="menu-item" onClick={openSettings}>
                      settings
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      {tabArrangeDragPreview && (
        <div
          className={`tab-arrange-preview ${tabArrangeDragPreview.variant === 'subtab' ? 'is-subtab' : 'is-parent'}`}
          style={{
            left: `${tabArrangeDragPreview.currentX - tabArrangeDragPreview.offsetX}px`,
            top: `${tabArrangeDragPreview.currentY - tabArrangeDragPreview.offsetY}px`,
            width: `${tabArrangeDragPreview.width}px`,
            height: `${tabArrangeDragPreview.height}px`,
          }}
        >
          <span>{tabArrangeDragPreview.label}</span>
        </div>
      )}

      {viewMode === 'domains' ? (
        <DomainsPage
          domains={state.domains}
          activeDomainId={state.activeDomainId}
          editingDomainId={editing?.type === 'domain' ? editing.id : null}
          onAddDomain={addDomainFromPage}
          onOpenDomain={openDomain}
          onCommitRename={(domainId, name) => commitRename('domain', domainId, name)}
          onCancelRename={(domainId) => cancelRename('domain', domainId)}
          onShouldSkipRenameBlur={(domainId) => shouldSkipRenameBlur('domain', domainId)}
          onOpenContextMenu={openContextMenuForDomain}
        />
      ) : viewMode === 'spaces' ? (
        <SpacesPage
          spaces={state.spaces}
          activeSpaceId={state.activeSpaceId}
          editingSpaceId={editing?.type === 'space' ? editing.id : null}
          arrangeMode={arrangeMode}
          arrangeableSpaceClassName={arrangeableSpaceClassName}
          draggingSpaceId={draggingSpaceId}
          spaceArrangeDragPreview={spaceArrangeDragPreview}
          spacesGridRef={spacesGridRef}
          onBackgroundClick={() => {
            if (arrangeMode.active && arrangeMode.scope === 'spaces') {
              if (suppressNextSpaceArrangeExitRef.current) {
                suppressNextSpaceArrangeExitRef.current = false
                return
              }
              exitArrangeMode()
            }
          }}
          onOpenDomains={openDomainsView}
          onOpenSpace={openSpace}
          onAddSpace={addSpace}
          onExitArrangeMode={exitArrangeMode}
          onCommitRename={(spaceId, name) => commitRename('space', spaceId, name)}
          onCancelRename={(spaceId) => cancelRename('space', spaceId)}
          onShouldSkipRenameBlur={(spaceId) => shouldSkipRenameBlur('space', spaceId)}
          onOpenContextMenu={openContextMenuForSpace}
          onConsumeArrangeClickSuppression={consumeArrangeClickSuppression}
          onStartArrangeDragSeed={startArrangeDragSeed}
          onStartArrangeTapCandidate={startArrangeTapCandidate}
          onStartArrangePress={startArrangePress}
          onHandleArrangeSpacePointerMove={handleArrangeSpacePointerMove}
          onHandleArrangeSpacePointerUp={handleArrangeSpacePointerUp}
          onClearArrangePressTimer={clearArrangePressTimer}
          onCancelArrangeSpacePointerDrag={cancelArrangeSpacePointerDrag}
        />
      ) : viewMode === 'settings' ? (
        <section className="settings-page-wrap">
          <div className="settings-page-card">
            <div className="settings-section-tabs" role="tablist" aria-label="settings sections">
              {(['hotkeys', 'data', 'visuals'] as SettingsSection[]).map((section) => (
                <button
                  key={section}
                  type="button"
                  role="tab"
                  aria-selected={settingsSection === section}
                  className={`settings-section-tab ${settingsSection === section ? 'is-active' : ''}`}
                  onClick={() => {
                    setSettingsSection(section)
                    if (section !== 'hotkeys') setEditingShortcut(null)
                  }}
                >
                  {section}
                </button>
              ))}
            </div>

            {settingsSection === 'hotkeys' && (
              <div className="settings-section-panel" role="tabpanel">
                <p>hotkeys ({isMacPlatform ? 'mac' : 'windows'}):</p>
                <div className="settings-hotkeys-list">
                  {(
                    [
                      ['toggleTabTrash', 'toggle tabs/trash'],
                      ['openDomains', 'open domains'],
                      ['openSpaces', 'open spaces'],
                      ['newTab', 'new parent tab'],
                      ['newSubTab', 'new sub tab'],
                      ['cycleSubTabNext', 'next sub tab'],
                      ['cycleSubTabPrev', 'previous sub tab'],
                    ] as Array<[ShortcutId, string]>
                  ).map(([shortcutId, label]) => (
                    <div key={shortcutId} className="settings-hotkey-row">
                      <span className="settings-hotkey-label">{label}</span>
                      <button
                        type="button"
                        className={`settings-shortcut-btn ${editingShortcut === shortcutId ? 'is-recording' : ''}`}
                        onClick={() => setEditingShortcut((current) => (current === shortcutId ? null : shortcutId))}
                      >
                        {editingShortcut === shortcutId
                          ? 'press keys...'
                          : formatShortcutLabel(shortcutDrafts[shortcutId], isMacPlatform)}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="settings-help">click a hotkey and press a new key combination. press escape to cancel.</p>
                <div className="settings-hotkey-row">
                  <label className="settings-hotkey-label" htmlFor="settings-mouse-back-forward">
                    enable mouse back/forward buttons
                  </label>
                  <div className="form-check form-switch settings-switch">
                    <input
                      id="settings-mouse-back-forward"
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      checked={mouseBackForwardEnabledDraft}
                      onChange={(event) => updateMouseBackForwardSetting(event.target.checked)}
                    />
                  </div>
                </div>
                <div className="settings-hotkey-row">
                  <label className="settings-hotkey-label" htmlFor="settings-generic-history-hotkeys">
                    enable generic back/forward hotkeys
                  </label>
                  <div className="form-check form-switch settings-switch">
                    <input
                      id="settings-generic-history-hotkeys"
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      checked={genericHistoryHotkeysEnabledDraft}
                      onChange={(event) => updateGenericHistoryHotkeysSetting(event.target.checked)}
                    />
                  </div>
                </div>
                <p className="settings-help">
                  generic hotkeys: {isMacPlatform ? 'cmd+[ and cmd+]' : 'alt+left and alt+right'}.
                </p>
              </div>
            )}

            {settingsSection === 'data' && (
              <div className="settings-section-panel" role="tabpanel">
                <p>automatically remove deleted items after:</p>
                <div className="settings-field-row">
                  <input
                    type="number"
                    className="settings-number-input"
                    min={MIN_AUTO_REMOVE_DAYS}
                    max={MAX_AUTO_REMOVE_DAYS}
                    step={1}
                    value={settingsDaysDraft}
                    onChange={(event) => updateAutoRemoveDaysSetting(event.target.value)}
                    onBlur={() => updateAutoRemoveDaysSetting(settingsDaysDraft, true)}
                  />
                  <span className="settings-field-suffix">days</span>
                </div>
                <p className="settings-help">
                  min {MIN_AUTO_REMOVE_DAYS} day, max {MAX_AUTO_REMOVE_DAYS} days. default is {DEFAULT_AUTO_REMOVE_DAYS}.
                </p>
                <div className="settings-divider" />
                <div className="settings-page-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-light"
                    onClick={() => setModal({ type: 'export-space', spaceId: activeSpace.id })}
                  >
                    export space
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-light" onClick={() => exportData('all')}>
                    export all
                  </button>
                </div>
                <p className="settings-help">exports convert internal tab markers to four spaces for clean markdown files.</p>
                {exportStatus && <p className="settings-help">{exportStatus}</p>}
              </div>
            )}

            {settingsSection === 'visuals' && (
              <div className="settings-section-panel" role="tabpanel">
                <div className="settings-hotkey-row">
                  <span className="settings-hotkey-label" id="settings-theme-label">
                    theme
                  </span>
                  <div className="theme-switch" role="radiogroup" aria-labelledby="settings-theme-label">
                    {THEME_OPTIONS.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        role="radio"
                        aria-checked={state.theme === theme.id}
                        className={`theme-switch-option ${state.theme === theme.id ? 'is-selected' : ''}`}
                        onClick={() => updateThemeSetting(theme.id)}
                      >
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="settings-help">dusk is available as a selection now; its visual treatment can be added later.</p>
                <div className="settings-hotkey-row settings-slider-row">
                  <label className="settings-hotkey-label" htmlFor="settings-tab-button-scale">
                    tab button size
                  </label>
                  <div className="settings-slider-wrap">
                    <input
                      id="settings-tab-button-scale"
                      className="form-range settings-range-input"
                      type="range"
                      min={MIN_TAB_BUTTON_SCALE}
                      max={MAX_TAB_BUTTON_SCALE}
                      step={TAB_BUTTON_SCALE_STEP}
                      value={tabButtonScaleDraft}
                      onChange={(event) => updateTabButtonScaleSetting(event.target.value)}
                    />
                    <span className="settings-range-value">{Math.round(tabButtonScaleDraft * 100)}%</span>
                  </div>
                </div>
                <p className="settings-help">adjusts the size of the parent and sub-tab buttons together.</p>
                <div className="settings-hotkey-row settings-slider-row">
                  <label className="settings-hotkey-label" htmlFor="settings-note-font-scale">
                    note font size
                  </label>
                  <div className="settings-slider-wrap">
                    <input
                      id="settings-note-font-scale"
                      className="form-range settings-range-input"
                      type="range"
                      min={MIN_NOTE_FONT_SCALE}
                      max={MAX_NOTE_FONT_SCALE}
                      step={NOTE_FONT_SCALE_STEP}
                      value={noteFontScaleDraft}
                      onChange={(event) => updateNoteFontScaleSetting(event.target.value)}
                    />
                    <span className="settings-range-value">{Math.round(noteFontScaleDraft * 100)}%</span>
                  </div>
                </div>
                <p className="settings-help">adjusts note text size without changing tabs or toolbar controls.</p>
                <div className="settings-hotkey-row">
                  <label
                    className="settings-hotkey-label"
                    htmlFor="settings-show-parent-home-tab"
                    title='adds a fixed first sub-tab named "home" for each parent tab.'
                  >
                    show parent home tab with the other sub-tabs
                  </label>
                  <div className="form-check form-switch settings-switch">
                    <input
                      id="settings-show-parent-home-tab"
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      checked={showParentHomeTabDraft}
                      onChange={(event) => updateShowParentHomeTabSetting(event.target.checked)}
                    />
                  </div>
                </div>
                <p className="settings-help">
                  when enabled, a locked <code>home</code> sub-tab appears first. it cannot be renamed or deleted.
                </p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <>
          {(isNoteWorkspaceView || (viewMode === 'trash' && Boolean(selectedTrashTab))) && (
            <header
              className={`subtabbar ${arrangeMode.active && viewMode === 'main' ? 'is-arranging' : ''}`}
              role="tablist"
              aria-label="Nested note tabs"
            >
              <div ref={subTabRailRef} className="tabbar-scroll">
                {isNoteWorkspaceView && state.ui.showParentHomeTab && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'main' && !activeSubTab}
                    className={`btn btn-sm ${viewMode === 'main' && !activeSubTab ? 'btn-info' : 'btn-outline-info'} tab-btn subtab-btn home-subtab-btn ${arrangeableSubTabClassName} ${
                      viewMode === 'stage-manager' && getStageManagerParentSelection(activeTab).mode === 'full'
                        ? 'stage-manager-home-selected'
                        : ''
                    } ${arrangeMode.active ? 'is-arrange-fixed' : ''} ${
                      arrangeMode.active &&
                      arrangeMode.dragItem?.type === 'subtab' &&
                      arrangeMode.dragItem.parentTabId === activeTab.id &&
                      activeTab.subTabs[0] &&
                      arrangeMode.overSubTabId === activeTab.subTabs[0].id &&
                      arrangeMode.overSubTabInsert === 'before'
                        ? 'is-arrange-home-target'
                        : ''
                    }`}
                    onClick={() => {
                      if (viewMode === 'stage-manager') {
                        handleStageManagerHomeClick()
                        return
                      }
                      if (consumeArrangeClickSuppression(`home:${activeTab.id}`)) return
                      selectParentHomeTab()
                    }}
                    title="home note"
                    onPointerDown={(event) => {
                      if (viewMode !== 'main') return
                      if (arrangeMode.active) {
                        startArrangeTapCandidate({ key: `home:${activeTab.id}`, type: 'home' }, event)
                        return
                      }
                      startArrangePress(event, null, `home:${activeTab.id}`)
                    }}
                    onPointerUp={(event) => {
                      if (viewMode !== 'main') return
                      if (arrangeMode.active) {
                        finalizeArrangeTapCandidate(`home:${activeTab.id}`, event, selectParentHomeTab)
                        return
                      }
                      clearArrangePressTimer()
                    }}
                    onPointerLeave={() => {
                      if (viewMode !== 'main') return
                      if (!arrangeMode.active) {
                        clearArrangePressTimer()
                      }
                    }}
                    onPointerCancel={() => {
                      if (viewMode !== 'main') return
                      clearArrangePressTimer()
                      clearArrangeTapCandidate()
                    }}
                  >
                    home
                  </button>
                )}

                {isNoteWorkspaceView &&
                  activeTab.subTabs.map((subTab) =>
                    editing?.type === 'subtab' && editing.id === subTab.id ? (
                      <input
                        key={subTab.id}
                        className="tab-rename-input"
                        defaultValue={subTab.title}
                        autoFocus
                        onFocus={(event) => {
                          autoSizeRenameInput(event.currentTarget)
                          event.currentTarget.select()
                        }}
                        onInput={(event) => autoSizeRenameInput(event.currentTarget)}
                        onBlur={(event) => {
                          if (shouldSkipRenameBlur('subtab', subTab.id)) return
                          commitRename('subtab', subTab.id, event.target.value)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitRename('subtab', subTab.id, (event.target as HTMLInputElement).value)
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            cancelRename('subtab', subTab.id)
                          }
                        }}
                      />
                    ) : (
                      <button
                        key={subTab.id}
                        data-arrange-subtab-id={subTab.id}
                        type="button"
                        role="tab"
                        aria-selected={viewMode === 'main' && subTab.id === activeSubTab?.id}
                        draggable={false}
                        className={`btn btn-sm ${viewMode === 'main' && subTab.id === activeSubTab?.id ? 'btn-info' : 'btn-outline-info'} tab-btn subtab-btn ${arrangeableSubTabClassName} ${
                          arrangeMode.active &&
                          arrangeMode.dragItem?.type === 'subtab' &&
                          arrangeMode.dragItem.parentTabId === activeTab.id &&
                          arrangeMode.overSubTabId === subTab.id &&
                          arrangeMode.overSubTabInsert === 'before'
                            ? 'is-arrange-target-before'
                            : ''
                        } ${
                          arrangeMode.active &&
                          arrangeMode.dragItem?.type === 'subtab' &&
                          arrangeMode.dragItem.parentTabId === activeTab.id &&
                          arrangeMode.overSubTabId === subTab.id &&
                          arrangeMode.overSubTabInsert === 'after'
                            ? 'is-arrange-target-after'
                            : ''
                        } ${draggingSubTabId === subTab.id ? 'is-dragging' : ''} ${
                          viewMode === 'stage-manager' && getStageManagerParentSelection(activeTab).selectedSubTabIds.includes(subTab.id)
                            ? 'stage-manager-subtab-selected'
                            : ''
                        }`}
                        onClick={() => {
                          if (viewMode === 'stage-manager') {
                            handleStageManagerSubTabClick(activeTab, subTab.id)
                            return
                          }
                          if (consumeArrangeClickSuppression(`subtab:${subTab.id}`)) return
                          selectSubTab(subTab.id)
                        }}
                        onDoubleClick={() => {
                          if (viewMode !== 'main' || arrangeMode.active) return
                          setEditing({ type: 'subtab', id: subTab.id })
                        }}
                        onContextMenu={(event) => {
                          if (viewMode !== 'main') return
                          openContextMenuForSubTab(event, activeTab.id, subTab.id)
                        }}
                        onPointerDown={(event) => {
                          if (viewMode !== 'main') return
                          if (event.button === 0) {
                            event.currentTarget.setPointerCapture(event.pointerId)
                          }
                          startArrangeDragSeed(`subtab:${subTab.id}`, event)
                          if (arrangeMode.active) {
                            startArrangeTapCandidate({ key: `subtab:${subTab.id}`, type: 'subtab', subTabId: subTab.id }, event)
                            return
                          }
                          startArrangePress(event, { type: 'subtab', parentTabId: activeTab.id, subTabId: subTab.id }, `subtab:${subTab.id}`)
                        }}
                        onPointerMove={(event) =>
                          handleArrangeTabPointerMove(
                            event,
                            { type: 'subtab', parentTabId: activeTab.id, subTabId: subTab.id },
                            subTab.title,
                            'subtab',
                          )
                        }
                        onPointerUp={(event) => {
                          if (viewMode !== 'main') return
                          handleArrangeTabPointerUp(event, `subtab:${subTab.id}`, () => selectSubTab(subTab.id))
                        }}
                        onPointerLeave={() => {
                          if (viewMode !== 'main') return
                          if (!arrangeMode.active) {
                            clearArrangePressTimer()
                          }
                        }}
                        onPointerCancel={() => {
                          if (viewMode !== 'main') return
                          cancelArrangeTabPointerDrag()
                        }}
                      >
                        {subTab.title}
                      </button>
                    ),
                  )}

                {viewMode === 'trash' &&
                  trashSubTabs.map((subTab) => (
                    <button
                      key={subTab.id}
                      type="button"
                      role="tab"
                      aria-selected={subTab.id === selectedTrashSubTab?.id}
                      className={`btn btn-sm tab-btn trash-subtab-btn ${subTab.id === selectedTrashSubTab?.id ? 'is-selected' : ''}`}
                      onClick={() => setTrashSubTabId(subTab.id)}
                      onContextMenu={(event) => {
                        if (!selectedTrashTab) return
                        openContextMenuForTrashSubTab(event, selectedTrashTab, subTab.id)
                      }}
                    >
                      {subTab.title}
                    </button>
                  ))}

                {viewMode === 'main' && !arrangeMode.active && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-light add-tab-btn"
                    onClick={addSubTab}
                    title="Add note tab"
                  >
                    +
                  </button>
                )}
              </div>
            </header>
          )}

          {viewMode === 'stage-manager' ? (
            <section className="stage-manager-shell">
              <div className="stage-manager-card">
                <div className="stage-manager-steps" aria-label="Director steps">
                  {stageManagerStepLabels.map(([step, label], index) => (
                    <div
                      key={step}
                      className={`stage-manager-step-pill ${stageManagerStep === step ? 'is-active' : ''} ${
                        stageManagerStepLabels.findIndex(([candidate]) => candidate === stageManagerStep) > index ? 'is-complete' : ''
                      }`}
                    >
                      <span className="stage-manager-step-index">{index + 1}</span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>

                {stageManagerStep === 'select' && (
                  <div className="stage-manager-panel">
                    <h2>director</h2>
                    <p>select the parent tabs and sub-tabs you want to work with in this space.</p>
                    <div className="stage-manager-actions-row">
                      <button type="button" className="btn btn-sm btn-outline-light" onClick={selectAllStageManagerItems}>
                        select all
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-light" onClick={deselectAllStageManagerItems}>
                        deselect all
                      </button>
                    </div>
                    <p className="stage-manager-help">
                      selected parent tabs: {stageManagerSelectionCounts.fullParentCount}. selected sub-tabs:{' '}
                      {stageManagerSelectionCounts.selectedSubTabCount}.
                    </p>
                  </div>
                )}

                {stageManagerStep === 'action' && (
                  <div className="stage-manager-panel">
                    <h2>choose action</h2>
                    <p>pick what you want to do with the current selection.</p>
                    <div className="stage-manager-action-grid">
                      {([
                        ['migrate', 'migrate'],
                        ['promote', 'promote'],
                        ['demote', 'demote'],
                        ['mass-delete', 'mass delete'],
                      ] as Array<[StageManagerAction, string]>).map(([action, label]) => (
                        <button
                          key={action}
                          type="button"
                          className={`btn btn-sm stage-manager-action-btn ${stageManagerAction === action ? 'is-selected' : ''}`}
                          onClick={() => selectStageManagerAction(action)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {stageManagerAction === 'migrate' && (
                      <p className="stage-manager-help">
                        migration changes location. moving a parent tab into another parent will demote that parent into a sub-tab.
                      </p>
                    )}
                    {stageManagerAction === 'promote' && (
                      <p className="stage-manager-help">
                        promotion changes level. one fully selected parent can become a new space. selected sub-tabs can become prime tabs.
                      </p>
                    )}
                    {stageManagerAction === 'demote' && (
                      <p className="stage-manager-help">
                        demotion changes level. selected parent tabs become sub-tabs under the destination parent, and selected loose sub-tabs move with them.
                      </p>
                    )}
                    {stageManagerAction === 'mass-delete' && (
                      <p className="stage-manager-help">
                        mass delete can either move the selection into trash or permanently remove it.
                      </p>
                    )}
                  </div>
                )}

                {stageManagerStep === 'configure' && (
                  <div className="stage-manager-panel">
                    <h2>configure</h2>
                    {stageManagerAction === 'promote' && stageManagerSelectionSnapshot.fullParents.length === 1 && (
                      <>
                        <p>this fully selected parent will become a new space. its home note becomes a prime tab named <code>main</code>.</p>
                        <div className="stage-manager-field-grid">
                          <label className="stage-manager-field">
                            <span>new space name</span>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={stageManagerDraft.newSpaceName}
                              onChange={(event) => updateStageManagerDraft({ newSpaceName: event.target.value })}
                              placeholder={stageManagerSelectionSnapshot.fullParents[0]?.title ?? 'new space'}
                            />
                          </label>
                        </div>
                      </>
                    )}

                    {stageManagerAction === 'promote' && stageManagerSelectionSnapshot.fullParents.length === 0 && (
                      <>
                        <p>selected sub-tabs will be promoted into prime tabs in the destination space.</p>
                        <div className="stage-manager-actions-row">
                          <button
                            type="button"
                            className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.promoteSpaceMode === 'existing' ? 'is-selected' : ''}`}
                            onClick={() => updateStageManagerDraft({ promoteSpaceMode: 'existing' })}
                          >
                            existing space
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.promoteSpaceMode === 'new' ? 'is-selected' : ''}`}
                            onClick={() => updateStageManagerDraft({ promoteSpaceMode: 'new' })}
                          >
                            new space
                          </button>
                        </div>
                        <div className="stage-manager-field-grid">
                          {stageManagerDraft.promoteSpaceMode === 'existing' ? (
                            <label className="stage-manager-field">
                              <span>destination space</span>
                              <select
                                className="form-select form-select-sm"
                                value={stageManagerDraft.promoteSpaceId}
                                onChange={(event) => updateStageManagerDraft({ promoteSpaceId: event.target.value })}
                              >
                                <option value="">select a space</option>
                                {stageManagerPromoteDestinationSpaces.map((space) => (
                                  <option key={space.id} value={space.id}>
                                    {space.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <label className="stage-manager-field">
                              <span>new space name</span>
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={stageManagerDraft.newSpaceName}
                                onChange={(event) => updateStageManagerDraft({ newSpaceName: event.target.value })}
                                placeholder="new space"
                              />
                            </label>
                          )}
                        </div>
                      </>
                    )}

                    {stageManagerAction === 'demote' && (
                      <>
                        <p>selected parent tabs will become sub-tabs under the destination parent. their old home notes become their new note content.</p>
                        <div className="stage-manager-actions-row">
                          <button
                            type="button"
                            className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.demoteParentMode === 'existing' ? 'is-selected' : ''}`}
                            onClick={() => updateStageManagerDraft({ demoteParentMode: 'existing' })}
                          >
                            existing parent
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.demoteParentMode === 'new' ? 'is-selected' : ''}`}
                            onClick={() => updateStageManagerDraft({ demoteParentMode: 'new' })}
                          >
                            new parent
                          </button>
                        </div>
                        <div className="stage-manager-field-grid">
                          {stageManagerDraft.demoteParentMode === 'existing' ? (
                            <label className="stage-manager-field">
                              <span>destination parent</span>
                              <select
                                className="form-select form-select-sm"
                                value={stageManagerDraft.demoteParentId}
                                onChange={(event) => updateStageManagerDraft({ demoteParentId: event.target.value })}
                              >
                                <option value="">select a parent tab</option>
                                {stageManagerDemoteParentOptions.map((tab) => (
                                  <option key={tab.id} value={tab.id}>
                                    {tab.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <label className="stage-manager-field">
                              <span>new parent name</span>
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={stageManagerDraft.demoteNewParentName}
                                onChange={(event) => updateStageManagerDraft({ demoteNewParentName: event.target.value })}
                                placeholder="new parent"
                              />
                            </label>
                          )}
                        </div>
                      </>
                    )}

                    {stageManagerAction === 'migrate' && (
                      <>
                        <p>choose whether the selection moves to another space or underneath a destination parent tab.</p>
                        <div className="stage-manager-actions-row">
                          <button
                            type="button"
                            className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.migrateTarget === 'space' ? 'is-selected' : ''}`}
                            onClick={() => updateStageManagerDraft({ migrateTarget: 'space' })}
                          >
                            migrate to space
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.migrateTarget === 'parent' ? 'is-selected' : ''}`}
                            onClick={() => updateStageManagerDraft({ migrateTarget: 'parent' })}
                          >
                            migrate to parent
                          </button>
                        </div>

                        {stageManagerDraft.migrateTarget === 'space' && (
                          <>
                            <div className="stage-manager-actions-row">
                              <button
                                type="button"
                                className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.migrateSpaceMode === 'existing' ? 'is-selected' : ''}`}
                                onClick={() => updateStageManagerDraft({ migrateSpaceMode: 'existing' })}
                              >
                                existing space
                              </button>
                              <button
                                type="button"
                                className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.migrateSpaceMode === 'new' ? 'is-selected' : ''}`}
                                onClick={() => updateStageManagerDraft({ migrateSpaceMode: 'new' })}
                              >
                                new space
                              </button>
                            </div>
                            <div className="stage-manager-field-grid">
                              {stageManagerDraft.migrateSpaceMode === 'existing' ? (
                                <label className="stage-manager-field">
                                  <span>destination space</span>
                                  <select
                                    className="form-select form-select-sm"
                                    value={stageManagerDraft.migrateSpaceId}
                                    onChange={(event) => updateStageManagerDraft({ migrateSpaceId: event.target.value })}
                                  >
                                    <option value="">select a space</option>
                                    {stageManagerOtherSpaces.map((space) => (
                                      <option key={space.id} value={space.id}>
                                        {space.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : (
                                <label className="stage-manager-field">
                                  <span>new space name</span>
                                  <input
                                    type="text"
                                    className="form-control form-control-sm"
                                    value={stageManagerDraft.newSpaceName}
                                    onChange={(event) => updateStageManagerDraft({ newSpaceName: event.target.value })}
                                    placeholder="new space"
                                  />
                                </label>
                              )}
                            </div>

                            {stageManagerSelectionSnapshot.looseSubTabs.length > 0 && (
                              <>
                                <label className="stage-manager-field">
                                  <span>how do we handle stray sub-tabs?</span>
                                  <select
                                    className="form-select form-select-sm"
                                    value={stageManagerStrayHandlingSelectValue}
                                    onChange={(event) => {
                                      const value = event.target.value
                                      if (value.startsWith('selected-parent:')) {
                                        updateStageManagerDraft({
                                          strayHandlingMode: 'selected-parent',
                                          straySelectedParentId: value.slice('selected-parent:'.length),
                                        })
                                        return
                                      }
                                      updateStageManagerDraft({ strayHandlingMode: value as StageManagerStrayHandlingMode })
                                    }}
                                  >
                                    <option value="promote">promote to own prime tabs</option>
                                    {stageManagerSelectionSnapshot.fullParents.map((tab) => (
                                      <option key={tab.id} value={`selected-parent:${tab.id}`}>
                                        include under {tab.title}
                                      </option>
                                    ))}
                                    <option value="existing-parent">include under existing parent...</option>
                                    <option value="new-parent">create new parent tab...</option>
                                  </select>
                                </label>

                                {stageManagerDraft.strayHandlingMode === 'existing-parent' && (
                                  <label className="stage-manager-field">
                                    <span>destination parent</span>
                                    <select
                                      className="form-select form-select-sm"
                                      value={stageManagerDraft.strayExistingParentId}
                                      onChange={(event) => updateStageManagerDraft({ strayExistingParentId: event.target.value })}
                                    >
                                      <option value="">select a parent tab</option>
                                      {stageManagerStrayExistingParentOptions.map((tab) => (
                                        <option key={tab.id} value={tab.id}>
                                          {tab.title}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                )}

                                {stageManagerDraft.strayHandlingMode === 'new-parent' && (
                                  <label className="stage-manager-field">
                                    <span>new parent name</span>
                                    <input
                                      type="text"
                                      className="form-control form-control-sm"
                                      value={stageManagerDraft.strayNewParentName}
                                      onChange={(event) => updateStageManagerDraft({ strayNewParentName: event.target.value })}
                                      placeholder="new parent"
                                    />
                                  </label>
                                )}
                              </>
                            )}
                          </>
                        )}

                        {stageManagerDraft.migrateTarget === 'parent' && (
                          <>
                            <div className="stage-manager-actions-row">
                              <button
                                type="button"
                                className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.migrateParentSpaceMode === 'current' ? 'is-selected' : ''}`}
                                onClick={() => updateStageManagerDraft({ migrateParentSpaceMode: 'current' })}
                              >
                                current space
                              </button>
                              <button
                                type="button"
                                className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.migrateParentSpaceMode === 'existing' ? 'is-selected' : ''}`}
                                onClick={() => updateStageManagerDraft({ migrateParentSpaceMode: 'existing' })}
                              >
                                existing space
                              </button>
                              <button
                                type="button"
                                className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.migrateParentSpaceMode === 'new' ? 'is-selected' : ''}`}
                                onClick={() => updateStageManagerDraft({ migrateParentSpaceMode: 'new' })}
                              >
                                new space
                              </button>
                            </div>

                            {stageManagerDraft.migrateParentSpaceMode === 'existing' && (
                              <label className="stage-manager-field">
                                <span>destination space</span>
                                <select
                                  className="form-select form-select-sm"
                                  value={stageManagerDraft.migrateParentSpaceId}
                                  onChange={(event) => updateStageManagerDraft({ migrateParentSpaceId: event.target.value })}
                                >
                                  <option value="">select a space</option>
                                  {stageManagerOtherSpaces.map((space) => (
                                    <option key={space.id} value={space.id}>
                                      {space.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}

                            {stageManagerDraft.migrateParentSpaceMode === 'new' && (
                              <label className="stage-manager-field">
                                <span>new space name</span>
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  value={stageManagerDraft.newSpaceName}
                                  onChange={(event) => updateStageManagerDraft({ newSpaceName: event.target.value })}
                                  placeholder="new space"
                                />
                              </label>
                            )}

                            {stageManagerDraft.migrateParentSpaceMode !== 'new' && (
                              <div className="stage-manager-actions-row">
                                <button
                                  type="button"
                                  className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.migrateParentMode === 'existing' ? 'is-selected' : ''}`}
                                  onClick={() => updateStageManagerDraft({ migrateParentMode: 'existing' })}
                                >
                                  existing parent
                                </button>
                                <button
                                  type="button"
                                  className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.migrateParentMode === 'new' ? 'is-selected' : ''}`}
                                  onClick={() => updateStageManagerDraft({ migrateParentMode: 'new' })}
                                >
                                  new parent
                                </button>
                              </div>
                            )}

                            <div className="stage-manager-field-grid">
                              {stageManagerDraft.migrateParentSpaceMode !== 'new' && stageManagerDraft.migrateParentMode === 'existing' ? (
                                <label className="stage-manager-field">
                                  <span>destination parent</span>
                                  <select
                                    className="form-select form-select-sm"
                                    value={stageManagerDraft.migrateParentId}
                                    onChange={(event) => updateStageManagerDraft({ migrateParentId: event.target.value })}
                                  >
                                    <option value="">select a parent tab</option>
                                    {stageManagerMigrateParentOptions.map((tab) => (
                                      <option key={tab.id} value={tab.id}>
                                        {tab.title}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : (
                                <label className="stage-manager-field">
                                  <span>new parent name</span>
                                  <input
                                    type="text"
                                    className="form-control form-control-sm"
                                    value={stageManagerDraft.migrateNewParentName}
                                    onChange={(event) => updateStageManagerDraft({ migrateNewParentName: event.target.value })}
                                    placeholder="new parent"
                                  />
                                </label>
                              )}
                            </div>
                          </>
                        )}

                        <p className="stage-manager-help">
                          migrating a parent tab into another parent will demote that parent into a sub-tab under the destination parent.
                        </p>
                      </>
                    )}

                    {stageManagerAction === 'mass-delete' && (
                      <>
                        <p>choose whether the current selection should move into trash or be deleted permanently.</p>
                        <div className="stage-manager-actions-row">
                          <button
                            type="button"
                            className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.massDeleteMode === 'trash' ? 'is-selected' : ''}`}
                            onClick={() => updateStageManagerDraft({ massDeleteMode: 'trash' })}
                          >
                            move to trash
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm stage-manager-action-btn ${stageManagerDraft.massDeleteMode === 'permanent' ? 'is-selected' : ''}`}
                            onClick={() => updateStageManagerDraft({ massDeleteMode: 'permanent' })}
                          >
                            delete for real
                          </button>
                        </div>
                        <p className="stage-manager-help">
                          the review step is the confirmation point for mass delete.
                        </p>
                      </>
                    )}

                    {stageManagerAction !== 'mass-delete' && (
                      <div className="stage-manager-switch-row">
                        <label className="settings-hotkey-label" htmlFor="stage-manager-open-destination">
                          open destination after apply
                        </label>
                        <div className="form-check form-switch settings-switch">
                          <input
                            id="stage-manager-open-destination"
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            checked={state.ui.stageManagerOpenDestinationAfterApply}
                            onChange={(event) => updateStageManagerOpenDestinationSetting(event.target.checked)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {stageManagerStep === 'review' && (
                  <div className="stage-manager-panel">
                    <h2>review</h2>
                    <ul className="stage-manager-review-list">
                      {getStageManagerReviewDetails().map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                    {getStageManagerReviewWarning() ? (
                      <div className="stage-manager-warning" role="note">
                        {getStageManagerReviewWarning()}
                      </div>
                    ) : (
                      <p className="stage-manager-help">review the destination and apply when it looks right.</p>
                    )}
                  </div>
                )}

                <div className="stage-manager-footer">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-light stage-manager-nav-btn"
                    onClick={handleStageManagerPrevious}
                    disabled={stageManagerStep === 'select'}
                  >
                    previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary stage-manager-nav-btn"
                    onClick={stageManagerStep === 'review' ? handleStageManagerApply : handleStageManagerNext}
                  >
                    {stageManagerStep === 'review' ? 'apply' : 'next'}
                  </button>
                </div>
              </div>
            </section>
          ) : isTrashHomeSelected ? (
            <section className="trash-home-note">
              <p>Items moved here are pending deletion.</p>
              <ul>
                <li>Use <strong>Restore All</strong> to move everything back into notes.</li>
                <li>Use <strong>delete all</strong> to permanently remove all items in Trash.</li>
                <li>This Trash note is read-only.</li>
              </ul>
              <div className="trash-home-actions">
                <button type="button" className="btn btn-sm btn-outline-light" onClick={() => setModal({ type: 'trash-restore-all' })}>
                  restore all
                </button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => setModal({ type: 'trash-delete-all' })}>
                  delete all
                </button>
              </div>
            </section>
          ) : (
            <section className={`editor-shell ${editorReadOnly ? 'editor-readonly' : ''}`}>
              <div ref={editorMountRef} className="toast-editor-host" />
              {viewMode === 'main' && imageTools.visible && (
                <>
                  <div className="image-tools" style={{ top: `${imageTools.cropTop}px`, left: `${imageTools.cropLeft}px` }}>
                    {!inlineCrop.active ? (
                      <button type="button" className="image-tool-btn" onClick={startInlineCrop} title="Crop">
                        crop
                      </button>
                    ) : (
                      <>
                        <button type="button" className="image-tool-btn" onClick={applyInlineCrop} title="Apply crop">
                          apply
                        </button>
                        <button type="button" className="image-tool-btn" onClick={cancelInlineCrop} title="Cancel crop">
                          cancel
                        </button>
                      </>
                    )}
                  </div>
                  {!inlineCrop.active && (
                    <button
                      type="button"
                      className="image-resize-handle"
                      style={{ top: `${imageTools.resizeTop}px`, left: `${imageTools.resizeLeft}px` }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => event.preventDefault()}
                      onPointerDown={beginImageResize}
                      aria-label="Resize image"
                      title="Drag to resize"
                    />
                  )}
                  {inlineCrop.active && (
                    <div
                      className="inline-crop-box"
                      style={{
                        top: `${inlineCrop.top}px`,
                        left: `${inlineCrop.left}px`,
                        width: `${inlineCrop.width}px`,
                        height: `${inlineCrop.height}px`,
                      }}
                      onPointerDown={(event) => beginInlineCropDrag('move', event)}
                    >
                      <button
                        type="button"
                        className="inline-crop-resize-handle"
                        onPointerDown={(event) => beginInlineCropDrag('resize', event)}
                        onClick={(event) => event.preventDefault()}
                        aria-label="Resize crop area"
                        title="Drag to resize crop area"
                      />
                    </div>
                  )}
                </>
              )}
              {viewMode === 'main' && linkPrompt.open && (
                <div
                  className="link-prompt"
                  style={{ top: `${linkPrompt.top}px`, left: `${linkPrompt.left}px` }}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <input
                    ref={linkPromptInputRef}
                    className="link-prompt-input"
                    value={linkPrompt.text}
                    placeholder="link name"
                    onChange={(event) => setLinkPrompt((previous) => ({ ...previous, text: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        insertNamedLinkFromPrompt()
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        closeLinkPrompt()
                      }
                    }}
                  />
                  <button type="button" className="link-prompt-btn" onClick={insertNamedLinkFromPrompt}>
                    done
                  </button>
                </div>
              )}
              {editorReadOnly && <div className="editor-lock" aria-hidden="true" />}
            </section>
          )}
        </>
      )}

      {contextMenu && (
        <div
          className="tab-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.type === 'space' ? (
            <>
              <button type="button" className="tab-context-delete" onClick={enterArrangeModeFromContext}>
                arrange
              </button>
              <button type="button" className="tab-context-delete" onClick={duplicateSpaceFromContext}>
                duplicate
              </button>
              <button type="button" className="tab-context-delete" onClick={beginRenameSpaceFromContext}>
                rename
              </button>
              <button
                type="button"
                className="tab-context-delete"
                onClick={() => {
                  if (!canDeleteSpace) {
                    setContextMenu(null)
                    return
                  }
                  openDeleteModalFromContext(false)
                }}
                disabled={!canDeleteSpace}
              >
                delete
              </button>
            </>
          ) : contextMenu.type === 'domain' ? (
            <button type="button" className="tab-context-delete" onClick={beginRenameDomainFromContext}>
              rename
            </button>
          ) : contextMenu.type === 'image' ? (
            <button
              type="button"
              className="tab-context-delete"
              onClick={() => {
                setContextMenu(null)
                void copySelectedImageToClipboard()
              }}
            >
              copy image
            </button>
          ) : contextMenu.type === 'trash-tab' || contextMenu.type === 'trash-subtab' ? (
            <button
              type="button"
              className="tab-context-delete tab-context-danger"
              onClick={() => openDeleteModalFromContext(true)}
            >
              delete for real
            </button>
          ) : (
            <>
              <button type="button" className="tab-context-delete" onClick={enterArrangeModeFromContext}>
                arrange
              </button>
              <button type="button" className="tab-context-delete" onClick={deleteFromContext}>
                move to trash
              </button>
              <button
                type="button"
                className="tab-context-delete tab-context-danger"
                onClick={() => openDeleteModalFromContext(true)}
              >
                delete now
              </button>
            </>
          )}
        </div>
      )}

      {modal && (
        <div className="delete-modal-backdrop" onClick={() => setModal(null)}>
          <div
            className={`delete-modal ${modal.type === 'export-space' ? 'settings-modal' : ''}`}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{modalText.title}</h2>
            <p>{modalText.body}</p>
            {modal.type === 'export-space' && (
              <label className="settings-modal-field">
                <span>space</span>
                <select
                  className="settings-select-input"
                  value={state.spaces.some((space) => space.id === modal.spaceId) ? modal.spaceId : activeSpace.id}
                  onChange={(event) => setModal({ type: 'export-space', spaceId: event.target.value })}
                >
                  {state.spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="delete-modal-actions">
              <button type="button" className="btn btn-sm btn-outline-light modal-cancel-btn" onClick={() => setModal(null)}>
                cancel
              </button>
              <button
                type="button"
                className={`btn btn-sm ${modal.type === 'export-space' ? 'modal-primary-btn' : 'btn-danger'}`}
                onClick={() => {
                  if (modal.type === 'delete-target' && modal.target.type === 'space' && state.spaces.length <= 1) {
                    setModal(null)
                    return
                  }
                  confirmModal()
                }}
              >
                {modalText.action}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="app-toast-layer" aria-live="polite" aria-atomic="true">
          <div
            key={toast.id}
            className={`app-toast app-toast-${toast.tone}`}
            onMouseEnter={() => {
              setToastHovered(true)
              setToastWasHovered(true)
            }}
            onMouseLeave={() => {
              setToastHovered(false)
              setToastWasHovered(true)
            }}
          >
            {toast.message}
          </div>
        </div>
      )}

    </main>
  )
}

export default App
