import type { CSSProperties } from 'react'

export type ArrangeDragPreviewPosition = {
  currentX: number
  currentY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

export function getArrangeDragPreviewStyle(preview: ArrangeDragPreviewPosition): CSSProperties {
  return {
    left: `${preview.currentX - preview.offsetX}px`,
    top: `${preview.currentY - preview.offsetY}px`,
    width: `${preview.width}px`,
    height: `${preview.height}px`,
  }
}

