import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  TAG_AUTOCOMPLETE_CONTAINS_MIN_QUERY_LENGTH,
  TAG_AUTOCOMPLETE_RECENT_LIMIT,
  TAG_AUTOCOMPLETE_RECENT_STORAGE_LIMIT,
  TAG_AUTOCOMPLETE_SUGGESTION_LIMIT,
  getTagAutocompleteKeyboardAction,
  getTagAutocompleteQueryFromText,
  getTagAutocompleteReplacement,
  getTagAutocompleteSuggestions,
  normalizeTagAutocompleteRecentKeys,
  rememberTagAutocompleteKey,
} from './tag-autocomplete'
import type { TagFilterTagSummary } from './tag-filter'

const useTagAutocompleteControllerSource = readFileSync(
  fileURLToPath(new URL('./useTagAutocompleteController.ts', import.meta.url)),
  'utf8',
)

const tags: TagFilterTagSummary[] = [
  { key: 'asdf', label: 'asdf', count: 4 },
  { key: 'asdf1', label: 'asdf1', count: 3 },
  { key: 'asdf2', label: 'asdf2', count: 2 },
  { key: 'asdf3', label: 'asdf3', count: 1 },
  { key: 'nested/tag', label: 'Nested/Tag', count: 5 },
  { key: 'tag-3', label: 'Tag-3', count: 1 },
  { key: 'thingsthatarecool', label: 'ThingsThatAreCool', count: 1 },
  { key: 'coolitems', label: 'CoolItems', count: 1 },
  { key: 'swellcooljay', label: 'SwellCoolJay', count: 1 },
  { key: 'cool', label: 'Cool', count: 1 },
]

