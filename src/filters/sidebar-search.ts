import { coerceFrontmatterString } from '../frontmatter/frontmatter'
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

export type SidebarSearchIndexes = Record<SidebarSearchFilterKind, NoteFilterIndex> & {
  frontmatterValues: NoteFilterOption[]
}

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
  frontmatterTerms: SidebarSearchFrontmatterTerm[]
  presenceTerms: SidebarSearchPresenceTerm[]
  activePrefix: SidebarSearchPrefix | null
  activeValue: string
}

export type SidebarSearchFrontmatterTerm = {
  value: string
  quoted: boolean
}

export type SidebarSearchPresenceTerm = {
  prefix: SidebarSearchPrefix
  kind: SidebarSearchFilterKind
  value: boolean
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

type SidebarSearchSegment = {
  prefix: SidebarSearchPrefix
  value: string
  start: number
  end: number
  complete: boolean
  quoted: boolean
}

const SEARCH_PREFIX_PATTERN = /^(tag|fm|prop|synced|duplicate):/i
const RESULT_LIMIT = 120
const FRONTMATTER_VALUE_SUGGESTION_PREFIX = 'fm-value:'

function normalizeSearchValue(value: string): string {
  return value.trim().replace(/^#/, '').toLocaleLowerCase()
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function parseBooleanSearchValue(value: string): boolean | null {
  const normalized = normalizeText(value)
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return null
}

function normalizeSearchDocument(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function isWhitespace(value: string): boolean {
  return /\s/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
  if (requestedPrefix === 'fm' && (
    option.type === 'frontmatter-template' ||
    option.type === 'frontmatter-property' ||
    option.type === 'frontmatter-value'
  )) return 'fm'
  if (requestedPrefix === 'prop' && option.type === 'frontmatter-property') return 'prop'
  if (option.type === 'tag') return 'tag'
  if (option.type === 'frontmatter-template') return 'fm'
  if (option.type === 'frontmatter-property' || option.type === 'frontmatter-value') return 'fm'
  return 'synced'
}

function getOptionsForPrefix(indexes: SidebarSearchIndexes, prefix: SidebarSearchPrefix): NoteFilterOption[] {
  if (prefix === 'tag') return indexes.tags.availableOptions
  if (prefix === 'fm') {
    return [
      ...indexes.frontmatter.availableOptions.filter((option) =>
        option.type === 'frontmatter-template' || option.type === 'frontmatter-property',
      ),
      ...indexes.frontmatterValues,
    ]
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

function readSidebarSearchSegments(query: string): SidebarSearchSegment[] {
  const segments: SidebarSearchSegment[] = []
  let index = 0

  while (index < query.length) {
    if (index > 0 && !isWhitespace(query[index - 1] ?? '')) {
      index += 1
      continue
    }

    const prefixMatch = query.slice(index).match(SEARCH_PREFIX_PATTERN)
    if (!prefixMatch) {
      index += 1
      continue
    }

    const prefix = (prefixMatch[1] ?? '').toLocaleLowerCase() as SidebarSearchPrefix
    const valueStart = index + prefixMatch[0].length
    const quote = query[valueStart]
    if (quote === '"' || quote === "'") {
      let cursor = valueStart + 1
      let value = ''
      let complete = false
      while (cursor < query.length) {
        const character = query[cursor] ?? ''
        if (character === '\\' && cursor + 1 < query.length) {
          value += query[cursor + 1] ?? ''
          cursor += 2
          continue
        }
        if (character === quote) {
          complete = true
          cursor += 1
          break
        }
        value += character
        cursor += 1
      }
      segments.push({
        prefix,
        value,
        start: index,
        end: cursor,
        complete: complete && value.trim().length > 0,
        quoted: true,
      })
      index = cursor
      continue
    }

    let cursor = valueStart
    while (cursor < query.length && !isWhitespace(query[cursor] ?? '')) cursor += 1
    const value = query.slice(valueStart, cursor)
    segments.push({
      prefix,
      value,
      start: index,
      end: cursor,
      complete: value.trim().length > 0,
      quoted: false,
    })
    index = cursor
  }

  return segments
}

function getActiveSegment(query: string): SidebarSearchSegment | null {
  if (!query || isWhitespace(query[query.length - 1] ?? '')) return null
  return readSidebarSearchSegments(query).findLast((segment) => segment.end === query.length) ?? null
}

function getActivePrefix(query: string): Pick<ParsedSidebarSearchInput, 'activePrefix' | 'activeValue'> {
  const activeSegment = getActiveSegment(query)
  if (!activeSegment) return { activePrefix: null, activeValue: '' }
  return {
    activePrefix: activeSegment.prefix,
    activeValue: activeSegment.value,
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
  const activeSegment = getActiveSegment(query)
  if (!activeSegment) return query.trim().replace(/\s+/g, ' ')
  return `${query.slice(0, activeSegment.start)}${query.slice(activeSegment.end)}`.trim().replace(/\s+/g, ' ')
}

export function completeSidebarSearchTokenQuery(query: string, tokenText: string): string {
  const normalizedTokenText = tokenText.trim()
  if (!normalizedTokenText) return query
  const activeSegment = getActiveSegment(query)
  const nextQuery = activeSegment
    ? `${query.slice(0, activeSegment.start)}${normalizedTokenText}${query.slice(activeSegment.end)}`
    : `${query.trim()} ${normalizedTokenText}`
  return `${nextQuery.trim().replace(/\s+/g, ' ')} `
}

export function appendSidebarSearchTokenQuery(query: string, tokenText: string): string {
  const normalizedTokenText = tokenText.trim()
  if (!normalizedTokenText) return query
  return `${`${query.trim()} ${normalizedTokenText}`.trim().replace(/\s+/g, ' ')} `
}

export function getSidebarSearchTokenForKey(
  indexes: SidebarSearchIndexes,
  kind: SidebarSearchFilterKind,
  key: string,
): SidebarSearchToken | null {
  const option = indexes[kind].availableOptions.find((candidate) => candidate.key === key)
  return option ? createTokenFromOption(option) : null
}

export function getEmptySidebarSearchIndexes(): SidebarSearchIndexes {
  return {
    tags: getEmptyNoteFilterIndex('tags'),
    synced: getEmptyNoteFilterIndex('synced'),
    frontmatter: getEmptyNoteFilterIndex('frontmatter'),
    frontmatterValues: [],
  }
}

function getFrontmatterValueSuggestionLabel(value: unknown): string {
  if (value == null || isRecord(value)) return ''
  const label = coerceFrontmatterString(value).replace(/\s+/g, ' ').trim()
  if (!label || label.length > 48) return ''
  return label
}

function getFrontmatterValueSuggestionLabels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => getFrontmatterValueSuggestionLabels(item))
  }
  const label = getFrontmatterValueSuggestionLabel(value)
  return label ? [label] : []
}

function buildFrontmatterValueOptions(context: NotebookIndexContext): NoteFilterOption[] {
  const optionsByKey = new Map<string, NoteFilterOption>()

  context.locations.forEach((location) => {
    const body = context.noteBodiesById.get(location.noteBodyId)
    body?.aisles.forEach((aisle) => {
      const aisleBody = context.aisleBodiesById.get(getAisleBodyId(aisle))
      if (aisleBody?.frontmatterStatus !== 'valid' || !isRecord(aisleBody.frontmatter)) return

      const aisleValues = new Set<string>()
      Object.values(aisleBody.frontmatter).forEach((value) => {
        getFrontmatterValueSuggestionLabels(value).forEach((label) => aisleValues.add(label))
      })

      aisleValues.forEach((label) => {
        const normalized = normalizeSearchDocument(label)
        const key = `${FRONTMATTER_VALUE_SUGGESTION_PREFIX}${normalized}`
        const current = optionsByKey.get(key)
        optionsByKey.set(key, {
          key,
          label,
          count: (current?.count ?? 0) + 1,
          type: 'frontmatter-value',
        })
      })
    })
  })

  return Array.from(optionsByKey.values()).sort((left, right) =>
    right.count - left.count || left.label.localeCompare(right.label, undefined, { sensitivity: 'base', numeric: true }),
  )
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
    frontmatterValues: buildFrontmatterValueOptions(indexContext),
  }
}

export function parseSidebarSearchInput(query: string, indexes: SidebarSearchIndexes): ParsedSidebarSearchInput {
  let cleaned = query
  const tokens: SidebarSearchToken[] = []
  const frontmatterTerms: SidebarSearchFrontmatterTerm[] = []
  const presenceTerms: SidebarSearchPresenceTerm[] = []
  const activeSegment = getActiveSegment(query)

  for (const segment of readSidebarSearchSegments(query)) {
    const value = segment.value.trim()
    const isActiveSegment = activeSegment?.start === segment.start && activeSegment.end === segment.end
    const booleanValue = segment.complete ? parseBooleanSearchValue(value) : null
    if (booleanValue !== null) {
      presenceTerms.push({
        prefix: segment.prefix,
        kind: getPrefixKind(segment.prefix),
        value: booleanValue,
      })
      cleaned = replaceRangeWithSpaces(cleaned, segment.start, segment.end)
      continue
    }

    if (segment.prefix === 'fm') {
      if (value) frontmatterTerms.push({ value, quoted: segment.quoted })
      cleaned = replaceRangeWithSpaces(cleaned, segment.start, segment.end)
      continue
    }

    const token = segment.complete ? resolveToken(segment.prefix, value, indexes) : null
    if (token) {
      tokens.push(token)
      cleaned = replaceRangeWithSpaces(cleaned, segment.start, segment.end)
      continue
    }

    if (isActiveSegment) cleaned = replaceRangeWithSpaces(cleaned, segment.start, segment.end)
  }

  return {
    text: cleaned.trim().replace(/\s+/g, ' '),
    tokens: uniqueTokens(tokens),
    frontmatterTerms,
    presenceTerms,
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
  if (parseBooleanSearchValue(activeValue) !== null) return []

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

function buildCandidatePresenceLookup(indexes: SidebarSearchIndexes): Map<SidebarSearchFilterKind, Set<string>> {
  const lookup = new Map<SidebarSearchFilterKind, Set<string>>()
  const indexedKinds: SidebarSearchFilterKind[] = ['tags', 'synced']
  indexedKinds.forEach((kind) => {
    const matches = new Set<string>()
    indexes[kind].allOccurrences.forEach((occurrence) => {
      matches.add(`${occurrence.location.noteId}:${occurrence.aisleId}:${occurrence.aisleBodyId}`)
    })
    lookup.set(kind, matches)
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

function getFrontmatterSearchDocument(candidate: SidebarSearchCandidate, context: NotebookIndexContext): string {
  const aisleBody = context.aisleBodiesById.get(candidate.aisleBodyId)
  if (aisleBody?.frontmatterStatus !== 'valid' || !isRecord(aisleBody.frontmatter)) return ''

  const parts: string[] = []
  const templateId = aisleBody.frontmatterMeta?.templateId ?? ''
  const template = templateId ? context.templatesById.get(templateId) ?? null : null
  if (template?.name) parts.push(template.name)

  Object.entries(aisleBody.frontmatter).forEach(([key, value]) => {
    if (key.trim()) parts.push(key)
    const coercedValue = coerceFrontmatterString(value).replace(/\s+/g, ' ').trim()
    if (coercedValue) parts.push(coercedValue)
  })

  return normalizeSearchDocument(parts.join(' '))
}

function frontmatterTermMatches(document: string, term: SidebarSearchFrontmatterTerm): boolean {
  const normalizedTerm = normalizeSearchDocument(term.value)
  if (!normalizedTerm) return true
  return document.includes(normalizedTerm)
}

function candidateMatchesFrontmatterTerms(
  candidate: SidebarSearchCandidate,
  terms: SidebarSearchFrontmatterTerm[],
  context: NotebookIndexContext,
  documentCache: Map<string, string>,
): boolean {
  if (terms.length <= 0) return true
  const document = documentCache.get(candidate.aisleBodyId) ?? getFrontmatterSearchDocument(candidate, context)
  if (!documentCache.has(candidate.aisleBodyId)) documentCache.set(candidate.aisleBodyId, document)
  if (!document) return false
  return terms.every((term) => frontmatterTermMatches(document, term))
}

function candidateHasPresence(
  candidate: SidebarSearchCandidate,
  kind: SidebarSearchFilterKind,
  lookup: Map<SidebarSearchFilterKind, Set<string>>,
  context: NotebookIndexContext,
  documentCache: Map<string, string>,
): boolean {
  if (kind === 'frontmatter') {
    const document = documentCache.get(candidate.aisleBodyId) ?? getFrontmatterSearchDocument(candidate, context)
    if (!documentCache.has(candidate.aisleBodyId)) documentCache.set(candidate.aisleBodyId, document)
    return document.length > 0
  }

  return lookup.get(kind)?.has(`${candidate.location.noteId}:${candidate.aisle.id}:${candidate.aisleBodyId}`) ?? false
}

function candidateMatchesPresenceTerms(
  candidate: SidebarSearchCandidate,
  terms: SidebarSearchPresenceTerm[],
  lookup: Map<SidebarSearchFilterKind, Set<string>>,
  context: NotebookIndexContext,
  documentCache: Map<string, string>,
): boolean {
  return terms.every((term) =>
    candidateHasPresence(candidate, term.kind, lookup, context, documentCache) === term.value,
  )
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
  const frontmatterTerms = parsed.frontmatterTerms
  const presenceTerms = parsed.presenceTerms
  if (selectedTokens.length <= 0 && frontmatterTerms.length <= 0 && presenceTerms.length <= 0 && !textQuery) return []

  const tokenLookup = buildCandidateTokenLookup(selectedTokens, effectiveIndexes)
  const presenceLookup = buildCandidatePresenceLookup(effectiveIndexes)
  const frontmatterDocumentCache = new Map<string, string>()
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
      if (!candidateMatchesPresenceTerms(candidate, presenceTerms, presenceLookup, indexContext, frontmatterDocumentCache)) continue
      if (!candidateMatchesFrontmatterTerms(candidate, frontmatterTerms, indexContext, frontmatterDocumentCache)) continue

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
