import { describe, expect, it } from 'vitest'
import type { Tab } from '../types/app'
import {
  applyStageManagerParentModifierClick,
  applyStageManagerSubTabModifierClick,
  buildStageManagerSelectionSnapshot,
  createEmptyStageManagerParentSelection,
  createStageManagerSelectionState,
  cycleStageManagerParentSelection,
  toggleStageManagerSubTabSelection,
} from './selection'

const tab: Tab = {
  id: 'parent-1',
  title: 'Parent',
  noteBodyId: 'body-parent',
  homeContent: 'home',
  activeSubTabId: null,
  subTabs: [
    { id: 'sub-1', title: 'One', noteBodyId: 'body-1', content: 'one' },
    { id: 'sub-2', title: 'Two', noteBodyId: 'body-2', content: 'two' },
  ],
}

describe('stage manager selection', () => {
  it('cycles parent selection through full and none states', () => {
    const full = cycleStageManagerParentSelection(tab, createEmptyStageManagerParentSelection())
    expect(full).toMatchObject({
      mode: 'full',
      selectedSubTabIds: ['sub-1', 'sub-2'],
    })

    const none = cycleStageManagerParentSelection(tab, full)
    expect(none).toMatchObject({
      mode: 'none',
      selectedSubTabIds: [],
    })
  })

  it('preserves a cached partial selection while cycling', () => {
    const partial = toggleStageManagerSubTabSelection(tab, createEmptyStageManagerParentSelection(), 'sub-1')
    const full = cycleStageManagerParentSelection(tab, partial)
    const restoredPartial = cycleStageManagerParentSelection(tab, full)

    expect(restoredPartial).toMatchObject({
      mode: 'partial',
      selectedSubTabIds: ['sub-1'],
      partialDirection: 'toward-none',
    })
  })

  it('builds snapshots with full parents and loose selected subtabs', () => {
    const otherTab: Tab = {
      ...tab,
      id: 'parent-2',
      subTabs: [{ id: 'sub-3', title: 'Three', noteBodyId: 'body-3', content: 'three' }],
    }
    const snapshot = buildStageManagerSelectionSnapshot([tab, otherTab], {
      [tab.id]: cycleStageManagerParentSelection(tab, createEmptyStageManagerParentSelection()),
      [otherTab.id]: toggleStageManagerSubTabSelection(otherTab, createEmptyStageManagerParentSelection(), 'sub-3'),
    })

    expect(snapshot.fullParents.map((candidate) => candidate.id)).toEqual(['parent-1', 'parent-2'])
    expect(snapshot.looseSubTabs).toEqual([])
    expect(snapshot.hasSelection).toBe(true)
  })

  it('shift-clicking a parent selects a full parent range', () => {
    const tabs = [
      { ...tab, id: 'parent-1' },
      { ...tab, id: 'parent-2' },
      { ...tab, id: 'parent-3' },
    ]
    const result = applyStageManagerParentModifierClick({
      tabs,
      selections: createStageManagerSelectionState(tabs),
      activeTabId: 'parent-1',
      clickedTabId: 'parent-3',
      modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
      anchor: null,
    })

    expect(result.anchor).toEqual({ kind: 'parent', tabId: 'parent-1' })
    expect(tabs.map((entry) => result.selections[entry.id].mode)).toEqual(['full', 'full', 'full'])
  })

  it('ctrl/cmd-clicking parents toggles full parent selection', () => {
    const tabs = [
      { ...tab, id: 'parent-1' },
      { ...tab, id: 'parent-2' },
      { ...tab, id: 'parent-3' },
    ]
    const first = applyStageManagerParentModifierClick({
      tabs,
      selections: createStageManagerSelectionState(tabs),
      activeTabId: 'parent-1',
      clickedTabId: 'parent-3',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
      anchor: null,
    })
    const second = applyStageManagerParentModifierClick({
      tabs,
      selections: first.selections,
      activeTabId: 'parent-1',
      clickedTabId: 'parent-1',
      modifiers: { shiftKey: false, ctrlKey: false, metaKey: true },
      anchor: first.anchor,
    })

    expect(first.selections['parent-1'].mode).toBe('full')
    expect(first.selections['parent-3'].mode).toBe('full')
    expect(second.selections['parent-1'].mode).toBe('none')
    expect(second.selections['parent-3'].mode).toBe('full')
  })

  it('shift-clicking sub-tabs selects a range and normalizes to full when all sub-tabs are selected', () => {
    const parent: Tab = {
      ...tab,
      activeSubTabId: 'sub-1',
      subTabs: [
        { id: 'sub-1', title: 'One', noteBodyId: 'body-1', content: 'one' },
        { id: 'sub-2', title: 'Two', noteBodyId: 'body-2', content: 'two' },
        { id: 'sub-3', title: 'Three', noteBodyId: 'body-3', content: 'three' },
      ],
    }
    const result = applyStageManagerSubTabModifierClick({
      tabs: [parent],
      selections: createStageManagerSelectionState([parent]),
      parentTabId: parent.id,
      clickedSubTabId: 'sub-3',
      modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
      anchor: null,
    })

    expect(result.anchor).toEqual({ kind: 'subtab', parentTabId: parent.id, subTabId: 'sub-1' })
    expect(result.selections[parent.id]).toMatchObject({
      mode: 'full',
      selectedSubTabIds: ['sub-1', 'sub-2', 'sub-3'],
    })
  })

  it('ctrl/cmd-clicking sub-tabs toggles a partial parent selection', () => {
    const parent: Tab = {
      ...tab,
      activeSubTabId: 'sub-1',
      subTabs: [
        { id: 'sub-1', title: 'One', noteBodyId: 'body-1', content: 'one' },
        { id: 'sub-2', title: 'Two', noteBodyId: 'body-2', content: 'two' },
        { id: 'sub-3', title: 'Three', noteBodyId: 'body-3', content: 'three' },
      ],
    }
    const first = applyStageManagerSubTabModifierClick({
      tabs: [parent],
      selections: createStageManagerSelectionState([parent]),
      parentTabId: parent.id,
      clickedSubTabId: 'sub-3',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
      anchor: null,
    })
    const second = applyStageManagerSubTabModifierClick({
      tabs: [parent],
      selections: first.selections,
      parentTabId: parent.id,
      clickedSubTabId: 'sub-1',
      modifiers: { shiftKey: false, ctrlKey: false, metaKey: true },
      anchor: first.anchor,
    })

    expect(first.selections[parent.id]).toMatchObject({
      mode: 'partial',
      selectedSubTabIds: ['sub-1', 'sub-3'],
    })
    expect(second.selections[parent.id]).toMatchObject({
      mode: 'partial',
      selectedSubTabIds: ['sub-3'],
    })
  })
})
