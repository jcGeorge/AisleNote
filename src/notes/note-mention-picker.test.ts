import { describe, expect, it } from 'vitest'
import type { AppState, Domain, NoteLocation, Space } from '../types/app'
import {
  buildNoteMentionNavigatorRows,
  createDefaultNoteMentionSelection,
  filterNoteMentionSearchEntries,
  getNoteMentionAisleCopyTarget,
  getNoteMentionPreviewData,
  getNoteMentionSearchEntryDetails,
  getNoteMentionSearchSelectionAfterClick,
  getNoteMentionSearchSelectionAfterHover,
  getNoteMentionSearchSelectionAfterKeyboard,
  getNoteMentionTarget,
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
    activeSubTabId: subTabs[0]?.id ?? null,
    subTabs,
  }
}

function createMentionState(): AppState {
  const activeSpace = space('space-a', 'Alpha space', 'tab-a', [
    tab('tab-a', 'Alpha prime', [
      { id: 'sub-a', title: 'Alpha sub', noteBodyId: 'sub-a-body'},
      { id: 'sub-b', title: 'Beta sub', noteBodyId: 'sub-b-body'},
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
    noteBodies: [
      { id: 'tab-a-body', aisles: [{ id: 'tab-a-aisle-1', aisleBodyId: 'tab-a-aisle-body-1' }] },
      { id: 'sub-a-body', aisles: [{ id: 'sub-a-aisle-1', aisleBodyId: 'sub-a-aisle-body-1' }] },
      {
        id: 'sub-b-body',
        aisles: [
          { id: 'sub-b-aisle-1', aisleBodyId: 'sub-b-aisle-body-1' },
          { id: 'sub-b-aisle-2', aisleBodyId: 'sub-b-aisle-body-2' },
        ],
      },
      { id: 'tab-b-body', aisles: [{ id: 'tab-b-aisle-1', aisleBodyId: 'tab-b-aisle-body-1' }] },
      { id: 'tab-c-body', aisles: [{ id: 'tab-c-aisle-1', aisleBodyId: 'tab-c-aisle-body-1' }] },
      { id: 'tab-d-body', aisles: [{ id: 'tab-d-aisle-1', aisleBodyId: 'tab-d-aisle-body-1' }] },
    ],
    noteAisleBodies: [
      { id: 'tab-a-aisle-body-1', markdown: 'tab a home' },
      { id: 'sub-a-aisle-body-1', markdown: 'sub a only aisle' },
      { id: 'sub-b-aisle-body-1', markdown: 'sub b first aisle' },
      { id: 'sub-b-aisle-body-2', markdown: '# Selected second aisle' },
      { id: 'tab-b-aisle-body-1', markdown: 'tab b home' },
      { id: 'tab-c-aisle-body-1', markdown: 'tab c home' },
      { id: 'tab-d-aisle-body-1', markdown: 'tab d home' },
    ],
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

  it('adds an aisle row only for multi-aisle notes and emits aisle-specific targets', () => {
    const state = createMentionState()
    const selection = createDefaultNoteMentionSelection(state, currentLocation)
    expect(buildNoteMentionNavigatorRows(state, selection).map((row) => row.id)).toEqual([
      'domain',
      'space',
      'tab',
      'note',
    ])

    const multiAisleSelection = updateNoteMentionSelectionForRow(state, selection, 'note', 'sub-b')
    const rows = buildNoteMentionNavigatorRows(state, multiAisleSelection)

    expect(rows.map((row) => [row.id, row.selectedId])).toEqual([
      ['domain', 'domain-a'],
      ['space', 'space-a'],
      ['tab', 'tab-a'],
      ['note', 'sub-b'],
      ['aisle', 'sub-b-aisle-1'],
    ])
    expect(rows.find((row) => row.id === 'aisle')?.items.map((item) => item.label)).toEqual(['aisle 1', 'aisle 2'])
    expect(moveNoteMentionActiveRow('note', 1, rows.map((row) => row.id))).toBe('aisle')

    const secondAisleSelection = updateNoteMentionSelectionForRow(state, multiAisleSelection, 'aisle', 'sub-b-aisle-2')
    expect(getNoteMentionTarget(secondAisleSelection)).toEqual({
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: 'sub-b',
      aisleIds: ['sub-b-aisle-2'],
    })
  })

  it('resolves mention previews to exactly the selected or first aisle', () => {
    const state = createMentionState()

    expect(getNoteMentionPreviewData(state, {
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: 'sub-a',
    })).toMatchObject({
      aisleId: 'sub-a-aisle-1',
      markdown: 'sub a only aisle',
      targetLabel: 'Humble beginnings > Alpha space > Alpha prime > Alpha sub',
    })

    expect(getNoteMentionPreviewData(state, {
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: 'sub-b',
      aisleIds: ['sub-b-aisle-2'],
    })).toMatchObject({
      aisleId: 'sub-b-aisle-2',
      markdown: '# Selected second aisle',
      targetLabel: 'Humble beginnings > Alpha space > Alpha prime > Beta sub',
    })
  })

  it('resolves mention copy targets to exactly one source aisle', () => {
    const state = createMentionState()

    expect(getNoteMentionAisleCopyTarget(state, {
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: 'sub-a',
    })).toEqual({
      source: {
        domainId: 'domain-a',
        spaceId: 'space-a',
        tabId: 'tab-a',
        subTabId: 'sub-a',
      },
      aisleId: 'sub-a-aisle-1',
    })

    expect(getNoteMentionAisleCopyTarget(state, {
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: 'sub-b',
      aisleIds: ['sub-b-aisle-2'],
    })).toEqual({
      source: {
        domainId: 'domain-a',
        spaceId: 'space-a',
        tabId: 'tab-a',
        subTabId: 'sub-b',
      },
      aisleId: 'sub-b-aisle-2',
    })

    expect(getNoteMentionAisleCopyTarget(state, {
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: 'sub-b',
    })).toBeNull()

    expect(getNoteMentionAisleCopyTarget(state, {
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'tab-a',
      subTabId: 'sub-b',
      aisleIds: ['missing-aisle'],
    })).toBeNull()
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

  it('builds search result aisle count and rail chip metadata', () => {
    const state = createMentionState()
    const entry = listSearchableNoteLocations(state).find((candidate) => candidate.subTabId === 'sub-b')
    expect(entry).toBeTruthy()

    const details = getNoteMentionSearchEntryDetails(state, entry!)

    expect(details.aisleCount).toBe(2)
    expect(details.contextChips).toEqual([
      { kind: 'domain', label: 'Humble beginnings' },
      { kind: 'space', label: 'Alpha space' },
      { kind: 'parent', label: 'Alpha prime' },
      { kind: 'note', label: 'Beta sub' },
    ])
  })

  it('locks search selection on click while leaving hover live before selection', () => {
    const initial = { activeIndex: 0, selectedIndex: null, searchAisleId: null }
    expect(getNoteMentionSearchSelectionAfterHover(initial, 1)).toEqual({
      activeIndex: 1,
      selectedIndex: null,
      searchAisleId: null,
    })

    const selected = getNoteMentionSearchSelectionAfterClick(initial, 2)
    expect(selected).toEqual({
      activeIndex: 2,
      selectedIndex: 2,
      searchAisleId: null,
    })
    expect(getNoteMentionSearchSelectionAfterHover({ ...selected, searchAisleId: 'aisle-2' }, 1)).toEqual({
      activeIndex: 2,
      selectedIndex: 2,
      searchAisleId: 'aisle-2',
    })
    expect(getNoteMentionSearchSelectionAfterKeyboard({ ...selected, searchAisleId: 'aisle-2' }, 3)).toEqual({
      activeIndex: 3,
      selectedIndex: null,
      searchAisleId: null,
    })
  })
})
