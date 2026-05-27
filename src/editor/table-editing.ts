import { NodeSelection, Selection, TextSelection } from 'prosemirror-state'
import type { TableControlTargetMode } from '../types/app'

export type TableControlOperation = 'add-row' | 'remove-row' | 'add-column' | 'remove-column'
export type TableReorderAxis = 'row' | 'column'
export type TableBoundaryDirection = 'before' | 'after'
export type TableCellNavigationDirection = 'forward' | 'backward'
export type TableRange = { tableStart: number; tableEnd: number }
export type TableCellNavigationResult = { handled: boolean; changed: boolean }

export type ActiveTableContext = {
  tableStart: number
  tableEnd: number
  cellStart: number
  tableNode: any
  rowIndex: number
  bodyRowIndex: number | null
  columnIndex: number
  columnCount: number
  bodyRowCount: number
  inHeader: boolean
}

export type TableControlsOverlayState = {
  visible: boolean
  columnTop: number
  columnLeft: number
  rowTop: number
  rowLeft: number
}

export type TableReorderMarkerStyle = {
  width: string
  height: string
  transform: string
}

export const CLOSED_TABLE_CONTROLS_STATE: TableControlsOverlayState = {
  visible: false,
  columnTop: 0,
  columnLeft: 0,
  rowTop: 0,
  rowLeft: 0,
}

export function isEditorRootFocused(
  root: { contains?: (node: unknown) => boolean; ownerDocument?: { activeElement?: unknown } } | null | undefined,
  activeElement: unknown = root?.ownerDocument?.activeElement,
) {
  return Boolean(root && activeElement && typeof root.contains === 'function' && root.contains(activeElement))
}

const TABLE_CONTROL_BUTTON_SIZE = 26
const TABLE_CONTROL_GAP = 4
const TABLE_CONTROL_VIEWPORT_PADDING = 8
const TABLE_COLUMN_CONTROL_WIDTH = TABLE_CONTROL_BUTTON_SIZE * 2 + TABLE_CONTROL_GAP
const TABLE_ROW_CONTROL_HEIGHT = TABLE_CONTROL_BUTTON_SIZE * 2 + TABLE_CONTROL_GAP
const TABLE_REORDER_DRAG_SLOP_PX = 18
const TABLE_REORDER_AXIS_LOCK_RATIO = 2
const TABLE_REORDER_MARKER_AXIS_NUDGE_PX = 2
const TABLE_REORDER_MARKER_EXTENSION_PX = 10

type TableRectLike = {
  top: number
  left: number
  width: number
  height: number
}

type PointLike = {
  left: number
  top: number
}

export function getTableRowReorderMarkerStyle(tableRect: TableRectLike, markerY: number): TableReorderMarkerStyle {
  return {
    width: `${tableRect.width + TABLE_REORDER_MARKER_EXTENSION_PX}px`,
    height: '',
    transform: `translate(${tableRect.left - TABLE_REORDER_MARKER_EXTENSION_PX}px, ${markerY + TABLE_REORDER_MARKER_AXIS_NUDGE_PX}px) translateY(-50%)`,
  }
}

