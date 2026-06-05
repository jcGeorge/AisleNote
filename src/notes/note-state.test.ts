import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { materializeDecoupledAisleCopies } from './aisle-links'
import { getAisleMarkdown, resolveNoteAisles } from './note-markdown'
import type { AppState, NoteAisle, NoteAisleBody, Space } from '../types/app'
import {
  applyCursorLocationSnapshot,
  applyNoteLocationToState,
  getAisleSignature,
  syncNoteAisleBodyMarkdownInState,
  syncNoteBodyAisleStructureInState,
  syncNoteBodyAislesInState,
  updateCursorLocationInState,
} from './note-state'

const createTestState = (): AppState => {
  const spaceOne: Space = {
    id: 'space-1',
    name: 'Space 1',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          title: 'Tab 1',
          noteBodyId: 'body-1',
          activeSubTabId: null,
          subTabs: [
            {
              id: 'sub-1',
              title: 'Sub 1',
              noteBodyId: 'body-1',
            },
          ],
        },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
  const spaceTwo: Space = {
    ...spaceOne,
    id: 'space-2',
    name: 'Space 2',
    data: {
      ...spaceOne.data,
      activeTabId: 'tab-2',
      tabs: [
        {
          id: 'tab-2',
          title: 'Tab 2',
          noteBodyId: 'body-2',
          activeSubTabId: 'sub-2',
          subTabs: [
            {
              id: 'sub-2',
              title: 'Sub 2',
              noteBodyId: 'body-2',
            },
          ],
        },
      ],
    },
  }

  return {
    theme: 'dark',
    activeDomainId: 'domain-1',
    activeSpaceId: 'space-1',
    domains: [
      {
        id: 'domain-1',
        name: 'Domain 1',
        activeSpaceId: 'space-1',
        spaces: [spaceOne, spaceTwo],
      },
    ],
    spaces: [spaceOne, spaceTwo],
    noteBodies: [
      { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-1' }] },
      { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'aisle-2' }] },
    ],
    noteAisleBodies: [
      { id: 'aisle-1', markdown: '' },
      { id: 'aisle-2', markdown: '' },
    ],
    hotkeys: {
      shortcuts: {
        toggleTabsTarget: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
        formatStrikethrough: '',
        cycleParentTabNext: '',
        cycleParentTabPrev: '',
        cycleSubTabNext: '',
        cycleSubTabPrev: '',
        cycleAislePrev: '',
        cycleAisleNext: '',
      },
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'normalNewLine',
          commandEnter: 'normalNewLine',
        },
        menuOperations: [],
      },
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: {
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'hotkeys',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

describe('note-state helpers', () => {
  const expectAisles = (aisles: NoteAisle[] | undefined, expected: NoteAisle[]) => {
    expect(aisles).toEqual(expected)
  }

  const getAisleBodyMarkdown = (aisleBodies: NoteAisleBody[] | undefined, aisleBodyId: string) =>
    aisleBodies?.find((body) => body.id === aisleBodyId)?.markdown

  it('syncs note body aisles into note bodies and aisle bodies', () => {
    const next = syncNoteBodyAislesInState(createTestState(), 'body-1', [
      { id: 'aisle-1', aisleBodyId: 'aisle-1', markdown: 'updated #Alpha' },
      { id: 'aisle-2', aisleBodyId: 'aisle-2', markdown: 'second #Beta' },
    ])

    expectAisles(next.noteBodies.find((body) => body.id === 'body-1')?.aisles, [
      { id: 'aisle-1', aisleBodyId: 'aisle-1' },
      { id: 'aisle-2', aisleBodyId: 'aisle-2' },
    ])
    expect(getAisleBodyMarkdown(next.noteAisleBodies, 'aisle-1')).toBe('updated #Alpha')
    expect(getAisleBodyMarkdown(next.noteAisleBodies, 'aisle-2')).toBe('second #Beta')
    expect(next.noteAisleBodies?.find((body) => body.id === 'aisle-1')?.tags).toEqual(['Alpha'])
    expect(next.noteAisleBodies?.find((body) => body.id === 'aisle-2')?.tags).toEqual(['Beta'])
  })

  it('syncs aisle structure without replacing current aisle body markdown', () => {
    const state = {
      ...createTestState(),
      noteAisleBodies: [
        { id: 'body-a', markdown: 'current a' },
        { id: 'body-b', markdown: 'current b' },
      ],
      noteBodies: [
        {
          id: 'body-1',
          aisles: [
            { id: 'aisle-a', aisleBodyId: 'body-a' },
            { id: 'aisle-b', aisleBodyId: 'body-b' },
          ],
        },
        { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'aisle-2' }] },
      ],
    }

    const next = syncNoteBodyAisleStructureInState(state, 'body-1', [
      { id: 'aisle-b', aisleBodyId: 'body-b', markdown: 'stale b' },
      { id: 'aisle-a', aisleBodyId: 'body-a', markdown: 'stale a' },
    ])

    expectAisles(next.noteBodies.find((body) => body.id === 'body-1')?.aisles, [
      { id: 'aisle-b', aisleBodyId: 'body-b' },
      { id: 'aisle-a', aisleBodyId: 'body-a' },
    ])
    expect(next.noteAisleBodies?.find((body) => body.id === 'body-a')?.markdown).toBe('current a')
    expect(next.noteAisleBodies?.find((body) => body.id === 'body-b')?.markdown).toBe('current b')
  })

  it('deletes linked aisle slots without reintroducing stale shared whitespace', () => {
    const currentMarkdown = 'Hat Trick!\n\n---\n\n\u200b'
    const state = {
      ...createTestState(),
      noteAisleBodies: [{ id: 'shared-aisle-body', markdown: currentMarkdown }],
      noteBodies: [
        {
          id: 'body-1',
          aisles: [
            { id: 'aisle-a', aisleBodyId: 'shared-aisle-body' },
            { id: 'aisle-b', aisleBodyId: 'shared-aisle-body' },
          ],
        },
        { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'aisle-2' }] },
      ],
    }

    const next = syncNoteBodyAisleStructureInState(state, 'body-1', [
      { id: 'aisle-b', aisleBodyId: 'shared-aisle-body', markdown: 'Hat Trick!\n\nold whitespace' },
    ])

    expectAisles(next.noteBodies.find((body) => body.id === 'body-1')?.aisles, [
      { id: 'aisle-b', aisleBodyId: 'shared-aisle-body' },
    ])
    expect(next.noteAisleBodies?.find((body) => body.id === 'shared-aisle-body')?.markdown).toBe(currentMarkdown)
  })

  it('writes linked aisle text through the shared aisle body source of truth', () => {
    const state = {
      ...createTestState(),
      noteAisleBodies: [{ id: 'shared-aisle-body', markdown: 'old' }],
      noteBodies: [
        {
          id: 'body-1',
          aisles: [
            { id: 'aisle-a', aisleBodyId: 'shared-aisle-body' },
            { id: 'aisle-b', aisleBodyId: 'shared-aisle-body' },
          ],
        },
        { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'aisle-2' }] },
      ],
    }

    const next = syncNoteAisleBodyMarkdownInState(state, 'shared-aisle-body', 'current #Shared')

    expect(next.noteAisleBodies?.find((body) => body.id === 'shared-aisle-body')?.markdown).toBe('current #Shared')
    expect(next.noteAisleBodies?.find((body) => body.id === 'shared-aisle-body')?.tags).toEqual(['Shared'])
    expectAisles(next.noteBodies.find((body) => body.id === 'body-1')?.aisles, [
      { id: 'aisle-a', aisleBodyId: 'shared-aisle-body' },
      { id: 'aisle-b', aisleBodyId: 'shared-aisle-body' },
    ])
  })

  it('applies a staged aisle de-couple to only the selected aisle slot', () => {
    const state = {
      ...createTestState(),
      noteAisleBodies: [{ id: 'shared-aisle-body', markdown: 'current shared text #Shared' }],
      noteBodies: [
        {
          id: 'body-1',
          aisles: [
            { id: 'aisle-a', aisleBodyId: 'shared-aisle-body' },
            { id: 'aisle-local', aisleBodyId: 'local-body' },
          ],
        },
        {
          id: 'body-2',
          aisles: [{ id: 'aisle-b', aisleBodyId: 'shared-aisle-body' }],
        },
      ],
    }
    const sourceAisles = state.noteBodies.find((body) => body.id === 'body-1')?.aisles ?? []
    const afterAisles = materializeDecoupledAisleCopies(state, resolveNoteAisles(sourceAisles, state.noteAisleBodies), ['aisle-a'])
    const next = syncNoteBodyAisleStructureInState(state, 'body-1', afterAisles)
    const decoupledAisle = next.noteBodies.find((body) => body.id === 'body-1')?.aisles[0]
    const linkedAisle = next.noteBodies.find((body) => body.id === 'body-2')?.aisles[0]

    expect(decoupledAisle?.id).toBe('aisle-a')
    expect(decoupledAisle?.aisleBodyId).not.toBe('shared-aisle-body')
    expect(decoupledAisle ? getAisleMarkdown(decoupledAisle, next.noteAisleBodies) : '').toBe('current shared text #Shared')
    expect(next.noteAisleBodies?.find((body) => body.id === decoupledAisle?.aisleBodyId)?.markdown).toBe(
      'current shared text #Shared',
    )
    expect(next.noteAisleBodies?.find((body) => body.id === decoupledAisle?.aisleBodyId)?.tags).toEqual(['Shared'])
    expect(linkedAisle).toEqual({ id: 'aisle-b', aisleBodyId: 'shared-aisle-body' })
    expect(next.noteAisleBodies?.find((body) => body.id === 'shared-aisle-body')?.markdown).toBe('current shared text #Shared')
  })

  it('applies note location across domain, space, tab, and sub-tab state', () => {
    const next = applyNoteLocationToState(createTestState(), {
      domainId: 'domain-1',
      spaceId: 'space-2',
      tabId: 'tab-2',
      subTabId: 'sub-2',
    })

    expect(next.activeDomainId).toBe('domain-1')
    expect(next.activeSpaceId).toBe('space-2')
    expect(next.spaces.find((space) => space.id === 'space-2')?.data.activeTabId).toBe('tab-2')
    expect(next.spaces.find((space) => space.id === 'space-2')?.data.tabs[0].activeSubTabId).toBe('sub-2')
  })

  it('stores cursor locations and applies saved cursor snapshots', () => {
    const withCursor = updateCursorLocationInState(
      createTestState(),
      'domain-1::space-1::tab-1::__home__',
      'aisle-1',
      { anchor: 3, head: 3, updatedAt: 1 },
      10,
    )

    expect(withCursor.ui.noteCursorLocations['domain-1::space-1::tab-1::__home__']).toEqual({
      activeAisleId: 'aisle-1',
      aisles: {
        'aisle-1': { anchor: 3, head: 3, updatedAt: 10 },
      },
      updatedAt: 10,
    })

    const restored = applyCursorLocationSnapshot(createTestState(), 'key', {
      activeAisleId: 'aisle-2',
      aisles: {
        'aisle-2': { anchor: 1, head: 2, updatedAt: 5 },
      },
      updatedAt: 5,
    })
    expect(restored.ui.noteCursorLocations.key?.activeAisleId).toBe('aisle-2')
  })

  it('builds aisle signatures from id, aisle body id, and markdown triples', () => {
    expect(getAisleSignature([{ id: 'a', aisleBodyId: 'a', markdown: 'one' }])).toBe('[["a","a","one"]]')
    expect(getAisleSignature([{ id: 'b', aisleBodyId: 'b', markdown: 'one' }])).not.toBe(
      getAisleSignature([{ id: 'a', aisleBodyId: 'a', markdown: 'one' }]),
    )
    expect(getAisleSignature([{ id: 'a', aisleBodyId: 'body-a', markdown: 'one' }])).not.toBe(
      getAisleSignature([{ id: 'a', aisleBodyId: 'body-b', markdown: 'one' }]),
    )
  })
})
