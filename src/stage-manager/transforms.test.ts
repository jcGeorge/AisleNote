import { describe, expect, it } from 'vitest'
import type { StageManagerSelectionSnapshot, Tab, WorkspaceData } from '../types/app'
import { stripStageManagerSelectionsFromWorkspace } from './transforms'

const tabA: Tab = {
  id: 'tab-a',
  title: 'A',
  noteBodyId: 'body-a',
  homeContent: '',
  activeSubTabId: 'sub-a',
  subTabs: [{ id: 'sub-a', title: 'A1', noteBodyId: 'body-a1', content: '' }],
}

const tabB: Tab = {
  id: 'tab-b',
  title: 'B',
  noteBodyId: 'body-b',
  homeContent: '',
  activeSubTabId: 'sub-b',
  subTabs: [{ id: 'sub-b', title: 'B1', noteBodyId: 'body-b1', content: '' }],
}

const selectionSnapshot: StageManagerSelectionSnapshot = {
  fullParents: [tabA],
  partialParents: [],
  looseSubTabs: [],
  fullParentIds: new Set(['tab-a']),
  hasSelection: true,
}

describe('stage manager navigation memory', () => {
  it('falls back to the next tab memory when the remembered active tab is moved away', () => {
    const data: WorkspaceData = {
      activeTabId: 'tab-a',
      tabs: [tabA, tabB],
      deletedTabs: [],
      deletedSubTabs: [],
    }

    const next = stripStageManagerSelectionsFromWorkspace(data, selectionSnapshot)

    expect(next.activeTabId).toBe('tab-b')
    expect(next.tabs[0].activeSubTabId).toBe('sub-b')
  })
})
