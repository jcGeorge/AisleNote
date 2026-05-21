import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import { DEFAULT_CUSTOM_THEME_PALETTE, DEFAULT_UI_SETTINGS } from '../settings/defaults'
import { syncNoteBodyAisleStructureInState } from '../notes/note-state'
import type { AppState, DeletedSubTabEntry, DeletedTabEntry, Space, SubTab, Tab, WorkspaceData } from '../types/app'
import { applyAutoPurgeToAppState, applyMarkdownToAppState, getNextAutoPurgeTimeForAppState, parseSavedState } from './app-state'
import { AUTO_PURGE_DAY_MS } from './workspace'

const liveTab: Tab = {
  id: 'live-tab',
  title: 'Live',
  noteBodyId: 'live-body',
  homeContent: '',
  activeSubTabId: null,
  subTabs: [],
}

function deletedTab(id: string, deletedAt: number): DeletedTabEntry {
  return {
    id: `deleted-${id}`,
    tab: {
      id,
      title: id,
      noteBodyId: `${id}-body`,
      homeContent: '',
      activeSubTabId: null,
      subTabs: [],
    },
    deletedAt,
  }
}

function deletedSubTab(id: string, deletedAt: number): DeletedSubTabEntry {
  const subTab: SubTab = {
    id,
    title: id,
    noteBodyId: `${id}-body`,
    content: '',
  }
  return {
    id: `deleted-${id}`,
    parentTabId: liveTab.id,
    parentTabTitle: liveTab.title,
    subTab,
    deletedAt,
  }
}

function workspace(
  deletedTabs: DeletedTabEntry[] = [],
  deletedSubTabs: DeletedSubTabEntry[] = [],
): WorkspaceData {
  return {
    activeTabId: liveTab.id,
    tabs: [liveTab],
    deletedTabs,
    deletedSubTabs,
  }
}

function space(id: string, autoRemoveDeletedDays: number, data: WorkspaceData): Space {
  return {
    id,
    name: id,
    settings: { autoRemoveDeletedDays },
    data,
  }
}

