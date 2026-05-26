import { describe, expect, it } from 'vitest'
import { getNewAisleInsertIndex, insertNewAisle } from './aisle-insertion'

const aisle = (id: string) => ({ id })

describe('aisle insertion placement', () => {
  it('appends new aisles at the end by default', () => {
    const aisles = [aisle('a'), aisle('b'), aisle('c')]

    expect(getNewAisleInsertIndex(aisles, 'b', 'end')).toBe(3)
    expect(insertNewAisle(aisles, aisle('new'), 'b', 'end').map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
      'new',
    ])
  })

  it('inserts new aisles to the right of the focused aisle when configured', () => {
    const aisles = [aisle('a'), aisle('b'), aisle('c')]

    expect(getNewAisleInsertIndex(aisles, 'b', 'right-of-focus')).toBe(2)
    expect(insertNewAisle(aisles, aisle('new'), 'b', 'right-of-focus').map((item) => item.id)).toEqual([
      'a',
      'b',
      'new',
      'c',
    ])
  })

  it('falls back to appending when the focused aisle is missing', () => {
    const aisles = [aisle('a'), aisle('b'), aisle('c')]

    expect(getNewAisleInsertIndex(aisles, 'missing', 'right-of-focus')).toBe(3)
    expect(insertNewAisle(aisles, aisle('new'), 'missing', 'right-of-focus').map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
      'new',
    ])
  })
})
