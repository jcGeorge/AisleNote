/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { Editor } from '@toast-ui/editor'
import type { ReorderListKind } from './list-reorder-markdown'
import { getWysiwygView } from './prosemirror-utils'
import { isEditorRootFocused } from './table-editing'
import {
  captureListItemBranchInEditor,
  clearTaskReorderClasses,
  createTaskReorderGhost,
  createTaskReorderMarker,
  createTaskReorderSelectionSuppressionController,
  getDirectReorderListItems,
  getListItemParagraphElement,
  getNearestCompatibleListElement,
  getPointerCompatibleListElement,
  getRenderedListItemKind,
  getTaskDragPreviewText,
  getTaskDropTargetFromList,
  getTopReorderListElement,
  hideTaskReorderMarker,
  moveCapturedListItemBranchInEditor,
  placeTaskCaretAtParagraphEnd,
  positionTaskReorderGhost,
  positionTaskReorderMarker,
  type CapturedListItemBranch,
} from './task-behavior'

type UseListReorderControlsOptions = {
  visible: boolean
  editorRef: MutableRefObject<Editor | null>
  editorEventRootRef: MutableRefObject<HTMLElement | null>
  commitActiveEditorMarkdownNow: (editor: Editor) => void
  syncToolbarFormatState: () => void
}

type OverlayMouseEventLike = {
  button?: number
  clientX: number
  clientY: number
  preventDefault: () => void
  stopPropagation: () => void
}

export type ListReorderHandleSegment = {
  key: string
  kind: ReorderListKind
  index: number
  top: number
  left: number
  width: number
  height: number
  itemElement: HTMLElement
  listElement: HTMLElement
}

export type ListReorderControlsState = {
  visible: boolean
  handles: ListReorderHandleSegment[]
}

type ListReorderInteraction = {
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
  dragging: boolean
}

type RectLike = {
  top: number
  left: number
  bottom?: number
  right?: number
  width: number
  height: number
}

type VerticalBounds = {
  top: number
  bottom: number
}

export const CLOSED_LIST_REORDER_CONTROLS_STATE: ListReorderControlsState = {
  visible: false,
  handles: [],
}

const LIST_REORDER_HANDLE_SIZE_PX = 14
const LIST_REORDER_HANDLE_GAP_PX = 4
const LIST_REORDER_HANDLE_VIEWPORT_PADDING_PX = 8
const LIST_REORDER_HANDLE_DRAG_SLOP_PX = 3

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function getViewportSize() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { width: 1024, height: 768 }
  }
  return {
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  }
}

function isVisibleRect(rect: RectLike, viewportWidth: number, viewportHeight: number) {
  const right = rect.right ?? rect.left + rect.width
  const bottom = rect.bottom ?? rect.top + rect.height
  return rect.width > 0 && rect.height > 0 && bottom >= 0 && right >= 0 && rect.top <= viewportHeight && rect.left <= viewportWidth
}

function isVisibleInVerticalBounds(rect: RectLike, bounds: VerticalBounds | null) {
  if (!bounds) return true
  const bottom = rect.bottom ?? rect.top + rect.height
  return bottom > bounds.top && rect.top < bounds.bottom
}

function getListReorderHandleVerticalBounds(
  editorRoot: HTMLElement,
  viewport: { width: number; height: number },
): VerticalBounds | null {
  const editorHost = editorRoot.closest<HTMLElement>('.toast-editor-host')
  if (!editorHost) return null

  const hostRect = editorHost.getBoundingClientRect()
  const top = clamp(hostRect.top, LIST_REORDER_HANDLE_VIEWPORT_PADDING_PX, viewport.height)
  const bottom = clamp(hostRect.bottom, top, viewport.height - LIST_REORDER_HANDLE_VIEWPORT_PADDING_PX)
  return bottom > top ? { top, bottom } : null
}

