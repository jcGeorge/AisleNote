import { describe, expect, it } from 'vitest'
import {
  getNewAisleInsertIndex,
  insertNewAisle,
  insertNewAisles,
  insertNewAislesWithReclaimedSlots,
  replaceFocusedAisleWithNewAisles,
} from './aisle-insertion'

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

  it('inserts new aisles to the left of the current aisle when configured', () => {
    const aisles = [aisle('a'), aisle('b'), aisle('c')]

    expect(getNewAisleInsertIndex(aisles, 'b', 'left-of-focus')).toBe(1)
    expect(insertNewAisle(aisles, aisle('new'), 'b', 'left-of-focus').map((item) => item.id)).toEqual([
      'a',
      'new',
      'b',
      'c',
    ])
  })

  it('inserts new aisles to the right of the current aisle when configured', () => {
    const aisles = [aisle('a'), aisle('b'), aisle('c')]

    expect(getNewAisleInsertIndex(aisles, 'b', 'right-of-focus')).toBe(2)
    expect(insertNewAisle(aisles, aisle('new'), 'b', 'right-of-focus').map((item) => item.id)).toEqual([
      'a',
      'b',
      'new',
      'c',
    ])
  })

  it('inserts multiple new aisles together to the left or right of the current aisle', () => {
    const aisles = [aisle('a'), aisle('b'), aisle('c')]
    const newAisles = [aisle('new-1'), aisle('new-2')]

    expect(insertNewAisles(aisles, newAisles, 'b', 'left-of-focus').map((item) => item.id)).toEqual([
      'a',
      'new-1',
      'new-2',
      'b',
      'c',
    ])
    expect(insertNewAisles(aisles, newAisles, 'b', 'right-of-focus').map((item) => item.id)).toEqual([
      'a',
      'b',
      'new-1',
      'new-2',
      'c',
    ])
  })

  it('falls back to appending when the focused aisle is missing', () => {
    const aisles = [aisle('a'), aisle('b'), aisle('c')]

    expect(getNewAisleInsertIndex(aisles, 'missing', 'left-of-focus')).toBe(3)
    expect(getNewAisleInsertIndex(aisles, 'missing', 'right-of-focus')).toBe(3)
    expect(insertNewAisle(aisles, aisle('new'), 'missing', 'left-of-focus').map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
      'new',
    ])
    expect(insertNewAisle(aisles, aisle('new'), 'missing', 'right-of-focus').map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
      'new',
    ])
  })

  it('replaces the focused aisle when the caller marks it replaceable', () => {
    const aisles = [aisle('a'), aisle('blank'), aisle('c')]
    const newAisles = [aisle('linked')]

    expect(
      replaceFocusedAisleWithNewAisles(aisles, newAisles, 'blank', (candidate) => candidate.id === 'blank')?.map(
        (item) => item.id,
      ),
    ).toEqual(['a', 'linked', 'c'])
  })

  it('does not replace missing or non-replaceable focused aisles', () => {
    const aisles = [aisle('a'), aisle('b'), aisle('c')]

    expect(replaceFocusedAisleWithNewAisles(aisles, [aisle('new')], 'missing', () => true)).toBeNull()
    expect(replaceFocusedAisleWithNewAisles(aisles, [aisle('new')], 'b', () => false)).toBeNull()
  })

  it('reclaims only eligible aisles when inserting a batch at the aisle limit', () => {
    const aisles = [aisle('kept-1'), aisle('empty-1'), aisle('focus'), aisle('empty-2')]
    const newAisles = [aisle('new-1'), aisle('new-2')]

    const result = insertNewAislesWithReclaimedSlots(
      aisles,
      newAisles,
      'focus',
      'right-of-focus',
      4,
      (candidate) => candidate.id.startsWith('empty'),
    )

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error('expected reclaimed insertion')
    expect(result.reclaimedCount).toBe(2)
    expect(result.aisles.map((item) => item.id)).toEqual(['kept-1', 'focus', 'new-1', 'new-2'])
  })

  it('blocks batch insertion when reclaimable aisles cannot make enough room', () => {
    const result = insertNewAislesWithReclaimedSlots(
      [aisle('kept-1'), aisle('empty'), aisle('kept-2')],
      [aisle('new-1'), aisle('new-2')],
      'kept-1',
      'right-of-focus',
      3,
      (candidate) => candidate.id === 'empty',
    )

    expect(result).toEqual({ status: 'blocked' })
  })

  it('keeps insertion anchored when the focused aisle is reclaimed', () => {
    const result = insertNewAislesWithReclaimedSlots(
      [aisle('a'), aisle('focus'), aisle('b')],
      [aisle('new')],
      'focus',
      'right-of-focus',
      3,
      (candidate) => candidate.id === 'focus',
    )

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error('expected anchored insertion')
    expect(result.reclaimedCount).toBe(1)
    expect(result.aisles.map((item) => item.id)).toEqual(['a', 'new', 'b'])
  })
})
