import type { Node as ProseMirrorNode } from 'prosemirror-model'
import {
  normalizeTableSelectionRange,
  type TableSelectionRange,
} from './table-editing'

export const AISLENOTE_TABLE_SELECTION_CLIPBOARD_MIME = 'application/x-aislenote-table-selection'

export type TableSelectionClipboardCell = {
  node: unknown | null
  text: string
}

export type TableSelectionClipboardPayload = {
  version: 1
  rows: Array<{
    cells: TableSelectionClipboardCell[]
  }>
}

export type TableSelectionClipboardSerialization = {
  payload: TableSelectionClipboardPayload
  text: string
  html: string
}

type DataTransferReadLike = Pick<DataTransfer, 'getData'> | null | undefined
type DataTransferWriteLike = Pick<DataTransfer, 'setData'> | null | undefined

type ClipboardItemLike = {
  types?: readonly string[]
  getType?: (type: string) => Promise<Blob>
}

type ClipboardLike = {
  read?: () => Promise<readonly ClipboardItemLike[]>
}

function getVisualTableRows(tableNode: any): any[] {
  const head = tableNode?.child?.(0)
  const body = tableNode?.child?.(1)
  const rows: any[] = []
  if (head?.childCount > 0) rows.push(head.child(0))
  for (let index = 0; index < (body?.childCount ?? 0); index += 1) {
    rows.push(body.child(index))
  }
  return rows
}

function getTableColumnCount(rows: any[]): number {
  return Math.max(1, ...rows.map((row) => Number(row?.childCount) || 0))
}

function normalizeCellText(value: string) {
  return String(value ?? '').replace(/\r\n?/g, '\n')
}

