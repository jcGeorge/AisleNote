import { buildVisibleMarkdownIndex } from '../notes/find-replace'
import { getAisleBodyId, getAisleMarkdown } from '../notes/note-markdown'
import { buildNoteLocationKey, type NoteSearchEntry } from '../notes/note-locations'
import type { AppState, NoteAisle, NoteFilterKind, NoteFilterSettings, NoteLocation } from '../types/app'
import {
  buildNoteFilterIndex,
  getEmptyNoteFilterIndex,
  type NoteFilterIndex,
  type NoteFilterOption,
  type NoteFilterOptionType,
} from './note-filter'
import { getNotebookIndexContext, type NotebookIndexContext } from './notebook-index-context'

export type SidebarSearchFilterKind = Exclude<NoteFilterKind, 'media'>
export type SidebarSearchPrefix = 'tag' | 'fm' | 'prop' | 'synced' | 'duplicate'

export type SidebarSearchIndexes = Record<SidebarSearchFilterKind, NoteFilterIndex>

export type SidebarSearchToken = {
  kind: SidebarSearchFilterKind
  key: string
  label: string
  optionType: NoteFilterOptionType
  prefix: SidebarSearchPrefix
}

export type ParsedSidebarSearchInput = {
  text: string
  tokens: SidebarSearchToken[]
  activePrefix: SidebarSearchPrefix | null
  activeValue: string
}

export type SidebarSearchSuggestion = SidebarSearchToken & {
  count: number
  tokenText: string
}

export type SidebarSearchResult = {
  key: string
  location: NoteLocation
  noteId: string
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
  aisleNumber: number
  aisleCount: number
  noteName: string
  folderPath: string
  snippet: string
}

export type SidebarSearchResultGroup = {
  key: string
  noteId: string
  noteName: string
  folderPath: string
  results: SidebarSearchResult[]
}

type SidebarSearchCandidate = {
  location: NoteLocation
  note: NoteSearchEntry
  aisle: NoteAisle
  noteBodyId: string
  aisleBodyId: string
  aisleIndex: number
  aisleCount: number
}

