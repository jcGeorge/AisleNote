/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { Editor } from '@toast-ui/editor'
import {
  applyTableControlOperationToView,
  applyTableRangeReorderOperationToView,
  CLOSED_TABLE_CONTROLS_STATE,
  CLOSED_TABLE_SELECTION_OVERLAY_STATE,
  getActiveTableContext,
  getActiveTableDomContext,
  getAdjustedRangeMoveIndex,
  getTableColumnReorderMarkerStyle,
  getTableColumnSegmentRects,
  getTableContextForCellElement,
  getTableControlsOverlayState,
  getTableControlsOverlayStateForCell,
  getTableRowReorderMarkerStyle,
  getTableRowSegmentRects,
  getTableSelectionCellClassNames,
  normalizeTableSelectionRange,
  isEditorRootFocused,
  type TableControlOperation,
  type TableControlsOverlayState,
  type TableReorderAxis,
  type TableSegmentRect,
  type TableSelectionOverlayState,
  type TableSelectionRange,
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

type OverlayMouseEventLike = {
  button?: number
  clientX: number
  clientY: number
  preventDefault: () => void
  stopPropagation: () => void
}

type TableDomContext = {
  context: NonNullable<ReturnType<typeof getTableContextForCellElement>>
  table: HTMLTableElement
}

type CellSelectionInteraction = {
  kind: 'cell-selection'
  editor: Editor
  context: TableDomContext['context']
  table: HTMLTableElement
  anchorRow: number
  anchorColumn: number
  startX: number
  startY: number
  selecting: boolean
  suppressingSelection: boolean
}

type AxisSelectionInteraction = {
  kind: 'axis-selection'
  editor: Editor
  context: TableDomContext['context']
  table: HTMLTableElement
  axis: TableReorderAxis
  anchorIndex: number
  suppressingSelection: boolean
}

type RangeReorderInteraction = {
  kind: 'range-reorder'
  editor: Editor
  context: TableDomContext['context']
  table: HTMLTableElement
  axis: TableReorderAxis
  sourceStart: number
  sourceEnd: number
  startX: number
  startY: number
  insertIndex: number | null
  marker: HTMLElement | null
  dragging: boolean
  suppressingSelection: boolean
}

type TableInteractionState = CellSelectionInteraction | AxisSelectionInteraction | RangeReorderInteraction

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
const TABLE_SELECTION_DRAG_SLOP_PX = 4
const TABLE_RANGE_REORDER_DRAG_SLOP_PX = 3
const TABLE_SELECTOR_SIZE_PX = 14
const TABLE_SELECTOR_GAP_PX = 4
const TABLE_SELECTION_HANDLE_SIZE_PX = 18

const TABLE_SELECTION_CELL_CLASSES = [
  'table-selected-cell',
  'table-selected-cells-cell',
  'table-selected-rows-cell',
  'table-selected-columns-cell',
  'table-selected-cell-top',
  'table-selected-cell-bottom',
  'table-selected-cell-left',
  'table-selected-cell-right',
]

function isInteractiveTableCellTarget(target: Element | null) {
  return Boolean(target?.closest('a, button, input, textarea, select, img, .table-tools, .table-selector-segment, .table-selection-handle'))
}

function clearTableReorderClasses(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>(`.${TABLE_REORDER_SOURCE_CLASS}, .${TABLE_REORDER_TARGET_CLASS}`)
    .forEach((element) => {
      element.classList.remove(TABLE_REORDER_SOURCE_CLASS, TABLE_REORDER_TARGET_CLASS)
    })
}

function clearTableSelectionClasses(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(TABLE_SELECTION_CELL_CLASSES.map((className) => `.${className}`).join(', ')).forEach((element) => {
    element.classList.remove(...TABLE_SELECTION_CELL_CLASSES)
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

function getSegmentIndexAtPosition(segments: TableSegmentRect[], position: number, axis: TableReorderAxis) {
  if (segments.length === 0 || !Number.isFinite(position)) return null
  const startKey = axis === 'row' ? 'top' : 'left'
  const sizeKey = axis === 'row' ? 'height' : 'width'
  const first = segments[0]
  const last = segments[segments.length - 1]
  if (position <= first[startKey]) return first.index
  if (position >= last[startKey] + last[sizeKey]) return last.index

  let nearestIndex = first.index
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const segment of segments) {
    const start = segment[startKey]
    const end = start + segment[sizeKey]
    if (position >= start && position <= end) return segment.index
    const center = start + segment[sizeKey] / 2
    const distance = Math.abs(position - center)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = segment.index
    }
  }
  return nearestIndex
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

  const style = getTableRowReorderMarkerStyle(tableRect, markerY)
  marker.style.width = style.width
  marker.style.height = style.height
  marker.style.transform = style.transform
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

  const style = getTableColumnReorderMarkerStyle(tableRect, markerX)
  marker.style.height = style.height
  marker.style.width = style.width
  marker.style.transform = style.transform
  marker.classList.add('is-visible')
}

function getTableDomContextForTableStart(view: any, tableStart: number | null | undefined): TableDomContext | null {
  if (typeof tableStart !== 'number' || !view?.dom || typeof view.dom.querySelectorAll !== 'function') return null
  const tables = Array.from(view.dom.querySelectorAll('table')).filter((table): table is HTMLTableElement => table instanceof HTMLTableElement)
  for (const table of tables) {
    const firstCell = table.querySelector('th, td')
    if (!(firstCell instanceof HTMLTableCellElement)) continue
    const context = getTableContextForCellElement(view, firstCell)
    if (context?.tableStart === tableStart) return { context, table }
  }
  return null
}

function getTableCellAtViewportPoint(view: any, coords: { left: number; top: number }) {
  const ownerDocument = view?.dom?.ownerDocument ?? document
  const hit = ownerDocument.elementFromPoint?.(coords.left, coords.top)
  const cell = hit instanceof Element ? hit.closest('td, th') : null
  if (!(cell instanceof HTMLTableCellElement) || !view?.dom?.contains?.(cell)) return null
  return cell
}

function createAxisSelection(tableStart: number, axis: TableReorderAxis, anchorIndex: number, headIndex: number): TableSelectionRange {
  return axis === 'row'
    ? {
        tableStart,
        mode: 'rows',
        anchorRow: anchorIndex,
        headRow: headIndex,
        anchorColumn: 0,
        headColumn: 0,
      }
    : {
        tableStart,
        mode: 'columns',
        anchorRow: 0,
        headRow: 0,
        anchorColumn: anchorIndex,
        headColumn: headIndex,
      }
}

function createCellSelection(context: TableDomContext['context'], headContext: TableDomContext['context']): TableSelectionRange {
  return {
    tableStart: context.tableStart,
    mode: 'cells',
    anchorRow: context.rowIndex,
    anchorColumn: context.columnIndex,
    headRow: headContext.rowIndex,
    headColumn: headContext.columnIndex,
  }
}

function createSelectionOverlayState(
  table: HTMLTableElement,
  tableStart: number,
  selection: TableSelectionRange | null,
): TableSelectionOverlayState {
  const tableRect = table.getBoundingClientRect()
  const rowRects = getTableRowSegmentRects(table)
  const columnRects = getTableColumnSegmentRects(table)
  const normalized = selection?.tableStart === tableStart
    ? normalizeTableSelectionRange(selection, rowRects.length, columnRects.length)
    : null

  const rows = rowRects.map((row) => ({
    ...row,
    left: tableRect.left - TABLE_SELECTOR_SIZE_PX - TABLE_SELECTOR_GAP_PX,
    width: TABLE_SELECTOR_SIZE_PX,
    selected: Boolean(normalized && row.index >= normalized.rowStart && row.index <= normalized.rowEnd),
  }))
  const columns = columnRects.map((column) => ({
    ...column,
    top: tableRect.top - TABLE_SELECTOR_SIZE_PX - TABLE_SELECTOR_GAP_PX,
    height: TABLE_SELECTOR_SIZE_PX,
    selected: Boolean(normalized && column.index >= normalized.columnStart && column.index <= normalized.columnEnd),
  }))

  const rowHandle =
    normalized?.mode === 'rows' && rows[normalized.rowStart] && rows[normalized.rowEnd]
      ? {
          index: normalized.rowStart,
          top: rows[normalized.rowStart].top,
          left: tableRect.left - TABLE_SELECTOR_SIZE_PX - TABLE_SELECTOR_GAP_PX - TABLE_SELECTION_HANDLE_SIZE_PX - TABLE_SELECTOR_GAP_PX,
          width: TABLE_SELECTION_HANDLE_SIZE_PX,
          height: rows[normalized.rowEnd].top + rows[normalized.rowEnd].height - rows[normalized.rowStart].top,
        }
      : null
  const columnHandle =
    normalized?.mode === 'columns' && columns[normalized.columnStart] && columns[normalized.columnEnd]
      ? {
          index: normalized.columnStart,
          top: tableRect.top - TABLE_SELECTOR_SIZE_PX - TABLE_SELECTOR_GAP_PX - TABLE_SELECTION_HANDLE_SIZE_PX - TABLE_SELECTOR_GAP_PX,
          left: columns[normalized.columnStart].left,
          width: columns[normalized.columnEnd].left + columns[normalized.columnEnd].width - columns[normalized.columnStart].left,
          height: TABLE_SELECTION_HANDLE_SIZE_PX,
      }
      : null
  const selectionRect =
    normalized &&
    rows[normalized.rowStart] &&
    rows[normalized.rowEnd] &&
    columns[normalized.columnStart] &&
    columns[normalized.columnEnd]
      ? {
          index: 0,
          top: rowRects[normalized.rowStart].top,
          left: columnRects[normalized.columnStart].left,
          width:
            columnRects[normalized.columnEnd].left +
            columnRects[normalized.columnEnd].width -
            columnRects[normalized.columnStart].left,
          height: rowRects[normalized.rowEnd].top + rowRects[normalized.rowEnd].height - rowRects[normalized.rowStart].top,
        }
      : null

  return {
    visible: rowRects.length > 0 && columnRects.length > 0,
    tableStart,
    mode: normalized?.mode ?? null,
    rows,
    columns,
    selectionRect,
    rowHandle,
    columnHandle,
  }
}

function applyTableSelectionClasses(root: HTMLElement | null, table: HTMLTableElement | null, selection: TableSelectionRange | null) {
  if (root) {
    clearTableSelectionClasses(root)
  } else if (table) {
    clearTableSelectionClasses(table)
  }
  if (!table || !selection) return

  const rows = getTableRows(table)
  const columnCount = getTableColumns(table).length
  rows.forEach((row, rowIndex) => {
    Array.from(row.children)
      .filter((cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement)
      .forEach((cell, columnIndex) => {
        const classNames = getTableSelectionCellClassNames(selection, rowIndex, columnIndex, rows.length, columnCount)
        if (classNames.length > 0) {
          cell.classList.add(...classNames)
        }
      })
  })
}

export function useTableControls({
  visible,
  editorRef,
  editorEventRootRef,
  commitActiveEditorMarkdownNow,
  syncToolbarFormatState,
}: UseTableControlsOptions) {
  const [tableControls, setTableControls] = useState<TableControlsOverlayState>(CLOSED_TABLE_CONTROLS_STATE)
  const [tableSelectionOverlay, setTableSelectionOverlay] = useState<TableSelectionOverlayState>(CLOSED_TABLE_SELECTION_OVERLAY_STATE)
  const [tableSelection, setTableSelectionState] = useState<TableSelectionRange | null>(null)
  const tableControlsRef = useRef<TableControlsOverlayState>(CLOSED_TABLE_CONTROLS_STATE)
  const tableSelectionOverlayRef = useRef<TableSelectionOverlayState>(CLOSED_TABLE_SELECTION_OVERLAY_STATE)
  const tableSelectionRef = useRef<TableSelectionRange | null>(null)
  const refreshFrameRef = useRef<number | null>(null)
  const activeCellRef = useRef<HTMLTableCellElement | null>(null)
  const lockedTableControlsRef = useRef<TableControlsOverlayState | null>(null)
  const interactionStateRef = useRef<TableInteractionState | null>(null)
  const suppressNextClickRef = useRef(false)
  const selectionSuppressionRef = useRef(createTaskReorderSelectionSuppressionController())

  const updateTableControls = useCallback((next: TableControlsOverlayState) => {
    if (tableControlsStateEqual(tableControlsRef.current, next)) return
    tableControlsRef.current = next
    setTableControls(next)
  }, [])

  const updateTableSelectionOverlay = useCallback((next: TableSelectionOverlayState) => {
    tableSelectionOverlayRef.current = next
    setTableSelectionOverlay(next)
  }, [])

  const setActiveCell = useCallback((cell: HTMLTableCellElement | null) => {
    if (activeCellRef.current === cell) return
    activeCellRef.current?.classList.remove(TABLE_ACTIVE_CELL_CLASS)
    activeCellRef.current = cell
    activeCellRef.current?.classList.add(TABLE_ACTIVE_CELL_CLASS)
  }, [])

  const setCurrentTableSelection = useCallback(
    (next: TableSelectionRange | null) => {
      const previous = tableSelectionRef.current
      tableSelectionRef.current = next
      setTableSelectionState(next)
      const view = getWysiwygView(editorRef.current)
      const tableStart = next?.tableStart ?? previous?.tableStart
      const table = typeof tableStart === 'number' ? getTableDomContextForTableStart(view, tableStart)?.table ?? null : null
      applyTableSelectionClasses(editorEventRootRef.current, table, next)
    },
    [editorEventRootRef, editorRef],
  )

  const close = useCallback(() => {
    lockedTableControlsRef.current = null
    setActiveCell(null)
    setCurrentTableSelection(null)
    updateTableSelectionOverlay(CLOSED_TABLE_SELECTION_OVERLAY_STATE)
    updateTableControls(CLOSED_TABLE_CONTROLS_STATE)
  }, [setActiveCell, setCurrentTableSelection, updateTableControls, updateTableSelectionOverlay])

  const releaseLockedTableControls = useCallback(() => {
    lockedTableControlsRef.current = null
  }, [])

  const refresh = useCallback(() => {
    if (!visible) {
      close()
      return
    }
    if (interactionStateRef.current?.kind === 'range-reorder') {
      return
    }
    const view = getWysiwygView(editorRef.current)
    const root = editorEventRootRef.current ?? view?.dom ?? null
    if (!view || !isEditorRootFocused(root)) {
      lockedTableControlsRef.current = null
      setActiveCell(null)
      setCurrentTableSelection(null)
      updateTableSelectionOverlay(CLOSED_TABLE_SELECTION_OVERLAY_STATE)
      updateTableControls(CLOSED_TABLE_CONTROLS_STATE)
      return
    }

    const selectedTable = getTableDomContextForTableStart(view, tableSelectionRef.current?.tableStart)
    const activeTable = getActiveTableDomContext(view)
    const tableDomContext = selectedTable ?? activeTable
    setActiveCell(activeTable?.cell ?? null)

    if (!tableDomContext) {
      lockedTableControlsRef.current = null
      setCurrentTableSelection(null)
      updateTableSelectionOverlay(CLOSED_TABLE_SELECTION_OVERLAY_STATE)
      updateTableControls(CLOSED_TABLE_CONTROLS_STATE)
      return
    }

    if (tableSelectionRef.current && !selectedTable) {
      setCurrentTableSelection(null)
    } else {
      applyTableSelectionClasses(root, tableDomContext.table, tableSelectionRef.current)
    }

    const firstCell = tableDomContext.table.querySelector('th, td')
    updateTableSelectionOverlay(
      createSelectionOverlayState(tableDomContext.table, tableDomContext.context.tableStart, tableSelectionRef.current),
    )

    const lockedControls = lockedTableControlsRef.current
    if (lockedControls?.visible) {
      updateTableControls(lockedControls)
      return
    }
    updateTableControls(
      firstCell instanceof HTMLTableCellElement ? getTableControlsOverlayStateForCell(firstCell) : getTableControlsOverlayState(view),
    )
  }, [
    close,
    editorEventRootRef,
    editorRef,
    setActiveCell,
    setCurrentTableSelection,
    updateTableControls,
    updateTableSelectionOverlay,
    visible,
  ])

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
      setCurrentTableSelection(null)
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
    [
      commitActiveEditorMarkdownNow,
      editorRef,
      scheduleRefresh,
      setCurrentTableSelection,
      syncToolbarFormatState,
      updateTableControls,
    ],
  )

  const endInteraction = useCallback(
    (options: { releaseSelectionAfterBrowserPass?: boolean } = {}) => {
      const interactionState = interactionStateRef.current
      const root = editorEventRootRef.current
      const shouldClearSelection = Boolean(
        interactionState?.suppressingSelection ||
          (interactionState?.kind === 'cell-selection' && interactionState.selecting) ||
          (interactionState?.kind === 'range-reorder' && interactionState.dragging),
      )
      if (interactionState?.kind === 'range-reorder') {
        interactionState.marker?.remove()
      }
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
      interactionStateRef.current = null
      scheduleRefresh()
    },
    [editorEventRootRef, scheduleRefresh],
  )

  function updateReorderDropTarget(event: globalThis.MouseEvent) {
    const interactionState = interactionStateRef.current
    const root = editorEventRootRef.current
    if (interactionState?.kind !== 'range-reorder' || !interactionState.dragging || !root) return

    clearTableReorderClasses(root)
    const rows = getTableRows(interactionState.table)
    const columns = getTableColumns(interactionState.table)
    const rowCount = rows.length
    const columnCount = columns.length
    const sourceSelection = createAxisSelection(
      interactionState.context.tableStart,
      interactionState.axis,
      interactionState.sourceStart,
      interactionState.sourceEnd,
    )

    rows.forEach((row, rowIndex) => {
      Array.from(row.children)
        .filter((cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement)
        .forEach((cell, columnIndex) => {
          if (getTableSelectionCellClassNames(sourceSelection, rowIndex, columnIndex, rowCount, columnCount).length > 0) {
            cell.classList.add(TABLE_REORDER_SOURCE_CLASS)
          }
        })
    })

    const insertIndex =
      interactionState.axis === 'row'
        ? getRowInsertIndex(interactionState.table, event.clientY, interactionState.insertIndex)
        : getColumnInsertIndex(interactionState.table, event.clientX, interactionState.insertIndex)
    interactionState.insertIndex = insertIndex

    if (interactionState.axis === 'row') {
      const targetRow = rows[Math.min(insertIndex, rows.length - 1)]
      Array.from(targetRow?.children ?? [])
        .filter((cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement)
        .forEach((cell) => cell.classList.add(TABLE_REORDER_TARGET_CLASS))
      if (interactionState.marker) positionRowMarker(interactionState.marker, interactionState.table, insertIndex)
    } else {
      const targetColumn = columns[Math.min(insertIndex, columns.length - 1)]
      if (targetColumn) {
        rows.forEach((row) => {
          const cell = row.children[targetColumn.cellIndex]
          if (cell instanceof HTMLTableCellElement) cell.classList.add(TABLE_REORDER_TARGET_CLASS)
        })
      }
      if (interactionState.marker) positionColumnMarker(interactionState.marker, interactionState.table, insertIndex)
    }
  }

  function handleCancel() {
    endInteraction()
  }

  function handleCellSelectionMove(interactionState: CellSelectionInteraction, event: globalThis.MouseEvent) {
    const root = editorEventRootRef.current
    if (!root) return

    const deltaX = event.clientX - interactionState.startX
    const deltaY = event.clientY - interactionState.startY
    if (!interactionState.selecting && Math.max(Math.abs(deltaX), Math.abs(deltaY)) < TABLE_SELECTION_DRAG_SLOP_PX) {
      return
    }

    if (!interactionState.selecting) {
      interactionState.selecting = true
      interactionState.suppressingSelection = true
      suppressNextClickRef.current = true
      root.classList.add(TABLE_REORDER_PENDING_CLASS)
      selectionSuppressionRef.current.begin()
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    selectionSuppressionRef.current.clearAfterBrowserPass()

    const view = getWysiwygView(interactionState.editor)
    const targetCell = getTableCellAtViewportPoint(view, { left: event.clientX, top: event.clientY })
    if (!targetCell || targetCell.closest('table') !== interactionState.table) return
    const targetContext = getTableContextForCellElement(view, targetCell)
    if (!targetContext || targetContext.tableStart !== interactionState.context.tableStart) return

    const nextSelection = createCellSelection(interactionState.context, targetContext)
    tableSelectionRef.current = nextSelection
    setTableSelectionState(nextSelection)
    applyTableSelectionClasses(root, interactionState.table, nextSelection)
    updateTableSelectionOverlay(createSelectionOverlayState(interactionState.table, interactionState.context.tableStart, nextSelection))
  }

  function handleAxisSelectionMove(interactionState: AxisSelectionInteraction, event: globalThis.MouseEvent) {
    const root = editorEventRootRef.current
    if (!root) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    selectionSuppressionRef.current.clearAfterBrowserPass()

    const segments =
      interactionState.axis === 'row'
        ? getTableRowSegmentRects(interactionState.table)
        : getTableColumnSegmentRects(interactionState.table)
    const headIndex = getSegmentIndexAtPosition(
      segments,
      interactionState.axis === 'row' ? event.clientY : event.clientX,
      interactionState.axis,
    )
    if (headIndex === null) return

    const nextSelection = createAxisSelection(
      interactionState.context.tableStart,
      interactionState.axis,
      interactionState.anchorIndex,
      headIndex,
    )
    tableSelectionRef.current = nextSelection
    setTableSelectionState(nextSelection)
    applyTableSelectionClasses(root, interactionState.table, nextSelection)
    updateTableSelectionOverlay(createSelectionOverlayState(interactionState.table, interactionState.context.tableStart, nextSelection))
  }

  function handleRangeReorderMove(interactionState: RangeReorderInteraction, event: globalThis.MouseEvent) {
    const root = editorEventRootRef.current
    if (!root) return

    const deltaX = event.clientX - interactionState.startX
    const deltaY = event.clientY - interactionState.startY
    if (!interactionState.dragging && Math.max(Math.abs(deltaX), Math.abs(deltaY)) < TABLE_RANGE_REORDER_DRAG_SLOP_PX) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    selectionSuppressionRef.current.clearAfterBrowserPass()

    if (!interactionState.dragging) {
      interactionState.dragging = true
      suppressNextClickRef.current = true
      root.classList.add(TABLE_REORDER_ACTIVE_CLASS)
      interactionState.marker = createTableReorderMarker(root, interactionState.axis)
    }

    updateReorderDropTarget(event)
  }

  function handleMouseMove(event: globalThis.MouseEvent) {
    const interactionState = interactionStateRef.current
    if (!interactionState) return
    if (interactionState.kind === 'cell-selection') {
      handleCellSelectionMove(interactionState, event)
      return
    }
    if (interactionState.kind === 'axis-selection') {
      handleAxisSelectionMove(interactionState, event)
      return
    }
    handleRangeReorderMove(interactionState, event)
  }

  function handleMouseUp(event: globalThis.MouseEvent) {
    const interactionState = interactionStateRef.current
    if (!interactionState) return

    if (interactionState.kind !== 'range-reorder') {
      if (interactionState.suppressingSelection || (interactionState.kind === 'cell-selection' && interactionState.selecting)) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
      }
      endInteraction({ releaseSelectionAfterBrowserPass: true })
      return
    }

    if (!interactionState.dragging || interactionState.insertIndex === null) {
      endInteraction({ releaseSelectionAfterBrowserPass: true })
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    suppressNextClickRef.current = true
    updateReorderDropTarget(event)

    const { editor, context, axis, sourceStart, sourceEnd, insertIndex } = interactionState
    const view = getWysiwygView(editor)
    const movedStart = getAdjustedRangeMoveIndex(sourceStart, sourceEnd, insertIndex)
    const movedEnd = movedStart + (sourceEnd - sourceStart)
    if (view && applyTableRangeReorderOperationToView(view, axis, sourceStart, sourceEnd, insertIndex, context)) {
      const nextSelection = createAxisSelection(context.tableStart, axis, movedStart, movedEnd)
      endInteraction({ releaseSelectionAfterBrowserPass: true })
      setCurrentTableSelection(nextSelection)
      editor.focus()
      commitActiveEditorMarkdownNow(editor)
      syncToolbarFormatState()
      scheduleRefresh()
    } else {
      endInteraction({ releaseSelectionAfterBrowserPass: true })
    }
  }

  function handleSelectStart(event: Event) {
    const interactionState = interactionStateRef.current
    if (!interactionState?.suppressingSelection && interactionState?.kind !== 'range-reorder') return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    selectionSuppressionRef.current.clearAfterBrowserPass()
  }

  function handleNativeDragStart(event: Event) {
    const interactionState = interactionStateRef.current
    if (!interactionState) return
    event.preventDefault()
    event.stopPropagation()
    if (interactionState.suppressingSelection || interactionState.kind === 'range-reorder') {
      selectionSuppressionRef.current.clearAfterBrowserPass()
    }
  }

  function installWindowInteractionListeners() {
    window.addEventListener('mousemove', handleMouseMove, true)
    window.addEventListener('mouseup', handleMouseUp, true)
    window.addEventListener('blur', handleCancel, true)
    window.addEventListener('selectstart', handleSelectStart, true)
    window.addEventListener('dragstart', handleNativeDragStart, true)
  }

  function handleMouseDown(event: MouseEvent) {
    if (!visible || event.button !== 0 || event.detail > 1) return
    const target = event.target instanceof Element ? event.target : null
    if (!target) return
    const sourceCell = target.closest('td, th')
    if (!(sourceCell instanceof HTMLTableCellElement)) {
      suppressNextClickRef.current = false
      setCurrentTableSelection(null)
      if (interactionStateRef.current) endInteraction()
      return
    }
    if (isInteractiveTableCellTarget(target)) {
      setCurrentTableSelection(null)
      return
    }
    const table = sourceCell.closest('table')
    if (!(table instanceof HTMLTableElement)) return

    const editor = editorRef.current
    const view = getWysiwygView(editor)
    if (!editor || !view || !view.dom?.contains?.(sourceCell)) return
    const context = getTableContextForCellElement(view, sourceCell)
    if (!context) return

    lockedTableControlsRef.current = null
    interactionStateRef.current = {
      kind: 'cell-selection',
      editor,
      context,
      table,
      anchorRow: context.rowIndex,
      anchorColumn: context.columnIndex,
      startX: event.clientX,
      startY: event.clientY,
      selecting: false,
      suppressingSelection: false,
    }
    installWindowInteractionListeners()
  }

  function handleClick(event: MouseEvent) {
    if (!suppressNextClickRef.current) return
    suppressNextClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  function handleKeyDown() {
    releaseLockedTableControls()
    setCurrentTableSelection(null)
    scheduleRefresh()
  }

  const beginTableAxisSelection = useCallback(
    (axis: TableReorderAxis, index: number, event: OverlayMouseEventLike) => {
      event.preventDefault()
      event.stopPropagation()
      if (!visible || (event.button ?? 0) !== 0) return
      const editor = editorRef.current
      const view = getWysiwygView(editor)
      const tableStart = tableSelectionOverlayRef.current.tableStart
      const tableDomContext = getTableDomContextForTableStart(view, tableStart)
      if (!editor || !view || !tableDomContext) return

      lockedTableControlsRef.current = null
      const nextSelection = createAxisSelection(tableDomContext.context.tableStart, axis, index, index)
      setCurrentTableSelection(nextSelection)
      interactionStateRef.current = {
        kind: 'axis-selection',
        editor,
        context: tableDomContext.context,
        table: tableDomContext.table,
        axis,
        anchorIndex: index,
        suppressingSelection: true,
      }
      suppressNextClickRef.current = true
      selectionSuppressionRef.current.begin()
      installWindowInteractionListeners()
      editor.focus()
      scheduleRefresh()
    },
    [editorRef, scheduleRefresh, setCurrentTableSelection, visible],
  )

  const beginTableRangeReorder = useCallback(
    (axis: TableReorderAxis, event: OverlayMouseEventLike) => {
      event.preventDefault()
      event.stopPropagation()
      if (!visible || (event.button ?? 0) !== 0) return
      const editor = editorRef.current
      const view = getWysiwygView(editor)
      const selection = tableSelectionRef.current
      const tableDomContext = getTableDomContextForTableStart(view, selection?.tableStart)
      if (!editor || !view || !selection || !tableDomContext) return
      const rows = getTableRows(tableDomContext.table)
      const columns = getTableColumns(tableDomContext.table)
      const normalized = normalizeTableSelectionRange(selection, rows.length, columns.length)
      if (!normalized) return
      if ((axis === 'row' && normalized.mode !== 'rows') || (axis === 'column' && normalized.mode !== 'columns')) return

      lockedTableControlsRef.current = null
      interactionStateRef.current = {
        kind: 'range-reorder',
        editor,
        context: tableDomContext.context,
        table: tableDomContext.table,
        axis,
        sourceStart: axis === 'row' ? normalized.rowStart : normalized.columnStart,
        sourceEnd: axis === 'row' ? normalized.rowEnd : normalized.columnEnd,
        startX: event.clientX,
        startY: event.clientY,
        insertIndex: null,
        marker: null,
        dragging: false,
        suppressingSelection: true,
      }
      suppressNextClickRef.current = true
      selectionSuppressionRef.current.begin()
      editor.focus()
      installWindowInteractionListeners()
    },
    [editorRef, visible],
  )

  useEffect(() => {
    if (!visible) {
      endInteraction()
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
      if (interactionStateRef.current) {
        endInteraction()
      }
    }
  }, [visible, editorEventRootRef.current, scheduleRefresh, close, endInteraction])

  return {
    tableControls,
    tableSelection,
    tableSelectionOverlay,
    close,
    refresh,
    runTableControlOperation,
    beginTableAxisSelection,
    beginTableRangeReorder,
  }
}
