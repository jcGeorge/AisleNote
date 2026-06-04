import type { NewAislePlacement } from '../types/app'

type AisleIdentity = {
  id: string
}

export function getNewAisleInsertIndex(
  aisles: readonly AisleIdentity[],
  activeAisleId: string | null | undefined,
  placement: NewAislePlacement,
) {
  if (placement === 'end') return aisles.length
  const activeIndex = aisles.findIndex((aisle) => aisle.id === activeAisleId)
  if (activeIndex < 0) return aisles.length
  return placement === 'left-of-focus' ? activeIndex : activeIndex + 1
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

export function insertNewAisles<T extends AisleIdentity>(
  aisles: readonly T[],
  newAisles: readonly T[],
  activeAisleId: string | null | undefined,
  placement: NewAislePlacement,
) {
  const insertIndex = getNewAisleInsertIndex(aisles, activeAisleId, placement)
  return [...aisles.slice(0, insertIndex), ...newAisles, ...aisles.slice(insertIndex)]
}

export function replaceFocusedAisleWithNewAisles<T extends AisleIdentity>(
  aisles: readonly T[],
  newAisles: readonly T[],
  activeAisleId: string | null | undefined,
  canReplaceAisle: (aisle: T) => boolean,
) {
  if (newAisles.length <= 0) return null
  const activeIndex = aisles.findIndex((aisle) => aisle.id === activeAisleId)
  if (activeIndex < 0) return null
  const activeAisle = aisles[activeIndex]
  if (!activeAisle || !canReplaceAisle(activeAisle)) return null
  return [...aisles.slice(0, activeIndex), ...newAisles, ...aisles.slice(activeIndex + 1)]
}
