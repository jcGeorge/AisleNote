import { describe, expect, it } from 'vitest'
import type { Tab } from '../types/app'
import {
  buildStageManagerSelectionSnapshot,
  createEmptyStageManagerParentSelection,
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
})
