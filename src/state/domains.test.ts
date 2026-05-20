import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, Domain, Space, WorkspaceData } from '../types/app'
import { setActiveDomain, setActiveSpaceInActiveDomain } from './domains'

const makeWorkspace = (activeTabId: string, activeSubTabId: string | null = null): WorkspaceData => ({
  activeTabId,
  tabs: [
    {
      id: 'tab-a',
      title: 'A',
      noteBodyId: 'body-a',
      homeContent: '',
      activeSubTabId,
      subTabs: [{ id: 'sub-a', title: 'A1', noteBodyId: 'body-a1', content: '' }],
    },
    {
      id: 'tab-b',
      title: 'B',
      noteBodyId: 'body-b',
      homeContent: '',
      activeSubTabId: null,
      subTabs: [],
    },
  ],
  deletedTabs: [],
  deletedSubTabs: [],
})

const makeSpace = (id: string, data: WorkspaceData): Space => ({
  id,
  name: id,
  settings: { autoRemoveDeletedDays: 7 },
  data,
})

function makeState(): AppState {
  const spaceA = makeSpace('space-a', makeWorkspace('tab-a', 'sub-a'))
  const spaceB = makeSpace('space-b', makeWorkspace('tab-b'))
  const spaceC = makeSpace('space-c', makeWorkspace('missing-tab', 'missing-sub'))
  const domainA: Domain = {
    id: 'domain-a',
    name: 'A',
    activeSpaceId: 'space-a',
    spaces: [spaceA, spaceB],
  }
  const domainB: Domain = {
    id: 'domain-b',
    name: 'B',
    activeSpaceId: 'space-c',
    spaces: [spaceC],
  }

  return {
    theme: 'dawn',
    activeDomainId: 'domain-a',
    domains: [domainA, domainB],
    noteBodies: [],
    activeSpaceId: 'space-a',
    spaces: [spaceA, spaceB],
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

describe('domain and space navigation memory', () => {
  it('opening a space restores its remembered active prime tab and sub-tab', () => {
    const next = setActiveSpaceInActiveDomain(makeState(), 'space-b')

    expect(next.activeSpaceId).toBe('space-b')
    expect(next.spaces.find((space) => space.id === 'space-b')?.data.activeTabId).toBe('tab-b')
  })

  it('opening a domain preserves its remembered active space and normalizes missing tab memory', () => {
    const next = setActiveDomain(makeState(), 'domain-b')
    const activeSpace = next.spaces.find((space) => space.id === next.activeSpaceId)

    expect(next.activeDomainId).toBe('domain-b')
    expect(next.activeSpaceId).toBe('space-c')
    expect(activeSpace?.data.activeTabId).toBe('tab-a')
    expect(activeSpace?.data.tabs[0].activeSubTabId).toBeNull()
  })
})
