import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, NoteBody, NoteLocation, Space, Tab } from '../types/app'
import {
  applyFindReplacementToState,
  buildVisibleMarkdownIndex,
  collectFindReplaceLocations,
  findVisibleMatches,
  getFindReplaceQueryError,
} from './find-replace'
import { buildContextToken } from './note-references'

function tab(id: string, title: string, noteBodyId: string, subTabs: Array<{ id: string; title: string; body: string }> = []): Tab {
  return {
    id,
    title,
    noteBodyId,
    activeSubTabId: subTabs[0]?.id ?? null,
    subTabs: subTabs.map((subTab) => ({
      id: subTab.id,
      title: subTab.title,
      noteBodyId: subTab.body,
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

function body(id: string, aisleId: string, aisleBodyId: string): NoteBody {
  return {
    id,
    aisles: [{ id: aisleId, aisleBodyId }],
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

    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'target', { caseSensitive: false, wholeWord: false, regex: false })).toHaveLength(6)
    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'target-url', { caseSensitive: false, wholeWord: false, regex: false })).toHaveLength(0)
    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'target', { caseSensitive: true, wholeWord: false, regex: false })).toHaveLength(0)
    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'Target', { caseSensitive: true, wholeWord: true, regex: false })).toHaveLength(6)
  })

  it('supports regex matching without throwing on invalid patterns', () => {
    const state = createFindReplaceState()
    state.noteAisleBodies = [{ id: 'aisle-body-home', markdown: 'Bear Beetle bearcat' }]

    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'b[a-z]+r', {
      caseSensitive: false,
      wholeWord: true,
      regex: true,
    }).map((match) => match.matchedText)).toEqual(['Bear'])
    expect(getFindReplaceQueryError('[', { caseSensitive: false, wholeWord: false, regex: true })).toBe('invalid regex')
    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', '[', {
      caseSensitive: false,
      wholeWord: false,
      regex: true,
    })).toEqual([])
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
      regex: false,
    })

    const result = applyFindReplacementToState(state, matches, 'Asset')

    expect(result.replacementCount).toBe(1)
    expect(result.state.noteAisleBodies?.[0]?.markdown).toBe('[Asset](https://example.com/target-url)')
  })

  it('does not search or replace encoded note preview context tokens', () => {
    const previewToken = buildContextToken({
      id: 'preview-token',
      target: { ...ACTIVE_LOCATION, subTabId: 'sub-a' },
    })
    const encodedFragment = previewToken.match(/\{\{tabs-context:([A-Za-z0-9_-]+)\}\}/)?.[1]?.slice(0, 8) ?? ''
    const state = createFindReplaceState()
    state.noteAisleBodies = [{ id: 'aisle-body-home', markdown: `red ${previewToken} red` }]

    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', encodedFragment, {
      caseSensitive: true,
      wholeWord: false,
      regex: false,
    })).toEqual([])

    const matches = findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'e', {
      caseSensitive: true,
      wholeWord: false,
      regex: false,
    })
    const result = applyFindReplacementToState(state, matches, 'x')

    expect(result.replacementCount).toBe(2)
    expect(result.state.noteAisleBodies?.[0]?.markdown).toBe(`rxd ${previewToken} rxd`)
  })

  it('deduplicates replacements for linked aisle bodies while keeping duplicate locations searchable', () => {
    const state = createFindReplaceState()
    const matches = findVisibleMatches(state, ACTIVE_LOCATION, 'project', 'shared target', {
      caseSensitive: false,
      wholeWord: true,
      regex: false,
    }).filter((match) => match.aisleBodyId === 'shared-aisle-body')

    const result = applyFindReplacementToState(state, matches, 'linked replacement')

    expect(matches).toHaveLength(2)
    expect(result.replacementCount).toBe(1)
    expect(result.changedAisleBodyIds).toEqual(new Set(['shared-aisle-body']))
    expect(result.state.noteAisleBodies?.find((candidate) => candidate.id === 'shared-aisle-body')?.markdown).toBe(
      'linked replacement',
    )
  })

  it('uses regex capture groups in replacement text', () => {
    const state = createFindReplaceState()
    state.noteAisleBodies = [{ id: 'aisle-body-home', markdown: 'Bear 42' }]
    const matches = findVisibleMatches(state, ACTIVE_LOCATION, 'note', '(Bear) (\\d+)', {
      caseSensitive: true,
      wholeWord: false,
      regex: true,
    })

    const result = applyFindReplacementToState(state, matches, '$2-$1-$&')

    expect(result.replacementCount).toBe(1)
    expect(result.state.noteAisleBodies?.[0]?.markdown).toBe('42-Bear-Bear 42')
  })

  it('replaces matches across every aisle in the active tab scope', () => {
    const state = createFindReplaceState()
    state.noteBodies = [
      body('body-home', 'aisle-home', 'aisle-body-home'),
      body('body-sub', 'aisle-sub', 'aisle-body-sub'),
    ]
    state.noteBodies[0].aisles.push({ id: 'aisle-home-2', aisleBodyId: 'aisle-body-home-2' })
    state.noteAisleBodies = [
      { id: 'aisle-body-home', markdown: 'first target' },
      { id: 'aisle-body-home-2', markdown: 'second target' },
    ]
    const matches = findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'target', {
      caseSensitive: false,
      wholeWord: true,
      regex: false,
    })

    const result = applyFindReplacementToState(state, matches, 'result')

    expect(result.replacementCount).toBe(2)
    expect(result.changedAisleBodyIds).toEqual(new Set(['aisle-body-home', 'aisle-body-home-2']))
    expect(result.state.noteAisleBodies?.map((aisleBody) => [aisleBody.id, aisleBody.markdown])).toEqual([
      ['aisle-body-home', 'first result'],
      ['aisle-body-home-2', 'second result'],
    ])
  })
})
