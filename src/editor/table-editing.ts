import { Selection } from 'prosemirror-state'

export type TableControlOperation = 'add-row' | 'remove-row' | 'add-column' | 'remove-column'
export type TableReorderAxis = 'row' | 'column'

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

export const CLOSED_TABLE_CONTROLS_STATE: TableControlsOverlayState = {
  visible: false,
  columnTop: 0,
  columnLeft: 0,
  rowTop: 0,
  rowLeft: 0,
}

const TABLE_CONTROL_BUTTON_SIZE = 26
const TABLE_CONTROL_GAP = 4
const TABLE_CONTROL_VIEWPORT_PADDING = 8
const TABLE_COLUMN_CONTROL_WIDTH = TABLE_CONTROL_BUTTON_SIZE * 2 + TABLE_CONTROL_GAP
const TABLE_ROW_CONTROL_HEIGHT = TABLE_CONTROL_BUTTON_SIZE * 2 + TABLE_CONTROL_GAP
const TABLE_REORDER_DRAG_SLOP_PX = 18
const TABLE_REORDER_AXIS_LOCK_RATIO = 2

type TableRectLike = {
  top: number
  left: number
  width: number
  height: number
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

function createEmptyBodyRow(schema: any, columnCount: number) {
  const cells: any[] = []
  for (let index = 0; index < Math.max(1, columnCount); index += 1) {
    cells.push(createEmptyCell(schema, 'tableBodyCell'))
  }
  return schema.nodes.tableRow.create(null, cells)
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

function setSelectionNearPosition(transaction: any, position: number) {
  const docSize = transaction.doc.content.size
  const target = clamp(position, 0, docSize)
  try {
    transaction.setSelection(Selection.near(transaction.doc.resolve(target), 1))
  } catch {
    try {
      transaction.setSelection(Selection.near(transaction.doc.resolve(Math.min(docSize, Math.max(0, target))), -1))
    } catch {
      // Leave the editor's fallback selection alone if the document is in an unusual transient state.
    }
  }
  return transaction
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

export function applyTableControlOperationToView(view: any, operation: TableControlOperation): boolean {
  const context = getActiveTableContext(view)
  const schema = view?.state?.schema
  if (!context || !schema) return false

  const tableNode = context.tableNode
  const headRow = getHeadRow(tableNode)
  const bodyRows = getBodyRows(tableNode)
  if (!headRow) return false

  if (operation === 'add-column') {
    const nextHeadRow = addColumnToRow(schema, headRow, 'tableHeadCell', context.columnIndex)
    const nextBodyRows = bodyRows.map((row) => addColumnToRow(schema, row, 'tableBodyCell', context.columnIndex))
    const nextTable = buildTable(schema, tableNode, nextHeadRow, nextBodyRows)
    return dispatchTableReplacement(view, context, nextTable, context.rowIndex, context.columnIndex + 1)
  }

  if (operation === 'remove-column') {
    if (context.columnCount <= 1) return dispatchTableRemoval(view, context)
    const nextHeadRow = removeColumnFromRow(schema, headRow, 'tableHeadCell', context.columnIndex)
    const nextBodyRows = bodyRows.map((row) => removeColumnFromRow(schema, row, 'tableBodyCell', context.columnIndex))
    const nextTable = buildTable(schema, tableNode, nextHeadRow, nextBodyRows)
    return dispatchTableReplacement(
      view,
      context,
      nextTable,
      Math.min(context.rowIndex, bodyRows.length),
      Math.max(0, Math.min(context.columnIndex, context.columnCount - 2)),
    )
  }

  if (operation === 'add-row') {
    const nextBodyRows = [...bodyRows]
    const insertIndex = context.inHeader ? 0 : Math.min(nextBodyRows.length, (context.bodyRowIndex ?? 0) + 1)
    nextBodyRows.splice(insertIndex, 0, createEmptyBodyRow(schema, context.columnCount))
    const nextTable = buildTable(schema, tableNode, cloneRowAsType(schema, headRow, 'tableHeadCell'), nextBodyRows)
    return dispatchTableReplacement(view, context, nextTable, insertIndex + 1, context.columnIndex)
  }

  if (operation === 'remove-row') {
    const visualRowCount = 1 + bodyRows.length
    if (visualRowCount <= 1) return dispatchTableRemoval(view, context)

    if (context.inHeader) {
      const nextHeadRow = cloneRowAsType(schema, bodyRows[0], 'tableHeadCell')
      const nextBodyRows = bodyRows.slice(1).map((row) => cloneRowAsType(schema, row, 'tableBodyCell'))
      const nextTable = buildTable(schema, tableNode, nextHeadRow, nextBodyRows)
      return dispatchTableReplacement(view, context, nextTable, 0, context.columnIndex)
    }

    const removeIndex = context.bodyRowIndex ?? 0
    const nextBodyRows = bodyRows
      .filter((_, index) => index !== removeIndex)
      .map((row) => cloneRowAsType(schema, row, 'tableBodyCell'))
    const nextTable = buildTable(schema, tableNode, cloneRowAsType(schema, headRow, 'tableHeadCell'), nextBodyRows)
    const nextGlobalRowIndex = nextBodyRows.length > 0 ? Math.min(removeIndex + 1, nextBodyRows.length) : 0
    return dispatchTableReplacement(view, context, nextTable, nextGlobalRowIndex, context.columnIndex)
  }

  return false
}