function serializePlainCell(value: string) {
  return normalizeCellText(value).replace(/[\t\n]+/g, ' ').trim()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function serializePayloadText(payload: TableSelectionClipboardPayload): string {
  return payload.rows
    .map((row) => row.cells.map((cell) => serializePlainCell(cell.text)).join('\t'))
    .join('\n')
}

function serializePayloadHtml(payload: TableSelectionClipboardPayload): string {
  const rows = payload.rows.map((row, rowIndex) => {
    const tag = rowIndex === 0 ? 'th' : 'td'
    return `<tr>${row.cells.map((cell) => `<${tag}>${escapeHtml(cell.text)}</${tag}>`).join('')}</tr>`
  })
  const [headRow, ...bodyRows] = rows
  return [
    '<table>',
    headRow ? `<thead>${headRow}</thead>` : '',
    `<tbody>${bodyRows.join('')}</tbody>`,
    '</table>',
  ].join('')
}

function serializeCell(cell: any | null): TableSelectionClipboardCell {
  if (!cell) return { node: null, text: '' }
  let node: unknown | null = null
  try {
    node = typeof cell.toJSON === 'function' ? cell.toJSON() : null
  } catch {
    node = null
  }
  return {
    node,
    text: normalizeCellText(String(cell.textContent ?? '')),
  }
}

export function serializeTableSelectionForClipboard(
  view: any | null,
  selection: TableSelectionRange | null,
): TableSelectionClipboardSerialization | null {
  if (!view?.state?.doc || !selection) return null
  const tableNode = view.state.doc.nodeAt(selection.tableStart)
  if (tableNode?.type?.name !== 'table') return null

  const rows = getVisualTableRows(tableNode)
  const columnCount = getTableColumnCount(rows)
  const normalized = normalizeTableSelectionRange(selection, rows.length, columnCount)
  if (!normalized) return null

  const payloadRows: TableSelectionClipboardPayload['rows'] = []
  for (let rowIndex = normalized.rowStart; rowIndex <= normalized.rowEnd; rowIndex += 1) {
    const row = rows[rowIndex]
    const cells: TableSelectionClipboardCell[] = []
    for (let columnIndex = normalized.columnStart; columnIndex <= normalized.columnEnd; columnIndex += 1) {
      cells.push(serializeCell(row?.child?.(columnIndex) ?? null))
    }
    payloadRows.push({ cells })
  }
  if (payloadRows.length === 0 || payloadRows.every((row) => row.cells.length === 0)) return null

  const payload: TableSelectionClipboardPayload = {
    version: 1,
    rows: payloadRows,
  }
  return {
    payload,
    text: serializePayloadText(payload),
    html: serializePayloadHtml(payload),
  }
}

export function writeTableSelectionClipboardData(
  clipboardData: DataTransferWriteLike,
  serialization: TableSelectionClipboardSerialization,
): boolean {
  if (!clipboardData) return false
  clipboardData.setData(AISLENOTE_TABLE_SELECTION_CLIPBOARD_MIME, JSON.stringify(serialization.payload))
  clipboardData.setData('text/html', serialization.html)
  clipboardData.setData('text/plain', serialization.text)
  return true
}

function parseTableSelectionClipboardPayload(source: string): TableSelectionClipboardPayload | null {
  if (!source) return null
  try {
    const parsed = JSON.parse(source) as TableSelectionClipboardPayload
    if (parsed?.version !== 1 || !Array.isArray(parsed.rows)) return null
    const rows = parsed.rows
      .map((row) => ({
        cells: Array.isArray(row?.cells)
          ? row.cells.map((cell) => ({
              node: cell?.node ?? null,
              text: typeof cell?.text === 'string' ? cell.text : '',
            }))
          : [],
      }))
      .filter((row) => row.cells.length > 0)
    return rows.length > 0 ? { version: 1, rows } : null
  } catch {
    return null
  }
}

export function readTableSelectionClipboardPayloadFromDataTransfer(
  dataTransfer: DataTransferReadLike,
): TableSelectionClipboardPayload | null {
  if (!dataTransfer) return null
  try {
    return parseTableSelectionClipboardPayload(dataTransfer.getData(AISLENOTE_TABLE_SELECTION_CLIPBOARD_MIME) ?? '')
  } catch {
    return null
  }
}

function createTextParagraph(schema: any, text: string): ProseMirrorNode | null {
  const paragraph = schema?.nodes?.paragraph
  if (!paragraph) return null
  try {
    return paragraph.create(null, text ? schema.text(text) : undefined)
  } catch {
    try {
      return paragraph.create()
    } catch {
      return null
    }
  }
}

function createFallbackCell(schema: any, cellTypeName: 'tableHeadCell' | 'tableBodyCell', text: string) {
  const cellType = schema?.nodes?.[cellTypeName]
  const paragraph = createTextParagraph(schema, text)
  if (!cellType || !paragraph) return null
  try {
    return cellType.create(null, paragraph)
  } catch {
    return null
  }
}

function cloneCellAsType(schema: any, sourceCell: any, cellTypeName: 'tableHeadCell' | 'tableBodyCell', fallbackText: string) {
  const cellType = schema?.nodes?.[cellTypeName]
  if (!cellType) return null
  try {
    if (sourceCell?.content && typeof cellType.validContent === 'function' && cellType.validContent(sourceCell.content)) {
      return cellType.create(sourceCell.attrs ?? null, sourceCell.content)
    }
  } catch {
    // Fall through to a text-only cell.
  }
  return createFallbackCell(schema, cellTypeName, String(sourceCell?.textContent ?? fallbackText ?? ''))
}

function createCellFromPayload(
  schema: any,
  cellTypeName: 'tableHeadCell' | 'tableBodyCell',
  cell: TableSelectionClipboardCell | null | undefined,
) {
  if (cell?.node && typeof schema?.nodeFromJSON === 'function') {
    try {
      return cloneCellAsType(schema, schema.nodeFromJSON(cell.node), cellTypeName, cell.text)
    } catch {
      // Fall through to a text-only cell.
    }
  }
  return createFallbackCell(schema, cellTypeName, cell?.text ?? '')
}

function createRowFromPayload(
  schema: any,
  cellTypeName: 'tableHeadCell' | 'tableBodyCell',
  cells: TableSelectionClipboardCell[],
  columnCount: number,
) {
  const rowType = schema?.nodes?.tableRow
  if (!rowType) return null
  const nextCells: any[] = []
  for (let index = 0; index < columnCount; index += 1) {
    const nextCell = createCellFromPayload(schema, cellTypeName, cells[index])
    if (!nextCell) return null
    nextCells.push(nextCell)
  }
  try {
    return rowType.create(null, nextCells)
  } catch {
    return null
  }
}

export function createTableNodeFromClipboardPayload(schema: any, payload: TableSelectionClipboardPayload): any | null {
  const tableType = schema?.nodes?.table
  const tableHeadType = schema?.nodes?.tableHead
  const tableBodyType = schema?.nodes?.tableBody
  if (!tableType || !tableHeadType || !tableBodyType || !Array.isArray(payload.rows) || payload.rows.length === 0) return null

  const columnCount = Math.max(1, ...payload.rows.map((row) => row.cells.length))
  const headRow = createRowFromPayload(schema, 'tableHeadCell', payload.rows[0]?.cells ?? [], columnCount)
  if (!headRow) return null

  const bodySourceRows = payload.rows.length > 1
    ? payload.rows.slice(1)
    : [{ cells: Array.from({ length: columnCount }, () => ({ node: null, text: '' })) }]
  const bodyRows = bodySourceRows.map((row) => createRowFromPayload(schema, 'tableBodyCell', row.cells, columnCount))
  if (bodyRows.some((row) => !row)) return null

  try {
    return tableType.create(null, [
      tableHeadType.create(null, headRow),
      tableBodyType.create(null, bodyRows),
    ])
  } catch {
    return null
  }
}

export function insertTableSelectionClipboardPayloadIntoView(
  view: any | null,
  payload: TableSelectionClipboardPayload,
): boolean {
  if (!view?.state?.schema || !view?.state?.tr || typeof view.dispatch !== 'function') return false
  const tableNode = createTableNodeFromClipboardPayload(view.state.schema, payload)
  if (!tableNode) return false

  try {
    view.dispatch(view.state.tr.replaceSelectionWith(tableNode, false).scrollIntoView())
    view.focus?.()
    return true
  } catch {
    return false
  }
}

export async function readTableSelectionClipboardPayloadFromClipboard(
  clipboard: ClipboardLike | null | undefined = typeof navigator !== 'undefined' ? navigator.clipboard : null,
): Promise<TableSelectionClipboardPayload | null> {
  if (!clipboard?.read) return null
  try {
    const items = await clipboard.read()
    for (const item of items) {
      if (!item.types?.includes(AISLENOTE_TABLE_SELECTION_CLIPBOARD_MIME) || !item.getType) continue
      const blob = await item.getType(AISLENOTE_TABLE_SELECTION_CLIPBOARD_MIME)
      return parseTableSelectionClipboardPayload(await blob.text())
    }
  } catch {
    return null
  }
  return null
}
