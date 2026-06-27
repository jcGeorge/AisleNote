import type { ToolbarToolId } from '../../types/app'

export const TOOLBAR_DRAG_MIME = 'application/x-aislenote-toolbar'
const TOOLBAR_DRAG_TEXT_PREFIX = 'aislenote-toolbar:'

export type ToolbarDragPayload =
  | { source: 'layout'; itemId: string }
  | { source: 'tool'; toolId: ToolbarToolId }
  | { source: 'spacer' }

export type ToolbarDropTarget =
  | { type: 'toolbar'; index: number }
  | { type: 'palette' }

export type ToolbarItemDropRect = {
  left: number
  right: number
  top: number
  bottom: number
}

export type ToolbarDropPoint = {
  x: number
  y: number
}

function isToolbarToolPayload(candidate: Record<string, unknown>): candidate is { source: 'tool'; toolId: ToolbarToolId } {
  return candidate.source === 'tool' && typeof candidate.toolId === 'string'
}

export function parseToolbarDragPayload(raw: string): ToolbarDragPayload | null {
  if (!raw) return null
  const normalized = raw.startsWith(TOOLBAR_DRAG_TEXT_PREFIX) ? raw.slice(TOOLBAR_DRAG_TEXT_PREFIX.length) : raw
  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>
    if (parsed.source === 'layout' && typeof parsed.itemId === 'string') return { source: 'layout', itemId: parsed.itemId }
    if (isToolbarToolPayload(parsed)) return { source: 'tool', toolId: parsed.toolId }
    if (parsed.source === 'spacer') return { source: 'spacer' }
    return null
  } catch {
    return null
  }
}

export function serializeToolbarDragPayload(payload: ToolbarDragPayload): string {
  return JSON.stringify(payload)
}

export function writeToolbarDragPayload(dataTransfer: DataTransfer, payload: ToolbarDragPayload) {
  const serialized = serializeToolbarDragPayload(payload)
  dataTransfer.setData(TOOLBAR_DRAG_MIME, serialized)
  dataTransfer.setData('text/plain', `${TOOLBAR_DRAG_TEXT_PREFIX}${serialized}`)
}

export function readToolbarDragPayload(
  dataTransfer: Pick<DataTransfer, 'getData'>,
  fallback: ToolbarDragPayload | null,
): ToolbarDragPayload | null {
  return parseToolbarDragPayload(dataTransfer.getData(TOOLBAR_DRAG_MIME))
    ?? parseToolbarDragPayload(dataTransfer.getData('text/plain'))
    ?? fallback
}

export function canDropToolbarPayload(payload: ToolbarDragPayload | null): payload is ToolbarDragPayload {
  return payload !== null
}

export function canDropPalettePayload(payload: ToolbarDragPayload | null): payload is { source: 'layout'; itemId: string } {
  return payload?.source === 'layout'
}

type ToolbarDropRow = {
  startIndex: number
  endIndex: number
  top: number
  bottom: number
}

function getToolbarDropRows(rects: ToolbarItemDropRect[]): ToolbarDropRow[] {
  const rows: ToolbarDropRow[] = []
  rects.forEach((rect, index) => {
    const currentRow = rows[rows.length - 1]
    if (!currentRow || rect.top > currentRow.bottom) {
      rows.push({
        startIndex: index,
        endIndex: index,
        top: rect.top,
        bottom: rect.bottom,
      })
      return
    }

    currentRow.endIndex = index
    currentRow.top = Math.min(currentRow.top, rect.top)
    currentRow.bottom = Math.max(currentRow.bottom, rect.bottom)
  })
  return rows
}

function getClosestToolbarDropRow(rows: ToolbarDropRow[], pointY: number): ToolbarDropRow {
  const containingRow = rows.find((row) => pointY >= row.top && pointY <= row.bottom)
  if (containingRow) return containingRow
  return rows.reduce((closest, row) => {
    const closestDistance = Math.min(Math.abs(pointY - closest.top), Math.abs(pointY - closest.bottom))
    const rowDistance = Math.min(Math.abs(pointY - row.top), Math.abs(pointY - row.bottom))
    return rowDistance < closestDistance ? row : closest
  })
}

export function getToolbarDropIndexFromPointer(
  rects: ToolbarItemDropRect[],
  point: ToolbarDropPoint,
  itemCount = rects.length,
): number {
  const boundedItemCount = Math.max(0, itemCount)
  const itemRects = rects.slice(0, boundedItemCount)
  if (boundedItemCount === 0 || itemRects.length === 0) return 0

  const maxBottom = Math.max(...itemRects.map((rect) => rect.bottom))
  if (point.y > maxBottom) return boundedItemCount

  const rows = getToolbarDropRows(itemRects)
  const row = point.y < itemRects[0].top ? rows[0] : getClosestToolbarDropRow(rows, point.y)
  const rowRects = itemRects.slice(row.startIndex, row.endIndex + 1)

  for (let offset = 0; offset < rowRects.length; offset += 1) {
    const rect = rowRects[offset]
    const midpoint = rect.left + (rect.right - rect.left) / 2
    if (point.x < midpoint) return row.startIndex + offset
  }

  return Math.min(row.endIndex + 1, boundedItemCount)
}
