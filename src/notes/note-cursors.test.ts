import { describe, expect, it } from 'vitest'
import {
  clampNoteCursorSelection,
  normalizeNoteCursorLocations,
  pruneNoteCursorLocations,
} from './note-cursors'
import type { NoteCursorLocation } from '../types/app'

describe('note cursor locations', () => {
  it('normalizes valid cursor locations and drops malformed selections', () => {
    const normalized = normalizeNoteCursorLocations({
      'note-main': {
        activeAisleId: 'aisle-1',
        aisles: {
          'aisle-1': {
            anchor: 3,
            head: 5,
            anchorBlock: { blockIndex: 1, offset: 2 },
            headBlock: { blockIndex: 1, offset: 4 },
            updatedAt: 10,
          },
          broken: { anchor: Number.NaN, head: 1, updatedAt: 12 },
          malformedEndpoint: { anchor: 1, head: 2, anchorBlock: { blockIndex: -1, offset: 0 }, updatedAt: 11 },
        },
      },
      empty: {
        activeAisleId: '',
        aisles: {},
      },
    })

    expect(normalized['note-main']).toEqual({
      activeAisleId: 'aisle-1',
      aisles: {
        'aisle-1': {
          anchor: 3,
          head: 5,
          anchorBlock: { blockIndex: 1, offset: 2 },
          headBlock: { blockIndex: 1, offset: 4 },
          updatedAt: 10,
        },
        malformedEndpoint: { anchor: 1, head: 2, updatedAt: 11 },
      },
      updatedAt: 11,
    })
    expect(normalized.empty).toBeUndefined()
  })

  it('prunes old note cursor locations by most recent update', () => {
    const locations: Record<string, NoteCursorLocation> = {
      old: { activeAisleId: 'a', aisles: {}, updatedAt: 1 },
      middle: { activeAisleId: 'b', aisles: {}, updatedAt: 2 },
      newest: { activeAisleId: 'c', aisles: {}, updatedAt: 3 },
    }

    expect(Object.keys(pruneNoteCursorLocations(locations, 2))).toEqual(['newest', 'middle'])
  })

  it('clamps cursor positions to document bounds', () => {
    expect(clampNoteCursorSelection({ anchor: 99, head: -1, updatedAt: 5 }, 12)).toEqual({
      anchor: 12,
      head: 0,
      updatedAt: 5,
    })
  })
})
