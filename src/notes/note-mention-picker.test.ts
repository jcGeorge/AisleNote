import { describe, expect, it } from 'vitest'
import type { AppState, Domain, NoteLocation, Space } from '../types/app'
import {
  buildNoteMentionNavigatorRows,
  createDefaultNoteMentionSelection,
  filterNoteMentionSearchEntries,
  moveNoteMentionActiveRow,
  moveNoteMentionSelectionInRow,
  updateNoteMentionSelectionForRow,
} from './note-mention-picker'
import { listSearchableNoteLocations } from './note-locations'

function space(id: string, name: string, activeTabId: string, tabs: Space['data']['tabs']): Space {
  return {
    id,
    name,
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId,
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function tab(id: string, title: string, subTabs: Space['data']['tabs'][number]['subTabs'] = []) {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
    homeContent: '',
    activeSubTabId: subTabs[0]?.id ?? null,
    subTabs,
  }
}

function createMentionState(): AppState {
  const activeSpace = space('space-a', 'Alpha space', 'tab-a', [
    tab('tab-a', 'Alpha prime', [
      { id: 'sub-a', title: 'Alpha sub', noteBodyId: 'sub-a-body', content: '' },
      { id: 'sub-b', title: 'Beta sub', noteBodyId: 'sub-b-body', content: '' },
    ]),
    tab('tab-b', 'Beta prime'),
  ])
  const otherSpace = space('space-b', 'Beta space', 'tab-c', [tab('tab-c', 'Codex')])
  const domains: Domain[] = [
    { id: 'domain-a', name: 'Humble beginnings', activeSpaceId: activeSpace.id, spaces: [activeSpace, otherSpace] },
    { id: 'domain-b', name: 'Other domain', activeSpaceId: 'space-c', spaces: [space('space-c', 'Gamma space', 'tab-d', [tab('tab-d', 'Alpha elsewhere')])] },
  ]
  return {
    activeDomainId: 'domain-a',
    activeSpaceId: activeSpace.id,
    domains,
    spaces: [activeSpace, otherSpace],
  } as unknown as AppState
}

describe('note mention picker model', () => {
  const currentLocation: NoteLocation = {
    domainId: 'domain-a',
    spaceId: 'space-a',
    tabId: 'tab-a',
    subTabId: 'sub-a',
  }

  it('defaults to the current domain, space, prime tab, and note', () => {
    const state = createMentionState()
    const selection = createDefaultNoteMentionSelection(state, currentLocation)
    const rows = buildNoteMentionNavigatorRows(state, selection)

    expect(selection).toEqual(currentLocation)
    expect(rows.map((row) => [row.id, row.selectedId])).toEqual([
      ['domain', 'domain-a'],
      ['space', 'space-a'],
      ['tab', 'tab-a'],
      ['note', 'sub-a'],
    ])
  })

  it('moves rows and resets downstream selections when a parent row changes', () => {
    const state = createMentionState()
    const selection = createDefaultNoteMentionSelection(state, currentLocation)

    expect(moveNoteMentionActiveRow('space', 1)).toBe('tab')
    expect(moveNoteMentionActiveRow('space', -1)).toBe('domain')

    const nextSpace = updateNoteMentionSelectionForRow(state, selection, 'space', 'space-b')
    expect(nextSpace).toEqual({
      domainId: 'domain-a',
      spaceId: 'space-b',
      tabId: 'tab-c',
      subTabId: null,
    })

    const nextNote = moveNoteMentionSelectionInRow(state, selection, 'note', 1)
    expect(nextNote.subTabId).toBe('sub-b')
  })

  it('searches all notes while ranking the current space and prime tab higher', () => {
    const state = createMentionState()
    const entries = listSearchableNoteLocations(state)
    const results = filterNoteMentionSearchEntries(entries, 'alpha', currentLocation)

    expect(results.map((entry) => entry.label).slice(0, 2)).toEqual([
      'Humble beginnings > Alpha space > Alpha prime > home',
      'Humble beginnings > Alpha space > Alpha prime > Alpha sub',
    ])
    expect(results.map((entry) => entry.label).at(-1)).toBe('Other domain > Gamma space > Alpha elsewhere > home')
  })
})
