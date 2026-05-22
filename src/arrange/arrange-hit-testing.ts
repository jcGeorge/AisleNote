import type { ArrangeInsertPosition } from '../types/app'

export const EXACT_RAIL_HIT_PADDING_PX = 0
export const TAB_RAIL_HIT_PADDING_PX = 14

export type ArrangeHitPoint = {
  clientX: number
  clientY: number
}

export type ArrangeRectLike = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>

export type ArrangeRailRectTarget = {
  id: string
  rect: ArrangeRectLike
}

export type ArrangeRailHitInput<TType extends string = string> = {
  type: TType
  railRect: ArrangeRectLike | null
  targets: ArrangeRailRectTarget[]
  padding?: number
}

export type ArrangeRailInsertionTarget = {
  targetId: string
  position: ArrangeInsertPosition
}

export type ArrangeRailItemTarget = {
  targetId: string
}

export type ArrangeRailHit<TType extends string = string> = {
  type: TType
  target: ArrangeRailInsertionTarget
}

export function makeArrangeHitPoint(clientX: number, clientY: number): ArrangeHitPoint {
  return { clientX, clientY }
}

export function isPointInsideArrangeRect(
  rect: ArrangeRectLike | null,
  point: ArrangeHitPoint,
  padding = EXACT_RAIL_HIT_PADDING_PX,
): boolean {
  if (!rect) return false
  return (
    point.clientX >= rect.left - padding &&
    point.clientX <= rect.right + padding &&
    point.clientY >= rect.top - padding &&
    point.clientY <= rect.bottom + padding
  )
}

export function getArrangeInsertionTargetFromRects(
  targets: ArrangeRailRectTarget[],
  point: ArrangeHitPoint,
): ArrangeRailInsertionTarget | null {
  const validTargets = targets.filter((target) => target.id)
  if (validTargets.length === 0) return null

  const closestRowAnchor = validTargets.reduce((closest, current) => {
    const closestDistance = Math.abs(point.clientY - (closest.rect.top + closest.rect.height / 2))
    const currentDistance = Math.abs(point.clientY - (current.rect.top + current.rect.height / 2))
    return currentDistance < closestDistance ? current : closest
  })

  const rowTargets = validTargets
    .filter((target) => Math.abs(target.rect.top - closestRowAnchor.rect.top) <= 6)
    .sort((left, right) => left.rect.left - right.rect.left)

  if (rowTargets.length === 0) return null

  for (const target of rowTargets) {
    const midpoint = target.rect.left + target.rect.width / 2
    if (point.clientX < midpoint) {
      return {
        targetId: target.id,
        position: 'before',
      }
    }
  }

  const lastTarget = rowTargets[rowTargets.length - 1]
  return {
    targetId: lastTarget.id,
    position: 'after',
  }
}

export function getArrangeItemTargetFromRects(
  targets: ArrangeRailRectTarget[],
  point: ArrangeHitPoint,
): ArrangeRailItemTarget | null {
  const target = targets.find((entry) => entry.id && isPointInsideArrangeRect(entry.rect, point, EXACT_RAIL_HIT_PADDING_PX))
  return target ? { targetId: target.id } : null
}

export function getArrangeRailHitFromRects<TType extends string>(
  rail: ArrangeRailHitInput<TType>,
  point: ArrangeHitPoint,
): ArrangeRailHit<TType> | null {
  if (!isPointInsideArrangeRect(rail.railRect, point, rail.padding ?? EXACT_RAIL_HIT_PADDING_PX)) return null
  const target = getArrangeInsertionTargetFromRects(rail.targets, point)
  return target ? { type: rail.type, target } : null
}

export function getFirstArrangeRailHitFromRects<TType extends string>(
  rails: ArrangeRailHitInput<TType>[],
  point: ArrangeHitPoint,
): ArrangeRailHit<TType> | null {
  for (const rail of rails) {
    const hit = getArrangeRailHitFromRects(rail, point)
    if (hit) return hit
  }
  return null
}

function getArrangeRailTargetsFromElement(
  rail: HTMLElement,
  selector: string,
  attributeName: string,
): ArrangeRailRectTarget[] {
  return Array.from(rail.querySelectorAll<HTMLElement>(selector)).map((element) => ({
    id: element.getAttribute(attributeName) ?? '',
    rect: element.getBoundingClientRect(),
  }))
}

export function getArrangeRailInsertionTargetFromElement(
  rail: HTMLElement | null,
  selector: string,
  attributeName: string,
  clientX: number,
  clientY: number,
  padding = EXACT_RAIL_HIT_PADDING_PX,
): ArrangeRailInsertionTarget | null {
  if (!rail) return null
  const point = makeArrangeHitPoint(clientX, clientY)
  const hit = getArrangeRailHitFromRects(
    {
      type: 'rail',
      railRect: rail.getBoundingClientRect(),
      targets: getArrangeRailTargetsFromElement(rail, selector, attributeName),
      padding,
    },
    point,
  )
  return hit?.target ?? null
}

export function getArrangeRailItemTargetFromElement(
  rail: HTMLElement | null,
  selector: string,
  attributeName: string,
  clientX: number,
  clientY: number,
): ArrangeRailItemTarget | null {
  if (!rail) return null
  return getArrangeItemTargetFromRects(
    getArrangeRailTargetsFromElement(rail, selector, attributeName),
    makeArrangeHitPoint(clientX, clientY),
  )
}
