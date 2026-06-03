import type { CSSProperties } from 'react'

export type ArrangeDragPreviewPosition = {
  currentX: number
  currentY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

export type ArrangeDragPreviewRect = {
  left: number
  top: number
  width: number
  height: number
}

export function getArrangeDragPreviewRect(preview: ArrangeDragPreviewPosition): ArrangeDragPreviewRect {
  return {
    left: preview.currentX - preview.offsetX,
    top: preview.currentY - preview.offsetY,
    width: preview.width,
    height: preview.height,
  }
}

export function getArrangeDragPreviewStyleFromRect(rect: ArrangeDragPreviewRect): CSSProperties {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
}

export function getArrangeDragPreviewStyle(preview: ArrangeDragPreviewPosition): CSSProperties {
  return getArrangeDragPreviewStyleFromRect(getArrangeDragPreviewRect(preview))
}
