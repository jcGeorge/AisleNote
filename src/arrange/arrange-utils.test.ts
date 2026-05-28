import { describe, expect, it } from 'vitest'
import { getPlacementNeighborId } from './arrange-utils'

describe('arrange placement neighbor helpers', () => {
  it('returns the previous neighbor for before-target placement', () => {
    expect(getPlacementNeighborId(['a', 'b', 'c'], 'b', 'before')).toBe('a')
  })

  it('returns the next neighbor for after-target placement', () => {
    expect(getPlacementNeighborId(['a', 'b', 'c'], 'b', 'after')).toBe('c')
  })

  it('returns no neighbor at first and last boundaries', () => {
    expect(getPlacementNeighborId(['a', 'b', 'c'], 'a', 'before')).toBeNull()
    expect(getPlacementNeighborId(['a', 'b', 'c'], 'c', 'after')).toBeNull()
  })

  it('ignores the dragged source item when resolving the companion cue', () => {
    expect(getPlacementNeighborId(['a', 'b', 'c', 'd'], 'c', 'before', 'b')).toBe('a')
    expect(getPlacementNeighborId(['a', 'b', 'c', 'd'], 'b', 'after', 'c')).toBe('d')
  })
})
