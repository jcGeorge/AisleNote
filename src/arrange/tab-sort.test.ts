import { describe, expect, it } from 'vitest'
import type { NoteBody, SubTab, Tab } from '../types/app'
import { sortSubTabs, sortTabs } from './tab-sort'

const noteBodies: NoteBody[] = [
  { id: 'body-a', createdAt: '2024-01-02T00:00:00.000Z', updatedAt: '2024-01-04T00:00:00.000Z', frontmatter: null, aisles: [] },
  { id: 'body-b', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-05T00:00:00.000Z', frontmatter: null, aisles: [] },
  { id: 'body-c', createdAt: '2024-01-03T00:00:00.000Z', updatedAt: '2024-01-03T00:00:00.000Z', frontmatter: null, aisles: [] },
  { id: 'body-missing-date', frontmatter: null, aisles: [] },
]

const makeTab = (id: string, title: string, noteBodyId: string): Tab => ({
  id,
  title,
  noteBodyId,
  homeContent: '',
  activeSubTabId: null,
  subTabs: [],
})

const makeSubTab = (id: string, title: string, noteBodyId: string): SubTab => ({
  id,
  title,
  noteBodyId,
  content: '',
})

describe('tab sorting', () => {
  it('sorts titles case-insensitively and keeps equal titles stable', () => {
    const tabs = [
      makeTab('first-beta', 'beta', 'body-a'),
      makeTab('alpha', 'Alpha', 'body-b'),
      makeTab('second-beta', 'Beta', 'body-c'),
    ]

    expect(sortTabs(tabs, noteBodies, 'alpha-asc').map((tab) => tab.id)).toEqual([
      'alpha',
      'first-beta',
      'second-beta',
    ])
    expect(sortTabs(tabs, noteBodies, 'alpha-desc').map((tab) => tab.id)).toEqual([
      'first-beta',
      'second-beta',
      'alpha',
    ])
  })

  it('sorts parent tabs by note body created and updated timestamps', () => {
    const tabs = [
      makeTab('a', 'A', 'body-a'),
      makeTab('missing', 'Missing', 'body-missing-date'),
      makeTab('b', 'B', 'body-b'),
      makeTab('c', 'C', 'body-c'),
    ]

    expect(sortTabs(tabs, noteBodies, 'created-asc').map((tab) => tab.id)).toEqual(['b', 'a', 'c', 'missing'])
    expect(sortTabs(tabs, noteBodies, 'created-desc').map((tab) => tab.id)).toEqual(['c', 'a', 'b', 'missing'])
    expect(sortTabs(tabs, noteBodies, 'updated-asc').map((tab) => tab.id)).toEqual(['c', 'a', 'b', 'missing'])
    expect(sortTabs(tabs, noteBodies, 'updated-desc').map((tab) => tab.id)).toEqual(['b', 'a', 'c', 'missing'])
  })

  it('sorts sub-tabs by note body timestamps with missing metadata after valid dates', () => {
    const subTabs = [
      makeSubTab('a', 'A', 'body-a'),
      makeSubTab('missing-date', 'Missing Date', 'body-missing-date'),
      makeSubTab('missing-body', 'Missing Body', 'unknown-body'),
      makeSubTab('b', 'B', 'body-b'),
    ]

    expect(sortSubTabs(subTabs, noteBodies, 'created-asc').map((subTab) => subTab.id)).toEqual([
      'b',
      'a',
      'missing-date',
      'missing-body',
    ])
    expect(sortSubTabs(subTabs, noteBodies, 'created-desc').map((subTab) => subTab.id)).toEqual([
      'a',
      'b',
      'missing-date',
      'missing-body',
    ])
  })
})
