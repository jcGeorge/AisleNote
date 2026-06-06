import { describe, expect, it } from 'vitest'
import { parseSavedState } from '../state/app-state'
import {
  clampAisleWidth,
  normalizeAisleWidths,
  pruneAisleWidthsForAppState,
  resetAisleWidthForLocation,
  setAisleWidthForLocation,
} from './aisle-widths'

function createState(aisles = ['aisle-a', 'aisle-b']) {
  return parseSavedState(
    JSON.stringify({
      activeDomainId: 'domain',
      activeSpaceId: 'space',
      domains: [
        {
          id: 'domain',
          name: 'Domain',
          activeSpaceId: 'space',
          spaces: [
            {
              id: 'space',
              name: 'Space',
              settings: { autoRemoveDeletedDays: 7 },
              data: {
                activeTabId: 'tab',
                tabs: [
                  {
                    id: 'tab',
                    title: 'Tab',
                    noteBodyId: 'body',
                    activeSubTabId: null,
                    subTabs: [{ id: 'sub', title: 'Sub', noteBodyId: 'sub-body' }],
                  },
                ],
                deletedTabs: [],
                deletedSubTabs: [],
              },
            },
          ],
        },
      ],
      noteBodies: [
        { id: 'body', aisles: aisles.map((aisleId) => ({ id: aisleId, aisleBodyId: `${aisleId}-body` })) },
        { id: 'sub-body', aisles: [{ id: 'sub-aisle', aisleBodyId: 'sub-aisle-body' }] },
      ],
      noteAisleBodies: [
        ...aisles.map((aisleId) => ({ id: `${aisleId}-body`, markdown: aisleId })),
        { id: 'sub-aisle-body', markdown: 'sub' },
      ],
    }),
  )
}

describe('aisle widths', () => {
  it('normalizes and clamps persisted widths', () => {
    expect(clampAisleWidth(120)).toBe(160)
    expect(clampAisleWidth(200)).toBe(200)
    expect(clampAisleWidth(1300)).toBe(1200)
    expect(clampAisleWidth(721.4)).toBe(721)
    expect(clampAisleWidth('bad')).toBeNull()

    expect(
      normalizeAisleWidths({
        ' domain::space::tab::__home__ ': {
          ' aisle-a ': 240,
          'aisle-b': '640.6',
          'bad-aisle': null,
        },
        empty: {},
        bad: 12,
      }),
    ).toEqual({
      'domain::space::tab::__home__': {
        'aisle-a': 240,
        'aisle-b': 641,
      },
    })
  })

  it('sets and resets one aisle width without disturbing other locations', () => {
    const widths = setAisleWidthForLocation({}, 'domain::space::tab::__home__', 'aisle-a', 700)
    expect(widths).toEqual({ 'domain::space::tab::__home__': { 'aisle-a': 700 } })

    const withSecond = setAisleWidthForLocation(widths, 'domain::space::tab::__home__', 'aisle-b', 200)
    expect(withSecond).toEqual({ 'domain::space::tab::__home__': { 'aisle-a': 700, 'aisle-b': 200 } })

    expect(resetAisleWidthForLocation(withSecond, 'domain::space::tab::__home__', 'aisle-a')).toEqual({
      'domain::space::tab::__home__': { 'aisle-b': 200 },
    })
    expect(resetAisleWidthForLocation(withSecond, 'domain::space::tab::__home__', 'aisle-b')).toEqual({
      'domain::space::tab::__home__': { 'aisle-a': 700 },
    })
  })

  it('prunes missing locations, missing aisles, and single-aisle locations', () => {
    const state = createState()

    expect(
      pruneAisleWidthsForAppState(
        {
          'domain::space::tab::__home__': {
            'aisle-a': 700,
            'aisle-b': 800,
            stale: 900,
          },
          'domain::space::tab::sub': { 'sub-aisle': 600 },
          missing: { 'aisle-a': 640 },
        },
        state,
      ),
    ).toEqual({
      'domain::space::tab::__home__': {
        'aisle-a': 700,
        'aisle-b': 800,
      },
    })
  })

  it('removes widths when a location is reduced to one aisle', () => {
    const state = createState(['aisle-a'])

    expect(
      pruneAisleWidthsForAppState(
        {
          'domain::space::tab::__home__': {
            'aisle-a': 700,
          },
        },
        state,
      ),
    ).toEqual({})
  })

  it('preserves width map identity when pruning does not change anything', () => {
    const state = createState()
    const emptyWidths = {}
    const liveWidths = {
      'domain::space::tab::__home__': {
        'aisle-a': 700,
      },
    }

    expect(pruneAisleWidthsForAppState(emptyWidths, state)).toBe(emptyWidths)
    expect(pruneAisleWidthsForAppState(liveWidths, state)).toBe(liveWidths)
  })
})