export function getTableColumnReorderMarkerStyle(tableRect: TableRectLike, markerX: number): TableReorderMarkerStyle {
  return {
    width: '',
    height: `${tableRect.height + TABLE_REORDER_MARKER_EXTENSION_PX}px`,
    transform: `translate(${markerX + TABLE_REORDER_MARKER_AXIS_NUDGE_PX}px, ${tableRect.top - TABLE_REORDER_MARKER_EXTENSION_PX}px) translateX(-50%)`,
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function rectRight(rect: TableRectLike) {
  return rect.left + rect.width
}

function rectBottom(rect: TableRectLike) {
  return rect.top + rect.height
}

export function isPointInTableRightSelectionZone(tableRect: TableRectLike, point: PointLike): boolean {
  if (
    !Number.isFinite(tableRect.top) ||
    !Number.isFinite(tableRect.left) ||
    !Number.isFinite(tableRect.width) ||
    !Number.isFinite(tableRect.height) ||
    tableRect.width <= 0 ||
    tableRect.height <= 0 ||
    !Number.isFinite(point.left) ||
    !Number.isFinite(point.top)
  ) {
    return false
  }
  return point.left > rectRight(tableRect) && point.top >= tableRect.top && point.top <= rectBottom(tableRect)
}

function getAdjustedMoveIndex(sourceIndex: number, insertIndex: number) {
  return sourceIndex < insertIndex ? insertIndex - 1 : insertIndex
}

export function getTableReorderDragDecision(deltaX: number, deltaY: number): {
  shouldSuppressSelection: boolean
  axis: TableReorderAxis | null
} {
  const horizontalDistance = Math.abs(deltaX)
  const verticalDistance = Math.abs(deltaY)
  const maxDistance = Math.max(horizontalDistance, verticalDistance)
  if (!Number.isFinite(horizontalDistance) || !Number.isFinite(verticalDistance)) {
    return { shouldSuppressSelection: false, axis: null }
  }
  if (maxDistance < TABLE_REORDER_DRAG_SLOP_PX) {
    return { shouldSuppressSelection: false, axis: null }
  }
  if (verticalDistance >= horizontalDistance * TABLE_REORDER_AXIS_LOCK_RATIO) {
    return { shouldSuppressSelection: true, axis: 'row' }
  }
  if (horizontalDistance >= verticalDistance * TABLE_REORDER_AXIS_LOCK_RATIO) {
    return { shouldSuppressSelection: true, axis: 'column' }
  }
  return { shouldSuppressSelection: false, axis: null }
}

function getNodeName(node: any): string | null {
  return typeof node?.type?.name === 'string' ? node.type.name : null
}

function findAncestorDepth($pos: any, names: Set<string>): number | null {
  for (let depth = $pos?.depth ?? 0; depth > 0; depth -= 1) {
    const name = getNodeName($pos.node(depth))
    if (name && names.has(name)) return depth
  }
  return null
}

function getBodyRows(tableNode: any): any[] {
  const tableBody = tableNode?.child?.(1)
  const rows: any[] = []
  if (!tableBody || typeof tableBody.childCount !== 'number') return rows
  for (let index = 0; index < tableBody.childCount; index += 1) {
    rows.push(tableBody.child(index))
  }
  return rows
}

function getHeadRow(tableNode: any): any | null {
  const tableHead = tableNode?.child?.(0)
  if (!tableHead || tableHead.childCount < 1) return null
  return tableHead.child(0)
}

function getColumnCount(tableNode: any) {
  const rows = [getHeadRow(tableNode), ...getBodyRows(tableNode)].filter(Boolean)
  return rows.reduce((max, row) => Math.max(max, row.childCount ?? 0), 0)
}

function getTableContextFromResolvedPosition($pos: any): ActiveTableContext | null {
  const cellDepth = findAncestorDepth($pos, new Set(['tableHeadCell', 'tableBodyCell']))
  const rowDepth = findAncestorDepth($pos, new Set(['tableRow']))
  const partDepth = findAncestorDepth($pos, new Set(['tableHead', 'tableBody']))
  const tableDepth = findAncestorDepth($pos, new Set(['table']))
  if (cellDepth === null || rowDepth === null || partDepth === null || tableDepth === null) return null

  const tableNode = $pos.node(tableDepth)
  const partName = getNodeName($pos.node(partDepth))
  const inHeader = partName === 'tableHead'
  const bodyRowIndex = inHeader ? null : $pos.index(partDepth)
  const rowIndex = inHeader ? 0 : (bodyRowIndex ?? 0) + 1
  const columnIndex = $pos.index(rowDepth)
  const bodyRowCount = getBodyRows(tableNode).length
  const columnCount = getColumnCount(tableNode)
  if (columnIndex < 0 || columnCount <= 0) return null

  return {
    tableStart: $pos.before(tableDepth),
    tableEnd: $pos.after(tableDepth),
    cellStart: $pos.before(cellDepth),
    tableNode,
    rowIndex,
    bodyRowIndex,
    columnIndex,
    columnCount,
    bodyRowCount,
    inHeader,
  }
}

export function getActiveTableContext(view: any): ActiveTableContext | null {
  const selection = view?.state?.selection
  const candidates = [selection?.$anchor, selection?.$head, selection?.$from, selection?.$to].filter(Boolean)
  for (const candidate of candidates) {
    const context = getTableContextFromResolvedPosition(candidate)
    if (context) return context
  }
  return null
}

export function getActiveTableRange(view: any): TableRange | null {
  const context = getActiveTableContext(view)
  return context ? { tableStart: context.tableStart, tableEnd: context.tableEnd } : null
}

export function isActiveSelectionInsideTableRange(view: any, range: TableRange): boolean {
  const context = getActiveTableContext(view)
  return Boolean(context && context.tableStart === range.tableStart && context.tableEnd === range.tableEnd)
}

function getDomElement(node: unknown): Element | null {
  if (node instanceof Element) return node
  if (node instanceof Text) return node.parentElement
  return null
}

function getCurrentCellElement(view: any, context: ActiveTableContext): HTMLTableCellElement | null {
  const nodeDom = typeof view?.nodeDOM === 'function' ? view.nodeDOM(context.cellStart) : null
  const nodeElement = getDomElement(nodeDom)
  const nodeCell = nodeElement?.closest('td, th')
  if (nodeCell instanceof HTMLTableCellElement) return nodeCell

  const selection =
    typeof view?.dom?.ownerDocument?.getSelection === 'function'
      ? view.dom.ownerDocument.getSelection()
      : typeof document !== 'undefined'
        ? document.getSelection()
        : null
  const selectionElement = getDomElement(selection?.anchorNode ?? null)
  const selectionCell = selectionElement?.closest('td, th')
  return selectionCell instanceof HTMLTableCellElement ? selectionCell : null
}

export function getActiveTableDomContext(view: any): {
  context: ActiveTableContext
  table: HTMLTableElement
  cell: HTMLTableCellElement
} | null {
  const context = getActiveTableContext(view)
  if (!context) return null
  const cell = getCurrentCellElement(view, context)
  if (!cell) return null
  const table = cell.closest('table')
  if (!(table instanceof HTMLTableElement)) return null
  return { context, table, cell }
}

export function getTableContextForCellElement(view: any, cell: HTMLTableCellElement): ActiveTableContext | null {
  if (!view?.state?.doc || typeof view.posAtDOM !== 'function') return null
  const positions: number[] = []
  try {
    const cellPos = view.posAtDOM(cell, 0)
    if (typeof cellPos === 'number') {
      positions.push(cellPos, cellPos + 1, cellPos + 2)
    }
  } catch {
    return null
  }
  for (const position of positions) {
    try {
      const context = getTableContextFromResolvedPosition(view.state.doc.resolve(position))
      if (context) return context
    } catch {
      // Try the next nearby table-cell position.
    }
  }
  return null
}

function getTableStartForElement(view: any, table: HTMLTableElement): number | null {
  const firstCell = table.querySelector('th, td')
  if (firstCell instanceof HTMLTableCellElement) {
    return getTableContextForCellElement(view, firstCell)?.tableStart ?? null
  }

  if (!view?.state?.doc || typeof view.posAtDOM !== 'function') return null
  try {
    const position = view.posAtDOM(table, 0)
    if (typeof position === 'number' && view.state.doc.nodeAt(position)?.type?.name === 'table') {
      return position
    }
  } catch {
    return null
  }
  return null
}

export function getTableSideSelectionTarget(
  view: any,
  point: PointLike,
  eventTarget?: Element | null,
): { table: HTMLTableElement; tableStart: number } | null {
  if (!view?.dom || typeof view.dom.querySelectorAll !== 'function') return null
  if (eventTarget?.closest('table')) return null

  const tables = Array.from(view.dom.querySelectorAll('table')).filter((table): table is HTMLTableElement => {
    return table instanceof HTMLTableElement
  })
  const candidates = tables
    .map((table) => ({
      table,
      rect: table.getBoundingClientRect(),
    }))
    .filter(({ rect }) => isPointInTableRightSelectionZone(rect, point))
    .sort((left, right) => Math.abs(point.left - rectRight(left.rect)) - Math.abs(point.left - rectRight(right.rect)))

  for (const candidate of candidates) {
    const tableStart = getTableStartForElement(view, candidate.table)
    if (typeof tableStart === 'number') {
      return {
        table: candidate.table,
        tableStart,
      }
    }
  }

  return null
}

export function isBlankTableSideSelectionTarget(view: any, eventTarget?: Element | null): boolean {
  if (!view?.dom || !eventTarget) return false
  return eventTarget === view.dom
}

export function selectTableNodeAtPosition(view: any, tableStart: number): boolean {
  const doc = view?.state?.doc
  const transaction = view?.state?.tr
  if (!doc || !transaction || typeof view?.dispatch !== 'function') return false
  const node = doc.nodeAt(tableStart)
  if (node?.type?.name !== 'table') return false

  view.dispatch(
    transaction
      .setSelection(NodeSelection.create(doc, tableStart))
      .setMeta('addToHistory', false)
      .scrollIntoView(),
  )
  if (typeof view.focus === 'function') {
    view.focus()
  }
  return true
}

export function isSelectedTableNode(view: any, tableStart?: number): boolean {
  const selection = view?.state?.selection
  if (selection?.node?.type?.name !== 'table') return false
  return typeof tableStart === 'number' ? selection.from === tableStart : true
}

export function selectTableFromSideClick(view: any, point: PointLike, eventTarget?: Element | null): boolean {
  const target = getTableSideSelectionTarget(view, point, eventTarget)
  return target ? selectTableNodeAtPosition(view, target.tableStart) : false
}

export function getTableControlsOverlayPlacement(
  tableRect: TableRectLike,
  viewportWidth: number,
  viewportHeight: number,
): TableControlsOverlayState {
  const preferredColumnTop = tableRect.top - TABLE_CONTROL_GAP - TABLE_CONTROL_BUTTON_SIZE
  const preferredRowLeft = rectRight(tableRect) + TABLE_CONTROL_GAP
  const columnLeft = clamp(
    rectRight(tableRect) - TABLE_COLUMN_CONTROL_WIDTH,
    TABLE_CONTROL_VIEWPORT_PADDING,
    viewportWidth - TABLE_CONTROL_VIEWPORT_PADDING - TABLE_COLUMN_CONTROL_WIDTH,
  )
  const columnTop = clamp(
    preferredColumnTop >= TABLE_CONTROL_VIEWPORT_PADDING ? preferredColumnTop : rectBottom(tableRect) + TABLE_CONTROL_GAP,
    TABLE_CONTROL_VIEWPORT_PADDING,
    viewportHeight - TABLE_CONTROL_VIEWPORT_PADDING - TABLE_CONTROL_BUTTON_SIZE,
  )
  const rowLeft = clamp(
    preferredRowLeft + TABLE_CONTROL_BUTTON_SIZE <= viewportWidth - TABLE_CONTROL_VIEWPORT_PADDING
      ? preferredRowLeft
      : tableRect.left - TABLE_CONTROL_GAP - TABLE_CONTROL_BUTTON_SIZE,
    TABLE_CONTROL_VIEWPORT_PADDING,
    viewportWidth - TABLE_CONTROL_VIEWPORT_PADDING - TABLE_CONTROL_BUTTON_SIZE,
  )
  const rowTop = clamp(
    rectBottom(tableRect) - TABLE_ROW_CONTROL_HEIGHT,
    TABLE_CONTROL_VIEWPORT_PADDING,
    viewportHeight - TABLE_CONTROL_VIEWPORT_PADDING - TABLE_ROW_CONTROL_HEIGHT,
  )
  return {
    visible: true,
    columnTop,
    columnLeft,
    rowTop,
    rowLeft,
  }
}

export function getTableControlsOverlayStateForCell(cell: HTMLTableCellElement): TableControlsOverlayState {
  const table = cell.closest('table')
  if (!(table instanceof HTMLTableElement)) {
    return CLOSED_TABLE_CONTROLS_STATE
  }
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
  return getTableControlsOverlayPlacement(
    table.getBoundingClientRect(),
    viewportWidth,
    viewportHeight,
  )
}

export function getTableControlsOverlayState(view: any): TableControlsOverlayState {
  const domContext = getActiveTableDomContext(view)
  if (!domContext) return CLOSED_TABLE_CONTROLS_STATE
  return getTableControlsOverlayStateForCell(domContext.cell)
}

function cloneCellAsType(schema: any, sourceCell: any, typeName: 'tableHeadCell' | 'tableBodyCell') {
  const cellType = schema.nodes[typeName]
  const paragraph = schema.nodes.paragraph
  const attrs = sourceCell?.attrs ?? null
  if (sourceCell?.content && typeof cellType.validContent === 'function' && cellType.validContent(sourceCell.content)) {
    return cellType.create(attrs, sourceCell.content)
  }
  const textContent = String(sourceCell?.textContent ?? '')
  return cellType.create(attrs, paragraph.create(null, textContent ? schema.text(textContent) : undefined))
}

function createEmptyCell(schema: any, typeName: 'tableHeadCell' | 'tableBodyCell') {
  return schema.nodes[typeName].create(null, schema.nodes.paragraph.create())
}

function cloneRowAsType(schema: any, row: any, cellTypeName: 'tableHeadCell' | 'tableBodyCell') {
  const cells: any[] = []
  for (let index = 0; index < row.childCount; index += 1) {
    cells.push(cloneCellAsType(schema, row.child(index), cellTypeName))
  }
  return schema.nodes.tableRow.create(row.attrs ?? null, cells)
}

function addColumnToRow(schema: any, row: any, cellTypeName: 'tableHeadCell' | 'tableBodyCell', columnIndex: number) {
  const cells: any[] = []
  const insertAfter = Math.max(0, Math.min(columnIndex, Math.max(0, row.childCount - 1)))
  for (let index = 0; index < row.childCount; index += 1) {
    cells.push(cloneCellAsType(schema, row.child(index), cellTypeName))
    if (index === insertAfter) {
      cells.push(createEmptyCell(schema, cellTypeName))
    }
  }
  if (row.childCount === 0) {
    cells.push(createEmptyCell(schema, cellTypeName))
  }
  return schema.nodes.tableRow.create(row.attrs ?? null, cells)
}

function removeColumnFromRow(schema: any, row: any, cellTypeName: 'tableHeadCell' | 'tableBodyCell', columnIndex: number) {
  const cells: any[] = []
  for (let index = 0; index < row.childCount; index += 1) {
    if (index === columnIndex) continue
    cells.push(cloneCellAsType(schema, row.child(index), cellTypeName))
  }
  return schema.nodes.tableRow.create(row.attrs ?? null, cells)
}

function createEmptyRow(schema: any, cellTypeName: 'tableHeadCell' | 'tableBodyCell', columnCount: number) {
  const cells: any[] = []
  for (let index = 0; index < Math.max(1, columnCount); index += 1) {
    cells.push(createEmptyCell(schema, cellTypeName))
  }
  return schema.nodes.tableRow.create(null, cells)
}

function createEmptyBodyRow(schema: any, columnCount: number) {
  return createEmptyRow(schema, 'tableBodyCell', columnCount)
}

function createEmptyHeadRow(schema: any, columnCount: number) {
  return createEmptyRow(schema, 'tableHeadCell', columnCount)
}

function cloneColumnMovedRow(
  schema: any,
  row: any,
  cellTypeName: 'tableHeadCell' | 'tableBodyCell',
  sourceIndex: number,
  insertIndex: number,
) {
  const adjustedIndex = getAdjustedMoveIndex(sourceIndex, insertIndex)
  const cells: any[] = []
  for (let index = 0; index < row.childCount; index += 1) {
    cells.push(cloneCellAsType(schema, row.child(index), cellTypeName))
  }
  const [movedCell] = cells.splice(sourceIndex, 1)
  cells.splice(adjustedIndex, 0, movedCell)
  return schema.nodes.tableRow.create(row.attrs ?? null, cells)
}

function buildTable(schema: any, originalTable: any, headRow: any, bodyRows: any[]) {
  const originalHead = originalTable.child(0)
  const originalBody = originalTable.child(1)
  return schema.nodes.table.create(originalTable.attrs ?? null, [
    schema.nodes.tableHead.create(originalHead.attrs ?? null, headRow),
    schema.nodes.tableBody.create(originalBody.attrs ?? null, bodyRows),
  ])
}

function getCellInnerPosition(tableNode: any, tableStart: number, rowIndex: number, columnIndex: number): number | null {
  const tableHead = tableNode.child(0)
  const tableBody = tableNode.child(1)
  let row: any
  let rowStart = tableStart + 2

  if (rowIndex === 0) {
    row = tableHead.child(0)
  } else {
    const bodyRowIndex = rowIndex - 1
    if (bodyRowIndex < 0 || bodyRowIndex >= tableBody.childCount) return null
    rowStart = tableStart + 1 + tableHead.nodeSize + 1
    for (let index = 0; index < bodyRowIndex; index += 1) {
      rowStart += tableBody.child(index).nodeSize
    }
    row = tableBody.child(bodyRowIndex)
  }

  if (!row || row.childCount <= 0) return null
  const targetColumn = clamp(columnIndex, 0, row.childCount - 1)
  let cellStart = rowStart + 1
  for (let index = 0; index < targetColumn; index += 1) {
    cellStart += row.child(index).nodeSize
  }
  return cellStart + 2
}

function setSelectionNearPosition(transaction: any, position: number, bias = 1) {
  const docSize = transaction.doc.content.size
  const target = clamp(position, 0, docSize)
  try {
    transaction.setSelection(Selection.near(transaction.doc.resolve(target), bias))
  } catch {
    try {
      transaction.setSelection(Selection.near(transaction.doc.resolve(Math.min(docSize, Math.max(0, target))), -bias))
    } catch {
      // Leave the editor's fallback selection alone if the document is in an unusual transient state.
    }
  }
  return transaction
}

function setTextSelectionAtPosition(transaction: any, position: number, bias: number) {
  const docSize = transaction.doc.content.size
  const target = clamp(position, 0, docSize)
  try {
    transaction.setSelection(TextSelection.create(transaction.doc, target))
  } catch {
    try {
      transaction.setSelection(Selection.near(transaction.doc.resolve(target), bias))
    } catch {
      // Leave the editor's fallback selection alone if the requested boundary cannot be resolved.
    }
  }
  return transaction
}

function getSelectedTableBoundaryContext(state: any): {
  tableStart: number
  tableEnd: number
  tableIndex: number
  parentNode: any
} | null {
  const selection = state?.selection
  const selectedNode = selection?.node
  if (selectedNode?.type?.name !== 'table') return null
  if (typeof selection.from !== 'number' || typeof selection.to !== 'number') return null

  const $from = selection.$from
  const parentNode = $from?.parent
  if (!parentNode || typeof $from.index !== 'function') return null

  return {
    tableStart: selection.from,
    tableEnd: selection.to,
    tableIndex: $from.index(),
    parentNode,
  }
}

function getTextBlockBoundarySelectionPosition(node: any, nodeStart: number, direction: TableBoundaryDirection) {
  return direction === 'before' ? nodeStart + Math.max(1, node.nodeSize - 1) : nodeStart + 1
}

export function moveSelectedTableBoundaryCaret(view: any, direction: TableBoundaryDirection): boolean {
  const state = view?.state
  if (!state || typeof view?.dispatch !== 'function') return false

  const context = getSelectedTableBoundaryContext(state)
  if (!context) return false

  const siblingIndex = direction === 'before' ? context.tableIndex - 1 : context.tableIndex + 1
  const sibling =
    siblingIndex >= 0 && siblingIndex < context.parentNode.childCount ? context.parentNode.child(siblingIndex) : null
  const siblingStart = direction === 'before' ? context.tableStart - (sibling?.nodeSize ?? 0) : context.tableEnd

  if (sibling?.isTextblock) {
    const selectionPosition = getTextBlockBoundarySelectionPosition(sibling, siblingStart, direction)
    const tr = setTextSelectionAtPosition(state.tr, selectionPosition, direction === 'before' ? -1 : 1)
    view.dispatch(tr.setMeta('addToHistory', false).scrollIntoView())
    if (typeof view.focus === 'function') {
      view.focus()
    }
    return true
  }

  const paragraphType = state.schema?.nodes?.paragraph
  if (!paragraphType) return false

  const insertPosition = direction === 'before' ? context.tableStart : context.tableEnd
  const paragraph = paragraphType.create()
  const tr = state.tr.insert(insertPosition, paragraph)
  setTextSelectionAtPosition(tr, insertPosition + 1, 1)
  view.dispatch(tr.scrollIntoView())
  if (typeof view.focus === 'function') {
    view.focus()
  }
  return true
}

function getOutsideTablePositionFromCoords(view: any, coords: { left: number; top: number }, range: TableRange): number | null {
  if (typeof view?.posAtCoords !== 'function') return null
  try {
    const result = view.posAtCoords(coords)
    const position = result?.pos
    if (typeof position !== 'number') return null
    return position <= range.tableStart || position >= range.tableEnd ? position : null
  } catch {
    return null
  }
}

function getOutsideTablePositionFromDomTarget(view: any, target: Element | null | undefined, range: TableRange): number | null {
  if (!target || !view?.dom?.contains?.(target) || typeof view.posAtDOM !== 'function') return null
  if (target.closest('table')) return null
  const blockTarget =
    target.closest('p, h1, h2, h3, h4, h5, h6, blockquote, pre, li, ul, ol, hr') ?? target
  try {
    const position = view.posAtDOM(blockTarget, 0)
    if (typeof position !== 'number') return null
    return position <= range.tableStart || position >= range.tableEnd ? position : null
  } catch {
    return null
  }
}

export function placeCaretOutsideTableAtCoords(
  view: any,
  coords: { left: number; top: number },
  range: TableRange,
  target?: Element | null,
): boolean {
  const transaction = view?.state?.tr
  if (!transaction || typeof view?.dispatch !== 'function') return false
  if (!isActiveSelectionInsideTableRange(view, range)) return false
  if (target?.closest('table')) return false

  const targetPosition =
    getOutsideTablePositionFromCoords(view, coords, range) ??
    getOutsideTablePositionFromDomTarget(view, target, range)
  if (targetPosition === null) return false

  const bias = targetPosition <= range.tableStart ? -1 : 1
  setSelectionNearPosition(transaction, targetPosition, bias)
  view.dispatch(transaction.setMeta('addToHistory', false).scrollIntoView())
  if (typeof view.focus === 'function') {
    view.focus()
  }
  return true
}

export function placeTableCaretAtCoords(
  view: any,
  coords: { left: number; top: number },
  targetCell?: HTMLTableCellElement | null,
): boolean {
  const transaction = view?.state?.tr
  if (!transaction || typeof view?.dispatch !== 'function') return false

  let targetPosition: number | null = null
  if (typeof view.posAtCoords === 'function') {
    try {
      const coordsResult = view.posAtCoords(coords)
      if (typeof coordsResult?.pos === 'number') {
        const context = getTableContextFromResolvedPosition(view.state.doc.resolve(coordsResult.pos))
        if (context) {
          targetPosition = coordsResult.pos
        }
      }
    } catch {
      targetPosition = null
    }
  }

  if (targetPosition === null && targetCell) {
    const context = getTableContextForCellElement(view, targetCell)
    if (context) {
      targetPosition = getCellInnerPosition(context.tableNode, context.tableStart, context.rowIndex, context.columnIndex)
    }
  }

  if (targetPosition === null) return false
  setSelectionNearPosition(transaction, targetPosition)
  view.dispatch(transaction.scrollIntoView())
  return true
}

function dispatchTableReplacement(
  view: any,
  context: ActiveTableContext,
  nextTable: any,
  targetRowIndex: number,
  targetColumnIndex: number,
) {
  const tr = view.state.tr.replaceWith(context.tableStart, context.tableEnd, nextTable)
  const selectionPosition = getCellInnerPosition(nextTable, context.tableStart, targetRowIndex, targetColumnIndex)
  if (selectionPosition !== null) {
    setSelectionNearPosition(tr, selectionPosition)
  }
  view.dispatch(tr.scrollIntoView())
  return true
}

function getVisualTableRows(tableNode: any): any[] {
  const headRow = getHeadRow(tableNode)
  return headRow ? [headRow, ...getBodyRows(tableNode)] : []
}

function getVisualRow(tableNode: any, rowIndex: number): any | null {
  return getVisualTableRows(tableNode)[rowIndex] ?? null
}

function getLastCellIndexInVisualRow(tableNode: any, rowIndex: number) {
  const row = getVisualRow(tableNode, rowIndex)
  return row ? Math.max(0, row.childCount - 1) : 0
}

function dispatchTableCellSelection(
  view: any,
  context: ActiveTableContext,
  targetRowIndex: number,
  targetColumnIndex: number,
) {
  const transaction = view?.state?.tr
  if (!transaction || typeof view?.dispatch !== 'function') return false
  const targetPosition = getCellInnerPosition(context.tableNode, context.tableStart, targetRowIndex, targetColumnIndex)
  if (targetPosition === null) return false
  setSelectionNearPosition(transaction, targetPosition)
  view.dispatch(transaction.setMeta('addToHistory', false).scrollIntoView())
  if (typeof view.focus === 'function') {
    view.focus()
  }
  return true
}

export function moveTableCellSelectionByTab(
  view: any,
  direction: TableCellNavigationDirection,
): TableCellNavigationResult {
  const context = getActiveTableContext(view)
  const schema = view?.state?.schema
  if (!context || !schema) return { handled: false, changed: false }

  const tableNode = view.state.doc.nodeAt(context.tableStart)
  if (!tableNode || tableNode.type?.name !== 'table') return { handled: false, changed: false }
  const headRow = getHeadRow(tableNode)
  if (!headRow) return { handled: false, changed: false }

  const bodyRows = getBodyRows(tableNode)
  const visualRows = [headRow, ...bodyRows]
  const currentRow = visualRows[context.rowIndex]
  if (!currentRow) return { handled: false, changed: false }

  if (direction === 'forward') {
    if (context.columnIndex < currentRow.childCount - 1) {
      return {
        handled: dispatchTableCellSelection(view, context, context.rowIndex, context.columnIndex + 1),
        changed: false,
      }
    }

    if (context.rowIndex < visualRows.length - 1) {
      return {
        handled: dispatchTableCellSelection(view, context, context.rowIndex + 1, 0),
        changed: false,
      }
    }

    const nextBodyRows = [...bodyRows, createEmptyBodyRow(schema, context.columnCount)]
    const nextTable = buildTable(schema, tableNode, cloneRowAsType(schema, headRow, 'tableHeadCell'), nextBodyRows)
    const handled = dispatchTableReplacement(view, context, nextTable, bodyRows.length + 1, 0)
    if (handled && typeof view.focus === 'function') {
      view.focus()
    }
    return { handled, changed: handled }
  }

  if (context.columnIndex > 0) {
    return {
      handled: dispatchTableCellSelection(view, context, context.rowIndex, context.columnIndex - 1),
      changed: false,
    }
  }

  if (context.rowIndex > 0) {
    return {
      handled: dispatchTableCellSelection(
        view,
        context,
        context.rowIndex - 1,
        getLastCellIndexInVisualRow(tableNode, context.rowIndex - 1),
      ),
      changed: false,
    }
  }

  const nextHeadRow = createEmptyHeadRow(schema, context.columnCount)
  const nextBodyRows = [cloneRowAsType(schema, headRow, 'tableBodyCell'), ...bodyRows]
  const nextTable = buildTable(schema, tableNode, nextHeadRow, nextBodyRows)
  const handled = dispatchTableReplacement(view, context, nextTable, 0, Math.max(0, context.columnCount - 1))
  if (handled && typeof view.focus === 'function') {
    view.focus()
  }
  return { handled, changed: handled }
}

export function selectFirstTableCellAfterPosition(view: any, position: number): boolean {
  const doc = view?.state?.doc
  const transaction = view?.state?.tr
  if (!doc || !transaction || typeof view?.dispatch !== 'function') return false

  let selectedNode: any | null = null
  let selectedPos = -1
  let selectedDistance = Number.POSITIVE_INFINITY
  const anchor = Number.isFinite(position) ? Math.max(0, position) : 0
  doc.descendants((node: any, pos: number) => {
    if (node?.type?.name !== 'table') return true
    const distance = pos >= anchor ? pos - anchor : Number.MAX_SAFE_INTEGER + Math.abs(pos - anchor)
    if (distance < selectedDistance) {
      selectedNode = node
      selectedPos = pos
      selectedDistance = distance
    }
    return false
  })

  if (!selectedNode || selectedPos < 0) return false
  const selectionPosition = getCellInnerPosition(selectedNode, selectedPos, 0, 0)
  if (selectionPosition === null) return false
  setSelectionNearPosition(transaction, selectionPosition)
  view.dispatch(transaction.setMeta('addToHistory', false).scrollIntoView())
  if (typeof view.focus === 'function') {
    view.focus()
  }
  return true
}

export function applyTableReorderOperationToView(
  view: any,
  axis: TableReorderAxis,
  sourceIndex: number,
  insertIndex: number,
  sourceContext?: ActiveTableContext | null,
): boolean {
  const baseContext = sourceContext ?? getActiveTableContext(view)
  const schema = view?.state?.schema
  if (!baseContext || !schema || sourceIndex < 0 || insertIndex < 0) return false

  const tableNode = view.state.doc.nodeAt(baseContext.tableStart)
  if (!tableNode || tableNode.type?.name !== 'table') return false
  const context: ActiveTableContext = {
    ...baseContext,
    tableNode,
    tableEnd: baseContext.tableStart + tableNode.nodeSize,
  }
  const headRow = getHeadRow(tableNode)
  const bodyRows = getBodyRows(tableNode)
  if (!headRow) return false

  if (axis === 'row') {
    const visualRows = [headRow, ...bodyRows]
    if (sourceIndex >= visualRows.length || insertIndex > visualRows.length) return false
    const movedIndex = getAdjustedMoveIndex(sourceIndex, insertIndex)
    if (movedIndex === sourceIndex) return false
    const nextVisualRows = [...visualRows]
    const [movedRow] = nextVisualRows.splice(sourceIndex, 1)
    nextVisualRows.splice(movedIndex, 0, movedRow)
    const nextHeadRow = cloneRowAsType(schema, nextVisualRows[0], 'tableHeadCell')
    const nextBodyRows = nextVisualRows.slice(1).map((row) => cloneRowAsType(schema, row, 'tableBodyCell'))
    const nextTable = buildTable(schema, tableNode, nextHeadRow, nextBodyRows)
    return dispatchTableReplacement(view, context, nextTable, movedIndex, context.columnIndex)
  }

  if (axis === 'column') {
    if (sourceIndex >= context.columnCount || insertIndex > context.columnCount) return false
    const movedIndex = getAdjustedMoveIndex(sourceIndex, insertIndex)
    if (movedIndex === sourceIndex) return false
    const nextHeadRow = cloneColumnMovedRow(schema, headRow, 'tableHeadCell', sourceIndex, insertIndex)
    const nextBodyRows = bodyRows.map((row) => cloneColumnMovedRow(schema, row, 'tableBodyCell', sourceIndex, insertIndex))
    const nextTable = buildTable(schema, tableNode, nextHeadRow, nextBodyRows)
    return dispatchTableReplacement(view, context, nextTable, context.rowIndex, movedIndex)
  }

  return false
}

function dispatchTableRemoval(view: any, context: ActiveTableContext) {
  const tr = view.state.tr.delete(context.tableStart, context.tableEnd)
  setSelectionNearPosition(tr, context.tableStart)
  view.dispatch(tr.scrollIntoView())
  return true
}

function getTargetedTableControlContext(
  context: ActiveTableContext,
  targetMode: TableControlTargetMode,
): ActiveTableContext {
  if (targetMode === 'active-cell') return context
  const bottomRowIndex = context.bodyRowCount > 0 ? context.bodyRowCount : 0
  return {
    ...context,
    rowIndex: bottomRowIndex,
    bodyRowIndex: context.bodyRowCount > 0 ? context.bodyRowCount - 1 : null,
    columnIndex: Math.max(0, context.columnCount - 1),
    inHeader: context.bodyRowCount === 0,
  }
}

export function applyTableControlOperationToView(
  view: any,
  operation: TableControlOperation,
  targetMode: TableControlTargetMode = 'active-cell',
): boolean {
  const context = getActiveTableContext(view)
  const schema = view?.state?.schema
  if (!context || !schema) return false
  const targetContext = getTargetedTableControlContext(context, targetMode)

  const tableNode = targetContext.tableNode
  const headRow = getHeadRow(tableNode)
  const bodyRows = getBodyRows(tableNode)
  if (!headRow) return false

  if (operation === 'add-column') {
    const nextHeadRow = addColumnToRow(schema, headRow, 'tableHeadCell', targetContext.columnIndex)
    const nextBodyRows = bodyRows.map((row) => addColumnToRow(schema, row, 'tableBodyCell', targetContext.columnIndex))
    const nextTable = buildTable(schema, tableNode, nextHeadRow, nextBodyRows)
    return dispatchTableReplacement(view, targetContext, nextTable, targetContext.rowIndex, targetContext.columnIndex + 1)
  }

  if (operation === 'remove-column') {
    if (targetContext.columnCount <= 1) return dispatchTableRemoval(view, targetContext)
    const nextHeadRow = removeColumnFromRow(schema, headRow, 'tableHeadCell', targetContext.columnIndex)
    const nextBodyRows = bodyRows.map((row) => removeColumnFromRow(schema, row, 'tableBodyCell', targetContext.columnIndex))
    const nextTable = buildTable(schema, tableNode, nextHeadRow, nextBodyRows)
    return dispatchTableReplacement(
      view,
      targetContext,
      nextTable,
      Math.min(targetContext.rowIndex, bodyRows.length),
      Math.max(0, Math.min(targetContext.columnIndex, targetContext.columnCount - 2)),
    )
  }

  if (operation === 'add-row') {
    const nextBodyRows = [...bodyRows]
    const insertIndex = targetContext.inHeader ? 0 : Math.min(nextBodyRows.length, (targetContext.bodyRowIndex ?? 0) + 1)
    nextBodyRows.splice(insertIndex, 0, createEmptyBodyRow(schema, targetContext.columnCount))
    const nextTable = buildTable(schema, tableNode, cloneRowAsType(schema, headRow, 'tableHeadCell'), nextBodyRows)
    return dispatchTableReplacement(view, targetContext, nextTable, insertIndex + 1, targetContext.columnIndex)
  }

  if (operation === 'remove-row') {
    const visualRowCount = 1 + bodyRows.length
    if (visualRowCount <= 1) return dispatchTableRemoval(view, targetContext)

    if (targetContext.inHeader) {
      const nextHeadRow = cloneRowAsType(schema, bodyRows[0], 'tableHeadCell')
      const nextBodyRows = bodyRows.slice(1).map((row) => cloneRowAsType(schema, row, 'tableBodyCell'))
      const nextTable = buildTable(schema, tableNode, nextHeadRow, nextBodyRows)
      return dispatchTableReplacement(view, targetContext, nextTable, 0, targetContext.columnIndex)
    }

    const removeIndex = targetContext.bodyRowIndex ?? 0
    const nextBodyRows = bodyRows
      .filter((_, index) => index !== removeIndex)
      .map((row) => cloneRowAsType(schema, row, 'tableBodyCell'))
    const nextTable = buildTable(schema, tableNode, cloneRowAsType(schema, headRow, 'tableHeadCell'), nextBodyRows)
    const nextGlobalRowIndex = nextBodyRows.length > 0 ? Math.min(removeIndex + 1, nextBodyRows.length) : 0
    return dispatchTableReplacement(view, targetContext, nextTable, nextGlobalRowIndex, targetContext.columnIndex)
  }

  return false
}
