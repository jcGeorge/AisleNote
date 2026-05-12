import type { ArrangeInsertPosition, ArrangeModeState } from '../types/app'

export const ARRANGE_PRESS_DELAY_MS = 380
export const ARRANGE_TAP_SLOP_PX = 6
export const ARRANGE_DRAG_START_SLOP_PX = 12

export const DEFAULT_ARRANGE_MODE: ArrangeModeState = {
  active: false,
  scope: null,
  source: null,
  dragItem: null,
  overParentTabId: null,
  overParentInsert: null,
  overSubTabId: null,
  overSubTabInsert: null,
  overSpaceId: null,
  overSpaceInsert: null,
}

export function moveItemByInsertion<T>(
  items: T[],
  fromIndex: number,
  targetIndex: number,
  position: ArrangeInsertPosition,
): T[] {
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return items
  const nextItems = [...items]
  const [movedItem] = nextItems.splice(fromIndex, 1)
  const rawInsertIndex = targetIndex + (position === 'after' ? 1 : 0)
  const insertIndex = fromIndex < rawInsertIndex ? rawInsertIndex - 1 : rawInsertIndex
  nextItems.splice(insertIndex, 0, movedItem)
  return nextItems
}

export function getArrangeRailInsertionTarget(
  rail: HTMLElement,
  selector: string,
  attributeName: string,
  clientX: number,
  clientY: number,
): { targetId: string; position: ArrangeInsertPosition } | null {
  const elements = Array.from(rail.querySelectorAll<HTMLElement>(selector))
  if (elements.length === 0) return null

  const rects = elements.map((element) => ({
    element,
    rect: element.getBoundingClientRect(),
    id: element.getAttribute(attributeName) ?? '',
  }))
  const validRects = rects.filter((entry) => entry.id)
  if (validRects.length === 0) return null

  const closestRowAnchor = validRects.reduce((closest, current) => {
    const closestDistance = Math.abs(clientY - (closest.rect.top + closest.rect.height / 2))
    const currentDistance = Math.abs(clientY - (current.rect.top + current.rect.height / 2))
    return currentDistance < closestDistance ? current : closest
  })

  const rowRects = validRects
    .filter((entry) => Math.abs(entry.rect.top - closestRowAnchor.rect.top) <= 6)
    .sort((left, right) => left.rect.left - right.rect.left)

  if (rowRects.length === 0) return null

  for (const entry of rowRects) {
    const midpoint = entry.rect.left + entry.rect.width / 2
    if (clientX < midpoint) {
      return {
        targetId: entry.id,
        position: 'before',
      }
    }
  }

  const lastEntry = rowRects[rowRects.length - 1]
  return {
    targetId: lastEntry.id,
    position: 'after',
  }
}

export function isPointInsideElement(
  element: HTMLElement | null,
  clientX: number,
  clientY: number,
  padding = 10,
): boolean {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  return (
    clientX >= rect.left - padding &&
    clientX <= rect.right + padding &&
    clientY >= rect.top - padding &&
    clientY <= rect.bottom + padding
  )
}
