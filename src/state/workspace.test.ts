import { describe, expect, it } from 'vitest'
import type { DeletedSubTabEntry, DeletedTabEntry, SubTab, Tab, WorkspaceData } from '../types/app'
import {
  applyAutoPurgeToWorkspace,
  AUTO_PURGE_DAY_MS,
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
