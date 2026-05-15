import { describe, expect, it } from 'vitest'
import { moveArrangeItemToTrash } from './arrange-trash'
import { isPointInsideRect } from './arrange-utils'
import type { SubTab, Tab, WorkspaceData } from '../types/app'

function subTab(id: string, title = id): SubTab {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
    content: `${title} content`,
  }
}

function tab(id: string, title = id, subTabs: SubTab[] = []): Tab {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
    homeContent: `${title} home`,
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

describe('arrange trash workspace helper', () => {
  it('moves a parent tab with its subtabs to deleted tabs', () => {
    const child = subTab('sub-1')
    const first = tab('tab-1', 'First', [child])
    const second = tab('tab-2', 'Second')
    const next = moveArrangeItemToTrash(
      workspace([first, second], 'tab-1'),
      { type: 'tab', tabId: 'tab-1' },
      { deletedAt: 123, createDeletedEntryId: () => 'deleted-tab-1' },
    )

    expect(next.tabs.map((entry) => entry.id)).toEqual(['tab-2'])
    expect(next.activeTabId).toBe('tab-2')
    expect(next.deletedTabs).toEqual([
      {
        id: 'deleted-tab-1',
        tab: first,
        deletedAt: 123,
      },
    ])
    expect(next.deletedTabs[0].tab.subTabs).toEqual([child])
  })

  it('creates a fallback tab when the last parent tab is moved to trash', () => {
    const onlyTab = tab('tab-1', 'Only')
    const fallback = tab('fallback', 'Fallback')
    const next = moveArrangeItemToTrash(
      workspace([onlyTab], 'tab-1'),
      { type: 'tab', tabId: 'tab-1' },
      {
        deletedAt: 123,
        createDeletedEntryId: () => 'deleted-tab-1',
        createFallbackTab: () => fallback,
      },
    )

    expect(next.tabs).toEqual([fallback])
    expect(next.activeTabId).toBe('fallback')
    expect(next.deletedTabs[0]).toMatchObject({ id: 'deleted-tab-1', tab: onlyTab, deletedAt: 123 })
  })

  it('moves a subtab to deleted subtabs and clears the active subtab', () => {
    const child = subTab('sub-1', 'Child')
    const parent = tab('tab-1', 'Parent', [child, subTab('sub-2')])
    const next = moveArrangeItemToTrash(
      workspace([parent], 'tab-1'),
      { type: 'subtab', parentTabId: 'tab-1', subTabId: 'sub-1' },
      { deletedAt: 123, createDeletedEntryId: () => 'deleted-sub-1' },
    )

    expect(next.tabs[0].activeSubTabId).toBeNull()
    expect(next.tabs[0].subTabs.map((entry) => entry.id)).toEqual(['sub-2'])
    expect(next.deletedSubTabs).toEqual([
      {
        id: 'deleted-sub-1',
        parentTabId: 'tab-1',
        parentTabTitle: 'Parent',
        subTab: child,
        deletedAt: 123,
      },
    ])
  })

  it('returns the same workspace for missing parent or subtab ids', () => {
    const data = workspace([tab('tab-1', 'Parent', [subTab('sub-1')])], 'tab-1')

    expect(moveArrangeItemToTrash(data, { type: 'tab', tabId: 'missing' })).toBe(data)
    expect(moveArrangeItemToTrash(data, { type: 'subtab', parentTabId: 'missing', subTabId: 'sub-1' })).toBe(data)
    expect(moveArrangeItemToTrash(data, { type: 'subtab', parentTabId: 'tab-1', subTabId: 'missing' })).toBe(data)
  })
})

describe('arrange trash exact hit detection', () => {
  const rect = {
    left: 10,
    right: 30,
    top: 20,
    bottom: 40,
  } as DOMRect

  it('accepts points inside the rect', () => {
    expect(isPointInsideRect(rect, 10, 20)).toBe(true)
    expect(isPointInsideRect(rect, 20, 30)).toBe(true)
    expect(isPointInsideRect(rect, 30, 40)).toBe(true)
  })

  it('rejects points just outside the rect with no padding', () => {
    expect(isPointInsideRect(rect, 9.99, 30)).toBe(false)
    expect(isPointInsideRect(rect, 30.01, 30)).toBe(false)
    expect(isPointInsideRect(rect, 20, 19.99)).toBe(false)
    expect(isPointInsideRect(rect, 20, 40.01)).toBe(false)
  })
})
