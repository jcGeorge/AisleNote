import { describe, expect, it } from 'vitest'
import type { DeletedSubTabEntry, DeletedTabEntry, SubTab, Tab, WorkspaceData } from '../types/app'
import { collectWorkspaceNavigationEntityIds, createReservedIdAllocator } from './navigation-ids'
import {
  applyAutoPurgeToWorkspace,
  AUTO_PURGE_DAY_MS,
  createDefaultWorkspaceData,
  createSpace,
  createSubTab,
  createTab,
  duplicateSpace,
  duplicateWorkspaceData,
  getNextWorkspaceTrashAutoPurgeTime,
} from './workspace'

const liveTab: Tab = {
  id: 'live-tab',
  title: 'Live',
  noteBodyId: 'live-body',
  homeContent: '',
  activeSubTabId: null,
  subTabs: [],
}

function tab(id: string): Tab {
  return {
    id,
    title: id,
    noteBodyId: `${id}-body`,
    homeContent: '',
    activeSubTabId: null,
    subTabs: [],
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

function deletedTab(id: string, deletedAt: number): DeletedTabEntry {
  return {
    id: `deleted-${id}`,
    tab: tab(id),
    deletedAt,
  }
}

function deletedSubTab(id: string, deletedAt: number): DeletedSubTabEntry {
  return {
    id: `deleted-${id}`,
    parentTabId: 'live-tab',
    parentTabTitle: 'Live',
    subTab: subTab(id),
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

describe('workspace trash auto purge', () => {
  it('does not schedule a purge when trash is empty', () => {
    expect(getNextWorkspaceTrashAutoPurgeTime(workspace(), 7, 1_000)).toBeNull()
  })

  it('uses the nearest deleted parent or sub-tab expiration', () => {
    const now = Date.UTC(2026, 4, 20)
    const data = workspace(
      [deletedTab('parent', now - 2 * AUTO_PURGE_DAY_MS)],
      [deletedSubTab('sub', now - 5 * AUTO_PURGE_DAY_MS)],
    )

    expect(getNextWorkspaceTrashAutoPurgeTime(data, 7, now)).toBe(now + 2 * AUTO_PURGE_DAY_MS)
  })

  it('returns now when any trash entry is already expired', () => {
    const now = Date.UTC(2026, 4, 20)
    const data = workspace([deletedTab('old-parent', now - 8 * AUTO_PURGE_DAY_MS)])

    expect(getNextWorkspaceTrashAutoPurgeTime(data, 7, now)).toBe(now)
  })

  it('removes expired parents and sub-tabs while keeping non-expired entries', () => {
    const now = Date.UTC(2026, 4, 20)
    const expiredParent = deletedTab('expired-parent', now - 7 * AUTO_PURGE_DAY_MS)
    const freshParent = deletedTab('fresh-parent', now - 6 * AUTO_PURGE_DAY_MS)
    const expiredSubTab = deletedSubTab('expired-sub', now - 8 * AUTO_PURGE_DAY_MS)
    const freshSubTab = deletedSubTab('fresh-sub', now - 1 * AUTO_PURGE_DAY_MS)
    const data = workspace([expiredParent, freshParent], [expiredSubTab, freshSubTab])

    const next = applyAutoPurgeToWorkspace(data, 7, now)

    expect(next.deletedTabs).toEqual([freshParent])
    expect(next.deletedSubTabs).toEqual([freshSubTab])
  })
})

describe('workspace id allocation', () => {
  it('creates parent and sub-tab ids from a collision-safe allocator', () => {
    const values = ['taken-tab', 'parent-id', 'parent-body', 'taken-sub', 'sub-id', 'sub-body']
    const allocate = createReservedIdAllocator(['taken-tab', 'taken-sub'], () => values.shift() ?? 'fallback')

    const parent = createTab('Parent', allocate)
    const child = createSubTab('Child', '', allocate)

    expect(parent.id).toBe('parent-id')
    expect(child.id).toBe('sub-id')
  })

  it('keeps onboarding sample content in the explicit default workspace only', () => {
    const data = createDefaultWorkspaceData()

    expect(data.tabs[0].title).toBe('welcome')
    expect(data.tabs[0].homeContent).toContain('This is the home note')
    expect(data.tabs[0].subTabs.map((subTab) => subTab.title)).toEqual(['list'])
  })

  it('creates a new space with an empty parent tab and no sample sub-tabs', () => {
    const existingIds = new Set(['space-collision', 'welcome-collision'])
    const values = ['space-collision', 'space-new', 'welcome-collision', 'tab-new', 'tab-body']
    const allocate = createReservedIdAllocator(existingIds, () => values.shift() ?? 'fallback')

    const space = createSpace('New Space', allocate)

    expect(space.id).toBe('space-new')
    expect(space.data.activeTabId).toBe('tab-new')
    expect(space.data.tabs[0]).toMatchObject({
      id: 'tab-new',
      title: 'tab',
      homeContent: '',
      activeSubTabId: null,
      subTabs: [],
    })
  })

  it('duplicates workspace data without reusing existing navigation ids', () => {
    const data: WorkspaceData = {
      activeTabId: 'tab-source',
      tabs: [
        {
          id: 'tab-source',
          title: 'Source',
          noteBodyId: 'body-source',
          homeContent: '',
          activeSubTabId: 'sub-source',
          subTabs: [{ id: 'sub-source', title: 'Sub', noteBodyId: 'body-sub-source', content: '' }],
        },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    }
    const existingIds = collectWorkspaceNavigationEntityIds(data)
    const values = ['tab-source', 'tab-copy', 'sub-source', 'sub-copy', 'body-sub-copy', 'body-copy']
    const allocate = createReservedIdAllocator(existingIds, () => values.shift() ?? 'fallback')

    const duplicated = duplicateWorkspaceData(data, allocate)

    expect(duplicated.activeTabId).toBe('tab-copy')
    expect(duplicated.tabs[0].id).toBe('tab-copy')
    expect(duplicated.tabs[0].subTabs[0].id).toBe('sub-copy')
  })

  it('duplicates a space with a unique space id and unique nested workspace ids', () => {
    const sourceValues = ['space-source', 'tab-source', 'tab-body-source']
    const source = createSpace('Source', createReservedIdAllocator([], () => sourceValues.shift() ?? 'fallback'))
    source.data.tabs[0] = {
      ...source.data.tabs[0],
      activeSubTabId: 'sub-source',
      subTabs: [{ id: 'sub-source', title: 'Sub', noteBodyId: 'sub-body-source', content: '' }],
    }
    const values = ['space-source', 'space-copy', 'tab-source', 'tab-copy', 'sub-source', 'sub-copy', 'sub-body-copy', 'tab-body-copy']
    const allocate = createReservedIdAllocator(collectWorkspaceNavigationEntityIds(source.data).add(source.id), () => values.shift() ?? 'fallback')

    const duplicated = duplicateSpace(source, [source.name], allocate)

    expect(duplicated.id).toBe('space-copy')
    expect(duplicated.data.tabs[0].id).toBe('tab-copy')
    expect(duplicated.data.tabs[0].subTabs[0].id).toBe('sub-copy')
  })
})