const SEARCH_PREFIX_PATTERN = /(^|\s)(tag|fm|prop|synced|duplicate):(?:"([^"]*)"|([^\s"]+))/gi
const ACTIVE_PREFIX_PATTERN = /(?:^|\s)(tag|fm|prop|synced|duplicate):(?:"([^"]*)|([^\s"]*))$/i
const RESULT_LIMIT = 120

function normalizeSearchValue(value: string): string {
  return value.trim().replace(/^#/, '').toLocaleLowerCase()
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function uniqueTokens(tokens: SidebarSearchToken[]): SidebarSearchToken[] {
  const seen = new Set<string>()
  const next: SidebarSearchToken[] = []
  tokens.forEach((token) => {
    const key = `${token.kind}:${token.key}`
    if (seen.has(key)) return
    seen.add(key)
    next.push(token)
  })
  return next
}

function getPrefixKind(prefix: SidebarSearchPrefix): SidebarSearchFilterKind {
  if (prefix === 'tag') return 'tags'
  if (prefix === 'fm' || prefix === 'prop') return 'frontmatter'
  return 'synced'
}

function getOptionPrefix(option: NoteFilterOption, requestedPrefix?: SidebarSearchPrefix): SidebarSearchPrefix {
  if (requestedPrefix === 'duplicate') return 'duplicate'
  if (option.type === 'tag') return 'tag'
  if (option.type === 'frontmatter-template') return 'fm'
  if (option.type === 'frontmatter-property') return 'prop'
  return 'synced'
}

function getOptionsForPrefix(indexes: SidebarSearchIndexes, prefix: SidebarSearchPrefix): NoteFilterOption[] {
  if (prefix === 'tag') return indexes.tags.availableOptions
  if (prefix === 'fm') {
    return indexes.frontmatter.availableOptions.filter((option) => option.type === 'frontmatter-template')
  }
  if (prefix === 'prop') {
    return indexes.frontmatter.availableOptions.filter((option) => option.type === 'frontmatter-property')
  }
  return indexes.synced.availableOptions
}

function createTokenFromOption(
  option: NoteFilterOption,
  prefix: SidebarSearchPrefix = getOptionPrefix(option),
): SidebarSearchToken {
  return {
    kind: getPrefixKind(prefix),
    key: option.key,
    label: option.label,
    optionType: option.type,
    prefix: getOptionPrefix(option, prefix),
  }
}

function optionMatchesValue(prefix: SidebarSearchPrefix, option: NoteFilterOption, value: string): boolean {
  const normalizedValue = normalizeSearchValue(value)
  if (!normalizedValue) return false
  if (normalizeText(option.key) === normalizeText(value)) return true
  const label = prefix === 'tag' ? option.label.replace(/^#/, '') : option.label
  return normalizeSearchValue(label) === normalizedValue
}

function optionMatchesSuggestion(option: NoteFilterOption, value: string): boolean {
  const normalizedValue = normalizeSearchValue(value)
  if (!normalizedValue) return true
  const normalizedLabel = normalizeSearchValue(option.label)
  return normalizedLabel.startsWith(normalizedValue) || normalizedLabel.includes(normalizedValue)
}

function resolveToken(prefix: SidebarSearchPrefix, value: string, indexes: SidebarSearchIndexes): SidebarSearchToken | null {
  const option = getOptionsForPrefix(indexes, prefix).find((candidate) => optionMatchesValue(prefix, candidate, value))
  return option ? createTokenFromOption(option, prefix) : null
}

function getActivePrefix(query: string): Pick<ParsedSidebarSearchInput, 'activePrefix' | 'activeValue'> {
  const match = query.match(ACTIVE_PREFIX_PATTERN)
  if (!match) return { activePrefix: null, activeValue: '' }
  return {
    activePrefix: match[1].toLocaleLowerCase() as SidebarSearchPrefix,
    activeValue: match[2] ?? match[3] ?? '',
  }
}

function replaceRangeWithSpaces(value: string, start: number, end: number): string {
  return `${value.slice(0, start)}${' '.repeat(Math.max(0, end - start))}${value.slice(end)}`
}

export function quoteSidebarSearchTokenValue(value: string): string {
  const normalized = value.trim()
  if (!/\s/.test(normalized)) return normalized
  return `"${normalized.replace(/"/g, '\\"')}"`
}

export function formatSidebarSearchTokenText(token: SidebarSearchToken): string {
  if (token.prefix === 'tag') return `tag:#${quoteSidebarSearchTokenValue(token.label.replace(/^#/, ''))}`
  return `${token.prefix}:${quoteSidebarSearchTokenValue(token.label)}`
}

export function clearActiveSidebarSearchPrefix(query: string): string {
  return query.replace(ACTIVE_PREFIX_PATTERN, '').trim().replace(/\s+/g, ' ')
}

export function getEmptySidebarSearchIndexes(): SidebarSearchIndexes {
  return {
    tags: getEmptyNoteFilterIndex('tags'),
    synced: getEmptyNoteFilterIndex('synced'),
    frontmatter: getEmptyNoteFilterIndex('frontmatter'),
  }
}

export function buildSidebarSearchIndexes(
  state: AppState,
  context?: NotebookIndexContext,
): SidebarSearchIndexes {
  const indexContext = getNotebookIndexContext(state, context)
  return {
    tags: buildNoteFilterIndex(state, 'tags', [], indexContext),
    synced: buildNoteFilterIndex(state, 'synced', [], indexContext),
    frontmatter: buildNoteFilterIndex(state, 'frontmatter', [], indexContext),
  }
}

export function parseSidebarSearchInput(query: string, indexes: SidebarSearchIndexes): ParsedSidebarSearchInput {
  let cleaned = query
  const tokens: SidebarSearchToken[] = []

  for (const match of query.matchAll(SEARCH_PREFIX_PATTERN)) {
    const prefix = match[2].toLocaleLowerCase() as SidebarSearchPrefix
    const value = match[3] ?? match[4] ?? ''
    const token = resolveToken(prefix, value, indexes)
    if (!token) continue
    tokens.push(token)
    const matchIndex = match.index ?? 0
    const start = matchIndex + match[1].length
    const end = matchIndex + match[0].length
    cleaned = replaceRangeWithSpaces(cleaned, start, end)
  }

  return {
    text: cleaned.trim().replace(/\s+/g, ' '),
    tokens: uniqueTokens(tokens),
    ...getActivePrefix(query),
  }
}

export function getSidebarSearchSuggestions(
  query: string,
  indexes: SidebarSearchIndexes,
  selectedTokens: SidebarSearchToken[] = [],
  limit = 8,
): SidebarSearchSuggestion[] {
  const { activePrefix, activeValue } = getActivePrefix(query)
  if (!activePrefix) return []

  const selectedKeys = new Set(selectedTokens.map((token) => `${token.kind}:${token.key}`))
  return getOptionsForPrefix(indexes, activePrefix)
    .filter((option) => optionMatchesSuggestion(option, activeValue))
    .map((option) => createTokenFromOption(option, activePrefix))
    .filter((token) => !selectedKeys.has(`${token.kind}:${token.key}`))
    .slice(0, limit)
    .map((token) => ({
      ...token,
      count: getOptionsForPrefix(indexes, activePrefix).find((option) => option.key === token.key)?.count ?? 0,
      tokenText: formatSidebarSearchTokenText(token),
    }))
}

export function getSidebarSearchSelectedTokens(
  filter: NoteFilterSettings | null | undefined,
  indexes: SidebarSearchIndexes,
): SidebarSearchToken[] {
  if (!filter?.active) return []
  const tokens: SidebarSearchToken[] = []
  const filterKinds: SidebarSearchFilterKind[] = ['tags', 'synced', 'frontmatter']
  filterKinds.forEach((kind) => {
    const selectedKeys = filter[kind]?.selectedKeys ?? []
    selectedKeys.forEach((key) => {
      const option = indexes[kind].availableOptions.find((candidate) => candidate.key === key)
      if (option) tokens.push(createTokenFromOption(option))
    })
  })
  return uniqueTokens(tokens)
}

export function mergeSidebarSearchTokens(
  selectedTokens: SidebarSearchToken[],
  parsedTokens: SidebarSearchToken[],
): SidebarSearchToken[] {
  return uniqueTokens([...selectedTokens, ...parsedTokens])
}

function buildCandidateTokenLookup(
  tokens: SidebarSearchToken[],
  indexes: SidebarSearchIndexes,
): Map<string, Set<string>> {
  const lookup = new Map<string, Set<string>>()
  tokens.forEach((token) => {
    const lookupKey = `${token.kind}:${token.key}`
    if (lookup.has(lookupKey)) return
    const matches = new Set<string>()
    indexes[token.kind].allOccurrences.forEach((occurrence) => {
      if (occurrence.key !== token.key) return
      matches.add(`${occurrence.location.noteId}:${occurrence.aisleId}:${occurrence.aisleBodyId}`)
    })
    lookup.set(lookupKey, matches)
  })
  return lookup
}

function candidateMatchesTokenLookup(
  token: SidebarSearchToken,
  candidate: SidebarSearchCandidate,
  lookup: Map<string, Set<string>>,
): boolean {
  const matches = lookup.get(`${token.kind}:${token.key}`)
  if (!matches) return false
  return matches.has(`${candidate.location.noteId}:${candidate.aisle.id}:${candidate.aisleBodyId}`)
}

function candidateMatchesFilterLookup(
  candidate: SidebarSearchCandidate,
  tokens: SidebarSearchToken[],
  lookup: Map<string, Set<string>>,
): boolean {
  return tokens.every((token) => candidateMatchesTokenLookup(token, candidate, lookup))
}

function queryTextMatches(haystack: string, query: string): boolean {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return true
  const normalizedHaystack = normalizeText(haystack)
  if (normalizedHaystack.includes(normalizedQuery)) return true
  return normalizedQuery.split(/\s+/).filter(Boolean).every((token) => normalizedHaystack.includes(token))
}

function getSnippet(visibleText: string, noteText: string, query: string): string {
  const compactVisibleText = visibleText.replace(/\s+/g, ' ').trim()
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return compactVisibleText.slice(0, 110) || noteText

  const normalizedVisible = normalizeText(compactVisibleText)
  const phraseIndex = normalizedVisible.indexOf(normalizedQuery)
  const token = normalizedQuery.split(/\s+/).find(Boolean) ?? normalizedQuery
  const tokenIndex = phraseIndex >= 0 ? phraseIndex : normalizedVisible.indexOf(token)
  if (tokenIndex < 0) return compactVisibleText.slice(0, 110) || noteText

  const start = Math.max(0, tokenIndex - 38)
  const end = Math.min(compactVisibleText.length, tokenIndex + Math.max(token.length, normalizedQuery.length) + 52)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < compactVisibleText.length ? '...' : ''
  return `${prefix}${compactVisibleText.slice(start, end).trim()}${suffix}`
}

export function buildSidebarSearchResultGroups({
  state,
  query,
  filter,
  indexes,
  context,
  limit = RESULT_LIMIT,
}: {
  state: AppState
  query: string
  filter: NoteFilterSettings | null | undefined
  indexes?: SidebarSearchIndexes
  context?: NotebookIndexContext
  limit?: number
}): SidebarSearchResultGroup[] {
  const indexContext = getNotebookIndexContext(state, context)
  const effectiveIndexes = indexes ?? buildSidebarSearchIndexes(state, indexContext)
  const parsed = parseSidebarSearchInput(query, effectiveIndexes)
  const selectedTokens = mergeSidebarSearchTokens(getSidebarSearchSelectedTokens(filter, effectiveIndexes), parsed.tokens)
  const textQuery = parsed.text
  if (selectedTokens.length <= 0 && !textQuery) return []

  const tokenLookup = buildCandidateTokenLookup(selectedTokens, effectiveIndexes)
  const groups: SidebarSearchResultGroup[] = []
  const groupsByNoteId = new Map<string, SidebarSearchResultGroup>()
  let count = 0

  for (const note of indexContext.locations) {
    const body = indexContext.noteBodiesById.get(note.noteBodyId)
    if (!body) continue
    for (let aisleIndex = 0; aisleIndex < body.aisles.length; aisleIndex += 1) {
      if (count >= limit) break
      const aisle = body.aisles[aisleIndex]
      const aisleBodyId = getAisleBodyId(aisle)
      const candidate: SidebarSearchCandidate = {
        location: { noteId: note.noteId },
        note,
        aisle,
        noteBodyId: note.noteBodyId,
        aisleBodyId,
        aisleIndex,
        aisleCount: body.aisles.length,
      }
      if (!candidateMatchesFilterLookup(candidate, selectedTokens, tokenLookup)) continue

      const markdown = getAisleMarkdown(aisle, indexContext.aisleBodiesById)
      const visibleText = buildVisibleMarkdownIndex(markdown).text
      const noteText = `${note.label} ${note.folderPath} ${note.noteName}`
      if (!queryTextMatches(`${noteText} ${visibleText}`, textQuery)) continue

      const group = groupsByNoteId.get(note.noteId) ?? {
        key: buildNoteLocationKey(note),
        noteId: note.noteId,
        noteName: note.noteName,
        folderPath: note.folderPath,
        results: [],
      }
      if (!groupsByNoteId.has(note.noteId)) {
        groupsByNoteId.set(note.noteId, group)
        groups.push(group)
      }

      group.results.push({
        key: `${note.noteId}:${aisle.id}:${aisleBodyId}`,
        location: { noteId: note.noteId },
        noteId: note.noteId,
        noteBodyId: note.noteBodyId,
        aisleId: aisle.id,
        aisleBodyId,
        aisleNumber: aisleIndex + 1,
        aisleCount: body.aisles.length,
        noteName: note.noteName,
        folderPath: note.folderPath,
        snippet: getSnippet(visibleText, noteText, textQuery),
      })
      count += 1
    }
  }

  return groups
}
