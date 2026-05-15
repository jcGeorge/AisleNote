export type ImageToolPlacementRect = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
}

export type ImageToolPlacement = {
  toolbarTop: number
  toolbarLeft: number
  resizeTop: number
  resizeLeft: number
}

const VIEWPORT_PADDING = 8
const TOOLBAR_IMAGE_INSET = 6

export function isUsableImageToolPlacementRect(rect: ImageToolPlacementRect): boolean {
  return (
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.right) &&
    Number.isFinite(rect.bottom) &&
    Number.isFinite(rect.width) &&
    rect.width > 0 &&
    rect.right > rect.left &&
    rect.bottom > rect.top
  )
}

export function getImageToolPlacement(rect: ImageToolPlacementRect): ImageToolPlacement {
  return {
    toolbarTop: Math.max(VIEWPORT_PADDING, rect.top + TOOLBAR_IMAGE_INSET),
    toolbarLeft: Math.max(VIEWPORT_PADDING, rect.left + TOOLBAR_IMAGE_INSET),
    resizeTop: Math.max(VIEWPORT_PADDING, rect.bottom - 2),
    resizeLeft: Math.max(VIEWPORT_PADDING, rect.right - 2),
  }
}