function appStateWithSpaces(spaces: Space[]): AppState {
  const domain = {
    id: 'domain-1',
    name: 'Domain',
    activeSpaceId: spaces[0]?.id ?? '',
    spaces,
  }
  return {
    theme: 'dawn',
    activeDomainId: domain.id,
    domains: [domain],
    noteBodies: [],
    activeSpaceId: domain.activeSpaceId,
    spaces,
    hotkeys: {
      shortcuts: DEFAULT_SHORTCUTS,
      newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
      enableMouseBackForward: true,
      enableGenericHistoryHotkeys: true,
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: DEFAULT_UI_SETTINGS,
  }
}

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

  it('normalizes legacy aisle markdown into shared aisle body records', () => {
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
        noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', markdown: 'legacy body' }] }],
      }),
    )

    const body = state.noteBodies.find((candidate) => candidate.id === 'body-1')
    const aisleBodyId = body?.aisles[0]?.aisleBodyId

    expect(aisleBodyId).toBe('aisle-1')
    expect(state.noteAisleBodies?.find((aisleBody) => aisleBody.id === aisleBodyId)?.markdown).toBe('legacy body')
    expect(body?.aisles[0]?.markdown).toBe('legacy body')
  })

  it('updates duplicate linked aisle slots together without stale sibling whitespace winning', () => {
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
        noteAisleBodies: [{ id: 'shared-aisle-body', markdown: 'Hat Trick!\\n\\nold whitespace' }],
        noteBodies: [
          {
            id: 'body-1',
            aisles: [
              { id: 'aisle-1', aisleBodyId: 'shared-aisle-body', markdown: 'Hat Trick!\\n\\nold whitespace' },
              { id: 'aisle-2', aisleBodyId: 'shared-aisle-body', markdown: 'Hat Trick!\\n\\nold whitespace' },
            ],
          },
        ],
      }),
    )

    const next = applyMarkdownToAppState(
      state,
      'space-1',
      'tab-1',
      null,
      'aisle-1',
      'Hat Trick!\n\nThe third aisle, seems like this refactor was successful.',
    )
    const body = next.noteBodies.find((candidate) => candidate.id === 'body-1')

    expect(next.noteAisleBodies?.find((aisleBody) => aisleBody.id === 'shared-aisle-body')?.markdown).toBe(
      'Hat Trick!\n\nThe third aisle, seems like this refactor was successful.',
    )
    expect(body?.aisles.map((aisle) => aisle.markdown)).toEqual([
      'Hat Trick!\n\nThe third aisle, seems like this refactor was successful.',
      'Hat Trick!\n\nThe third aisle, seems like this refactor was successful.',
    ])
  })

  it('lets a linked aisle edit the same aisle body used by direct note duplicates', () => {
    const state = parseSavedState(
      JSON.stringify({
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-source',
              tabs: [
                {
                  id: 'tab-source',
                  title: 'Source',
                  noteBodyId: 'body-source',
                  homeContent: '',
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'tab-target',
                  title: 'Target',
                  noteBodyId: 'body-target',
                  homeContent: '',
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'tab-peer',
                  title: 'Peer',
                  noteBodyId: 'body-target',
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
        noteAisleBodies: [
          { id: 'source-aisle-body', markdown: 'source text' },
          { id: 'shared-aisle-body', markdown: 'base text' },
        ],
        noteBodies: [
          {
            id: 'body-source',
            aisles: [
              { id: 'source-aisle', aisleBodyId: 'source-aisle-body', markdown: 'source text' },
              { id: 'linked-aisle', aisleBodyId: 'shared-aisle-body', markdown: 'base text' },
            ],
          },
          {
            id: 'body-target',
            aisles: [{ id: 'target-aisle', aisleBodyId: 'shared-aisle-body', markdown: 'base text' }],
          },
        ],
      }),
    )

    const next = applyMarkdownToAppState(state, 'space-1', 'tab-source', null, 'linked-aisle', 'linked aisle edit')
    const sourceBody = next.noteBodies.find((body) => body.id === 'body-source')
    const targetBody = next.noteBodies.find((body) => body.id === 'body-target')

    expect(next.noteAisleBodies?.find((aisleBody) => aisleBody.id === 'shared-aisle-body')?.markdown).toBe(
      'linked aisle edit',
    )
    expect(sourceBody?.aisles.find((aisle) => aisle.id === 'linked-aisle')?.markdown).toBe('linked aisle edit')
    expect(targetBody?.aisles[0]?.markdown).toBe('linked aisle edit')
    expect(next.spaces[0].data.tabs.find((tab) => tab.id === 'tab-target')?.homeContent).toBe('linked aisle edit')
    expect(next.spaces[0].data.tabs.find((tab) => tab.id === 'tab-peer')?.homeContent).toBe('linked aisle edit')
  })

  it('can commit by aisle body id when a linked aisle slot id is stale or mismatched', () => {
    const state = parseSavedState(
      JSON.stringify({
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-source',
              tabs: [
                {
                  id: 'tab-source',
                  title: 'Source',
                  noteBodyId: 'body-source',
                  homeContent: '',
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'tab-target',
                  title: 'Target',
                  noteBodyId: 'body-target',
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
        noteAisleBodies: [
          { id: 'source-aisle-body', markdown: 'source text' },
          { id: 'shared-aisle-body', markdown: 'base text' },
        ],
        noteBodies: [
          {
            id: 'body-source',
            aisles: [
              { id: 'source-aisle', aisleBodyId: 'source-aisle-body', markdown: 'source text' },
              { id: 'linked-aisle', aisleBodyId: 'shared-aisle-body', markdown: 'base text' },
            ],
          },
          {
            id: 'body-target',
            aisles: [{ id: 'target-aisle', aisleBodyId: 'shared-aisle-body', markdown: 'base text' }],
          },
        ],
      }),
    )

    const next = applyMarkdownToAppState(
      state,
      'space-1',
      'tab-source',
      null,
      'source-aisle',
      'body-id edit',
      { aisleBodyId: 'shared-aisle-body' },
    )

    expect(next.noteAisleBodies?.find((aisleBody) => aisleBody.id === 'shared-aisle-body')?.markdown).toBe(
      'body-id edit',
    )
    expect(next.noteAisleBodies?.find((aisleBody) => aisleBody.id === 'source-aisle-body')?.markdown).toBe(
      'source text',
    )
    expect(next.noteBodies.find((body) => body.id === 'body-source')?.aisles[1]?.markdown).toBe('body-id edit')
    expect(next.noteBodies.find((body) => body.id === 'body-target')?.aisles[0]?.markdown).toBe('body-id edit')
  })

  it('keeps the remaining linked aisle writable after deleting a sibling linked aisle', () => {
    const state = parseSavedState(
      JSON.stringify({
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-source',
              tabs: [
                {
                  id: 'tab-source',
                  title: 'Source',
                  noteBodyId: 'body-source',
                  homeContent: '',
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'tab-target',
                  title: 'Target',
                  noteBodyId: 'body-target',
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
        noteAisleBodies: [
          { id: 'target-aisle-body-a', markdown: 'target a' },
          { id: 'target-aisle-body-b', markdown: 'target b' },
        ],
        noteBodies: [
          {
            id: 'body-source',
            aisles: [
              { id: 'linked-aisle-a', aisleBodyId: 'target-aisle-body-a', markdown: 'target a' },
              { id: 'linked-aisle-b', aisleBodyId: 'target-aisle-body-b', markdown: 'target b' },
            ],
          },
          {
            id: 'body-target',
            aisles: [
              { id: 'target-aisle-a', aisleBodyId: 'target-aisle-body-a', markdown: 'target a' },
              { id: 'target-aisle-b', aisleBodyId: 'target-aisle-body-b', markdown: 'target b' },
            ],
          },
        ],
      }),
    )

    const afterDelete = syncNoteBodyAisleStructureInState(state, 'body-source', [
      { id: 'linked-aisle-b', aisleBodyId: 'target-aisle-body-b', markdown: 'stale target b' },
    ])
    const afterEdit = applyMarkdownToAppState(
      afterDelete,
      'space-1',
      'tab-source',
      null,
      'linked-aisle-b',
      'remaining linked edit',
      { aisleBodyId: 'target-aisle-body-b' },
    )

    expect(afterDelete.noteBodies.find((body) => body.id === 'body-source')?.aisles).toEqual([
      { id: 'linked-aisle-b', aisleBodyId: 'target-aisle-body-b', markdown: 'target b' },
    ])
    expect(afterEdit.noteAisleBodies?.find((aisleBody) => aisleBody.id === 'target-aisle-body-b')?.markdown).toBe(
      'remaining linked edit',
    )
    expect(afterEdit.noteBodies.find((body) => body.id === 'body-source')?.aisles[0]?.markdown).toBe(
      'remaining linked edit',
    )
    expect(afterEdit.noteBodies.find((body) => body.id === 'body-target')?.aisles[1]?.markdown).toBe(
      'remaining linked edit',
    )
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

  it('normalizes persisted heading collapse state', () => {
    const state = parseSavedState(
      JSON.stringify({
        ui: {
          headingCollapseState: {
            'body-1': {
              'aisle-1': ['heading-a', 'heading-a', '', 4, 'heading-b'],
              '': ['ignored'],
              'aisle-2': [],
            },
            '': {
              'aisle-3': ['ignored'],
            },
            broken: null,
          },
        },
      }),
    )
    const missing = parseSavedState(JSON.stringify({ ui: {} }))

    expect(state.ui.headingCollapseState).toEqual({
      'body-1': {
        'aisle-1': ['heading-a', 'heading-b'],
      },
    })
    expect(missing.ui.headingCollapseState).toEqual({})
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
    const misc = parseSavedState(JSON.stringify({ ui: { settingsSection: 'misc' } }))
    const tips = parseSavedState(JSON.stringify({ ui: { settingsSection: 'tips' } }))
    const toolbar = parseSavedState(JSON.stringify({ ui: { settingsSection: 'toolbar' } }))
    const invalid = parseSavedState(JSON.stringify({ ui: { settingsSection: 'unknown' } }))
    const missing = parseSavedState(JSON.stringify({ ui: {} }))

    expect(valid.ui.settingsSection).toBe('visuals')
    expect(misc.ui.settingsSection).toBe('misc')
    expect(tips.ui.settingsSection).toBe('tips')
    expect(toolbar.ui.settingsSection).toBe('toolbar')
    expect(invalid.ui.settingsSection).toBe('hotkeys')
    expect(missing.ui.settingsSection).toBe('hotkeys')
  })

  it('normalizes persisted tip settings', () => {
    const valid = parseSavedState(JSON.stringify({
      ui: {
        seenTipIds: ['task-undo', 'bad-tip', 'task-undo', 'tab-create-after-rename', 'aisle-shortcut'],
        disabledTipIds: ['tab-create-after-rename', 'unknown'],
      },
    }))
    const missing = parseSavedState(JSON.stringify({ ui: {} }))

    expect(valid.ui.seenTipIds).toEqual(['task-undo', 'tab-create-after-rename', 'aisle-shortcut'])
    expect(valid.ui.disabledTipIds).toEqual(['tab-create-after-rename'])
    expect(missing.ui.seenTipIds).toEqual([])
    expect(missing.ui.disabledTipIds).toEqual([])
  })

  it('normalizes persisted table control target modes', () => {
    const valid = parseSavedState(JSON.stringify({
      ui: {
        tableAddTargetMode: 'active-cell',
        tableDeleteTargetMode: 'active-cell',
      },
    }))
    const invalid = parseSavedState(JSON.stringify({
      ui: {
        tableAddTargetMode: 'middle',
        tableDeleteTargetMode: 'edge',
      },
    }))
    const missing = parseSavedState(JSON.stringify({ ui: {} }))

    expect(valid.ui.tableAddTargetMode).toBe('active-cell')
    expect(valid.ui.tableDeleteTargetMode).toBe('active-cell')
    expect(invalid.ui.tableAddTargetMode).toBe('bottom-right')
    expect(invalid.ui.tableDeleteTargetMode).toBe('bottom-right')
    expect(missing.ui.tableAddTargetMode).toBe('bottom-right')
    expect(missing.ui.tableDeleteTargetMode).toBe('bottom-right')
  })

  it('normalizes persisted note copy mode memory', () => {
    const linked = parseSavedState(JSON.stringify({ ui: { lastNoteCopyMode: 'linked' } }))
    const independent = parseSavedState(JSON.stringify({ ui: { lastNoteCopyMode: 'independent' } }))
    const invalid = parseSavedState(JSON.stringify({ ui: { lastNoteCopyMode: 'plain' } }))
    const missing = parseSavedState(JSON.stringify({ ui: {} }))

    expect(linked.ui.lastNoteCopyMode).toBe('linked')
    expect(independent.ui.lastNoteCopyMode).toBe('independent')
    expect(invalid.ui.lastNoteCopyMode).toBe('independent')
    expect(missing.ui.lastNoteCopyMode).toBe('independent')
  })

  it('normalizes persisted de-coupled item data retention memory', () => {
    const keep = parseSavedState(JSON.stringify({ ui: { decoupledItemsKeepData: true } }))
    const clear = parseSavedState(JSON.stringify({ ui: { decoupledItemsKeepData: false } }))
    const invalid = parseSavedState(JSON.stringify({ ui: { decoupledItemsKeepData: 'yes' } }))
    const missing = parseSavedState(JSON.stringify({ ui: {} }))

    expect(keep.ui.decoupledItemsKeepData).toBe(true)
    expect(clear.ui.decoupledItemsKeepData).toBe(false)
    expect(invalid.ui.decoupledItemsKeepData).toBe(true)
    expect(missing.ui.decoupledItemsKeepData).toBe(true)
  })
})

describe('app state trash auto purge', () => {
  it('does not schedule a purge when no space has trash', () => {
    const state = appStateWithSpaces([space('space-1', 7, workspace())])

    expect(getNextAutoPurgeTimeForAppState(state, Date.UTC(2026, 4, 20))).toBeNull()
  })

  it('uses the nearest expiration across all spaces', () => {
    const now = Date.UTC(2026, 4, 20)
    const state = appStateWithSpaces([
      space('short', 3, workspace([deletedTab('short-parent', now - 2 * AUTO_PURGE_DAY_MS)])),
      space('long', 10, workspace([deletedTab('long-parent', now - 8 * AUTO_PURGE_DAY_MS)])),
    ])

    expect(getNextAutoPurgeTimeForAppState(state, now)).toBe(now + AUTO_PURGE_DAY_MS)
  })

  it('returns now when any space has expired trash', () => {
    const now = Date.UTC(2026, 4, 20)
    const state = appStateWithSpaces([
      space('space-1', 7, workspace([deletedTab('expired-parent', now - 7 * AUTO_PURGE_DAY_MS)])),
      space('space-2', 30, workspace([deletedTab('fresh-parent', now - 7 * AUTO_PURGE_DAY_MS)])),
    ])

    expect(getNextAutoPurgeTimeForAppState(state, now)).toBe(now)
  })

  it('purges expired trash using each space retention window', () => {
    const now = Date.UTC(2026, 4, 20)
    const shortExpiredParent = deletedTab('short-expired-parent', now - 3 * AUTO_PURGE_DAY_MS)
    const shortFreshSubTab = deletedSubTab('short-fresh-sub', now - AUTO_PURGE_DAY_MS)
    const longFreshParent = deletedTab('long-fresh-parent', now - 3 * AUTO_PURGE_DAY_MS)
    const state = appStateWithSpaces([
      space('short', 2, workspace([shortExpiredParent], [shortFreshSubTab])),
      space('long', 10, workspace([longFreshParent])),
    ])

    const next = applyAutoPurgeToAppState(state, now)

    expect(next.spaces.find((candidate) => candidate.id === 'short')?.data.deletedTabs).toEqual([])
    expect(next.spaces.find((candidate) => candidate.id === 'short')?.data.deletedSubTabs).toEqual([shortFreshSubTab])
    expect(next.spaces.find((candidate) => candidate.id === 'long')?.data.deletedTabs).toEqual([longFreshParent])
    expect(next.domains[0].spaces.find((candidate) => candidate.id === 'short')?.data.deletedTabs).toEqual([])
  })
})
