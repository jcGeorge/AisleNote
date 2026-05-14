import { describe, expect, it } from 'vitest'
import { applyMarkdownToAppState, parseSavedState } from './app-state'

describe('app state normalization', () => {
  it('migrates legacy tab content into note bodies', () => {
    const state = parseSavedState(
      JSON.stringify({
        theme: 'dusk',
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-1',
              tabs: [
                {
                  id: 'tab-1',
                  title: 'Tab',
                  homeContent: 'legacy home',
                  activeSubTabId: 'sub-1',
                  subTabs: [{ id: 'sub-1', title: 'Sub', content: 'legacy sub' }],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
      }),
    )

    const tab = state.spaces[0].data.tabs[0]
    const subTab = tab.subTabs[0]
    const tabBody = state.noteBodies.find((body) => body.id === tab.noteBodyId)
    const subTabBody = state.noteBodies.find((body) => body.id === subTab.noteBodyId)

    expect(state.theme).toBe('blues')
    expect(tabBody?.aisles[0]?.markdown).toBe('legacy home')
    expect(subTabBody?.aisles[0]?.markdown).toBe('legacy sub')
  })

  it('updates the note body and legacy content mirror together', () => {
    const state = parseSavedState(null)
    const space = state.spaces[0]
    const tab = space.data.tabs[0]
    const aisleId = state.noteBodies.find((body) => body.id === tab.noteBodyId)?.aisles[0]?.id ?? ''
    const next = applyMarkdownToAppState(state, space.id, tab.id, null, aisleId, 'updated')
    const nextTab = next.spaces[0].data.tabs[0]
    const nextBody = next.noteBodies.find((body) => body.id === nextTab.noteBodyId)

    expect(nextTab.homeContent).toBe('updated')
    expect(nextBody?.aisles[0]?.markdown).toBe('updated')
  })

  it('normalizes persisted note cursor locations', () => {
    const state = parseSavedState(
      JSON.stringify({
        ui: {
          noteCursorLocations: {
            'domain::space::tab::__home__': {
              activeAisleId: 'aisle-1',
              aisles: {
                'aisle-1': { anchor: 2, head: 4, updatedAt: 20 },
                broken: { anchor: -1, head: 1, updatedAt: 30 },
              },
            },
          },
        },
      }),
    )

    expect(state.ui.noteCursorLocations['domain::space::tab::__home__']).toEqual({
      activeAisleId: 'aisle-1',
      aisles: {
        'aisle-1': { anchor: 2, head: 4, updatedAt: 20 },
      },
      updatedAt: 20,
    })
  })
})
