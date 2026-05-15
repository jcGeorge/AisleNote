import { describe, expect, it } from 'vitest'
import type { WorkspaceData } from '../types/app'
import {
  applyWorkspaceNavigationLocation,
  normalizeWorkspaceNavigationMemory,
  selectActivePrimeTabHome,
  selectPrimeTabWithMemory,
  selectSubTabWithMemory,
} from './navigation-memory'

const makeWorkspace = (): WorkspaceData => ({
  activeTabId: 'tab-a',
  tabs: [
    {
      id: 'tab-a',
      title: 'A',
      noteBodyId: 'body-a',
      homeContent: '',
      activeSubTabId: 'sub-a-2',
      subTabs: [
        { id: 'sub-a-1', title: 'A1', noteBodyId: 'body-a1', content: '' },
        { id: 'sub-a-2', title: 'A2', noteBodyId: 'body-a2', content: '' },
      ],
    },
    {
      id: 'tab-b',
      title: 'B',
      noteBodyId: 'body-b',
      homeContent: '',
      activeSubTabId: 'sub-b-1',
      subTabs: [{ id: 'sub-b-1', title: 'B1', noteBodyId: 'body-b1', content: '' }],
    },
  ],
  deletedTabs: [],
  deletedSubTabs: [],
})

describe('workspace navigation memory', () => {
  it('switches to a different prime tab without clearing its remembered sub-tab', () => {
    const next = selectPrimeTabWithMemory(makeWorkspace(), 'tab-b')

    expect(next.activeTabId).toBe('tab-b')
    expect(next.tabs.find((tab) => tab.id === 'tab-b')?.activeSubTabId).toBe('sub-b-1')
  })

  it('clicking the active prime tab returns to that tab home', () => {
    const next = selectActivePrimeTabHome(makeWorkspace())

    expect(next.activeTabId).toBe('tab-a')
    expect(next.tabs.find((tab) => tab.id === 'tab-a')?.activeSubTabId).toBeNull()
  })

  it('clicking an active prime tab through the prime-tab helper toggles home', () => {
    const next = selectPrimeTabWithMemory(makeWorkspace(), 'tab-a')

    expect(next.activeTabId).toBe('tab-a')
    expect(next.tabs.find((tab) => tab.id === 'tab-a')?.activeSubTabId).toBeNull()
  })

  it('normalizes invalid remembered tabs and sub-tabs to a safe home location', () => {
    const data = makeWorkspace()
    const next = normalizeWorkspaceNavigationMemory({
      ...data,
      activeTabId: 'missing',
      tabs: data.tabs.map((tab) => (tab.id === 'tab-a' ? { ...tab, activeSubTabId: 'missing-sub' } : tab)),
    })

    expect(next.activeTabId).toBe('tab-a')
    expect(next.tabs.find((tab) => tab.id === 'tab-a')?.activeSubTabId).toBeNull()
  })

  it('ignores invalid sub-tab selections and keeps the current memory', () => {
    const next = selectSubTabWithMemory(makeWorkspace(), 'missing-sub')

    expect(next.activeTabId).toBe('tab-a')
    expect(next.tabs.find((tab) => tab.id === 'tab-a')?.activeSubTabId).toBe('sub-a-2')
  })

  it('applies browser history locations with safe fallbacks', () => {
    const next = applyWorkspaceNavigationLocation(makeWorkspace(), 'missing-tab', 'missing-sub')

    expect(next.activeTabId).toBe('tab-a')
    expect(next.tabs.find((tab) => tab.id === 'tab-a')?.activeSubTabId).toBeNull()
  })
})
