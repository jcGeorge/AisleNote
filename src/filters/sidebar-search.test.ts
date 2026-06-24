import { describe, expect, it } from 'vitest'
import type { AppState } from '../types/app'
import {
  buildNoteFilterIndex,
  getFrontmatterPropertyFilterKey,
  getFrontmatterTemplateFilterKey,
  getSyncedAisleFilterKey,
} from './note-filter'
import { createNotebookIndexContext } from './notebook-index-context'
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
      ['synced', 'synced-aisle', 'Calvin sermon'],
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
      optionType: 'synced-aisle',
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

    expect(resultGroups.map((group) => group.noteId)).toEqual(['note-a', 'note-b', 'note-c'])
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

describe('sidebar search index context', () => {
  it('preserves sidebar index and result shapes when callers provide a notebook index context', () => {
    const state = createSearchState()
    const context = createNotebookIndexContext(state)
    const directIndexes = buildSidebarSearchIndexes(state)
    const contextIndexes = buildSidebarSearchIndexes(state, context)

    expect(contextIndexes.tags.availableOptions).toEqual(directIndexes.tags.availableOptions)
    expect(contextIndexes.synced.availableOptions).toEqual(directIndexes.synced.availableOptions)
    expect(contextIndexes.frontmatter.availableOptions).toEqual(directIndexes.frontmatter.availableOptions)
    expect(contextIndexes.tags.allOccurrences).toEqual(directIndexes.tags.allOccurrences)
    expect(contextIndexes.synced.allOccurrences).toEqual(directIndexes.synced.allOccurrences)
    expect(contextIndexes.frontmatter.allOccurrences).toEqual(directIndexes.frontmatter.allOccurrences)

    const directResults = buildSidebarSearchResultGroups({
      state,
      indexes: directIndexes,
      query: 'grace',
      filter: null,
    })
    const contextResults = buildSidebarSearchResultGroups({
      state,
      context,
      indexes: contextIndexes,
      query: 'grace',
      filter: null,
    })

    expect(contextResults).toEqual(directResults)
  })

  it('uses precomputed body maps in context-backed note filter builders', () => {
    const state = createSearchState()
    const context = createNotebookIndexContext(state)
    const originalFind = state.noteBodies.find
    state.noteBodies.find = (() => {
      throw new Error('noteBodies.find should not be used by context-backed filter builders')
    }) as typeof state.noteBodies.find

    try {
      expect(buildNoteFilterIndex(state, 'tags', [], context).availableOptions.map((option) => option.label)).toContain(
        'Calvin',
      )
      expect(buildNoteFilterIndex(state, 'synced', [], context).availableOptions).toHaveLength(1)
      expect(buildNoteFilterIndex(state, 'frontmatter', [], context).availableOptions.map((option) => option.key)).toContain(
        getFrontmatterTemplateFilterKey('template-sermon'),
      )
      expect(buildNoteFilterIndex(state, 'media', [], context).availableOptions).toEqual([])
    } finally {
      state.noteBodies.find = originalFind
    }
  })
})
