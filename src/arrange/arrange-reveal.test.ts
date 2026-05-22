import { describe, expect, it } from 'vitest'
import { getNextArrangeHierarchyRevealLevel } from './useArrangeMode'

describe('arrange hierarchy reveal level', () => {
  it('advances from the currently persisted visible level', () => {
    expect(getNextArrangeHierarchyRevealLevel(0, 0)).toBe(1)
    expect(getNextArrangeHierarchyRevealLevel(0, 1)).toBe(2)
    expect(getNextArrangeHierarchyRevealLevel(0, 2)).toBe(2)
  })

  it('advances from the temporary reveal level when it is higher than persisted visibility', () => {
    expect(getNextArrangeHierarchyRevealLevel(1, 0)).toBe(2)
    expect(getNextArrangeHierarchyRevealLevel(1, 1)).toBe(2)
    expect(getNextArrangeHierarchyRevealLevel(2, 0)).toBe(2)
  })
})
