import { normalizeTagLabel } from './tags.js'

export const TAG_AUTOCOMPLETE_SUGGESTION_LIMIT = 7
export const TAG_AUTOCOMPLETE_RECENT_LIMIT = TAG_AUTOCOMPLETE_SUGGESTION_LIMIT
export const TAG_AUTOCOMPLETE_RECENT_STORAGE_LIMIT = 32
export const TAG_AUTOCOMPLETE_CONTAINS_MIN_QUERY_LENGTH = 3

export type TagAutocompleteQuery = {
  from: number
  to: number
  query: string
}

export type TagAutocompleteSuggestion = {
  key: string
  label: string
  count: number
}

export type TagFilterTagSummary = {
  key: string
  label: string
  count: number
}

export type TagAutocompleteKeyboardInput = {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

export type TagAutocompleteKeyboardAction =
  | { type: 'none' }
  | { type: 'close' }
  | { type: 'highlight'; index: number }
  | { type: 'accept'; index: number }

const TAG_QUERY_BOUNDARY_RE = /(^|[^A-Za-z0-9_/-])#([A-Za-z0-9_/-]*)$/

export function normalizeTagAutocompleteKey(tag: string): string {
  return normalizeTagLabel(tag).toLocaleLowerCase()
}

export function getTagAutocompleteQueryFromText(
  textBeforeCursor: string,
  cursorPosition: number,
): TagAutocompleteQuery | null {
  const source = String(textBeforeCursor ?? '')
  const match = TAG_QUERY_BOUNDARY_RE.exec(source)
  if (!match) return null
  const query = match[2] ?? ''
  const triggerOffset = source.length - query.length - 1
  return {
    from: cursorPosition - query.length - 1,
    to: cursorPosition,
    query: source.slice(triggerOffset + 1),
  }
}

export function normalizeTagAutocompleteRecentKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return []
  const seen = new Set<string>()
  const normalized: string[] = []
  keys.forEach((key) => {
    const normalizedKey = normalizeTagAutocompleteKey(typeof key === 'string' ? key : '')
    if (!normalizedKey || seen.has(normalizedKey)) return
    seen.add(normalizedKey)
    normalized.push(normalizedKey)
  })
  return normalized.slice(0, TAG_AUTOCOMPLETE_RECENT_STORAGE_LIMIT)
}

export function rememberTagAutocompleteKey(currentKeys: string[], key: string): string[] {
  const normalizedKey = normalizeTagAutocompleteKey(key)
  if (!normalizedKey) return normalizeTagAutocompleteRecentKeys(currentKeys)
  return normalizeTagAutocompleteRecentKeys([
    normalizedKey,
    ...currentKeys.filter((candidate) => normalizeTagAutocompleteKey(candidate) !== normalizedKey),
  ])
}

function toSuggestion(tag: TagFilterTagSummary): TagAutocompleteSuggestion {
  return {
    key: tag.key,
    label: tag.label,
    count: tag.count,
  }
}

function sortSuggestionsAz(suggestions: TagAutocompleteSuggestion[]): TagAutocompleteSuggestion[] {
  return [...suggestions].sort((left, right) => {
    const labelCompare = left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    return labelCompare || left.key.localeCompare(right.key)
  })
}

export function getTagAutocompleteSuggestions(
  availableTags: TagFilterTagSummary[],
  query: string,
  recentKeys: string[],
): TagAutocompleteSuggestion[] {
  const tagsByKey = new Map<string, TagFilterTagSummary>()
  availableTags.forEach((tag) => {
    const key = normalizeTagAutocompleteKey(tag.key || tag.label)
    if (!key || tagsByKey.has(key)) return
    tagsByKey.set(key, { ...tag, key, label: normalizeTagLabel(tag.label) || tag.label })
  })

  const queryKey = normalizeTagAutocompleteKey(query)
  const tags = Array.from(tagsByKey.values())
  if (queryKey) {
    const exactSuggestion = tagsByKey.get(queryKey)
    const prefixSuggestions = [
      ...(exactSuggestion ? [toSuggestion(exactSuggestion)] : []),
      ...sortSuggestionsAz(
        tags
          .filter((tag) => tag.key !== queryKey && tag.key.startsWith(queryKey))
          .map(toSuggestion),
      ),
    ]
    if (queryKey.length < TAG_AUTOCOMPLETE_CONTAINS_MIN_QUERY_LENGTH) {
      return prefixSuggestions.length === 1 && exactSuggestion
        ? []
        : prefixSuggestions.slice(0, TAG_AUTOCOMPLETE_SUGGESTION_LIMIT)
    }

    const prefixKeys = new Set(prefixSuggestions.map((suggestion) => suggestion.key))
    const suggestions = [
      ...prefixSuggestions,
      ...sortSuggestionsAz(
        tags
          .filter((tag) => !prefixKeys.has(tag.key) && tag.key.includes(queryKey))
          .map(toSuggestion),
      ),
    ]
    return suggestions.length === 1 && exactSuggestion
      ? []
      : suggestions.slice(0, TAG_AUTOCOMPLETE_SUGGESTION_LIMIT)
  }

  const recentSuggestions = normalizeTagAutocompleteRecentKeys(recentKeys)
    .map((key) => tagsByKey.get(key))
    .filter((tag): tag is TagFilterTagSummary => Boolean(tag))
    .map(toSuggestion)
  const recentSuggestionKeys = new Set(recentSuggestions.map((suggestion) => suggestion.key))
  return [
    ...recentSuggestions,
    ...sortSuggestionsAz(
      tags
        .filter((tag) => !recentSuggestionKeys.has(tag.key))
        .map(toSuggestion),
    ),
  ].slice(0, TAG_AUTOCOMPLETE_SUGGESTION_LIMIT)
}

export function getTagAutocompleteKeyboardAction(
  input: TagAutocompleteKeyboardInput,
  activeIndex: number,
  itemCount: number,
): TagAutocompleteKeyboardAction {
  if (input.key === 'Escape') return { type: 'close' }
  if (input.metaKey || input.ctrlKey || input.altKey || input.shiftKey) return { type: 'none' }

  const boundedCount = Math.max(0, itemCount)
  if (boundedCount === 0) return { type: 'none' }
  const normalizedActiveIndex = Math.max(0, Math.min(boundedCount - 1, activeIndex))

  if (input.key === 'ArrowDown') return { type: 'highlight', index: (normalizedActiveIndex + 1) % boundedCount }
  if (input.key === 'ArrowUp') {
    return { type: 'highlight', index: (normalizedActiveIndex - 1 + boundedCount) % boundedCount }
  }
  if (input.key === 'Home') return { type: 'highlight', index: 0 }
  if (input.key === 'End') return { type: 'highlight', index: boundedCount - 1 }
  if (input.key === 'Enter' || input.key === 'Tab') return { type: 'accept', index: normalizedActiveIndex }
  return { type: 'none' }
}

export function getTagAutocompleteReplacement(label: string): string {
  const normalized = normalizeTagLabel(label)
  return normalized ? `#${normalized} ` : ''
}
