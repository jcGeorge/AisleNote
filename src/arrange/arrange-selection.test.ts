import { describe, expect, it } from 'vitest'
import type { ArrangeSelectionState, SubTab, Tab, WorkspaceData } from '../types/app'
import {
  EMPTY_ARRANGE_SELECTION,
  moveSelectedItemsByInsertion,
  moveSelectedParentTabsToTrash,
  moveSelectedSubTabsToParentTab,
  moveSelectedSubTabsToTrash,
  updateArrangeSelectionForClick,
} from './arrange-selection'

function subTab(id: string, title = id): SubTab {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
    content: `${title} content`,
  }
}

function tab(id: string, title = id, subTabs: SubTab[] = [], activeSubTabId = subTabs[0]?.id ?? null): Tab {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
    homeContent: `${title} home`,
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

const noSelection: ArrangeSelectionState = EMPTY_ARRANGE_SELECTION

describe('arrange modifier selection', () => {
  it('selects a parent range from the active parent on first shift-click', () => {
    const next = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'parent',
      itemId: 'parent-4',
      orderedIds: ['parent-1', 'parent-2', 'parent-3', 'parent-4'],
      currentId: 'parent-2',
      modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
    })

    expect(next).toMatchObject({
      kind: 'parent',
      selectedIds: ['parent-2', 'parent-3', 'parent-4'],
      anchorId: 'parent-2',
    })
  })

  it('selects a sub-tab range from the active sub-tab on first shift-click', () => {
    const next = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'subtab',
      parentTabId: 'parent-1',
      itemId: 'sub-4',
      orderedIds: ['sub-1', 'sub-2', 'sub-3', 'sub-4'],
      currentId: 'sub-2',
      modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
    })

    expect(next).toMatchObject({
      kind: 'subtab',
      parentTabId: 'parent-1',
      selectedIds: ['sub-2', 'sub-3', 'sub-4'],
      anchorId: 'sub-2',
    })
  })

  it('ctrl/cmd toggles while seeding the current same-kind item on first modifier click', () => {
    const first = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'parent',
      itemId: 'parent-3',
      orderedIds: ['parent-1', 'parent-2', 'parent-3'],
      currentId: 'parent-1',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    })
    const second = updateArrangeSelectionForClick({
      selection: first,
      kind: 'parent',
      itemId: 'parent-1',
      orderedIds: ['parent-1', 'parent-2', 'parent-3'],
      currentId: 'parent-1',
      modifiers: { shiftKey: false, ctrlKey: false, metaKey: true },
    })

    expect(first.selectedIds).toEqual(['parent-1', 'parent-3'])
    expect(second.selectedIds).toEqual(['parent-3'])
  })

  it('switching selection kind clears the previous homogeneous group', () => {
    const parentSelection = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'parent',
      itemId: 'parent-2',
      orderedIds: ['parent-1', 'parent-2'],
      currentId: 'parent-1',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    })
    const subTabSelection = updateArrangeSelectionForClick({
      selection: parentSelection,
      kind: 'subtab',
      parentTabId: 'parent-1',
      itemId: 'sub-2',
      orderedIds: ['sub-1', 'sub-2'],
      currentId: 'sub-1',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    })

    expect(parentSelection.selectedIds).toEqual(['parent-1', 'parent-2'])
    expect(subTabSelection).toMatchObject({
      kind: 'subtab',
      parentTabId: 'parent-1',
      selectedIds: ['sub-1', 'sub-2'],
    })
  })
})

describe('arrange group operations', () => {
  it('reorders selected parents as one ordered block', () => {
    const parents = [tab('parent-1'), tab('parent-2'), tab('parent-3'), tab('parent-4')]
    const next = moveSelectedItemsByInsertion(parents, ['parent-2', 'parent-3'], 'parent-4', 'after')

    expect(next.map((entry) => entry.id)).toEqual(['parent-1', 'parent-4', 'parent-2', 'parent-3'])
    expect(moveSelectedItemsByInsertion(parents, ['parent-2', 'parent-3'], 'parent-3', 'after')).toBe(parents)
  })

  it('reorders selected sub-tabs as one ordered block', () => {
    const subTabs = [subTab('sub-1'), subTab('sub-2'), subTab('sub-3'), subTab('sub-4')]
    const next = moveSelectedItemsByInsertion(subTabs, ['sub-2', 'sub-3'], 'sub-1', 'before')

    expect(next.map((entry) => entry.id)).toEqual(['sub-2', 'sub-3', 'sub-1', 'sub-4'])
  })

  it('moves selected sub-tabs to another parent in source order', () => {
    const source = tab('parent-1', 'Source', [subTab('sub-1'), subTab('sub-2'), subTab('sub-3')], 'sub-2')
    const target = tab('parent-2', 'Target', [subTab('sub-4')], 'sub-4')
    const next = moveSelectedSubTabsToParentTab(workspace([source, target], source.id), source.id, ['sub-1', 'sub-3'], target.id)

    expect(next.activeTabId).toBe(target.id)
    expect(next.tabs.find((entry) => entry.id === source.id)?.subTabs.map((entry) => entry.id)).toEqual(['sub-2'])
    expect(next.tabs.find((entry) => entry.id === source.id)?.activeSubTabId).toBe('sub-2')
    expect(next.tabs.find((entry) => entry.id === target.id)?.activeSubTabId).toBe('sub-1')
    expect(next.tabs.find((entry) => entry.id === target.id)?.subTabs.map((entry) => entry.id)).toEqual([
      'sub-4',
      'sub-1',
      'sub-3',
    ])
  })

  it('moves selected parents to trash and creates a fallback when all parents are moved', () => {
    const only = tab('parent-1', 'Only')
    const fallback = tab('fallback', 'Fallback')
    const next = moveSelectedParentTabsToTrash(workspace([only], only.id), [only.id], {
      deletedAt: 123,
      createDeletedEntryId: () => 'deleted-parent-1',
      createFallbackTab: () => fallback,
    })

    expect(next.tabs).toEqual([fallback])
    expect(next.activeTabId).toBe(fallback.id)
    expect(next.deletedTabs).toEqual([{ id: 'deleted-parent-1', tab: only, deletedAt: 123 }])
  })

  it('moves selected sub-tabs to trash in parent order', () => {
    const source = tab('parent-1', 'Parent', [subTab('sub-1'), subTab('sub-2'), subTab('sub-3')], 'sub-2')
    const deletedIds = ['deleted-sub-1', 'deleted-sub-2']
    const next = moveSelectedSubTabsToTrash(workspace([source], source.id), source.id, ['sub-1', 'sub-2'], {
      deletedAt: 123,
      createDeletedEntryId: () => deletedIds.shift() ?? 'missing',
    })

    expect(next.tabs[0].activeSubTabId).toBeNull()
    expect(next.tabs[0].subTabs.map((entry) => entry.id)).toEqual(['sub-3'])
    expect(next.deletedSubTabs.map((entry) => entry.id)).toEqual(['deleted-sub-1', 'deleted-sub-2'])
    expect(next.deletedSubTabs.map((entry) => entry.subTab.id)).toEqual(['sub-1', 'sub-2'])
  })
})