export function getListReorderHandlePlacement(
  itemRect: RectLike,
  listRect: RectLike | null | undefined,
  textRect: RectLike | null | undefined,
  viewportWidth: number,
  viewportHeight: number,
  verticalBounds: VerticalBounds | null = null,
) {
  const verticalAnchorRect = textRect && textRect.width > 0 && textRect.height > 0 ? textRect : itemRect
  const horizontalAnchorRect = listRect && listRect.width > 0 && listRect.height > 0 ? listRect : itemRect
  const handleHeight = Math.max(LIST_REORDER_HANDLE_SIZE_PX, verticalAnchorRect.height)
  const railLeft = Math.min(horizontalAnchorRect.left, itemRect.left)
  const preferredLeft = railLeft - LIST_REORDER_HANDLE_SIZE_PX - LIST_REORDER_HANDLE_GAP_PX
  const preferredTop = verticalAnchorRect.top + verticalAnchorRect.height / 2 - handleHeight / 2
  const minTop = Math.max(LIST_REORDER_HANDLE_VIEWPORT_PADDING_PX, verticalBounds?.top ?? LIST_REORDER_HANDLE_VIEWPORT_PADDING_PX)
  const maxBottom = Math.min(
    viewportHeight - LIST_REORDER_HANDLE_VIEWPORT_PADDING_PX,
    verticalBounds?.bottom ?? viewportHeight - LIST_REORDER_HANDLE_VIEWPORT_PADDING_PX,
  )

  return {
    left: clamp(
      preferredLeft,
      LIST_REORDER_HANDLE_VIEWPORT_PADDING_PX,
      viewportWidth - LIST_REORDER_HANDLE_VIEWPORT_PADDING_PX - LIST_REORDER_HANDLE_SIZE_PX,
    ),
    top: clamp(
      preferredTop,
      minTop,
      maxBottom - handleHeight,
    ),
    width: LIST_REORDER_HANDLE_SIZE_PX,
    height: handleHeight,
  }
}

function getListItemPositionKey(view: any, listItemElement: HTMLElement): string | null {
  if (typeof view?.posAtDOM !== 'function') return null
  try {
    const position = view.posAtDOM(listItemElement, 0)
    return typeof position === 'number' ? String(position) : null
  } catch {
    return null
  }
}

export function getListReorderHandleSegmentsForEditorRoot(
  editorRoot: HTMLElement,
  view: any,
  viewport: { width: number; height: number } = getViewportSize(),
): ListReorderHandleSegment[] {
  const verticalBounds = getListReorderHandleVerticalBounds(editorRoot, viewport)

  return Array.from(editorRoot.querySelectorAll<HTMLElement>('li')).flatMap((listItemElement) => {
    const listElement = listItemElement.parentElement
    if (!(listElement instanceof HTMLElement)) return []

    const kind = getRenderedListItemKind(listItemElement)
    if (!kind) return []

    const directItems = getDirectReorderListItems(listElement, kind)
    const index = directItems.indexOf(listItemElement)
    if (index < 0) return []

    const itemRect = listItemElement.getBoundingClientRect()
    if (!isVisibleRect(itemRect, viewport.width, viewport.height)) return []
    if (!isVisibleInVerticalBounds(itemRect, verticalBounds)) return []

    const listRect = listElement.getBoundingClientRect()
    const paragraph = getListItemParagraphElement(listItemElement)
    const textRect = paragraph?.getBoundingClientRect() ?? itemRect
    const placement = getListReorderHandlePlacement(itemRect, listRect, textRect, viewport.width, viewport.height, verticalBounds)
    const positionKey = getListItemPositionKey(view, listItemElement)
    const key = positionKey
      ? `list-reorder-${kind}-${positionKey}`
      : `list-reorder-${kind}-${index}-${Math.round(itemRect.top)}-${Math.round(itemRect.left)}`

    return [{
      key,
      kind,
      index,
      itemElement: listItemElement,
      listElement,
      ...placement,
    }]
  })
}

function listReorderControlsStateEqual(left: ListReorderControlsState, right: ListReorderControlsState) {
  if (left.visible !== right.visible || left.handles.length !== right.handles.length) return false
  return left.handles.every((handle, index) => {
    const nextHandle = right.handles[index]
    return Boolean(
      nextHandle &&
        handle.key === nextHandle.key &&
        handle.kind === nextHandle.kind &&
        handle.index === nextHandle.index &&
        handle.top === nextHandle.top &&
        handle.left === nextHandle.left &&
        handle.width === nextHandle.width &&
        handle.height === nextHandle.height &&
        handle.itemElement === nextHandle.itemElement &&
        handle.listElement === nextHandle.listElement,
    )
  })
}

