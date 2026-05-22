const CONTEXT_MENU_VIEWPORT_GAP = 8
const SUBMENU_EDGE_OVERLAP = 1

export type MenuPoint = {
  x: number
  y: number
}

export type MenuSize = {
  width: number
  height: number
}

export type MenuViewport = MenuSize

export type MenuRect = MenuPoint &
  MenuSize & {
    right: number
    bottom: number
  }

export type MenuPosition = {
  left: number
  top: number
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function clampContextMenuPosition(
  anchor: MenuPoint,
  menuSize: MenuSize,
  viewport: MenuViewport,
  gap = CONTEXT_MENU_VIEWPORT_GAP,
): MenuPosition {
  return {
    left: clampValue(anchor.x, gap, viewport.width - menuSize.width - gap),
    top: clampValue(anchor.y, gap, viewport.height - menuSize.height - gap),
  }
}

export function getSubmenuPosition(
  triggerRect: MenuRect,
  panelSize: MenuSize,
  viewport: MenuViewport,
  gap = CONTEXT_MENU_VIEWPORT_GAP,
): MenuPosition {
  const rightLeft = triggerRect.right - SUBMENU_EDGE_OVERLAP
  const leftLeft = triggerRect.x - panelSize.width + SUBMENU_EDGE_OVERLAP
  const unclampedLeft =
    rightLeft + panelSize.width <= viewport.width - gap || leftLeft < gap
      ? rightLeft
      : leftLeft

  return {
    left: clampValue(unclampedLeft, gap, viewport.width - panelSize.width - gap),
    top: clampValue(triggerRect.y, gap, viewport.height - panelSize.height - gap),
  }
}
