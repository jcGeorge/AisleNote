import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, NoteBody, NoteLocation, Space, Tab } from '../types/app'
import {
  applyFindReplacementToState,
  buildVisibleMarkdownIndex,
  collectFindReplaceLocations,
  findVisibleMatches,
} from './find-replace'

function tab(id: string, title: string, noteBodyId: string, subTabs: Array<{ id: string; title: string; body: string }> = []): Tab {
  return {
    id,
    title,
    noteBodyId,
    homeContent: '',
    activeSubTabId: subTabs[0]?.id ?? null,
    subTabs: subTabs.map((subTab) => ({
      id: subTab.id,
      title: subTab.title,
      noteBodyId: subTab.body,
      content: '',
    })),
  }
}

function space(id: string, name: string, tabs: Tab[]): Space {
  return {
    id,
    name,
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: tabs[0]?.id ?? '',
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function body(id: string, aisleId: string, aisleBodyId: string, markdown = ''): NoteBody {
  return {
    id,
    frontmatter: null,
    aisles: [{ id: aisleId, aisleBodyId, markdown }],
  }
}

function createFindReplaceState(): AppState {
  const activeSpace = space('space-a', 'Space A', [
    tab('parent-a', 'Parent A', 'body-home', [
      { id: 'sub-a', title: 'Sub A', body: 'body-sub' },
      { id: 'sub-linked', title: 'Linked Sub', body: 'body-linked-a' },
    ]),
    tab('parent-b', 'Parent B', 'body-parent-b'),
  ])
  const otherSpace = space('space-b', 'Space B', [tab('parent-c', 'Parent C', 'body-space-b')])
  const otherDomainSpace = space('space-c', 'Space C', [tab('parent-d', 'Parent D', 'body-linked-b')])

  return {
    theme: 'dark',
    activeDomainId: 'domain-a',
    activeSpaceId: 'space-a',
    domains: [
      { id: 'domain-a', name: 'Domain A', activeSpaceId: 'space-a', spaces: [activeSpace, otherSpace] },
      { id: 'domain-b', name: 'Domain B', activeSpaceId: 'space-c', spaces: [otherDomainSpace] },
    ],
    spaces: [activeSpace, otherSpace],
    noteBodies: [
      body('body-home', 'aisle-home', 'aisle-body-home'),
      body('body-sub', 'aisle-sub', 'aisle-body-sub'),
      body('body-linked-a', 'aisle-linked-a', 'shared-aisle-body'),
      body('body-linked-b', 'aisle-linked-b', 'shared-aisle-body'),
      body('body-parent-b', 'aisle-parent-b', 'aisle-body-parent-b'),
      body('body-space-b', 'aisle-space-b', 'aisle-body-space-b'),
    ],
    noteAisleBodies: [
      { id: 'aisle-body-home', markdown: 'home target' },
      { id: 'aisle-body-sub', markdown: 'sub target' },
      { id: 'shared-aisle-body', markdown: 'shared target' },
      { id: 'aisle-body-parent-b', markdown: 'parent b target' },
      { id: 'aisle-body-space-b', markdown: 'space b target' },
    ],
    hotkeys: {
      shortcuts: {
        toggleTabTrash: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
        formatStrikethrough: '',
        cycleParentTabNext: '',
        cycleParentTabPrev: '',
        cycleSubTabNext: '',
        cycleSubTabPrev: '',
      },
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'normalNewLine',
          commandEnter: 'normalNewLine',
        },
        menuOperations: [],
      },
      enableMouseBackForward: true,
      enableGenericHistoryHotkeys: true,
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: {
      showParentHomeTab: true,
      stageManagerOpenDestinationAfterApply: true,
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'hotkeys',
      customThemePalette: null,
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

const ACTIVE_LOCATION: NoteLocation = {
  domainId: 'domain-a',
  spaceId: 'space-a',
  tabId: 'parent-a',
  subTabId: null,
}

describe('find and replace scope collection', () => {
  it('collects note, parent, space, domain, and project scopes from the active location', () => {
    const state = createFindReplaceState()

    expect(collectFindReplaceLocations(state, ACTIVE_LOCATION, 'note').map((location) => location.noteBodyId)).toEqual([
      'body-home',
    ])
    expect(collectFindReplaceLocations(state, ACTIVE_LOCATION, 'parent').map((location) => location.noteBodyId)).toEqual([
      'body-home',
      'body-sub',
      'body-linked-a',
    ])
    expect(collectFindReplaceLocations(state, ACTIVE_LOCATION, 'space').map((location) => location.noteBodyId)).toEqual([
      'body-home',
      'body-sub',
      'body-linked-a',
      'body-parent-b',
    ])
    expect(collectFindReplaceLocations(state, ACTIVE_LOCATION, 'domain').map((location) => location.noteBodyId)).toEqual([
      'body-home',
      'body-sub',
      'body-linked-a',
      'body-parent-b',
      'body-space-b',
    ])
    expect(collectFindReplaceLocations(state, ACTIVE_LOCATION, 'project').map((location) => location.noteBodyId)).toEqual([
      'body-home',
      'body-sub',
      'body-linked-a',
      'body-parent-b',
      'body-space-b',
      'body-linked-b',
    ])
  })
})

describe('visible markdown matching', () => {
  it('searches rendered text without matching markdown syntax or link urls', () => {
    const markdown = [
      '# Heading Target',
      '**Bold Target** and [Link Target](https://example.com/target-url)',
      '- [ ] Task Target',
      '> Quote Target',
      '```ts',
      'code Target',
      '```',
    ].join('\n')
    const state = createFindReplaceState()
    state.noteAisleBodies = [{ id: 'aisle-body-home', markdown }]

    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'target', { caseSensitive: false, wholeWord: false })).toHaveLength(6)
    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'target-url', { caseSensitive: false, wholeWord: false })).toHaveLength(0)
    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'target', { caseSensitive: true, wholeWord: false })).toHaveLength(0)
    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'Target', { caseSensitive: true, wholeWord: true })).toHaveLength(6)
  })

  it('keeps visible positions mapped to markdown source positions', () => {
    const index = buildVisibleMarkdownIndex('- [x] Task [Label](https://example.com)')

    expect(index.text).toBe('Task Label')
    expect(index.positions.every((position) => position >= 0)).toBe(true)
  })

  it('replaces visible link labels without replacing link urls', () => {
    const state = createFindReplaceState()
    state.noteAisleBodies = [{ id: 'aisle-body-home', markdown: '[Link Target](https://example.com/target-url)' }]
    const matches = findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'Link Target', {
      caseSensitive: true,
      wholeWord: false,
    })

    const result = applyFindReplacementToState(state, matches, 'Asset')

    expect(result.replacementCount).toBe(1)
    expect(result.state.noteAisleBodies?.[0]?.markdown).toBe('[Asset](https://example.com/target-url)')
  })

  it('deduplicates replacements for linked aisle bodies while keeping duplicate locations searchable', () => {
    const state = createFindReplaceState()
    const matches = findVisibleMatches(state, ACTIVE_LOCATION, 'project', 'shared target', {
      caseSensitive: false,
      wholeWord: true,
    }).filter((match) => match.aisleBodyId === 'shared-aisle-body')

    const result = applyFindReplacementToState(state, matches, 'linked replacement')

    expect(matches).toHaveLength(2)
    expect(result.replacementCount).toBe(1)
    expect(result.changedAisleBodyIds).toEqual(new Set(['shared-aisle-body']))
    expect(result.state.noteAisleBodies?.find((candidate) => candidate.id === 'shared-aisle-body')?.markdown).toBe(
      'linked replacement',
    )
  })
})
