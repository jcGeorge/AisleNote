import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import { BUILT_IN_THEME_PALETTE_SEEDS, DEFAULT_CUSTOM_THEME_PALETTE, DEFAULT_UI_SETTINGS } from '../settings/defaults'
import { syncNoteBodyAisleStructureInState } from '../notes/note-state'
import { getAisleMarkdown } from '../notes/note-markdown'
import type {
  AppState,
  DeletedDomainEntry,
  DeletedSpaceEntry,
  DeletedSubTabEntry,
  DeletedTabEntry,
  Space,
  SubTab,
  Tab,
  WorkspaceData,
} from '../types/app'
import {
  DEFAULT_STATE,
  applyAutoPurgeToAppState,
  applyMarkdownToAppState,
  getNextAutoPurgeTimeForAppState,
  parseSavedState,
} from './app-state'
import { AUTO_PURGE_DAY_MS } from './workspace'

const liveTab: Tab = {
  id: 'live-tab',
  title: 'Live',
  noteBodyId: 'live-body',
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

function deletedSpaceEntry(id: string, deletedAt: number, targetSpace: Space): DeletedSpaceEntry {
  return {
    id,
    domainId: 'domain-1',
    domainName: 'Domain',
    space: targetSpace,
    deletedAt,
  }
}

function deletedDomainEntry(
  id: string,
  deletedAt: number,
  spaces: Space[],
  deletedSpaces: DeletedSpaceEntry[] = [],
): DeletedDomainEntry {
  return {
    id,
    domain: {
      id: `${id}-domain`,
      name: id,
      activeSpaceId: spaces[0]?.id ?? '',
      spaces,
    },
    deletedSpaces,
    deletedAt,
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
    deletedDomains: [],
    deletedSpaces: [],
    noteBodies: [],
    activeSpaceId: domain.activeSpaceId,
    spaces,
    hotkeys: {
      shortcuts: DEFAULT_SHORTCUTS,
      newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: DEFAULT_UI_SETTINGS,
  }
}

function defaultModernSpace(): Space {
  return {
    id: 'space',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 7 },
    data: {
      activeTabId: 'tab',
      tabs: [
        {
          id: 'tab',
          title: 'Tab',
          noteBodyId: 'body-1',
          activeSubTabId: null,
          subTabs: [],
        },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function modernState(raw: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(raw.domains)) return raw
  const spaces = Array.isArray(raw.spaces) && raw.spaces.length > 0 ? raw.spaces : [defaultModernSpace()]
  const activeSpaceId = typeof raw.activeSpaceId === 'string' ? raw.activeSpaceId : String((spaces[0] as { id?: string }).id ?? '')
  const domain = {
    id: 'domain',
    name: 'Domain',
    activeSpaceId,
    spaces,
  }
  return {
    ...raw,
    activeDomainId: typeof raw.activeDomainId === 'string' ? raw.activeDomainId : domain.id,
    domains: [domain],
    activeSpaceId,
    spaces,
  }
}

function parseModernState(raw: Record<string, unknown>): AppState {
  return parseSavedState(JSON.stringify(modernState(raw)))
}

describe('app state normalization', () => {
  it('rejects legacy spaces-only app data', () => {
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

    expect(state).toBe(DEFAULT_STATE)
  })

  it('updates note body markdown through the aisle body source of truth', () => {
    const state = parseSavedState(null)
    const space = state.spaces[0]
    const tab = space.data.tabs[0]
    const aisleId = state.noteBodies.find((body) => body.id === tab.noteBodyId)?.aisles[0]?.id ?? ''
    const next = applyMarkdownToAppState(state, space.id, tab.id, null, aisleId, 'updated')
    const nextTab = next.spaces[0].data.tabs[0]
    const nextBody = next.noteBodies.find((body) => body.id === nextTab.noteBodyId)

    expect(nextBody?.aisles[0] ? getAisleMarkdown(nextBody.aisles[0], next.noteAisleBodies) : '').toBe('updated')
  })

  it('normalizes structural aisles with shared aisle body records', () => {
    const state = parseModernState({
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
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }] }],
        noteAisleBodies: [{ id: 'aisle-body-1', markdown: 'body text' }],
      })

    const body = state.noteBodies.find((candidate) => candidate.id === 'body-1')
    const aisleBodyId = body?.aisles[0]?.aisleBodyId

    expect(aisleBodyId).toBe('aisle-body-1')
    expect(state.noteAisleBodies?.find((aisleBody) => aisleBody.id === aisleBodyId)?.markdown).toBe('body text')
    expect(body?.aisles[0] ? getAisleMarkdown(body.aisles[0], state.noteAisleBodies) : '').toBe('body text')
  })

  it('updates duplicate linked aisle slots together without stale sibling whitespace winning', () => {
    const state = parseModernState({
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
              { id: 'aisle-1', aisleBodyId: 'shared-aisle-body' },
              { id: 'aisle-2', aisleBodyId: 'shared-aisle-body' },
            ],
          },
        ],
      })

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
    expect(body?.aisles.map((aisle) => getAisleMarkdown(aisle, next.noteAisleBodies))).toEqual([
      'Hat Trick!\n\nThe third aisle, seems like this refactor was successful.',
      'Hat Trick!\n\nThe third aisle, seems like this refactor was successful.',
    ])
  })

  it('lets a linked aisle edit the same aisle body used by direct note duplicates', () => {
    const state = parseModernState({
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
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'tab-target',
                  title: 'Target',
                  noteBodyId: 'body-target',
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'tab-peer',
                  title: 'Peer',
                  noteBodyId: 'body-target',
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
              { id: 'source-aisle', aisleBodyId: 'source-aisle-body' },
              { id: 'linked-aisle', aisleBodyId: 'shared-aisle-body' },
            ],
          },
          {
            id: 'body-target',
            aisles: [{ id: 'target-aisle', aisleBodyId: 'shared-aisle-body' }],
          },
        ],
      })

    const next = applyMarkdownToAppState(state, 'space-1', 'tab-source', null, 'linked-aisle', 'linked aisle edit')
    const sourceBody = next.noteBodies.find((body) => body.id === 'body-source')
    const targetBody = next.noteBodies.find((body) => body.id === 'body-target')

    expect(next.noteAisleBodies?.find((aisleBody) => aisleBody.id === 'shared-aisle-body')?.markdown).toBe(
      'linked aisle edit',
    )
    expect(sourceBody?.aisles.find((aisle) => aisle.id === 'linked-aisle') ? getAisleMarkdown(sourceBody.aisles.find((aisle) => aisle.id === 'linked-aisle')!, next.noteAisleBodies) : '').toBe('linked aisle edit')
    expect(targetBody?.aisles[0] ? getAisleMarkdown(targetBody.aisles[0], next.noteAisleBodies) : '').toBe('linked aisle edit')
  })

  it('can commit by aisle body id when a linked aisle slot id is stale or mismatched', () => {
    const state = parseModernState({
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
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'tab-target',
                  title: 'Target',
                  noteBodyId: 'body-target',
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
              { id: 'source-aisle', aisleBodyId: 'source-aisle-body' },
              { id: 'linked-aisle', aisleBodyId: 'shared-aisle-body' },
            ],
          },
          {
            id: 'body-target',
            aisles: [{ id: 'target-aisle', aisleBodyId: 'shared-aisle-body' }],
          },
        ],
      })

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
    const sourceAisle = next.noteBodies.find((body) => body.id === 'body-source')?.aisles[1]
    const targetAisle = next.noteBodies.find((body) => body.id === 'body-target')?.aisles[0]
    expect(sourceAisle ? getAisleMarkdown(sourceAisle, next.noteAisleBodies) : '').toBe('body-id edit')
    expect(targetAisle ? getAisleMarkdown(targetAisle, next.noteAisleBodies) : '').toBe('body-id edit')
  })

  it('keeps the remaining linked aisle writable after deleting a sibling linked aisle', () => {
    const state = parseModernState({
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
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'tab-target',
                  title: 'Target',
                  noteBodyId: 'body-target',
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
              { id: 'linked-aisle-a', aisleBodyId: 'target-aisle-body-a' },
              { id: 'linked-aisle-b', aisleBodyId: 'target-aisle-body-b' },
            ],
          },
          {
            id: 'body-target',
            aisles: [
              { id: 'target-aisle-a', aisleBodyId: 'target-aisle-body-a' },
              { id: 'target-aisle-b', aisleBodyId: 'target-aisle-body-b' },
            ],
          },
        ],
      })

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
      { id: 'linked-aisle-b', aisleBodyId: 'target-aisle-body-b' },
    ])
    expect(afterEdit.noteAisleBodies?.find((aisleBody) => aisleBody.id === 'target-aisle-body-b')?.markdown).toBe(
      'remaining linked edit',
    )
    const editedSourceAisle = afterEdit.noteBodies.find((body) => body.id === 'body-source')?.aisles[0]
    const editedTargetAisle = afterEdit.noteBodies.find((body) => body.id === 'body-target')?.aisles[1]
    expect(editedSourceAisle ? getAisleMarkdown(editedSourceAisle, afterEdit.noteAisleBodies) : '').toBe(
      'remaining linked edit',
    )
    expect(editedTargetAisle ? getAisleMarkdown(editedTargetAisle, afterEdit.noteAisleBodies) : '').toBe(
      'remaining linked edit',
    )
  })

  it('preserves modern note body timestamps with frontmatter on aisle bodies', () => {
    const state = parseModernState({
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
            updatedAt: '2026-05-15T12:30:00.000Z',
            aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }],
          },
        ],
        noteAisleBodies: [
          {
            id: 'aisle-body-1',
            markdown: 'body',
            frontmatter: {
              created: '2024-01-02',
              updatedAt: '2026-05-15T12:30:00.000Z',
            },
          },
        ],
      })

    const body = state.noteBodies.find((candidate) => candidate.id === 'body-1')

    expect(body?.createdAt).toBe('2024-01-02T00:00:00.000Z')
    expect(body?.updatedAt).toBe('2026-05-15T12:30:00.000Z')
  })

  it('updates note body updatedAt on content edits while preserving createdAt', () => {
    const state = parseModernState({
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
            aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }],
          },
        ],
        noteAisleBodies: [{ id: 'aisle-body-1', markdown: 'before' }],
      })

    const next = applyMarkdownToAppState(state, 'space-1', 'tab-1', null, 'aisle-1', 'after')
    const body = next.noteBodies.find((candidate) => candidate.id === 'body-1')

    expect(body?.createdAt).toBe('2024-01-02T00:00:00.000Z')
    expect(body?.updatedAt).not.toBe('2024-01-03T00:00:00.000Z')
  })

  it('normalizes persisted note cursor locations', () => {
    const state = parseModernState({
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
      })

    expect(state.ui.noteCursorLocations['domain::space::tab::__home__']).toEqual({
      activeAisleId: 'aisle-1',
      aisles: {
        'aisle-1': { anchor: 2, head: 4, updatedAt: 20 },
      },
      updatedAt: 20,
    })
  })

  it('normalizes persisted heading collapse state', () => {
    const state = parseModernState({
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
      })
    const missing = parseModernState({ ui: {} })

    expect(state.ui.headingCollapseState).toEqual({
      'body-1': {
        'aisle-1': ['heading-a', 'heading-b'],
      },
    })
    expect(missing.ui.headingCollapseState).toEqual({})
  })

  it('normalizes persisted custom theme palettes', () => {
    const valid = parseModernState({
      theme: 'custom',
      ui: {
        customThemePalette: {
          primary: '#AbC',
          text: '#123456',
        },
      },
    })
    const invalid = parseModernState({
      theme: 'custom',
      ui: {
        customThemePalette: {
          primary: 'red',
        },
      },
    })
    const missing = parseModernState({ ui: {} })

    expect(valid.theme).toBe('custom1')
    expect(valid.ui.selectedCustomTheme).toBe('custom1')
    expect(valid.ui.customThemePalette).toEqual({
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      primary: '#aabbcc',
      text: '#123456',
    })
    expect(valid.ui.themePalettes?.custom1).toEqual(valid.ui.customThemePalette)
    expect(invalid.ui.customThemePalette?.primary).toBe(DEFAULT_CUSTOM_THEME_PALETTE.primary)
    expect(missing.ui.customThemePalette).toBeNull()
    expect(missing.ui.themePalettes).toEqual({})
  })

  it('normalizes custom theme ids and selected custom theme memory', () => {
    const custom2 = parseModernState({
      theme: 'custom2',
      ui: { selectedCustomTheme: 'custom3' },
    })
    const invalidSelected = parseModernState({
      theme: 'custom3',
      ui: { selectedCustomTheme: 'custom4' },
    })

    expect(custom2.theme).toBe('custom2')
    expect(custom2.ui.selectedCustomTheme).toBe('custom3')
    expect(invalidSelected.theme).toBe('custom3')
    expect(invalidSelected.ui.selectedCustomTheme).toBe('custom1')
  })

  it('normalizes persisted per-theme palettes', () => {
    const state = parseModernState({
      theme: 'dawn',
      ui: {
        customThemePalette: {
          primary: '#AbC',
        },
        themePalettes: {
          dawn: {
            primary: '#123456',
            domainRail: '#a95429',
          },
          light: {
            primary: 'not-a-color',
          },
          unknown: {
            primary: '#ffffff',
          },
        },
      },
    })

    expect(state.ui.themePalettes?.dawn?.primary).toBe('#123456')
    expect(state.ui.themePalettes?.dawn?.domainRail).toBe('#a95429')
    expect(state.ui.themePalettes?.light?.primary).toBe(DEFAULT_CUSTOM_THEME_PALETTE.primary)
    expect(state.ui.themePalettes?.custom1?.primary).toBe('#aabbcc')
    expect(Object.keys(state.ui.themePalettes ?? {}).sort()).toEqual(['custom1', 'dawn', 'light'])
  })

  it('drops exact legacy dawn and blues seed palette overrides', () => {
    const state = parseModernState({
      ui: {
        themePalettes: {
          dawn: {
            ...BUILT_IN_THEME_PALETTE_SEEDS.dawn,
            canvas: '#776238',
          },
          blues: {
            ...BUILT_IN_THEME_PALETTE_SEEDS.blues,
            canvas: '#25324d',
          },
        },
      },
    })

    expect(state.ui.themePalettes?.dawn).toBeUndefined()
    expect(state.ui.themePalettes?.blues).toBeUndefined()
  })

  it('normalizes persisted settings section memory', () => {
    const valid = parseModernState({ ui: { settingsSection: 'visuals' } })
    const data = parseModernState({ ui: { settingsSection: 'data', dataSettingsSection: 'export' } })
    const invalidData = parseModernState({ ui: { settingsSection: 'data', dataSettingsSection: 'sync' } })
    const misc = parseModernState({ ui: { settingsSection: 'misc' } })
    const theming = parseModernState({ ui: { settingsSection: 'theming' } })
    const nestedVisuals = parseModernState({ ui: { settingsSection: 'visuals', visualsSettingsSection: 'otherVisuals' } })
    const invalidNestedVisuals = parseModernState({ ui: { settingsSection: 'visuals', visualsSettingsSection: 'colors' } })
    const tips = parseModernState({ ui: { settingsSection: 'tips' } })
    const toolbar = parseModernState({ ui: { settingsSection: 'toolbar' } })
    const invalid = parseModernState({ ui: { settingsSection: 'unknown' } })
    const missing = parseModernState({ ui: {} })

    expect(valid.ui.settingsSection).toBe('visuals')
    expect(data.ui.settingsSection).toBe('data')
    expect(data.ui.dataSettingsSection).toBe('export')
    expect(invalidData.ui.dataSettingsSection).toBe('cloud')
    expect(misc.ui.settingsSection).toBe('misc')
    expect(theming.ui.settingsSection).toBe('visuals')
    expect(theming.ui.visualsSettingsSection).toBe('theming')
    expect(nestedVisuals.ui.settingsSection).toBe('visuals')
    expect(nestedVisuals.ui.visualsSettingsSection).toBe('otherVisuals')
    expect(invalidNestedVisuals.ui.visualsSettingsSection).toBe('theming')
    expect(tips.ui.settingsSection).toBe('tips')
    expect(toolbar.ui.settingsSection).toBe('toolbar')
    expect(invalid.ui.settingsSection).toBe('hotkeys')
    expect(missing.ui.settingsSection).toBe('hotkeys')
  })

  it('normalizes tooltip scale settings', () => {
    const valid = parseModernState({ ui: { tooltipScale: 1.25 } })
    const tooLarge = parseModernState({ ui: { tooltipScale: 8 } })
    const tooSmall = parseModernState({ ui: { tooltipScale: 0.1 } })
    const missing = parseModernState({ ui: {} })

    expect(valid.ui.tooltipScale).toBe(1.25)
    expect(tooLarge.ui.tooltipScale).toBe(1.6)
    expect(tooSmall.ui.tooltipScale).toBe(0.8)
    expect(missing.ui.tooltipScale).toBe(1)
  })

  it('normalizes always-visible navigation hierarchy settings', () => {
    const valid = parseModernState({ ui: { alwaysShowSpaces: true, alwaysShowDomains: true } })
    const invalid = parseModernState({ ui: { alwaysShowSpaces: false, alwaysShowDomains: true } })
    const missing = parseModernState({ ui: {} })

    expect(valid.ui.alwaysShowSpaces).toBe(true)
    expect(valid.ui.alwaysShowDomains).toBe(true)
    expect(invalid.ui.alwaysShowSpaces).toBe(false)
    expect(invalid.ui.alwaysShowDomains).toBe(false)
    expect(missing.ui.alwaysShowSpaces).toBe(false)
    expect(missing.ui.alwaysShowDomains).toBe(false)
  })

  it('normalizes persisted tip settings', () => {
    const valid = parseModernState({
      ui: {
        seenTipIds: ['task-undo', 'bad-tip', 'task-undo', 'tab-create-after-rename', 'aisle-shortcut'],
        disabledTipIds: ['tab-create-after-rename', 'unknown'],
      },
    })
    const missing = parseModernState({ ui: {} })

    expect(valid.ui.seenTipIds).toEqual(['task-undo', 'tab-create-after-rename'])
    expect(valid.ui.disabledTipIds).toEqual(['tab-create-after-rename'])
    expect(missing.ui.seenTipIds).toEqual([])
    expect(missing.ui.disabledTipIds).toEqual([])
  })

  it('normalizes persisted find option settings', () => {
    const enabled = parseModernState({
      ui: {
        findCaseSensitive: true,
        findWholeWord: true,
        findRegex: true,
      },
    })
    const invalid = parseModernState({
      ui: {
        findCaseSensitive: 'yes',
        findWholeWord: 1,
        findRegex: null,
      },
    })
    const missing = parseModernState({ ui: {} })

    expect(enabled.ui.findCaseSensitive).toBe(true)
    expect(enabled.ui.findWholeWord).toBe(true)
    expect(enabled.ui.findRegex).toBe(true)
    expect(invalid.ui.findCaseSensitive).toBe(false)
    expect(invalid.ui.findWholeWord).toBe(false)
    expect(invalid.ui.findRegex).toBe(false)
    expect(missing.ui.findCaseSensitive).toBe(false)
    expect(missing.ui.findWholeWord).toBe(false)
    expect(missing.ui.findRegex).toBe(false)
  })

  it('normalizes synced toolbar layouts while leaving active toolbar selection local', () => {
    const state = parseModernState({
      ui: {
        activeToolbarLayoutId: 'should-not-sync',
        toolbarLayouts: [
          {
            id: 'default',
            name: 'bad default',
            items: [{ id: 'copy', type: 'tool', toolId: 'copy' }],
          },
          {
            id: 'desktop',
            name: '  desktop  ',
            items: [
              { id: 'one', type: 'tool', toolId: 'bold' },
              { id: 'two', type: 'tool', toolId: 'bold' },
              { id: 'gap', type: 'spacer' },
              { id: 'three', type: 'tool', toolId: 'italic' },
            ],
          },
        ],
      },
    })
    const missing = parseModernState({ ui: {} })

    expect(state.ui.toolbarLayouts).toEqual([
      {
        id: 'desktop',
        name: 'desktop',
        items: [
          { id: 'one', type: 'tool', toolId: 'bold' },
          { id: 'gap', type: 'spacer' },
          { id: 'three', type: 'tool', toolId: 'italic' },
        ],
      },
    ])
    expect('activeToolbarLayoutId' in state.ui).toBe(false)
    expect(missing.ui.toolbarLayouts).toEqual([])
  })

  it('normalizes toolbar customizer name visibility', () => {
    const enabled = parseModernState({ ui: { toolbarEditorShowNames: true } })
    const disabled = parseModernState({ ui: { toolbarEditorShowNames: false } })
    const invalid = parseModernState({ ui: { toolbarEditorShowNames: 'yes' } })
    const missing = parseModernState({ ui: {} })

    expect(enabled.ui.toolbarEditorShowNames).toBe(true)
    expect(disabled.ui.toolbarEditorShowNames).toBe(false)
    expect(invalid.ui.toolbarEditorShowNames).toBe(false)
    expect(missing.ui.toolbarEditorShowNames).toBe(false)
  })

  it('normalizes persisted table control target modes', () => {
    const valid = parseModernState({
      ui: {
        tableAddTargetMode: 'active-cell',
        tableDeleteTargetMode: 'active-cell',
      },
    })
    const invalid = parseModernState({
      ui: {
        tableAddTargetMode: 'middle',
        tableDeleteTargetMode: 'edge',
      },
    })
    const missing = parseModernState({ ui: {} })

    expect(valid.ui.tableAddTargetMode).toBe('active-cell')
    expect(valid.ui.tableDeleteTargetMode).toBe('active-cell')
    expect(invalid.ui.tableAddTargetMode).toBe('bottom-right')
    expect(invalid.ui.tableDeleteTargetMode).toBe('bottom-right')
    expect(missing.ui.tableAddTargetMode).toBe('bottom-right')
    expect(missing.ui.tableDeleteTargetMode).toBe('bottom-right')
  })

  it('normalizes persisted table of contents scope', () => {
    const focused = parseModernState({ ui: { tableOfContentsScope: 'focused-aisle' } })
    const all = parseModernState({ ui: { tableOfContentsScope: 'all-aisles' } })
    const invalid = parseModernState({ ui: { tableOfContentsScope: 'visible' } })
    const missing = parseModernState({ ui: {} })

    expect(focused.ui.tableOfContentsScope).toBe('focused-aisle')
    expect(all.ui.tableOfContentsScope).toBe('all-aisles')
    expect(invalid.ui.tableOfContentsScope).toBe('all-aisles')
    expect(missing.ui.tableOfContentsScope).toBe('all-aisles')
  })

  it('normalizes persisted new aisle placement', () => {
    const rightOfFocus = parseModernState({ ui: { newAislePlacement: 'right-of-focus' } })
    const end = parseModernState({ ui: { newAislePlacement: 'end' } })
    const invalid = parseModernState({ ui: { newAislePlacement: 'middle' } })
    const missing = parseModernState({ ui: {} })

    expect(rightOfFocus.ui.newAislePlacement).toBe('right-of-focus')
    expect(end.ui.newAislePlacement).toBe('end')
    expect(invalid.ui.newAislePlacement).toBe('end')
    expect(missing.ui.newAislePlacement).toBe('end')
  })

  it('normalizes persisted note copy mode memory', () => {
    const linked = parseModernState({ ui: { lastNoteCopyMode: 'linked' } })
    const independent = parseModernState({ ui: { lastNoteCopyMode: 'independent' } })
    const invalid = parseModernState({ ui: { lastNoteCopyMode: 'plain' } })
    const missing = parseModernState({ ui: {} })

    expect(linked.ui.lastNoteCopyMode).toBe('linked')
    expect(independent.ui.lastNoteCopyMode).toBe('independent')
    expect(invalid.ui.lastNoteCopyMode).toBe('independent')
    expect(missing.ui.lastNoteCopyMode).toBe('independent')
  })

  it('normalizes persisted de-coupled item data retention memory', () => {
    const keep = parseModernState({ ui: { decoupledItemsKeepData: true } })
    const clear = parseModernState({ ui: { decoupledItemsKeepData: false } })
    const invalid = parseModernState({ ui: { decoupledItemsKeepData: 'yes' } })
    const missing = parseModernState({ ui: {} })

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

  it('uses deleted workspace entries when scheduling purge', () => {
    const now = Date.UTC(2026, 4, 20)
    const state: AppState = {
      ...appStateWithSpaces([space('live', 7, workspace())]),
      deletedSpaces: [
        deletedSpaceEntry('deleted-space', now - 2 * AUTO_PURGE_DAY_MS, space('deleted-space', 3, workspace())),
      ],
      deletedDomains: [
        deletedDomainEntry('deleted-domain', now - 4 * AUTO_PURGE_DAY_MS, [
          space('deleted-domain-space', 10, workspace()),
        ]),
      ],
    }

    expect(getNextAutoPurgeTimeForAppState(state, now)).toBe(now + AUTO_PURGE_DAY_MS)
  })

  it('purges expired deleted workspace entries using their retention windows', () => {
    const now = Date.UTC(2026, 4, 20)
    const state: AppState = {
      ...appStateWithSpaces([space('live', 7, workspace())]),
      deletedSpaces: [
        deletedSpaceEntry('expired-space', now - 8 * AUTO_PURGE_DAY_MS, space('expired-space', 7, workspace())),
        deletedSpaceEntry('fresh-space', now - 6 * AUTO_PURGE_DAY_MS, space('fresh-space', 7, workspace())),
      ],
      deletedDomains: [
        deletedDomainEntry('expired-domain', now - 4 * AUTO_PURGE_DAY_MS, [
          space('expired-domain-space', 3, workspace()),
        ]),
        deletedDomainEntry('retained-domain', now - 8 * AUTO_PURGE_DAY_MS, [
          space('retained-domain-space', 10, workspace()),
        ]),
      ],
    }

    const next = applyAutoPurgeToAppState(state, now)

    expect(getNextAutoPurgeTimeForAppState(state, now)).toBe(now)
    expect(next.deletedSpaces?.map((entry) => entry.id)).toEqual(['fresh-space'])
    expect(next.deletedDomains?.map((entry) => entry.id)).toEqual(['retained-domain'])
  })

  it('keeps deleted domains until nested deleted spaces reach their own retention', () => {
    const now = Date.UTC(2026, 4, 20)
    const state: AppState = {
      ...appStateWithSpaces([space('live', 7, workspace())]),
      deletedDomains: [
        deletedDomainEntry(
          'deleted-domain',
          now - 10 * AUTO_PURGE_DAY_MS,
          [space('deleted-domain-space', 3, workspace())],
          [
            deletedSpaceEntry(
              'nested-fresh-space',
              now - AUTO_PURGE_DAY_MS,
              space('nested-fresh-space', 30, workspace()),
            ),
          ],
        ),
      ],
    }

    const next = applyAutoPurgeToAppState(state, now)

    expect(getNextAutoPurgeTimeForAppState(state, now)).toBe(now + 29 * AUTO_PURGE_DAY_MS)
    expect(next.deletedDomains?.map((entry) => entry.id)).toEqual(['deleted-domain'])
  })

  it('purges nested trash inside retained deleted workspace entries', () => {
    const now = Date.UTC(2026, 4, 20)
    const expiredParent = deletedTab('expired-parent', now - 3 * AUTO_PURGE_DAY_MS)
    const freshParent = deletedTab('fresh-parent', now - AUTO_PURGE_DAY_MS)
    const state: AppState = {
      ...appStateWithSpaces([space('live', 7, workspace())]),
      deletedSpaces: [
        deletedSpaceEntry(
          'deleted-space',
          now - AUTO_PURGE_DAY_MS,
          space('deleted-space', 2, workspace([expiredParent, freshParent])),
        ),
      ],
      deletedDomains: [
        deletedDomainEntry(
          'deleted-domain',
          now - AUTO_PURGE_DAY_MS,
          [space('deleted-domain-space', 2, workspace([expiredParent, freshParent]))],
          [
            deletedSpaceEntry(
              'nested-expired-space',
              now - 3 * AUTO_PURGE_DAY_MS,
              space('nested-expired-space', 2, workspace()),
            ),
            deletedSpaceEntry(
              'nested-fresh-space',
              now - AUTO_PURGE_DAY_MS,
              space('nested-fresh-space', 2, workspace([expiredParent])),
            ),
          ],
        ),
      ],
    }

    const next = applyAutoPurgeToAppState(state, now)

    expect(next.deletedSpaces?.[0]?.space.data.deletedTabs).toEqual([freshParent])
    expect(next.deletedDomains?.[0]?.domain.spaces[0]?.data.deletedTabs).toEqual([freshParent])
    expect(next.deletedDomains?.[0]?.deletedSpaces.map((entry) => entry.id)).toEqual(['nested-fresh-space'])
    expect(next.deletedDomains?.[0]?.deletedSpaces[0]?.space.data.deletedTabs).toEqual([])
  })
})
