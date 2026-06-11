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

export type InsertNewAislesWithReclaimResult<T extends AisleIdentity> =
  | { status: 'applied'; aisles: T[]; reclaimedCount: number }
  | { status: 'blocked' }

export function insertNewAislesWithReclaimedSlots<T extends AisleIdentity>(
  aisles: readonly T[],
  newAisles: readonly T[],
  activeAisleId: string | null | undefined,
  placement: NewAislePlacement,
  maxAisles: number,
  canReclaimAisle: (aisle: T) => boolean,
): InsertNewAislesWithReclaimResult<T> {
  if (newAisles.length <= 0 || newAisles.length > maxAisles) return { status: 'blocked' }
  const insertIndex = getNewAisleInsertIndex(aisles, activeAisleId, placement)
  const reclaimCount = Math.max(0, aisles.length + newAisles.length - maxAisles)
  if (reclaimCount === 0) {
    return {
      status: 'applied',
      aisles: insertNewAisles(aisles, newAisles, activeAisleId, placement),
      reclaimedCount: 0,
    }
  }

  const reclaimedIndexes: number[] = []
  for (let index = aisles.length - 1; index >= 0 && reclaimedIndexes.length < reclaimCount; index -= 1) {
    const aisle = aisles[index]
    if (aisle && canReclaimAisle(aisle)) reclaimedIndexes.push(index)
  }
  if (reclaimedIndexes.length < reclaimCount) return { status: 'blocked' }

  const reclaimedIndexSet = new Set(reclaimedIndexes)
  const retainedAisles = aisles.filter((_aisle, index) => !reclaimedIndexSet.has(index))
  const adjustedInsertIndex = insertIndex - reclaimedIndexes.filter((index) => index < insertIndex).length
  return {
    status: 'applied',
    reclaimedCount: reclaimedIndexes.length,
    aisles: [
      ...retainedAisles.slice(0, adjustedInsertIndex),
      ...newAisles,
      ...retainedAisles.slice(adjustedInsertIndex),
    ],
  }
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
