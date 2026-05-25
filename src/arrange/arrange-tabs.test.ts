import { describe, expect, it } from 'vitest'
import type { SubTab, Tab, WorkspaceData } from '../types/app'
import { moveSubTabToParentTab } from './arrange-tabs'

function subTab(id: string, title = id): SubTab {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
  }
}

function tab(id: string, title = id, subTabs: SubTab[] = [], activeSubTabId = subTabs[0]?.id ?? null): Tab {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
    activeSubTabId,
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

describe('arrange tab workspace helper', () => {
  it('moves a sub-tab to another parent, appends it, and selects the moved sub-tab', () => {
    const moved = subTab('sub-a')
    const source = tab('parent-a', 'A', [moved, subTab('sub-b')], moved.id)
    const existingTargetSubTab = subTab('sub-c')
    const target = tab('parent-b', 'B', [existingTargetSubTab], existingTargetSubTab.id)

    const next = moveSubTabToParentTab(workspace([source, target], source.id), source.id, moved.id, target.id)

    expect(next.activeTabId).toBe(target.id)
    expect(next.tabs.find((entry) => entry.id === source.id)?.activeSubTabId).toBeNull()
    expect(next.tabs.find((entry) => entry.id === source.id)?.subTabs.map((entry) => entry.id)).toEqual(['sub-b'])
    expect(next.tabs.find((entry) => entry.id === target.id)?.activeSubTabId).toBe(moved.id)
    expect(next.tabs.find((entry) => entry.id === target.id)?.subTabs.map((entry) => entry.id)).toEqual(['sub-c', moved.id])
  })

  it('preserves the source parent active sub-tab when moving a different sub-tab', () => {
    const moved = subTab('sub-a')
    const remainingActive = subTab('sub-b')
    const source = tab('parent-a', 'A', [moved, remainingActive], remainingActive.id)
    const target = tab('parent-b')

    const next = moveSubTabToParentTab(workspace([source, target], source.id), source.id, moved.id, target.id)

    expect(next.activeTabId).toBe(target.id)
    expect(next.tabs.find((entry) => entry.id === source.id)?.activeSubTabId).toBe(remainingActive.id)
    expect(next.tabs.find((entry) => entry.id === target.id)?.activeSubTabId).toBe(moved.id)
  })

  it('returns the same workspace for invalid moves', () => {
    const moved = subTab('sub-a')
    const source = tab('parent-a', 'A', [moved])
    const target = tab('parent-b')
    const duplicateTarget = tab('parent-c', 'C', [moved])
    const data = workspace([source, target, duplicateTarget], source.id)

    expect(moveSubTabToParentTab(data, source.id, moved.id, source.id)).toBe(data)
    expect(moveSubTabToParentTab(data, 'missing', moved.id, target.id)).toBe(data)
    expect(moveSubTabToParentTab(data, source.id, moved.id, 'missing')).toBe(data)
    expect(moveSubTabToParentTab(data, source.id, 'missing', target.id)).toBe(data)
    expect(moveSubTabToParentTab(data, source.id, moved.id, duplicateTarget.id)).toBe(data)
  })
})
