import type { NewAislePlacement } from '../types/app'

type AisleIdentity = {
  id: string
}

export function getNewAisleInsertIndex(
  aisles: readonly AisleIdentity[],
  activeAisleId: string | null | undefined,
  placement: NewAislePlacement,
) {
  if (placement !== 'right-of-focus') return aisles.length
  const activeIndex = aisles.findIndex((aisle) => aisle.id === activeAisleId)
  return activeIndex >= 0 ? activeIndex + 1 : aisles.length
}

export function insertNewAisle<T extends AisleIdentity>(
  aisles: readonly T[],
  aisle: T,
  activeAisleId: string | null | undefined,
  placement: NewAislePlacement,
) {
  const insertIndex = getNewAisleInsertIndex(aisles, activeAisleId, placement)
  return [...aisles.slice(0, insertIndex), aisle, ...aisles.slice(insertIndex)]
}
