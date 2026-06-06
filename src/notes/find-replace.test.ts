import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { EDITOR_BLANK_LINE_PLACEHOLDER } from '../markdown/markdown-utils'
import type { AppState, NoteBody, NoteLocation, Space, Tab } from '../types/app'
import {
  applyFindReplacementToState,
  SCRATCHPAD_FIND_LOCATION,
  buildVisibleMarkdownIndex,
  collectFindReplaceLocations,
  findVisibleMatches,
  getFindReplaceQueryError,
} from './find-replace'
import { buildPreviewToken, buildInternalNoteLinkToken } from './note-references'

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
        toggleNotesTrash: '',
        toggleNotesScratchpad: '',
        toggleNotesFilter: '',
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

const ACTIVE_LOCATION: NoteLocation = {
  domainId: 'domain-a',
  spaceId: 'space-a',
  tabId: 'parent-a',
  subTabId: null,
}

describe('find and replace scope collection', () => {
  it('collects note, parent, space, domain, and notebook scopes from the active location', () => {
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
    expect(collectFindReplaceLocations(state, ACTIVE_LOCATION, 'notebook').map((location) => location.noteBodyId)).toEqual([
      'body-home',
      'body-sub',
      'body-linked-a',
      'body-parent-b',
      'body-space-b',
      'body-linked-b',
    ])
  })

  it('appends scratchpad to every normal scope and searches it after project results', () => {
    const state = createFindReplaceState()
    state.scratchpad = { noteBodyId: 'body-scratch', activeAisleId: 'aisle-scratch' }
    state.noteBodies.push(body('body-scratch', 'aisle-scratch', 'aisle-body-scratch'))
    state.noteAisleBodies?.push({ id: 'aisle-body-scratch', markdown: 'scratch target' })

    expect(collectFindReplaceLocations(state, ACTIVE_LOCATION, 'note').map((location) => location.noteBodyId)).toEqual([
      'body-home',
      'body-scratch',
    ])
    expect(collectFindReplaceLocations(state, ACTIVE_LOCATION, 'parent').map((location) => location.noteBodyId)).toEqual([
      'body-home',
      'body-sub',
      'body-linked-a',
      'body-scratch',
    ])
    expect(collectFindReplaceLocations(state, ACTIVE_LOCATION, 'space').map((location) => location.noteBodyId)).toEqual([
      'body-home',
      'body-sub',
      'body-linked-a',
      'body-parent-b',
      'body-scratch',
    ])
    expect(collectFindReplaceLocations(state, ACTIVE_LOCATION, 'domain').map((location) => location.noteBodyId)).toEqual([
      'body-home',
      'body-sub',
      'body-linked-a',
      'body-parent-b',
      'body-space-b',
      'body-scratch',
    ])
    expect(collectFindReplaceLocations(state, ACTIVE_LOCATION, 'notebook').map((location) => location.noteBodyId)).toEqual([
      'body-home',
      'body-sub',
      'body-linked-a',
      'body-parent-b',
      'body-space-b',
      'body-linked-b',
      'body-scratch',
    ])
    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'target', {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    }).map((match) => match.context.noteKind)).toEqual(['parent', 'scratchpad'])
  })

  it('uses scratchpad for scratchpad-local scopes and appends it after notebook results', () => {
    const state = createFindReplaceState()
    state.scratchpad = { noteBodyId: 'body-scratch', activeAisleId: 'aisle-scratch' }
    state.noteBodies.push(body('body-scratch', 'aisle-scratch', 'aisle-body-scratch'))
    state.noteAisleBodies?.push({ id: 'aisle-body-scratch', markdown: 'scratch target' })

    const scratchpadLocalScopes = ['note', 'parent', 'space', 'domain'] as const
    scratchpadLocalScopes.forEach((scope) => {
      expect(collectFindReplaceLocations(state, SCRATCHPAD_FIND_LOCATION, scope).map((location) => location.noteBodyId)).toEqual([
        'body-scratch',
      ])
    })
    expect(collectFindReplaceLocations(state, SCRATCHPAD_FIND_LOCATION, 'notebook').map((location) => location.noteBodyId)).toEqual([
      'body-home',
      'body-sub',
      'body-linked-a',
      'body-parent-b',
      'body-space-b',
      'body-linked-b',
      'body-scratch',
    ])
    expect(findVisibleMatches(state, SCRATCHPAD_FIND_LOCATION, 'notebook', 'target', {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    }).at(-1)?.context.noteKind).toBe('scratchpad')
  })

  it('adds aisle display metadata to normal and scratchpad matches', () => {
    const state = createFindReplaceState()
    const homeBody = state.noteBodies.find((candidate) => candidate.id === 'body-home')
    homeBody?.aisles.push({ id: 'aisle-home-2', aisleBodyId: 'aisle-body-home-2' })
    state.noteAisleBodies?.push({ id: 'aisle-body-home-2', markdown: 'second target' })

    const normalMatches = findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'target', {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    })

    expect(normalMatches.map((match) => [match.aisleId, match.aisleIndex, match.aisleNumber, match.aisleCount])).toEqual([
      ['aisle-home', 0, 1, 2],
      ['aisle-home-2', 1, 2, 2],
    ])

    state.scratchpad = { noteBodyId: 'body-scratch', activeAisleId: 'aisle-scratch-2' }
    state.noteBodies.push({
      id: 'body-scratch',
      aisles: [
        { id: 'aisle-scratch-1', aisleBodyId: 'aisle-body-scratch-1' },
        { id: 'aisle-scratch-2', aisleBodyId: 'aisle-body-scratch-2' },
      ],
    })
    state.noteAisleBodies?.push(
      { id: 'aisle-body-scratch-1', markdown: 'scratch first' },
      { id: 'aisle-body-scratch-2', markdown: 'scratch second' },
    )

    const scratchpadMatches = findVisibleMatches(state, SCRATCHPAD_FIND_LOCATION, 'note', 'scratch', {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    })

    expect(scratchpadMatches.map((match) => [match.aisleId, match.aisleIndex, match.aisleNumber, match.aisleCount])).toEqual([
      ['aisle-scratch-1', 0, 1, 2],
      ['aisle-scratch-2', 1, 2, 2],
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

  it('preserves blank paragraphs around task lists when replacing text with nothing', () => {
    const state = createFindReplaceState()
    const markdown = [
      'Intro',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '- [ ] icon-one.svg',
      '- [ ] icon-two.svg',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      'Outro',
    ].join('\n')
    state.noteAisleBodies = [{ id: 'aisle-body-home', markdown }]
    const matches = findVisibleMatches(state, ACTIVE_LOCATION, 'note', '.svg', {
      caseSensitive: true,
      wholeWord: false,
      regex: false,
    })

    const result = applyFindReplacementToState(state, matches, '')

    expect(result.replacementCount).toBe(2)
    expect(result.state.noteAisleBodies?.[0]?.markdown).toBe([
      'Intro',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '- [ ] icon-one',
      '- [ ] icon-two',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      'Outro',
    ].join('\n'))
  })

  it('does not search or replace note preview directive tokens', () => {
    const state = createFindReplaceState()
    const previewToken = buildPreviewToken(state, {
      id: 'preview-token',
      target: { ...ACTIVE_LOCATION, subTabId: 'sub-a' },
    })
    state.noteAisleBodies = [{ id: 'aisle-body-home', markdown: `red ${previewToken} red` }]

    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'preview-token', {
      caseSensitive: true,
      wholeWord: false,
      regex: false,
    })).toEqual([])
    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'Sub A', {
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

  it('searches wiki note link display text without matching handles or preview embeds', () => {
    const state = createFindReplaceState()
    const wikiLink = buildInternalNoteLinkToken(state, { ...ACTIVE_LOCATION, subTabId: 'sub-a' })
    const aliasedLink = buildInternalNoteLinkToken(state, { ...ACTIVE_LOCATION, subTabId: 'sub-a' }, 'Custom Label')
    const previewToken = buildPreviewToken(state, {
      id: 'preview-token',
      target: { ...ACTIVE_LOCATION, subTabId: 'sub-a' },
    })
    state.noteAisleBodies = [{ id: 'aisle-body-home', markdown: `${wikiLink} ${aliasedLink} ${previewToken}` }]

    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'Sub A', {
      caseSensitive: true,
      wholeWord: false,
      regex: false,
    })).toHaveLength(1)
    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'Custom Label', {
      caseSensitive: true,
      wholeWord: false,
      regex: false,
    })).toHaveLength(1)
    expect(findVisibleMatches(state, ACTIVE_LOCATION, 'note', 'sub-a', {
      caseSensitive: true,
      wholeWord: false,
      regex: false,
    })).toEqual([])
  })

  it('deduplicates replacements for linked aisle bodies while keeping duplicate locations searchable', () => {
    const state = createFindReplaceState()
    const matches = findVisibleMatches(state, ACTIVE_LOCATION, 'notebook', 'shared target', {
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
