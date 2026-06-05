import type { CSSProperties } from 'react'

export const ARRANGE_DRAG_PREVIEW_POINTER_OFFSET_REM = 2
export const ARRANGE_DRAG_PREVIEW_POINTER_OFFSET_PX = ARRANGE_DRAG_PREVIEW_POINTER_OFFSET_REM * 16

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

export function getArrangeDragPreviewCenteredLeft(currentX: number, width: number): number {
  return currentX - width / 2
}

export function getArrangeDragPreviewBelowPointerTop(currentY: number, height: number): number {
  return currentY - height / 2 + ARRANGE_DRAG_PREVIEW_POINTER_OFFSET_PX
}

export function getArrangeDragPreviewRect(preview: ArrangeDragPreviewPosition): ArrangeDragPreviewRect {
  return {
    left: getArrangeDragPreviewCenteredLeft(preview.currentX, preview.width),
    top: getArrangeDragPreviewBelowPointerTop(preview.currentY, preview.height),
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
