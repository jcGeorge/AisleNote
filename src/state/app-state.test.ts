import { describe, expect, it } from 'vitest'
import { DEFAULT_CUSTOM_THEME_PALETTE } from '../settings/defaults'
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

  it('backfills note body timestamps from existing frontmatter', () => {
    const state = parseSavedState(
      JSON.stringify({
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
                  noteBodyId: 'body-1',
                  homeContent: '',
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteBodies: [
          {
            id: 'body-1',
            frontmatter: {
              created: '2024-01-02',
              updatedAt: '2026-05-15T12:30:00.000Z',
            },
            aisles: [{ id: 'aisle-1', markdown: 'body' }],
          },
        ],
      }),
    )

    const body = state.noteBodies.find((candidate) => candidate.id === 'body-1')

    expect(body?.createdAt).toBe('2024-01-02T00:00:00.000Z')
    expect(body?.updatedAt).toBe('2026-05-15T12:30:00.000Z')
  })

  it('updates note body updatedAt on content edits while preserving createdAt', () => {
    const state = parseSavedState(
      JSON.stringify({
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
                  noteBodyId: 'body-1',
                  homeContent: 'before',
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteBodies: [
          {
            id: 'body-1',
            createdAt: '2024-01-02T00:00:00.000Z',
            updatedAt: '2024-01-03T00:00:00.000Z',
            aisles: [{ id: 'aisle-1', markdown: 'before' }],
          },
        ],
      }),
    )

    const next = applyMarkdownToAppState(state, 'space-1', 'tab-1', null, 'aisle-1', 'after')
    const body = next.noteBodies.find((candidate) => candidate.id === 'body-1')

    expect(body?.createdAt).toBe('2024-01-02T00:00:00.000Z')
    expect(body?.updatedAt).not.toBe('2024-01-03T00:00:00.000Z')
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

  it('normalizes persisted custom theme palettes', () => {
    const valid = parseSavedState(JSON.stringify({
      theme: 'custom',
      ui: {
        customThemePalette: {
          primary: '#AbC',
          text: '#123456',
        },
      },
    }))
    const invalid = parseSavedState(JSON.stringify({
      theme: 'custom',
      ui: {
        customThemePalette: {
          primary: 'red',
        },
      },
    }))
    const missing = parseSavedState(JSON.stringify({ ui: {} }))

    expect(valid.theme).toBe('custom')
    expect(valid.ui.customThemePalette).toEqual({
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      primary: '#aabbcc',
      text: '#123456',
    })
    expect(invalid.ui.customThemePalette?.primary).toBe(DEFAULT_CUSTOM_THEME_PALETTE.primary)
    expect(missing.ui.customThemePalette).toBeNull()
  })

  it('normalizes persisted settings section memory', () => {
    const valid = parseSavedState(JSON.stringify({ ui: { settingsSection: 'visuals' } }))
    const invalid = parseSavedState(JSON.stringify({ ui: { settingsSection: 'unknown' } }))
    const missing = parseSavedState(JSON.stringify({ ui: {} }))

    expect(valid.ui.settingsSection).toBe('visuals')
    expect(invalid.ui.settingsSection).toBe('hotkeys')
    expect(missing.ui.settingsSection).toBe('hotkeys')
  })
})
