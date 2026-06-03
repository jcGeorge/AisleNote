import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { moveSpaceToDomain } from '../state/domains'
import type { AppState, Domain, Space, SubTab, Tab, WorkspaceData } from '../types/app'
import {
  moveHierarchyDropRequestItemToTrash,
  moveParentTabsToSpace,
  moveSubTabsToParentInSpace,
} from './arrange-hierarchy'

function subTab(id: string, title = id): SubTab {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
  }
}

function tab(id: string, title = id, subTabs: SubTab[] = []): Tab {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
    activeSubTabId: subTabs[0]?.id ?? null,
    subTabs,
  }
}

function workspace(tabs: Tab[], activeTabId = tabs[0]?.id ?? 'missing'): WorkspaceData {
  return {
    activeTabId,
    tabs,
    deletedTabs: [],
    deletedSubTabs: [],
  }
}

function space(id: string, tabs: Tab[]): Space {
  return {
    id,
    name: id,
    settings: { autoRemoveDeletedDays: 7 },
    data: workspace(tabs),
  }
}

function appState(domains: Domain[], activeDomainId: string, activeSpaceId: string): AppState {
  const activeDomain = domains.find((domain) => domain.id === activeDomainId) ?? domains[0]
  const activeSpaces = activeDomain?.spaces ?? []
  return {
    theme: 'dark',
    activeDomainId,
    domains,
    noteBodies: [],
    activeSpaceId,
    spaces: activeSpaces,
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
      showParentHomeTab: true,
      stageManagerOpenDestinationAfterApply: true,
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'visuals',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

function domain(id: string, spaces: Space[], activeSpaceId = spaces[0]?.id ?? ''): Domain {
  return {
    id,
    name: id,
    activeSpaceId,
    spaces,
  }
}

describe('arrange hierarchy moves', () => {
  it('moves selected parent tabs to a target space as an ordered block', () => {
    const sourceA = tab('parent-a')
    const sourceB = tab('parent-b')
    const target = tab('parent-c')
    const sourceSpace = space('space-a', [sourceA, sourceB])
    const targetSpace = space('space-b', [target])
    const state = appState([domain('domain-a', [sourceSpace, targetSpace], 'space-a')], 'domain-a', 'space-a')

    const next = moveParentTabsToSpace(state, 'domain-a', 'space-a', ['parent-b'], 'domain-a', 'space-b', {
      createFallbackTab: () => tab('fallback'),
    })

    expect(next.activeSpaceId).toBe('space-b')
    expect(next.spaces.find((entry) => entry.id === 'space-a')?.data.tabs.map((entry) => entry.id)).toEqual(['parent-a'])
    expect(next.spaces.find((entry) => entry.id === 'space-b')?.data.tabs.map((entry) => entry.id)).toEqual([
      'parent-c',
      'parent-b',
    ])
    expect(next.spaces.find((entry) => entry.id === 'space-b')?.data.activeTabId).toBe('parent-b')
  })

  it('appends a single parent tab to a chosen space in another domain', () => {
    const sourceA = tab('parent-a')
    const sourceB = tab('parent-b')
    const target = tab('parent-c')
    const state = appState(
      [domain('domain-a', [space('source', [sourceA, sourceB])], 'source'), domain('domain-b', [space('target', [target])])],
      'domain-a',
      'source',
    )

    const next = moveParentTabsToSpace(state, 'domain-a', 'source', ['parent-a'], 'domain-b', 'target', {
      createFallbackTab: () => tab('fallback'),
    })

    const sourceAfter = next.domains.find((entry) => entry.id === 'domain-a')?.spaces[0]
    const targetAfter = next.domains.find((entry) => entry.id === 'domain-b')?.spaces[0]
    expect(sourceAfter?.data.tabs.map((entry) => entry.id)).toEqual(['parent-b'])
    expect(targetAfter?.data.tabs.map((entry) => entry.id)).toEqual(['parent-c', 'parent-a'])
    expect(next.activeDomainId).toBe('domain-b')
    expect(next.activeSpaceId).toBe('target')
    expect(next.spaces.map((entry) => entry.id)).toEqual(['target'])
  })

  it('appends multiple parent tabs to a chosen space in another domain and leaves a fallback behind', () => {
    const sourceA = tab('parent-a')
    const sourceB = tab('parent-b')
    const target = tab('parent-c')
    const state = appState(
      [domain('domain-a', [space('source', [sourceA, sourceB])], 'source'), domain('domain-b', [space('target', [target])])],
      'domain-a',
      'source',
    )

    const next = moveParentTabsToSpace(
      state,
      'domain-a',
      'source',
      ['parent-a', 'parent-b'],
      'domain-b',
      'target',
      {
        createFallbackTab: () => tab('fallback'),
      },
    )

    const sourceAfter = next.domains.find((entry) => entry.id === 'domain-a')?.spaces[0]
    const targetAfter = next.domains.find((entry) => entry.id === 'domain-b')?.spaces[0]
    expect(sourceAfter?.data.tabs.map((entry) => entry.id)).toEqual(['fallback'])
    expect(targetAfter?.data.tabs.map((entry) => entry.id)).toEqual(['parent-c', 'parent-a', 'parent-b'])
    expect(targetAfter?.data.activeTabId).toBe('parent-a')
  })

  it('moves selected parent tabs before a chosen parent in the target space', () => {
    const sourceA = tab('parent-a')
    const sourceB = tab('parent-b')
    const targetA = tab('parent-c')
    const targetB = tab('parent-d')
    const sourceSpace = space('space-a', [sourceA, sourceB])
    const targetSpace = space('space-b', [targetA, targetB])
    const state = appState([domain('domain-a', [sourceSpace, targetSpace], 'space-a')], 'domain-a', 'space-a')

    const next = moveParentTabsToSpace(state, 'domain-a', 'space-a', ['parent-b'], 'domain-a', 'space-b', {
      createFallbackTab: () => tab('fallback'),
      placement: { targetParentTabId: 'parent-c', position: 'before' },
    })

    expect(next.spaces.find((entry) => entry.id === 'space-b')?.data.tabs.map((entry) => entry.id)).toEqual([
      'parent-b',
      'parent-c',
      'parent-d',
    ])
    expect(next.spaces.find((entry) => entry.id === 'space-b')?.data.activeTabId).toBe('parent-b')
  })

  it('moves selected parent tabs after a chosen parent in the target space', () => {
    const sourceA = tab('parent-a')
    const sourceB = tab('parent-b')
    const targetA = tab('parent-c')
    const targetB = tab('parent-d')
    const sourceSpace = space('space-a', [sourceA, sourceB])
    const targetSpace = space('space-b', [targetA, targetB])
    const state = appState([domain('domain-a', [sourceSpace, targetSpace], 'space-a')], 'domain-a', 'space-a')

    const next = moveParentTabsToSpace(state, 'domain-a', 'space-a', ['parent-b'], 'domain-a', 'space-b', {
      createFallbackTab: () => tab('fallback'),
      placement: { targetParentTabId: 'parent-c', position: 'after' },
    })

    expect(next.spaces.find((entry) => entry.id === 'space-b')?.data.tabs.map((entry) => entry.id)).toEqual([
      'parent-c',
      'parent-b',
      'parent-d',
    ])
    expect(next.spaces.find((entry) => entry.id === 'space-b')?.data.activeTabId).toBe('parent-b')
  })

  it('creates a fallback tab when all parents leave the source space', () => {
    const only = tab('parent-a')
    const sourceSpace = space('space-a', [only])
    const targetSpace = space('space-b', [tab('parent-b')])
    const state = appState([domain('domain-a', [sourceSpace, targetSpace], 'space-a')], 'domain-a', 'space-a')

    const next = moveParentTabsToSpace(state, 'domain-a', 'space-a', ['parent-a'], 'domain-a', 'space-b', {
      createFallbackTab: () => tab('fallback'),
    })

    const sourceAfter = next.domains[0].spaces.find((entry) => entry.id === 'space-a')
    expect(sourceAfter?.data.tabs.map((entry) => entry.id)).toEqual(['fallback'])
    expect(sourceAfter?.data.activeTabId).toBe('fallback')
  })

  it('moves selected subtabs to a chosen parent in another space', () => {
    const moving = subTab('sub-a')
    const staying = subTab('sub-b')
    const sourceParent = tab('parent-a', 'Parent A', [moving, staying])
    const targetParent = tab('parent-b')
    const sourceSpace = space('space-a', [sourceParent])
    const targetSpace = space('space-b', [targetParent])
    const state = appState([domain('domain-a', [sourceSpace, targetSpace], 'space-a')], 'domain-a', 'space-a')

    const next = moveSubTabsToParentInSpace(
      state,
      'domain-a',
      'space-a',
      'parent-a',
      ['sub-a'],
      'domain-a',
      'space-b',
      'parent-b',
    )

    const nextSourceParent = next.domains[0].spaces
      .find((entry) => entry.id === 'space-a')
      ?.data.tabs.find((entry) => entry.id === 'parent-a')
    const nextTargetParent = next.spaces
      .find((entry) => entry.id === 'space-b')
      ?.data.tabs.find((entry) => entry.id === 'parent-b')

    expect(next.activeSpaceId).toBe('space-b')
    expect(next.spaces.find((entry) => entry.id === 'space-b')?.data.activeTabId).toBe('parent-b')
    expect(nextSourceParent?.subTabs.map((entry) => entry.id)).toEqual(['sub-b'])
    expect(nextTargetParent?.subTabs.map((entry) => entry.id)).toEqual(['sub-a'])
    expect(nextTargetParent?.activeSubTabId).toBe('sub-a')
  })

  it('moves a guided carried parent group from its source space to trash', () => {
    const sourceA = tab('parent-a', 'Parent A')
    const sourceB = tab('parent-b', 'Parent B')
    const sourceSpace = space('space-a', [sourceA, sourceB])
    const targetSpace = space('space-b', [tab('parent-c')])
    const state = appState([domain('domain-a', [sourceSpace, targetSpace], 'space-b')], 'domain-a', 'space-b')

    const result = moveHierarchyDropRequestItemToTrash(
      state,
      {
        sourceDomainId: 'domain-a',
        sourceSpaceId: 'space-a',
        item: { type: 'parent', parentTabIds: ['parent-a'] },
        target: { type: 'space', domainId: 'domain-a', spaceId: 'space-b' },
      },
      {
        createDeletedEntryId: () => 'deleted-parent-a',
        createFallbackTab: () => tab('fallback'),
      },
    )

    const nextSource = result.state.domains[0].spaces.find((entry) => entry.id === 'space-a')
    expect(result.moved).toEqual({ kind: 'parent tab', name: 'Parent A' })
    expect(nextSource?.data.tabs.map((entry) => entry.id)).toEqual(['parent-b'])
    expect(nextSource?.data.deletedTabs.map((entry) => entry.tab.id)).toEqual(['parent-a'])
    expect(result.state.activeSpaceId).toBe('space-b')
  })

  it('moves a guided carried sub-tab group from its source space to trash', () => {
    const moving = subTab('sub-a', 'Sub A')
    const staying = subTab('sub-b', 'Sub B')
    const sourceParent = tab('parent-a', 'Parent A', [moving, staying])
    const sourceSpace = space('space-a', [sourceParent])
    const targetSpace = space('space-b', [tab('parent-b')])
    const state = appState([domain('domain-a', [sourceSpace, targetSpace], 'space-b')], 'domain-a', 'space-b')

    const result = moveHierarchyDropRequestItemToTrash(
      state,
      {
        sourceDomainId: 'domain-a',
        sourceSpaceId: 'space-a',
        item: { type: 'subtab', parentTabId: 'parent-a', subTabIds: ['sub-a'] },
        target: { type: 'space', domainId: 'domain-a', spaceId: 'space-b' },
      },
      {
        createDeletedEntryId: () => 'deleted-sub-a',
        createFallbackTab: () => tab('fallback'),
      },
    )

    const nextSourceParent = result.state.domains[0].spaces
      .find((entry) => entry.id === 'space-a')
      ?.data.tabs.find((entry) => entry.id === 'parent-a')
    expect(result.moved).toEqual({ kind: 'tab', name: 'Sub A' })
    expect(nextSourceParent?.subTabs.map((entry) => entry.id)).toEqual(['sub-b'])
    expect(result.state.domains[0].spaces.find((entry) => entry.id === 'space-a')?.data.deletedSubTabs.map((entry) => entry.subTab.id)).toEqual(['sub-a'])
    expect(result.state.activeSpaceId).toBe('space-b')
  })

  it('moves a space to another domain by appending and focusing it', () => {
    const sourceSpace = space('space-a', [tab('parent-a')])
    const stayingSpace = space('space-b', [tab('parent-b')])
    const targetSpace = space('space-c', [tab('parent-c')])
    const state = appState(
      [domain('domain-a', [sourceSpace, stayingSpace], 'space-a'), domain('domain-b', [targetSpace], 'space-c')],
      'domain-a',
      'space-a',
    )

    const result = moveSpaceToDomain(state, 'domain-a', 'space-a', 'domain-b')

    expect(result.changed).toBe(true)
    expect(result.state.activeDomainId).toBe('domain-b')
    expect(result.state.activeSpaceId).toBe('space-a')
    expect(result.state.domains.find((entry) => entry.id === 'domain-a')?.spaces.map((entry) => entry.id)).toEqual([
      'space-b',
    ])
    expect(result.state.domains.find((entry) => entry.id === 'domain-b')?.spaces.map((entry) => entry.id)).toEqual([
      'space-c',
      'space-a',
    ])
  })

  it('moves the last space out of a domain and leaves one fallback space behind', () => {
    const fallbackSpace = {
      ...space('fallback-space', [tab('fallback-tab', 'tab')]),
      name: 'space',
    }
    const state = appState(
      [domain('domain-a', [space('space-a', [tab('parent-a')])]), domain('domain-b', [space('space-b', [tab('parent-b')])])],
      'domain-a',
      'space-a',
    )

    const result = moveSpaceToDomain(state, 'domain-a', 'space-a', 'domain-b', {
      createFallbackSpace: () => fallbackSpace,
    })

    const sourceDomain = result.state.domains.find((entry) => entry.id === 'domain-a')
    const targetDomain = result.state.domains.find((entry) => entry.id === 'domain-b')
    expect(result.changed).toBe(true)
    expect(sourceDomain?.activeSpaceId).toBe('fallback-space')
    expect(sourceDomain?.spaces.map((entry) => entry.id)).toEqual(['fallback-space'])
    expect(sourceDomain?.spaces[0].name).toBe('space')
    expect(sourceDomain?.spaces[0].data.tabs.map((entry) => entry.title)).toEqual(['tab'])
    expect(targetDomain?.spaces.map((entry) => entry.id)).toEqual(['space-b', 'space-a'])
    expect(result.state.activeDomainId).toBe('domain-b')
    expect(result.state.activeSpaceId).toBe('space-a')
  })
})
