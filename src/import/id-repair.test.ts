import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import { DEFAULT_UI_SETTINGS } from '../settings/defaults'
import type { AppState, NoteAisleBody, NoteBody, Space, Tab } from '../types/app'
import { repairAppStateEntityIds } from './id-repair'

function createIdGenerator() {
  let next = 0
  return () => {
    next += 1
    return `generated-${next}`
  }
}

function noteBody(id: string, aisleId = `${id}-aisle`, aisleBodyId = `${id}-aisle-body`): NoteBody {
  return {
    id,
    aisles: [{ id: aisleId, aisleBodyId }],
  }
}

function aisleBody(id: string, markdown = ''): NoteAisleBody {
  return { id, markdown, frontmatter: null, frontmatterStatus: 'none' }
}

function tab(id: string, noteBodyId: string, subTabId = `${id}-sub`): Tab {
  return {
    id,
    title: id,
    noteBodyId,
    activeSubTabId: subTabId,
    subTabs: [{ id: subTabId, title: subTabId, noteBodyId: `${noteBodyId}-sub` }],
  }
}

function space(id: string, tabs: Tab[]): Space {
  return {
    id,
    name: id,
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: tabs[0]?.id ?? '',
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function stateWithSpaces(spaces: Space[], noteBodies: NoteBody[], noteAisleBodies: NoteAisleBody[]): AppState {
  return {
    theme: 'dawn',
    activeDomainId: 'domain',
    domains: [{ id: 'domain', name: 'Domain', activeSpaceId: spaces[0]?.id ?? '', spaces }],
    deletedDomains: [],
    deletedSpaces: [],
    scratchpad: { noteBodyId: noteBodies[0]?.id ?? '' },
    noteBodies,
    noteAisleBodies,
    activeSpaceId: spaces[0]?.id ?? '',
    spaces,
    hotkeys: {
      shortcuts: DEFAULT_SHORTCUTS,
      newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: {
      ...DEFAULT_UI_SETTINGS,
      noteCursorLocations: {},
      headingCollapseState: {},
    },
  }
}

function collectUniqueIds(state: AppState) {
  const ids: string[] = []
  state.domains.forEach((domain) => {
    ids.push(domain.id)
    domain.spaces.forEach((spaceEntry) => {
      ids.push(spaceEntry.id)
      spaceEntry.data.tabs.forEach((tabEntry) => {
        ids.push(tabEntry.id)
        tabEntry.subTabs.forEach((subTab) => ids.push(subTab.id))
      })
      spaceEntry.data.deletedTabs.forEach((entry) => {
        ids.push(entry.id, entry.tab.id)
        entry.tab.subTabs.forEach((subTab) => ids.push(subTab.id))
      })
      spaceEntry.data.deletedSubTabs.forEach((entry) => ids.push(entry.id, entry.subTab.id))
    })
  })
  state.noteBodies.forEach((body) => {
    ids.push(body.id)
    body.aisles.forEach((aisle) => ids.push(aisle.id))
  })
  state.noteAisleBodies?.forEach((body) => ids.push(body.id))
  return ids
}

describe('repairAppStateEntityIds', () => {
  it('repairs duplicate domain, space, tab, and sub-tab entity ids deterministically', () => {
    const firstTab = tab('tab', 'body-a', 'sub')
    const secondTab = tab('tab', 'body-b', 'sub')
    const firstSpace = space('space', [firstTab, secondTab])
    const secondSpace = space('space', [tab('other-tab', 'body-c', 'other-sub')])
    const state = stateWithSpaces(
      [firstSpace, secondSpace],
      [
        noteBody('body-a'),
        noteBody('body-a-sub'),
        noteBody('body-b'),
        noteBody('body-b-sub'),
        noteBody('body-c'),
        noteBody('body-c-sub'),
      ],
      [
        aisleBody('body-a-aisle-body'),
        aisleBody('body-a-sub-aisle-body'),
        aisleBody('body-b-aisle-body'),
        aisleBody('body-b-sub-aisle-body'),
        aisleBody('body-c-aisle-body'),
        aisleBody('body-c-sub-aisle-body'),
      ],
    )
    state.domains.push({ ...state.domains[0], spaces: [space('domain-two-space', [tab('domain-two-tab', 'body-d')])] })
    state.noteBodies.push(noteBody('body-d'), noteBody('body-d-sub'))
    state.noteAisleBodies?.push(aisleBody('body-d-aisle-body'), aisleBody('body-d-sub-aisle-body'))

    const { state: repaired, summary } = repairAppStateEntityIds(state, createIdGenerator())
    const ids = collectUniqueIds(repaired)

    expect(new Set(ids).size).toBe(ids.length)
    expect(repaired.domains[0].id).toBe('domain')
    expect(repaired.domains[1].id).not.toBe('domain')
    expect(repaired.domains[0].spaces[0].id).toBe('space')
    expect(repaired.domains[0].spaces[1].id).not.toBe('space')
    expect(repaired.domains[0].spaces[0].data.tabs[0].id).toBe('tab')
    expect(repaired.domains[0].spaces[0].data.tabs[1].id).not.toBe('tab')
    expect(repaired.domains[0].spaces[0].data.tabs[0].subTabs[0].id).toBe('sub')
    expect(repaired.domains[0].spaces[0].data.tabs[1].subTabs[0].id).not.toBe('sub')
    expect(summary.repairedIds).toBeGreaterThanOrEqual(4)
  })

  it('repairs duplicate note-body and aisle-body records while preserving valid shared references', () => {
    const sharedTab = tab('tab-a', 'shared-body', 'tab-a-sub')
    const linkedTab = tab('tab-b', 'shared-body', 'tab-b-sub')
    const state = stateWithSpaces(
      [space('space', [sharedTab, linkedTab])],
      [
        {
          id: 'shared-body',
          aisles: [
            { id: 'shared-aisle-a', aisleBodyId: 'shared-aisle-body' },
            { id: 'shared-aisle-b', aisleBodyId: 'shared-aisle-body' },
          ],
        },
        noteBody('shared-body', 'duplicate-aisle', 'duplicate-aisle-body'),
        noteBody('shared-body-sub-a', 'sub-a-aisle', 'sub-a-body'),
        noteBody('shared-body-sub-b', 'sub-b-aisle', 'sub-b-body'),
      ],
      [
        aisleBody('shared-aisle-body', 'first body'),
        aisleBody('shared-aisle-body', 'duplicate body'),
        aisleBody('duplicate-aisle-body'),
        aisleBody('sub-a-body'),
        aisleBody('sub-b-body'),
      ],
    )
    state.domains[0].spaces[0].data.tabs[0].subTabs[0].noteBodyId = 'shared-body-sub-a'
    state.domains[0].spaces[0].data.tabs[1].subTabs[0].noteBodyId = 'shared-body-sub-b'

    const { state: repaired } = repairAppStateEntityIds(state, createIdGenerator())
    const bodyIds = repaired.noteBodies.map((body) => body.id)
    const aisleBodyIds = (repaired.noteAisleBodies ?? []).map((body) => body.id)
    const repairedTabs = repaired.domains[0].spaces[0].data.tabs
    const sharedBody = repaired.noteBodies.find((body) => body.id === 'shared-body')

    expect(new Set(bodyIds).size).toBe(bodyIds.length)
    expect(new Set(aisleBodyIds).size).toBe(aisleBodyIds.length)
    expect(repairedTabs[0].noteBodyId).toBe('shared-body')
    expect(repairedTabs[1].noteBodyId).toBe('shared-body')
    expect(sharedBody?.aisles.map((aisle) => aisle.aisleBodyId)).toEqual(['shared-aisle-body', 'shared-aisle-body'])
  })

  it('repairs duplicate trash entry ids without aliasing deleted note records', () => {
    const state = stateWithSpaces(
      [space('space', [tab('tab', 'body')])],
      [noteBody('body'), noteBody('body-sub'), noteBody('deleted-body'), noteBody('deleted-sub-body')],
      [
        aisleBody('body-aisle-body'),
        aisleBody('body-sub-aisle-body'),
        aisleBody('deleted-body-aisle-body'),
        aisleBody('deleted-sub-body-aisle-body'),
      ],
    )
    const workspace = state.domains[0].spaces[0].data
    workspace.deletedTabs = [
      { id: 'trash', deletedAt: 1, tab: tab('deleted-note', 'deleted-body', 'deleted-child') },
      { id: 'trash', deletedAt: 2, tab: tab('deleted-note', 'deleted-body', 'deleted-child') },
    ]
    workspace.deletedSubTabs = [
      {
        id: 'trash-sub',
        parentTabId: 'tab',
        parentTabTitle: 'tab',
        deletedAt: 1,
        subTab: { id: 'deleted-sub', title: 'deleted sub', noteBodyId: 'deleted-sub-body' },
      },
      {
        id: 'trash-sub',
        parentTabId: 'tab',
        parentTabTitle: 'tab',
        deletedAt: 2,
        subTab: { id: 'deleted-sub', title: 'deleted sub', noteBodyId: 'deleted-sub-body' },
      },
    ]

    const { state: repaired } = repairAppStateEntityIds(state, createIdGenerator())
    const repairedWorkspace = repaired.domains[0].spaces[0].data

    expect(repairedWorkspace.deletedTabs[0].id).toBe('trash')
    expect(repairedWorkspace.deletedTabs[1].id).not.toBe('trash')
    expect(repairedWorkspace.deletedTabs[0].tab.id).toBe('deleted-note')
    expect(repairedWorkspace.deletedTabs[1].tab.id).not.toBe('deleted-note')
    expect(repairedWorkspace.deletedSubTabs[0].id).toBe('trash-sub')
    expect(repairedWorkspace.deletedSubTabs[1].id).not.toBe('trash-sub')
    expect(repairedWorkspace.deletedSubTabs[0].subTab.id).toBe('deleted-sub')
    expect(repairedWorkspace.deletedSubTabs[1].subTab.id).not.toBe('deleted-sub')
  })
})
