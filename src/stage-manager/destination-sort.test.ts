import { describe, expect, it } from 'vitest'
import type { NoteBody, Tab } from '../types/app'
import {
  applyDestinationParentSubTabSort,
  applyDestinationSubTabSort,
  applyDestinationTabSort,
} from './destination-sort'

const noteBodies: NoteBody[] = [
  { id: 'body-a', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-03T00:00:00.000Z', aisles: [] },
  { id: 'body-b', createdAt: '2024-01-02T00:00:00.000Z', updatedAt: '2024-01-02T00:00:00.000Z', aisles: [] },
]

const tabs: Tab[] = [
  {
    id: 'z',
    title: 'Zed',
    noteBodyId: 'body-a',
    activeSubTabId: null,
    subTabs: [],
  },
  {
    id: 'a',
    title: 'Alpha',
    noteBodyId: 'body-b',
    activeSubTabId: null,
    subTabs: [
      { id: 'sub-z', title: 'Zed', noteBodyId: 'body-a'},
      { id: 'sub-a', title: 'Alpha', noteBodyId: 'body-b'},
    ],
  },
]

describe('stage manager destination sorting', () => {
  it('keeps destination tab order unchanged for the default mode', () => {
    expect(applyDestinationTabSort(tabs, noteBodies, 'default')).toBe(tabs)
    expect(applyDestinationTabSort(tabs, noteBodies, 'default').map((tab) => tab.id)).toEqual(['z', 'a'])
  })

  it('sorts destination parent tabs for non-default modes', () => {
    expect(applyDestinationTabSort(tabs, noteBodies, 'alpha-asc').map((tab) => tab.id)).toEqual(['a', 'z'])
  })

  it('keeps destination sub-tab order unchanged for the default mode', () => {
    expect(applyDestinationSubTabSort(tabs[1].subTabs, noteBodies, 'default')).toBe(tabs[1].subTabs)
    expect(applyDestinationSubTabSort(tabs[1].subTabs, noteBodies, 'default').map((subTab) => subTab.id)).toEqual(['sub-z', 'sub-a'])
  })

  it('sorts only the requested destination parent sub-tab row for non-default modes', () => {
    const nextTabs = applyDestinationParentSubTabSort(tabs, 'a', noteBodies, 'alpha-asc')

    expect(nextTabs.map((tab) => tab.id)).toEqual(['z', 'a'])
    expect(nextTabs[1].subTabs.map((subTab) => subTab.id)).toEqual(['sub-a', 'sub-z'])
  })
})
