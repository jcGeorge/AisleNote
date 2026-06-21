import { describe, expect, it } from 'vitest'
import type { AppState } from '../types/app'
import {
  getFrontmatterPropertyFilterKey,
  getFrontmatterTemplateFilterKey,
  getSyncedAisleFilterKey,
} from './note-filter'
import {
  buildSidebarSearchIndexes,
  buildSidebarSearchResultGroups,
  getSidebarSearchSuggestions,
  parseSidebarSearchInput,
} from './sidebar-search'

function createSearchState(): AppState {
  return {
    theme: 'dark',
    notebook: {
      activeNoteId: 'note-a',
      items: [
        { type: 'note', id: 'note-a', title: 'Calvin sermon', noteBodyId: 'body-shared-note' },
        { type: 'note', id: 'note-b', title: 'Calvin duplicate', noteBodyId: 'body-shared-note' },
        { type: 'note', id: 'note-c', title: 'Linked aisle note', noteBodyId: 'body-linked-aisle' },
        { type: 'note', id: 'note-d', title: 'Loose tag', noteBodyId: 'body-loose' },
      ],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    noteBodies: [
      { id: 'body-shared-note', aisles: [{ id: 'aisle-a', aisleBodyId: 'aisle-body-shared' }] },
      { id: 'body-linked-aisle', aisles: [{ id: 'aisle-c', aisleBodyId: 'aisle-body-shared' }] },
      { id: 'body-loose', aisles: [{ id: 'aisle-d', aisleBodyId: 'aisle-body-loose' }] },
    ],
    noteAisleBodies: [
      {
        id: 'aisle-body-shared',
        markdown: '#Calvin grace sermon body',
        frontmatter: { speaker: 'Calvin', topic: 'Grace' },
        frontmatterStatus: 'valid',
        frontmatterMeta: {
          templateId: 'template-sermon',
          templateDerived: true,
        },
      },
      {
        id: 'aisle-body-loose',
        markdown: '#Calvin salvation notes',
        frontmatter: null,
        frontmatterStatus: 'none',
      },
    ],
    hotkeys: {
      shortcuts: {} as AppState['hotkeys']['shortcuts'],
      newlineShortcuts: { shortcuts: {} as never, menuOperations: [] },
    },
    frontmatter: {
      templates: [
        {
          id: 'template-sermon',
          name: 'Sermon',
          fields: [],
        },
      ],
      settingsTemplateId: '',
      lastAppliedTemplateId: '',
    },
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 280,
      collapsedFolderIds: [],
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'active-cell',
      noteFontScale: 1,
      settingsSection: 'data',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

describe('sidebar search parsing and suggestions', () => {
  it('parses prefix filter tokens and leaves plain text as the text query', () => {
    const indexes = buildSidebarSearchIndexes(createSearchState())
    const parsed = parseSidebarSearchInput('tag:#Calvin fm:Sermon prop:speaker synced:"Calvin sermon" grace', indexes)

    expect(parsed.text).toBe('grace')
    expect(parsed.tokens.map((token) => [token.kind, token.optionType, token.label])).toEqual([
      ['tags', 'tag', 'Calvin'],
      ['frontmatter', 'frontmatter-template', 'Sermon'],
      ['frontmatter', 'frontmatter-property', 'speaker'],
      ['synced', 'synced-note', 'Calvin sermon'],
    ])
  })

  it('suggests supported filter prefixes including duplicate as synced aliases', () => {
    const indexes = buildSidebarSearchIndexes(createSearchState())

    expect(getSidebarSearchSuggestions('tag:#Cal', indexes).map((suggestion) => suggestion.tokenText)).toContain(
      'tag:#Calvin',
    )
    expect(getSidebarSearchSuggestions('fm:Ser', indexes).map((suggestion) => suggestion.tokenText)).toContain(
      'fm:Sermon',
    )
    expect(getSidebarSearchSuggestions('prop:spe', indexes).map((suggestion) => suggestion.tokenText)).toContain(
      'prop:speaker',
    )
    expect(getSidebarSearchSuggestions('duplicate:Cal', indexes)[0]).toMatchObject({
      kind: 'synced',
      optionType: 'synced-note',
      prefix: 'duplicate',
    })
  })
})

describe('sidebar search result filtering', () => {
  it('combines text, tags, and frontmatter filters with AND semantics', () => {
    const state = createSearchState()
    const indexes = buildSidebarSearchIndexes(state)
    const resultGroups = buildSidebarSearchResultGroups({
      state,
      indexes,
      query: 'grace',
      filter: {
        active: true,
        kind: 'frontmatter',
        tags: { selectedKeys: ['calvin'], sortMode: 'az' },
        synced: { selectedKeys: [] },
        frontmatter: { selectedKeys: [getFrontmatterTemplateFilterKey('template-sermon')] },
        media: { selectedKeys: [] },
      },
    })

    expect(resultGroups.map((group) => group.noteId)).toEqual(['note-a', 'note-b', 'note-c'])
    expect(resultGroups.flatMap((group) => group.results).every((result) => result.snippet.includes('grace'))).toBe(true)
  })

  it('uses synced aisle filters at aisle granularity', () => {
    const state = createSearchState()
    const indexes = buildSidebarSearchIndexes(state)
    const resultGroups = buildSidebarSearchResultGroups({
      state,
      indexes,
      query: 'sermon',
      filter: {
        active: true,
        kind: 'synced',
        tags: { selectedKeys: [], sortMode: 'az' },
        synced: { selectedKeys: [getSyncedAisleFilterKey('aisle-body-shared')] },
        frontmatter: { selectedKeys: [] },
        media: { selectedKeys: [] },
      },
    })

    expect(resultGroups.map((group) => group.noteId)).toEqual(['note-a', 'note-c'])
  })

  it('excludes aisles that do not satisfy every selected filter', () => {
    const state = createSearchState()
    const indexes = buildSidebarSearchIndexes(state)
    const resultGroups = buildSidebarSearchResultGroups({
      state,
      indexes,
      query: 'salvation',
      filter: {
        active: true,
        kind: 'frontmatter',
        tags: { selectedKeys: ['calvin'], sortMode: 'az' },
        synced: { selectedKeys: [] },
        frontmatter: { selectedKeys: [getFrontmatterPropertyFilterKey('speaker')] },
        media: { selectedKeys: [] },
      },
    })

    expect(resultGroups).toEqual([])
  })
})
