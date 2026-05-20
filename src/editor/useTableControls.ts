/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { Editor } from '@toast-ui/editor'
import {
  applyTableControlOperationToView,
  applyTableReorderOperationToView,
  CLOSED_TABLE_CONTROLS_STATE,
  getActiveTableContext,
  getActiveTableDomContext,
  getTableContextForCellElement,
  getTableControlsOverlayState,
  getTableControlsOverlayStateForCell,
  getTableReorderDragDecision,
  isSelectedTableNode,
  placeTableCaretAtCoords,
  type TableControlOperation,
  type TableControlsOverlayState,
  type TableReorderAxis,
} from './table-editing'
import type { TableControlTargetMode } from '../types/app'
import { getWysiwygView } from './prosemirror-utils'
import { createTaskReorderSelectionSuppressionController } from './task-behavior'

type UseTableControlsOptions = {
  visible: boolean
  editorRef: MutableRefObject<Editor | null>
  editorEventRootRef: MutableRefObject<HTMLElement | null>
  commitActiveEditorMarkdownNow: (editor: Editor) => void
  syncToolbarFormatState: () => void
}

function tableControlsStateEqual(left: TableControlsOverlayState, right: TableControlsOverlayState) {
  return (
    left.visible === right.visible &&
    left.columnTop === right.columnTop &&
    left.columnLeft === right.columnLeft &&
    left.rowTop === right.rowTop &&
    left.rowLeft === right.rowLeft
  )
}

const TABLE_ACTIVE_CELL_CLASS = 'table-active-cell'
const TABLE_REORDER_SOURCE_CLASS = 'table-reorder-source-cell'
const TABLE_REORDER_TARGET_CLASS = 'table-reorder-target-cell'
const TABLE_REORDER_PENDING_CLASS = 'table-reorder-pending'
const TABLE_REORDER_ACTIVE_CLASS = 'table-reorder-active'
const TABLE_REORDER_MARKER_GAP_OFFSET_PX = 4
const TABLE_REORDER_SLOT_HYSTERESIS_PX = 6

type TableDragState = {
  editor: Editor
  context: NonNullable<ReturnType<typeof getTableContextForCellElement>>
  table: HTMLTableElement
  sourceCell: HTMLTableCellElement
  sourceRowIndex: number
  sourceColumnIndex: number
  startX: number
  startY: number
  axis: TableReorderAxis | null
  insertIndex: number | null
  marker: HTMLElement | null
  dragging: boolean
  suppressingSelection: boolean
  nativeDragSuppressed: boolean
}

function isInteractiveTableDragTarget(target: Element | null) {
  return Boolean(target?.closest('a, button, input, textarea, select, img, .table-tools'))
}

function clearTableReorderClasses(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>(`.${TABLE_REORDER_SOURCE_CLASS}, .${TABLE_REORDER_TARGET_CLASS}`)
    .forEach((element) => {
      element.classList.remove(TABLE_REORDER_SOURCE_CLASS, TABLE_REORDER_TARGET_CLASS)
    })
}

function createTableReorderMarker(root: HTMLElement, axis: TableReorderAxis) {
  const marker = document.createElement('div')
  marker.className = `table-reorder-marker table-reorder-marker-${axis}`
  root.appendChild(marker)
  return marker
}

function getTableRows(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>('tr'))
}