export function useListReorderControls({
  visible,
  editorRef,
  editorEventRootRef,
  commitActiveEditorMarkdownNow,
  syncToolbarFormatState,
}: UseListReorderControlsOptions) {
  const [listReorderControls, setListReorderControls] = useState<ListReorderControlsState>(CLOSED_LIST_REORDER_CONTROLS_STATE)
  const listReorderControlsRef = useRef<ListReorderControlsState>(CLOSED_LIST_REORDER_CONTROLS_STATE)
  const refreshFrameRef = useRef<number | null>(null)
  const interactionStateRef = useRef<ListReorderInteraction | null>(null)
  const selectionSuppressionRef = useRef(createTaskReorderSelectionSuppressionController())

  const updateListReorderControls = useCallback((next: ListReorderControlsState) => {
    if (listReorderControlsStateEqual(listReorderControlsRef.current, next)) return
    listReorderControlsRef.current = next
    setListReorderControls(next)
  }, [])

  const close = useCallback(() => {
    updateListReorderControls(CLOSED_LIST_REORDER_CONTROLS_STATE)
  }, [updateListReorderControls])

  const refresh = useCallback(() => {
    if (!visible) {
      close()
      return
    }
    if (interactionStateRef.current) return

    const editor = editorRef.current
    const view = getWysiwygView(editor)
    const root = editorEventRootRef.current ?? view?.dom ?? null
    if (!view?.dom || !root || !isEditorRootFocused(root)) {
      updateListReorderControls(CLOSED_LIST_REORDER_CONTROLS_STATE)
      return
    }

    const handles = getListReorderHandleSegmentsForEditorRoot(view.dom, view)
    updateListReorderControls({
      visible: handles.length > 0,
      handles,
    })
  }, [close, editorEventRootRef, editorRef, updateListReorderControls, visible])

  const scheduleRefresh = useCallback(() => {
    if (typeof window === 'undefined') {
      refresh()
      return
    }
    if (refreshFrameRef.current !== null) {
      window.cancelAnimationFrame(refreshFrameRef.current)
    }
    refreshFrameRef.current = window.requestAnimationFrame(() => {
      refreshFrameRef.current = null
      refresh()
    })
  }, [refresh])

  const endInteraction = useCallback(
    (options: { releaseSelectionAfterBrowserPass?: boolean } = {}) => {
      const interactionState = interactionStateRef.current
      const root = editorEventRootRef.current
      interactionState?.ghost?.remove()
      interactionState?.marker?.remove()
      if (root) {
        clearTaskReorderClasses(root)
        root.classList.remove('task-reorder-pending', 'task-reorder-active')
      }
      if (options.releaseSelectionAfterBrowserPass) {
        selectionSuppressionRef.current.endAfterBrowserPass()
      } else {
        selectionSuppressionRef.current.endImmediately()
      }
      window.removeEventListener('mousemove', handleMouseMove, true)
      window.removeEventListener('mouseup', handleMouseUp, true)
      window.removeEventListener('blur', handleCancel, true)
      window.removeEventListener('selectstart', handleSelectStart, true)
      window.removeEventListener('dragstart', handleNativeDragStart, true)
      interactionStateRef.current = null
      scheduleRefresh()
    },
    [editorEventRootRef, scheduleRefresh],
  )

  function updateDropTarget(event: globalThis.MouseEvent) {
    const interactionState = interactionStateRef.current
    const root = editorEventRootRef.current
    if (!interactionState?.dragging || !root) return

    clearTaskReorderClasses(root)
    interactionState.sourceElement.classList.add('task-reorder-source')

    const targetListElement =
      getPointerCompatibleListElement(interactionState.clusterElement, interactionState.sourceElement, interactionState.listKind, event) ??
      getNearestCompatibleListElement(interactionState.clusterElement, interactionState.sourceElement, interactionState.listKind, event)
    if (!targetListElement) {
      interactionState.insertIndex = null
      interactionState.targetListElement = null
      hideTaskReorderMarker(interactionState.marker)
      return
    }

    const nextTarget = getTaskDropTargetFromList(
      interactionState.sourceIndex,
      targetListElement,
      interactionState.listKind,
      event,
      interactionState.targetListElement === targetListElement ? interactionState.insertIndex : null,
      targetListElement === interactionState.listElement,
    )
    if (!nextTarget) {
      interactionState.insertIndex = null
      interactionState.targetListElement = null
      hideTaskReorderMarker(interactionState.marker)
      return
    }

    interactionState.insertIndex = nextTarget.insertIndex
    interactionState.targetListElement = nextTarget.listElement
    nextTarget.element.classList.add('task-reorder-target')
    if (interactionState.marker) {
      positionTaskReorderMarker(interactionState.marker, nextTarget.element, nextTarget.markerY)
    }
  }

  function handleCancel() {
    endInteraction()
  }

  function handleMouseMove(event: globalThis.MouseEvent) {
    const interactionState = interactionStateRef.current
    const root = editorEventRootRef.current
    if (!interactionState || !root) return

    const distance = Math.max(
      Math.abs(event.clientX - interactionState.startX),
      Math.abs(event.clientY - interactionState.startY),
    )
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    selectionSuppressionRef.current.clearAfterBrowserPass()

    if (!interactionState.dragging && distance < LIST_REORDER_HANDLE_DRAG_SLOP_PX) return

    if (!interactionState.dragging) {
      interactionState.dragging = true
      root.classList.add('task-reorder-active')
      interactionState.sourceElement.classList.add('task-reorder-source')
      interactionState.ghost = createTaskReorderGhost(root, interactionState.previewText)
      interactionState.marker = createTaskReorderMarker(root)
    }

    if (interactionState.ghost) positionTaskReorderGhost(interactionState.ghost, event)
    updateDropTarget(event)
  }

  function handleMouseUp(event: globalThis.MouseEvent) {
    const interactionState = interactionStateRef.current
    if (!interactionState) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    if (!interactionState.dragging) {
      const { editor, sourceElement } = interactionState
      const view = getWysiwygView(editor)
      endInteraction()
      if (view && sourceElement.isConnected) {
        placeTaskCaretAtParagraphEnd(view, editor, sourceElement)
      }
      return
    }

    updateDropTarget(event)
    const { editor, sourceBranch, sourceIndex, insertIndex, listKind, targetListElement } = interactionState
    const targetListItems = targetListElement ? getDirectReorderListItems(targetListElement, listKind) : []
    const view = getWysiwygView(editor)
    endInteraction({ releaseSelectionAfterBrowserPass: true })
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
        commitActiveEditorMarkdownNow(editor)
        syncToolbarFormatState()
      }
    }
  }

  function handleSelectStart(event: Event) {
    if (!interactionStateRef.current) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    selectionSuppressionRef.current.clearAfterBrowserPass()
  }

  function handleNativeDragStart(event: Event) {
    if (!interactionStateRef.current) return
    event.preventDefault()
    event.stopPropagation()
    selectionSuppressionRef.current.clearAfterBrowserPass()
  }

  function installWindowInteractionListeners() {
    window.addEventListener('mousemove', handleMouseMove, true)
    window.addEventListener('mouseup', handleMouseUp, true)
    window.addEventListener('blur', handleCancel, true)
    window.addEventListener('selectstart', handleSelectStart, true)
    window.addEventListener('dragstart', handleNativeDragStart, true)
  }

  const beginListHandleGesture = useCallback(
    (segment: ListReorderHandleSegment, event: OverlayMouseEventLike) => {
      event.preventDefault()
      event.stopPropagation()
      if (!visible || (event.button ?? 0) !== 0) return

      const editor = editorRef.current
      const view = getWysiwygView(editor)
      const root = editorEventRootRef.current ?? view?.dom ?? null
      const sourceElement = segment.itemElement
      if (!editor || !view?.dom || !root || !sourceElement.isConnected || !view.dom.contains(sourceElement)) return

      const listElement = sourceElement.parentElement
      if (!(listElement instanceof HTMLElement)) return

      const listKind = getRenderedListItemKind(sourceElement)
      if (!listKind || listKind !== segment.kind) return

      const sourceIndex = getDirectReorderListItems(listElement, listKind).indexOf(sourceElement)
      if (sourceIndex < 0) return

      const sourceBranch = captureListItemBranchInEditor(view, sourceElement)
      if (!sourceBranch) return

      interactionStateRef.current = {
        editor,
        sourceElement,
        sourceBranch,
        sourceIndex,
        listElement,
        clusterElement: getTopReorderListElement(listElement, view.dom),
        listKind,
        insertIndex: null,
        targetListElement: null,
        ghost: null,
        marker: null,
        previewText: getTaskDragPreviewText(sourceElement, listKind),
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      }
      root.classList.add('task-reorder-pending')
      selectionSuppressionRef.current.begin()
      editor.focus()
      installWindowInteractionListeners()
    },
    [editorEventRootRef, editorRef, visible],
  )

  useEffect(() => {
    if (!visible) {
      endInteraction()
      close()
      return
    }

    const root = editorEventRootRef.current
    const handleEditorActivity = () => scheduleRefresh()
    const handleGeometryChange = () => scheduleRefresh()

    root?.addEventListener('focusin', handleEditorActivity, true)
    root?.addEventListener('keyup', handleEditorActivity, true)
    root?.addEventListener('mouseup', handleEditorActivity, true)
    root?.addEventListener('pointerup', handleEditorActivity, true)
    document.addEventListener('selectionchange', handleEditorActivity, true)
    window.addEventListener('resize', handleGeometryChange)
    window.addEventListener('scroll', handleGeometryChange, true)
    scheduleRefresh()

    return () => {
      root?.removeEventListener('focusin', handleEditorActivity, true)
      root?.removeEventListener('keyup', handleEditorActivity, true)
      root?.removeEventListener('mouseup', handleEditorActivity, true)
      root?.removeEventListener('pointerup', handleEditorActivity, true)
      document.removeEventListener('selectionchange', handleEditorActivity, true)
      window.removeEventListener('resize', handleGeometryChange)
      window.removeEventListener('scroll', handleGeometryChange, true)
      if (refreshFrameRef.current !== null) {
        window.cancelAnimationFrame(refreshFrameRef.current)
        refreshFrameRef.current = null
      }
      if (interactionStateRef.current) {
        endInteraction()
      }
    }
  }, [visible, editorEventRootRef.current, scheduleRefresh, close, endInteraction])

  return {
    listReorderControls,
    close,
    refresh,
    beginListHandleGesture,
  }
}
