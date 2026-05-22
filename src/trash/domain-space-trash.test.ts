import { describe, expect, it } from 'vitest'
import { createDomainFromSpaces } from '../state/domains'
import { createSpace } from '../state/workspace'
import type { AppState, Domain, Space, SubTab, Tab } from '../types/app'
import {
  moveDomainToTrash,
  moveSpaceToTrash,
  restoreDeletedDomainTrashItem,
  restoreTrashDomain,
  restoreTrashSpace,
} from './domain-space-trash'

function workspaceSpace(id: string, name: string): Space {
  return {
    ...createSpace(name, () => `${id}-generated`),
    id,
    name,
  }
}

function subTab(id: string): SubTab {
  return {
    id,
    title: id,
    noteBodyId: `${id}-body`,
    content: '',
  }
}

function tab(id: string, subTabs: SubTab[] = []): Tab {
  return {
    id,
    title: id,
    noteBodyId: `${id}-body`,
    homeContent: '',
    activeSubTabId: subTabs[0]?.id ?? null,
    subTabs,
  }
}

function workspaceSpaceWithTabs(id: string, name: string, tabs: Tab[]): Space {
  return {
    id,
    name,
    settings: { autoRemoveDeletedDays: 7 },
    data: {
      activeTabId: tabs[0]?.id ?? '',
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function domain(id: string, name: string, spaces: Space[]): Domain {
  return createDomainFromSpaces(name, spaces, {
    id,
    activeSpaceId: spaces[0]?.id,
    createId: () => `${id}-generated`,
  })
}

function appState(domains: Domain[]): AppState {
  const activeDomain = domains[0]
  return {
    theme: 'dawn',
    activeDomainId: activeDomain.id,
    domains,
    deletedDomains: [],
    deletedSpaces: [],
    noteBodies: [],
    activeSpaceId: activeDomain.activeSpaceId,
    spaces: activeDomain.spaces,
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
        shortcuts: { controlEnter: 'normalNewLine', shiftEnter: 'normalNewLine', commandEnter: 'normalNewLine' },
        menuOperations: [],
      },
      enableMouseBackForward: true,
      enableGenericHistoryHotkeys: true,
    },
    frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
    ui: {
      showParentHomeTab: true,
      stageManagerOpenDestinationAfterApply: true,
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'visuals',
      customThemePalette: null,
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

describe('domain and space trash helpers', () => {
  it('moves and restores a space under its original live domain', () => {
    const first = workspaceSpace('space-a', 'A')
    const second = workspaceSpace('space-b', 'B')
    const initial = appState([domain('domain-a', 'Domain A', [first, second])])

    const moved = moveSpaceToTrash(initial, 'domain-a', 'space-b', () => 'deleted-space-a')

    expect(moved.changed).toBe(true)
    expect(moved.state.domains[0].spaces.map((space) => space.id)).toEqual(['space-a'])
    expect(moved.state.deletedSpaces?.[0]).toMatchObject({
      id: 'deleted-space-a',
      domainId: 'domain-a',
      space: expect.objectContaining({ id: 'space-b' }),
    })

    const restored = restoreTrashSpace(moved.state, {
      source: 'deleted-space',
      deletedSpaceEntryId: 'deleted-space-a',
      domainId: 'domain-a',
    })

    expect(restored.changed).toBe(true)
    expect(restored.state.domains[0].spaces.map((space) => space.id)).toEqual(['space-a', 'space-b'])
    expect(restored.state.deletedSpaces).toEqual([])
  })

  it('moves deleted spaces into a deleted domain and restores them after the domain returns', () => {
    const first = workspaceSpace('space-a', 'A')
    const second = workspaceSpace('space-b', 'B')
    const other = domain('domain-b', 'Domain B', [workspaceSpace('space-c', 'C')])
    const initial = appState([domain('domain-a', 'Domain A', [first, second]), other])
    const withoutSpace = moveSpaceToTrash(initial, 'domain-a', 'space-b', () => 'deleted-space-a').state

    const withoutDomain = moveDomainToTrash(withoutSpace, 'domain-a', () => 'deleted-domain-a').state

    expect(withoutDomain.domains.map((entry) => entry.id)).toEqual(['domain-b'])
    expect(withoutDomain.deletedSpaces).toEqual([])
    expect(withoutDomain.deletedDomains?.[0].deletedSpaces.map((entry) => entry.id)).toEqual(['deleted-space-a'])

    const restoredDomain = restoreTrashDomain(withoutDomain, 'deleted-domain-a').state

    expect(restoredDomain.domains.map((entry) => entry.id)).toEqual(['domain-b', 'domain-a'])
    expect(restoredDomain.deletedSpaces?.map((entry) => entry.id)).toEqual(['deleted-space-a'])
  })

  it('restores a single space from a deleted domain and leaves sibling spaces in trash', () => {
    const first = workspaceSpace('space-a', 'A')
    const second = workspaceSpace('space-b', 'B')
    const other = domain('domain-b', 'Domain B', [workspaceSpace('space-c', 'C')])
    const initial = appState([domain('domain-a', 'Domain A', [first, second]), other])
    const withoutDomain = moveDomainToTrash(initial, 'domain-a', () => 'deleted-domain-a').state

    const restored = restoreTrashSpace(withoutDomain, {
      source: 'deleted-domain-space',
      deletedSpaceEntryId: null,
      deletedDomainEntryId: 'deleted-domain-a',
      domainId: 'domain-a',
      spaceId: 'space-b',
    })

    const restoredDomain = restored.state.domains.find((entry) => entry.id === 'domain-a')
    expect(restored.changed).toBe(true)
    expect(restoredDomain?.spaces.map((space) => space.id)).toEqual(['space-b'])
    expect(restored.state.deletedDomains?.[0].domain.spaces.map((space) => space.id)).toEqual(['space-a'])
  })

  it('restores a parent tab from a deleted domain as a minimal path', () => {
    const space = workspaceSpaceWithTabs('space-a', 'A', [tab('parent-a'), tab('parent-b')])
    const other = domain('domain-b', 'Domain B', [workspaceSpace('space-b', 'B')])
    const initial = appState([domain('domain-a', 'Domain A', [space]), other])
    const withoutDomain = moveDomainToTrash(initial, 'domain-a', () => 'deleted-domain-a').state

    const restored = restoreDeletedDomainTrashItem(withoutDomain, {
      type: 'trash-tab',
      source: 'deleted-domain-tab',
      deletedTabEntryId: null,
      deletedDomainEntryId: 'deleted-domain-a',
      domainId: 'domain-a',
      spaceId: 'space-a',
      parentTabId: 'parent-a',
    })

    const restoredSpace = restored.state.domains.find((entry) => entry.id === 'domain-a')?.spaces[0]
    const remainingSpace = restored.state.deletedDomains?.[0].domain.spaces[0]
    expect(restoredSpace?.data.tabs.map((entry) => entry.id)).toEqual(['parent-a'])
    expect(remainingSpace?.data.tabs.map((entry) => entry.id)).toEqual(['parent-b'])
  })

  it('restores a subtab from a deleted domain without restoring sibling subtabs', () => {
    const parent = tab('parent-a', [subTab('sub-a'), subTab('sub-b')])
    const space = workspaceSpaceWithTabs('space-a', 'A', [parent])
    const other = domain('domain-b', 'Domain B', [workspaceSpace('space-b', 'B')])
    const initial = appState([domain('domain-a', 'Domain A', [space]), other])
    const withoutDomain = moveDomainToTrash(initial, 'domain-a', () => 'deleted-domain-a').state

    const restored = restoreDeletedDomainTrashItem(withoutDomain, {
      type: 'trash-subtab',
      source: 'deleted-domain-tab',
      deletedTabEntryId: null,
      deletedDomainEntryId: 'deleted-domain-a',
      domainId: 'domain-a',
      spaceId: 'space-a',
      parentTabId: 'parent-a',
      subTabId: 'sub-a',
    })

    const restoredParent = restored.state.domains
      .find((entry) => entry.id === 'domain-a')
      ?.spaces[0].data.tabs.find((entry) => entry.id === 'parent-a')
    const remainingParent = restored.state.deletedDomains?.[0].domain.spaces[0].data.tabs.find(
      (entry) => entry.id === 'parent-a',
    )
    expect(restoredParent?.subTabs.map((entry) => entry.id)).toEqual(['sub-a'])
    expect(remainingParent?.subTabs.map((entry) => entry.id)).toEqual(['sub-b'])
  })
})