describe('tag autocomplete helpers', () => {
  it('detects markdown tag queries at valid text boundaries', () => {
    expect(getTagAutocompleteQueryFromText('#', 1)).toEqual({ from: 0, to: 1, query: '' })
    expect(getTagAutocompleteQueryFromText('#a', 2)).toEqual({ from: 0, to: 2, query: 'a' })
    expect(getTagAutocompleteQueryFromText('hello #asdf', 11)).toEqual({ from: 6, to: 11, query: 'asdf' })
    expect(getTagAutocompleteQueryFromText('hello #Tag-3', 12)).toEqual({ from: 6, to: 12, query: 'Tag-3' })
    expect(getTagAutocompleteQueryFromText('hello #nested/tag', 17)).toEqual({
      from: 6,
      to: 17,
      query: 'nested/tag',
    })
  })

  it('rejects non-tag contexts and invalid query characters', () => {
    expect(getTagAutocompleteQueryFromText('C#', 2)).toBeNull()
    expect(getTagAutocompleteQueryFromText('https://example.com/#anchor', 27)).toBeNull()
    expect(getTagAutocompleteQueryFromText('#bad?', 5)).toBeNull()
    expect(getTagAutocompleteQueryFromText('file/path#tag', 13)).toBeNull()
  })

  it('filters typed suggestions by case-insensitive prefix and sorts A-Z', () => {
    expect(getTagAutocompleteSuggestions(tags, 'a', []).map((tag) => tag.label)).toEqual([
      'asdf',
      'asdf1',
      'asdf2',
      'asdf3',
    ])
    expect(getTagAutocompleteSuggestions(tags, 'TA', []).map((tag) => tag.label)).toEqual(['Tag-3'])
    expect(getTagAutocompleteSuggestions(tags, 'nested', []).map((tag) => tag.label)).toEqual(['Nested/Tag'])
  })

  it('adds contains matches after the minimum query length', () => {
    expect(TAG_AUTOCOMPLETE_CONTAINS_MIN_QUERY_LENGTH).toBe(3)
    expect(getTagAutocompleteSuggestions(tags, 'Co', []).map((tag) => tag.label)).toEqual(['Cool', 'CoolItems'])
    expect(getTagAutocompleteSuggestions(tags, 'Coo', []).map((tag) => tag.label)).toEqual([
      'Cool',
      'CoolItems',
      'SwellCoolJay',
      'ThingsThatAreCool',
    ])
    expect(getTagAutocompleteSuggestions(tags, 'TAG', []).map((tag) => tag.label)).toEqual(['Tag-3', 'Nested/Tag'])
  })

  it('keeps prefix matches first and does not duplicate contains matches', () => {
    const suggestions = getTagAutocompleteSuggestions(tags, 'coo', [])
    expect(suggestions.map((tag) => tag.label)).toEqual([
      'Cool',
      'CoolItems',
      'SwellCoolJay',
      'ThingsThatAreCool',
    ])
    expect(new Set(suggestions.map((tag) => tag.key)).size).toBe(suggestions.length)
  })

  it('hides suggestions when the typed query only exactly matches an existing tag', () => {
    expect(getTagAutocompleteSuggestions(tags, 'nested/tag', [])).toEqual([])
  })

  it('keeps exact matches when longer or contains alternatives are available', () => {
    expect(getTagAutocompleteSuggestions(tags, 'Cool', []).map((tag) => tag.label)).toEqual([
      'Cool',
      'CoolItems',
      'SwellCoolJay',
      'ThingsThatAreCool',
    ])
  })

  it('shows recent existing tags first for a bare trigger and fills with A-Z tags', () => {
    expect(TAG_AUTOCOMPLETE_SUGGESTION_LIMIT).toBe(7)
    expect(TAG_AUTOCOMPLETE_RECENT_LIMIT).toBe(TAG_AUTOCOMPLETE_SUGGESTION_LIMIT)
    const recent = ['missing', 'tag-3', 'nested/tag', 'asdf']
    expect(getTagAutocompleteSuggestions(tags, '', recent).map((tag) => tag.label)).toEqual([
      'Tag-3',
      'Nested/Tag',
      'asdf',
      'asdf1',
      'asdf2',
      'asdf3',
      'Cool',
    ])

    const manyTags = Array.from({ length: TAG_AUTOCOMPLETE_RECENT_LIMIT + 2 }, (_, index) => ({
      key: `tag${index}`,
      label: `tag${index}`,
      count: index + 1,
    }))
    expect(
      getTagAutocompleteSuggestions(
        manyTags,
        '',
        manyTags.map((tag) => tag.key),
      ),
    ).toHaveLength(TAG_AUTOCOMPLETE_RECENT_LIMIT)
  })

  it('caps typed suggestions to the menu limit', () => {
    const manyTags = Array.from({ length: TAG_AUTOCOMPLETE_SUGGESTION_LIMIT + 4 }, (_, index) => ({
      key: `alpha-${index}`,
      label: `Alpha-${index}`,
      count: index + 1,
    }))
    expect(getTagAutocompleteSuggestions(manyTags, 'alpha', [])).toHaveLength(TAG_AUTOCOMPLETE_SUGGESTION_LIMIT)
  })

  it('normalizes and remembers recent selected tags with a bounded history', () => {
    expect(normalizeTagAutocompleteRecentKeys(['Tag', '#tag', 'Nested/Tag', '', 4])).toEqual(['tag', 'nested/tag'])
    expect(rememberTagAutocompleteKey(['asdf', 'tag-3'], 'Nested/Tag')).toEqual(['nested/tag', 'asdf', 'tag-3'])
    expect(rememberTagAutocompleteKey(['asdf', 'tag-3'], 'ASDF')).toEqual(['asdf', 'tag-3'])
    expect(
      normalizeTagAutocompleteRecentKeys(Array.from({ length: TAG_AUTOCOMPLETE_RECENT_STORAGE_LIMIT + 4 }, (_, index) => `tag${index}`)),
    ).toHaveLength(TAG_AUTOCOMPLETE_RECENT_STORAGE_LIMIT)
  })

  it('reduces keyboard input while the menu is open', () => {
    expect(getTagAutocompleteKeyboardAction({ key: 'ArrowDown' }, 0, 3)).toEqual({ type: 'highlight', index: 1 })
    expect(getTagAutocompleteKeyboardAction({ key: 'ArrowUp' }, 0, 3)).toEqual({ type: 'highlight', index: 2 })
    expect(getTagAutocompleteKeyboardAction({ key: 'Home' }, 2, 3)).toEqual({ type: 'highlight', index: 0 })
    expect(getTagAutocompleteKeyboardAction({ key: 'End' }, 0, 3)).toEqual({ type: 'highlight', index: 2 })
    expect(getTagAutocompleteKeyboardAction({ key: 'Enter' }, 1, 3)).toEqual({ type: 'accept', index: 1 })
    expect(getTagAutocompleteKeyboardAction({ key: 'Tab' }, 1, 3)).toEqual({ type: 'accept', index: 1 })
    expect(getTagAutocompleteKeyboardAction({ key: 'Escape', metaKey: true }, 1, 3)).toEqual({ type: 'close' })
    expect(getTagAutocompleteKeyboardAction({ key: 'Enter', ctrlKey: true }, 1, 3)).toEqual({ type: 'none' })
  })

  it('builds replacement text with selected casing', () => {
    expect(getTagAutocompleteReplacement('Nested/Tag')).toBe('#Nested/Tag ')
  })

  it('requests available tags lazily after a cursor tag query exists', () => {
    expect(useTagAutocompleteControllerSource).toContain('getAvailableTags: () => TagFilterTagSummary[]')
    expect(useTagAutocompleteControllerSource).toContain('const getAvailableTagsRef = useRef(getAvailableTags)')
    expect(useTagAutocompleteControllerSource).toContain('getTagAutocompleteSuggestions(getAvailableTagsRef.current(), query.query')
    expect(useTagAutocompleteControllerSource).not.toContain('availableTagsRef.current = availableTags')
  })
})
