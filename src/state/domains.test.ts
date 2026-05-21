import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, Domain, Space, WorkspaceData } from '../types/app'
import { createDomain, moveDomainWithinState, removeDomain, setActiveDomain, setActiveSpaceInActiveDomain } from './domains'
import { createReservedIdAllocator } from './navigation-ids'

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

  it('removes a domain and falls back when deleting the active domain', () => {
    const next = removeDomain(makeState(), 'domain-a')

    expect(next.domains.map((domain) => domain.id)).toEqual(['domain-b'])
    expect(next.activeDomainId).toBe('domain-b')
    expect(next.activeSpaceId).toBe('space-c')
  })

  it('keeps at least one domain when removing domains', () => {
    const state = removeDomain(makeState(), 'domain-a')

    expect(removeDomain(state, 'domain-b')).toBe(state)
  })

  it('moves domains by insertion without changing the active domain', () => {
    const next = moveDomainWithinState(makeState(), 'domain-a', 'domain-b', 'after')

    expect(next.domains.map((domain) => domain.id)).toEqual(['domain-b', 'domain-a'])
    expect(next.activeDomainId).toBe('domain-a')
    expect(next.activeSpaceId).toBe('space-a')
  })
})

describe('domain id allocation', () => {
  it('creates domain and initial space ids from a collision-safe allocator', () => {
    const values = ['space-existing', 'space-new', 'tab-existing', 'tab-new', 'tab-body', 'sub-new', 'sub-body', 'domain-existing', 'domain-new']
    const allocate = createReservedIdAllocator(['domain-existing', 'space-existing', 'tab-existing'], () => values.shift() ?? 'fallback')

    const domain = createDomain('New Domain', allocate)

    expect(domain.id).toBe('domain-new')
    expect(domain.activeSpaceId).toBe('space-new')
    expect(domain.spaces[0].id).toBe('space-new')
    expect(domain.spaces[0].data.activeTabId).toBe('tab-new')
  })
})
