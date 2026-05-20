import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { getLocationInfo } from '../notes/note-locations'
import type { AppState, NoteLocation, Space } from '../types/app'
import { applyNoteCopyToState } from './note-copy'

const sourceLocation: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-source',
  subTabId: null,
}

const targetLocation: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-target',
  subTabId: null,
}

function createCopyTestState(): AppState {
  const space: Space = {
    id: 'space-1',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 30 },
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
  }

  return {
    theme: 'dark',
    activeDomainId: 'domain-1',
    activeSpaceId: 'space-1',
    domains: [{ id: 'domain-1', name: 'Domain', activeSpaceId: 'space-1', spaces: [space] }],
    spaces: [space],
    noteBodies: [
      { id: 'body-source', frontmatter: null, aisles: [{ id: 'aisle-source', markdown: 'source text' }] },
      { id: 'body-target', frontmatter: null, aisles: [{ id: 'aisle-target', markdown: 'target text' }] },
    ],
    hotkeys: {
      shortcuts: {
        toggleTabTrash: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
        formatStrikethrough: '',
        cycleParentTabNext: '',
        cycleParentTabPrev: '',
        cycleSubTabNext: '',
        cycleSubTabPrev: '',
      },
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'normalNewLine',
          commandEnter: 'normalNewLine',
        },
        menuOperations: [],
      },
      enableMouseBackForward: true,
      enableGenericHistoryHotkeys: true,
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: {
      showParentHomeTab: true,
      stageManagerOpenDestinationAfterApply: true,
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'hotkeys',
      customThemePalette: null,
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

describe('note copy helpers', () => {
  it('creates an independent copy of the target body', () => {
    const result = applyNoteCopyToState(createCopyTestState(), sourceLocation, targetLocation, 'independent')

    expect(result.status).toBe('applied')
    const sourceInfo = getLocationInfo(result.state, sourceLocation)
    expect(sourceInfo.noteBodyId).not.toBe('body-source')
    expect(sourceInfo.noteBodyId).not.toBe('body-target')
    expect(result.state.noteBodies).toHaveLength(3)
    expect(result.state.noteBodies.find((body) => body.id === sourceInfo.noteBodyId)?.aisles[0]?.markdown).toBe(
      'target text',
    )
    expect(getLocationInfo(result.state, targetLocation).noteBodyId).toBe('body-target')
  })

  it('links the source to the target body without cloning', () => {
    const result = applyNoteCopyToState(createCopyTestState(), sourceLocation, targetLocation, 'linked')

    expect(result.status).toBe('applied')
    expect(getLocationInfo(result.state, sourceLocation).noteBodyId).toBe('body-target')
    expect(result.state.noteBodies).toHaveLength(2)
  })
})
