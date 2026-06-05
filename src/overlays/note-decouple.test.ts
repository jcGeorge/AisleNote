import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { buildNoteLocationKey, getLocationInfo } from '../notes/note-locations'
import { getAisleMarkdown } from '../notes/note-markdown'
import type { AppState, NoteAisle, NoteLocation, Space } from '../types/app'
import { decoupleNoteLocationsInState } from './note-decouple'

const sourceLocation: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-source',
  subTabId: null,
}

const peerLocation: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-peer',
  subTabId: null,
}

const aisleMarkdown = (state: AppState, aisle: NoteAisle | null | undefined) =>
  aisle ? getAisleMarkdown(aisle, state.noteAisleBodies) : ''

function createDecoupleTestState(): AppState {
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
          noteBodyId: 'body-shared',
          activeSubTabId: null,
          subTabs: [],
        },
        {
          id: 'tab-peer',
          title: 'Peer',
          noteBodyId: 'body-shared',
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
      {
        id: 'body-shared',
        aisles: [{ id: 'aisle-shared', aisleBodyId: 'aisle-body-shared' }],
      },
    ],
    noteAisleBodies: [
      {
        id: 'aisle-body-shared',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        markdown: 'shared authoritative text',
        frontmatter: { status: 'linked' },
        frontmatterStatus: 'valid',
      },
    ],
    hotkeys: {
      shortcuts: {
        toggleTabsTarget: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
        formatStrikethrough: '',
        cycleParentTabNext: '',
        cycleParentTabPrev: '',
        cycleSubTabNext: '',
        cycleSubTabPrev: '',
        cycleAislePrev: '',
        cycleAisleNext: '',
      },
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'normalNewLine',
          commandEnter: 'normalNewLine',
        },
        menuOperations: [],
      },
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: {
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'hotkeys',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
      decoupledItemsKeepData: true,
    },
  }
}

describe('note de-couple helpers', () => {
  it('turns de-coupled locations into independent copies with current data when keep-data is enabled', () => {
    const result = decoupleNoteLocationsInState(
      createDecoupleTestState(),
      'body-shared',
      new Set([buildNoteLocationKey(sourceLocation)]),
      true,
    )
    const sourceInfo = getLocationInfo(result, sourceLocation)
    const peerInfo = getLocationInfo(result, peerLocation)
    const peerBody = result.noteBodies.find((body) => body.id === peerInfo.noteBodyId)
    const peerAisleBody = result.noteAisleBodies?.find((body) => body.id === peerBody?.aisles[0]?.aisleBodyId)

    expect(sourceInfo.noteBodyId).toBe('body-shared')
    expect(peerInfo.noteBodyId).not.toBe('body-shared')
    expect(aisleMarkdown(result, peerBody?.aisles[0])).toBe('shared authoritative text')
    expect(peerAisleBody?.markdown).toBe('shared authoritative text')
    expect(peerAisleBody?.frontmatter).toEqual({ status: 'linked' })
  })

  it('turns de-coupled locations into empty independent notes when keep-data is disabled', () => {
    const result = decoupleNoteLocationsInState(
      createDecoupleTestState(),
      'body-shared',
      new Set([buildNoteLocationKey(sourceLocation)]),
      false,
    )
    const peerBodyId = getLocationInfo(result, peerLocation).noteBodyId
    const peerBody = result.noteBodies.find((body) => body.id === peerBodyId)
    const peerAisleBody = result.noteAisleBodies?.find((body) => body.id === peerBody?.aisles[0]?.aisleBodyId)

    expect(peerBodyId).not.toBe('body-shared')
    expect(aisleMarkdown(result, peerBody?.aisles[0])).toBe('')
    expect(peerAisleBody?.markdown).toBe('')
  })
})