function getTableColumns(table: HTMLTableElement) {
  const firstRow = table.querySelector<HTMLTableRowElement>('tr')
  return firstRow ? Array.from(firstRow.children).filter((cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement) : []
}

function getInsertionIndexFromCenters(pointerPosition: number, centers: number[], previousInsertIndex: number | null) {
  let insertIndex = 0
  while (insertIndex < centers.length && pointerPosition >= centers[insertIndex]) {
    insertIndex += 1
  }

  if (previousInsertIndex !== null && Math.abs(insertIndex - previousInsertIndex) === 1) {
    if (insertIndex > previousInsertIndex) {
      const boundary = centers[previousInsertIndex]
      if (boundary !== undefined && pointerPosition < boundary + TABLE_REORDER_SLOT_HYSTERESIS_PX) {
        insertIndex = previousInsertIndex
      }
    } else {
      const boundary = centers[insertIndex]
      if (boundary !== undefined && pointerPosition > boundary - TABLE_REORDER_SLOT_HYSTERESIS_PX) {
        insertIndex = previousInsertIndex
      }
    }
  }

  return insertIndex
}

function getRowInsertIndex(table: HTMLTableElement, clientY: number, previousInsertIndex: number | null) {
  const rows = getTableRows(table)
  const centers = rows.map((row) => {
    const rect = row.getBoundingClientRect()
    return rect.top + rect.height / 2
  })
  return getInsertionIndexFromCenters(clientY, centers, previousInsertIndex)
}

function getColumnInsertIndex(table: HTMLTableElement, clientX: number, previousInsertIndex: number | null) {
  const columns = getTableColumns(table)
  const centers = columns.map((cell) => {
    const rect = cell.getBoundingClientRect()
    return rect.left + rect.width / 2
  })
  return getInsertionIndexFromCenters(clientX, centers, previousInsertIndex)
}

function positionRowMarker(marker: HTMLElement, table: HTMLTableElement, insertIndex: number) {
  const rows = getTableRows(table)
  const tableRect = table.getBoundingClientRect()
  const firstRect = rows[0]?.getBoundingClientRect()
  const lastRect = rows[rows.length - 1]?.getBoundingClientRect()
  if (!firstRect || !lastRect) return

  let markerY = firstRect.top - TABLE_REORDER_MARKER_GAP_OFFSET_PX
  if (insertIndex >= rows.length) {
    markerY = lastRect.bottom + TABLE_REORDER_MARKER_GAP_OFFSET_PX
  } else if (insertIndex > 0) {
    const previousRect = rows[insertIndex - 1].getBoundingClientRect()
    const nextRect = rows[insertIndex].getBoundingClientRect()
    const gap = nextRect.top - previousRect.bottom
    markerY = gap > 2 ? previousRect.bottom + gap / 2 : nextRect.top - TABLE_REORDER_MARKER_GAP_OFFSET_PX
  }

  marker.style.width = `${tableRect.width}px`
  marker.style.height = ''
  marker.style.transform = `translate(${tableRect.left}px, ${markerY}px) translateY(-50%)`
  marker.classList.add('is-visible')
}

function positionColumnMarker(marker: HTMLElement, table: HTMLTableElement, insertIndex: number) {
  const columns = getTableColumns(table)
  const tableRect = table.getBoundingClientRect()
  const firstRect = columns[0]?.getBoundingClientRect()
  const lastRect = columns[columns.length - 1]?.getBoundingClientRect()
  if (!firstRect || !lastRect) return

  let markerX = firstRect.left - TABLE_REORDER_MARKER_GAP_OFFSET_PX
  if (insertIndex >= columns.length) {
    markerX = lastRect.right + TABLE_REORDER_MARKER_GAP_OFFSET_PX
  } else if (insertIndex > 0) {
    const previousRect = columns[insertIndex - 1].getBoundingClientRect()
    const nextRect = columns[insertIndex].getBoundingClientRect()
    const gap = nextRect.left - previousRect.right
    markerX = gap > 2 ? previousRect.right + gap / 2 : nextRect.left - TABLE_REORDER_MARKER_GAP_OFFSET_PX
  }

  marker.style.height = `${tableRect.height}px`
  marker.style.width = ''
  marker.style.transform = `translate(${markerX}px, ${tableRect.top}px) translateX(-50%)`
  marker.classList.add('is-visible')
}

export function useTableControls({
  visible,
  editorRef,
  editorEventRootRef,
  commitActiveEditorMarkdownNow,
  syncToolbarFormatState,
}: UseTableControlsOptions) {
  const [tableControls, setTableControls] = useState<TableControlsOverlayState>(CLOSED_TABLE_CONTROLS_STATE)
  const tableControlsRef = useRef<TableControlsOverlayState>(CLOSED_TABLE_CONTROLS_STATE)
  const refreshFrameRef = useRef<number | null>(null)
  const activeCellRef = useRef<HTMLTableCellElement | null>(null)
  const lockedTableControlsRef = useRef<TableControlsOverlayState | null>(null)
  const dragStateRef = useRef<TableDragState | null>(null)
  const suppressNextClickRef = useRef(false)
  const failedDragCaretVersionRef = useRef(0)
  const selectionSuppressionRef = useRef(createTaskReorderSelectionSuppressionController())

  const updateTableControls = useCallback((next: TableControlsOverlayState) => {
    if (tableControlsStateEqual(tableControlsRef.current, next)) return
    tableControlsRef.current = next
    setTableControls(next)
  }, [])

  const setActiveCell = useCallback((cell: HTMLTableCellElement | null) => {
    if (activeCellRef.current === cell) return
    activeCellRef.current?.classList.remove(TABLE_ACTIVE_CELL_CLASS)
    activeCellRef.current = cell
    activeCellRef.current?.classList.add(TABLE_ACTIVE_CELL_CLASS)
  }, [])

  const close = useCallback(() => {
    lockedTableControlsRef.current = null
    setActiveCell(null)
    updateTableControls(CLOSED_TABLE_CONTROLS_STATE)
  }, [setActiveCell, updateTableControls])

  const releaseLockedTableControls = useCallback(() => {
    lockedTableControlsRef.current = null
  }, [])

  const refresh = useCallback(() => {
    if (!visible) {
      close()
      return
    }
    if (dragStateRef.current) {
      return
    }
    const view = getWysiwygView(editorRef.current)
    const activeTable = view ? getActiveTableDomContext(view) : null
    setActiveCell(activeTable?.cell ?? null)
    if (!activeTable) {
      lockedTableControlsRef.current = null
      updateTableControls(CLOSED_TABLE_CONTROLS_STATE)
      return
    }
    const lockedControls = lockedTableControlsRef.current
    if (lockedControls?.visible) {
      updateTableControls(lockedControls)
      return
    }
    updateTableControls(getTableControlsOverlayState(view))
  }, [close, editorRef, setActiveCell, updateTableControls, visible])

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

  const runTableControlOperation = useCallback(
    (operation: TableControlOperation, targetMode: TableControlTargetMode = 'active-cell') => {
      const currentEditor = editorRef.current
      const view = getWysiwygView(currentEditor)
      if (!currentEditor || !view) return false
      const frozenControls = tableControlsRef.current.visible ? tableControlsRef.current : getTableControlsOverlayState(view)
      const handled = applyTableControlOperationToView(view, operation, targetMode)
      if (!handled) return false
      const activeTable = getActiveTableContext(view)
      lockedTableControlsRef.current = activeTable && frozenControls.visible ? frozenControls : null
      if (lockedTableControlsRef.current) {
        updateTableControls(lockedTableControlsRef.current)
      }
      currentEditor.focus()
      commitActiveEditorMarkdownNow(currentEditor)
      syncToolbarFormatState()
      scheduleRefresh()
      return true
    },
    [commitActiveEditorMarkdownNow, editorRef, scheduleRefresh, syncToolbarFormatState, updateTableControls],
  )

  const endDrag = useCallback(
    (options: { releaseSelectionAfterBrowserPass?: boolean } = {}) => {
      const dragState = dragStateRef.current
      const root = editorEventRootRef.current
      const shouldClearSelection = Boolean(dragState?.suppressingSelection || dragState?.dragging)
      dragState?.marker?.remove()
      if (root) {
        clearTableReorderClasses(root)
        root.classList.remove(TABLE_REORDER_PENDING_CLASS, TABLE_REORDER_ACTIVE_CLASS)
      }
      if (!shouldClearSelection) {
        selectionSuppressionRef.current.endWithoutClearing()
      } else if (options.releaseSelectionAfterBrowserPass) {
        selectionSuppressionRef.current.endAfterBrowserPass()
      } else {
        selectionSuppressionRef.current.endImmediately()
      }
      window.removeEventListener('mousemove', handleMouseMove, true)
      window.removeEventListener('mouseup', handleMouseUp, true)
      window.removeEventListener('blur', handleCancel, true)
      window.removeEventListener('selectstart', handleSelectStart, true)
      window.removeEventListener('dragstart', handleNativeDragStart, true)
      dragStateRef.current = null
      scheduleRefresh()
    },
    [editorEventRootRef, scheduleRefresh],
  )

  function updateDropTarget(event: globalThis.MouseEvent) {
    const dragState = dragStateRef.current
    const root = editorEventRootRef.current
    if (!dragState?.dragging || !dragState.axis || !root) return

    clearTableReorderClasses(root)
    dragState.sourceCell.classList.add(TABLE_REORDER_SOURCE_CLASS)

    const insertIndex =
      dragState.axis === 'row'
        ? getRowInsertIndex(dragState.table, event.clientY, dragState.insertIndex)
        : getColumnInsertIndex(dragState.table, event.clientX, dragState.insertIndex)
    dragState.insertIndex = insertIndex

    const targetCells =
      dragState.axis === 'row'
        ? getTableRows(dragState.table)[Math.min(insertIndex, getTableRows(dragState.table).length - 1)]?.children
        : getTableColumns(dragState.table)
    if (targetCells) {
      Array.from(targetCells)
        .filter((cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement)
        .forEach((cell) => cell.classList.add(TABLE_REORDER_TARGET_CLASS))
    }

    if (dragState.marker) {
      if (dragState.axis === 'row') {
        positionRowMarker(dragState.marker, dragState.table, insertIndex)
      } else {
        positionColumnMarker(dragState.marker, dragState.table, insertIndex)
      }
    }
  }

  function handleCancel() {
    failedDragCaretVersionRef.current += 1
    endDrag()
  }

  function getTableCellAtViewportPoint(view: any, coords: { left: number; top: number }) {
    const ownerDocument = view?.dom?.ownerDocument ?? document
    const hit = ownerDocument.elementFromPoint?.(coords.left, coords.top)
    const cell = hit instanceof Element ? hit.closest('td, th') : null
    if (!(cell instanceof HTMLTableCellElement) || !view?.dom?.contains?.(cell)) return null
    return cell
  }

  function scheduleFailedDragCaretPlacement(
    editor: Editor,
    coords: { left: number; top: number },
    releaseCell: HTMLTableCellElement | null,
  ) {
    const view = getWysiwygView(editor)
    if (!view) return
    const scheduledVersion = failedDragCaretVersionRef.current
    window.setTimeout(() => {
      if (scheduledVersion !== failedDragCaretVersionRef.current) return
      if (editorRef.current !== editor || getWysiwygView(editor) !== view) return

      const targetCell = releaseCell?.isConnected ? releaseCell : getTableCellAtViewportPoint(view, coords)
      if (placeTableCaretAtCoords(view, coords, targetCell)) {
        editor.focus()
        lockedTableControlsRef.current = null
        if (targetCell) {
          setActiveCell(targetCell)
          updateTableControls(getTableControlsOverlayStateForCell(targetCell))
        }
        scheduleRefresh()
      }
    }, 0)
  }

  function handleMouseMove(event: globalThis.MouseEvent) {
    const dragState = dragStateRef.current
    const root = editorEventRootRef.current
    if (!dragState || !root) return

    const decision = getTableReorderDragDecision(event.clientX - dragState.startX, event.clientY - dragState.startY)
    if (decision.shouldSuppressSelection && !dragState.suppressingSelection) {
      dragState.suppressingSelection = true
      root.classList.add(TABLE_REORDER_PENDING_CLASS)
      selectionSuppressionRef.current.begin()
    }

    if (dragState.suppressingSelection || dragState.dragging) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      selectionSuppressionRef.current.clearAfterBrowserPass()
    }

    if (!dragState.axis && decision.axis) {
      dragState.axis = decision.axis
    }
    if (!dragState.axis) return

    if (!dragState.dragging) {
      dragState.dragging = true
      suppressNextClickRef.current = true
      root.classList.add(TABLE_REORDER_ACTIVE_CLASS)
      dragState.sourceCell.classList.add(TABLE_REORDER_SOURCE_CLASS)
      dragState.marker = createTableReorderMarker(root, dragState.axis)
      selectionSuppressionRef.current.clearAfterBrowserPass()
    }

    updateDropTarget(event)
  }

  function handleMouseUp(event: globalThis.MouseEvent) {
    const dragState = dragStateRef.current
    if (!dragState) return
    if (!dragState.dragging || !dragState.axis || dragState.insertIndex === null) {
      if (dragState.suppressingSelection || dragState.dragging || dragState.nativeDragSuppressed) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        suppressNextClickRef.current = true
        const coords = { left: event.clientX, top: event.clientY }
        const releaseCell = getTableCellAtViewportPoint(getWysiwygView(dragState.editor), coords)
        endDrag()
        if (releaseCell) {
          scheduleFailedDragCaretPlacement(dragState.editor, coords, releaseCell)
        }
      } else {
        suppressNextClickRef.current = false
        endDrag()
      }
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    suppressNextClickRef.current = true
    updateDropTarget(event)

    const coords = { left: event.clientX, top: event.clientY }
    const releaseCell = getTableCellAtViewportPoint(getWysiwygView(dragState.editor), coords)
    const { editor, context, axis, sourceRowIndex, sourceColumnIndex, insertIndex } = dragState
    const sourceIndex = axis === 'row' ? sourceRowIndex : sourceColumnIndex
    const view = getWysiwygView(editor)
    if (view && insertIndex !== null && applyTableReorderOperationToView(view, axis, sourceIndex, insertIndex, context)) {
      endDrag({ releaseSelectionAfterBrowserPass: true })
      editor.focus()
      commitActiveEditorMarkdownNow(editor)
      syncToolbarFormatState()
      scheduleRefresh()
    } else {
      endDrag()
      if (releaseCell) {
        scheduleFailedDragCaretPlacement(editor, coords, releaseCell)
      }
    }
  }

  function handleSelectStart(event: Event) {
    const dragState = dragStateRef.current
    if (!dragState?.suppressingSelection && !dragState?.dragging) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    selectionSuppressionRef.current.clearAfterBrowserPass()
  }

  function handleNativeDragStart(event: Event) {
    const dragState = dragStateRef.current
    if (!dragState) return
    const shouldBlockSelectedTableDrag =
      !dragState.suppressingSelection &&
      !dragState.dragging &&
      isSelectedTableNode(getWysiwygView(dragState.editor), dragState.context.tableStart)
    if (!dragState.suppressingSelection && !dragState.dragging && !shouldBlockSelectedTableDrag) return
    dragState.nativeDragSuppressed = shouldBlockSelectedTableDrag || dragState.nativeDragSuppressed
    event.preventDefault()
    event.stopPropagation()
    if (dragState.suppressingSelection || dragState.dragging) {
      selectionSuppressionRef.current.clearAfterBrowserPass()
    }
  }

  function handleMouseDown(event: MouseEvent) {
    failedDragCaretVersionRef.current += 1
    if (!visible || event.button !== 0 || event.detail > 1) return
    const target = event.target instanceof Element ? event.target : null
    if (!target) return
    const sourceCell = target.closest('td, th')
    if (!(sourceCell instanceof HTMLTableCellElement)) {
      suppressNextClickRef.current = false
      if (dragStateRef.current) {
        endDrag()
      }
      return
    }
    if (isInteractiveTableDragTarget(target)) return
    const table = sourceCell.closest('table')
    if (!(table instanceof HTMLTableElement)) return

    const editor = editorRef.current
    const view = getWysiwygView(editor)
    if (!editor || !view || !view.dom?.contains?.(sourceCell)) return
    const context = getTableContextForCellElement(view, sourceCell)
    if (!context) return

    lockedTableControlsRef.current = null

    dragStateRef.current = {
      editor,
      context,
      table,
      sourceCell,
      sourceRowIndex: context.rowIndex,
      sourceColumnIndex: context.columnIndex,
      startX: event.clientX,
      startY: event.clientY,
      axis: null,
      insertIndex: null,
      marker: null,
      dragging: false,
      suppressingSelection: false,
      nativeDragSuppressed: false,
    }

    window.addEventListener('mousemove', handleMouseMove, true)
    window.addEventListener('mouseup', handleMouseUp, true)
    window.addEventListener('blur', handleCancel, true)
    window.addEventListener('selectstart', handleSelectStart, true)
    window.addEventListener('dragstart', handleNativeDragStart, true)
  }

  function handleClick(event: MouseEvent) {
    if (!suppressNextClickRef.current) return
    suppressNextClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  function handleKeyDown() {
    releaseLockedTableControls()
    scheduleRefresh()
  }

  useEffect(() => {
    if (!visible) {
      endDrag()
      close()
      return
    }

    const root = editorEventRootRef.current
    const handleEditorActivity = () => scheduleRefresh()
    const handleGeometryChange = () => {
      releaseLockedTableControls()
      scheduleRefresh()
    }

    root?.addEventListener('focusin', handleEditorActivity, true)
    root?.addEventListener('keyup', handleEditorActivity, true)
    root?.addEventListener('mouseup', handleEditorActivity, true)
    root?.addEventListener('pointerup', handleEditorActivity, true)
    root?.addEventListener('mousedown', handleMouseDown, true)
    root?.addEventListener('click', handleClick, true)
    root?.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('selectionchange', handleEditorActivity, true)
    window.addEventListener('resize', handleGeometryChange)
    window.addEventListener('scroll', handleGeometryChange, true)
    scheduleRefresh()

    return () => {
      root?.removeEventListener('focusin', handleEditorActivity, true)
      root?.removeEventListener('keyup', handleEditorActivity, true)
      root?.removeEventListener('mouseup', handleEditorActivity, true)
      root?.removeEventListener('pointerup', handleEditorActivity, true)
      root?.removeEventListener('mousedown', handleMouseDown, true)
      root?.removeEventListener('click', handleClick, true)
      root?.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('selectionchange', handleEditorActivity, true)
      window.removeEventListener('resize', handleGeometryChange)
      window.removeEventListener('scroll', handleGeometryChange, true)
      if (refreshFrameRef.current !== null) {
        window.cancelAnimationFrame(refreshFrameRef.current)
        refreshFrameRef.current = null
      }
      if (dragStateRef.current) {
        endDrag()
      }
    }
  }, [visible, editorEventRootRef.current, scheduleRefresh, close, endDrag])

  return {
    tableControls,
    close,
    refresh,
    runTableControlOperation,
  }
}
