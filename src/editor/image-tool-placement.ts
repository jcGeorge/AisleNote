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
  toolbarMinWidth: number
  resizeTop: number
  resizeLeft: number
}

const VIEWPORT_PADDING = 8
const TOOLBAR_ESTIMATED_HEIGHT = 32
const TOOLBAR_IMAGE_GAP = 6

export function getImageToolPlacement(rect: ImageToolPlacementRect): ImageToolPlacement {
  return {
    toolbarTop: Math.max(VIEWPORT_PADDING, rect.top - TOOLBAR_ESTIMATED_HEIGHT - TOOLBAR_IMAGE_GAP),
    toolbarLeft: Math.max(VIEWPORT_PADDING, rect.left),
    toolbarMinWidth: Math.max(0, Math.round(rect.width)),
    resizeTop: Math.max(VIEWPORT_PADDING, rect.bottom - 2),
    resizeLeft: Math.max(VIEWPORT_PADDING, rect.right - 2),
  }
}
