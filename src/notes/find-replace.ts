import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { syncNoteAisleBodyMarkdownInState } from './aisle-body-state'
import { getAisleBodyId, getAisleMarkdown } from './note-markdown'
import { getLocationInfo, getNoteLocationBreadcrumbLabel, listSearchableNoteLocations } from './note-locations'
import type { AppState, NoteLocation } from '../types/app'

export type FindReplaceScope = 'note' | 'parent' | 'space' | 'domain' | 'project'

export type FindReplaceOptions = {
  caseSensitive: boolean
  wholeWord: boolean
}

export type FindReplaceMatch = {
  id: string
  location: NoteLocation
  label: string
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
  markdownFrom: number
  markdownTo: number
  visibleFrom: number
  visibleTo: number
  snippet: string
}

export type FindReplaceApplyResult = {
  state: AppState
  changedAisleBodyIds: Set<string>
  replacementCount: number
}

type VisibleMarkdownIndex = {
  text: string
  positions: number[]
}

function isWordChar(value: string | undefined): boolean {
  return Boolean(value && /[a-z0-9_]/i.test(value))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function appendVisibleChar(index: VisibleMarkdownIndex, char: string, position: number) {
  index.text += char
  index.positions.push(position)
}

function appendVisibleText(index: VisibleMarkdownIndex, text: string, startPosition: number) {
  for (let offset = 0; offset < text.length; offset += 1) {
    appendVisibleChar(index, text[offset], startPosition + offset)
  }
}

function stripBlockPrefix(line: string): number {
  const blockPrefix = line.match(/^(\s{0,3})(?:#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|(?:[-*+]|\d+[.)])\s+)/)
  return blockPrefix?.[0].length ?? 0
}

function appendInlineVisibleMarkdown(index: VisibleMarkdownIndex, line: string, lineStart: number) {
  let offset = stripBlockPrefix(line)
  while (offset < line.length) {
    const rest = line.slice(offset)
    const imageOrLink = rest.match(/^(!?)\[([^\]]*)\]\(([^)]*)\)/)
    if (imageOrLink) {
      const labelStart = offset + imageOrLink[1].length + 1
      appendVisibleText(index, imageOrLink[2], lineStart + labelStart)
      offset += imageOrLink[0].length
      continue
    }

    const marker = rest.match(/^(\*\*|__|~~|==|`|\*|_)/)?.[1]
    if (marker) {
      offset += marker.length
      continue
    }

    appendVisibleChar(index, line[offset], lineStart + offset)
    offset += 1
  }
}

export function buildVisibleMarkdownIndex(markdown: string): VisibleMarkdownIndex {
  const index: VisibleMarkdownIndex = { text: '', positions: [] }
  const source = String(markdown ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = source.split('\n')
  let sourceOffset = 0
  let inFence = false
  let fenceMarker = ''

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      appendVisibleChar(index, '\n', -1)
    }

    const fence = line.match(/^\s*(```+|~~~+)/)
    if (fence) {
      if (!inFence) {
        inFence = true
        fenceMarker = fence[1][0]
      } else if (fence[1][0] === fenceMarker) {
        inFence = false
        fenceMarker = ''
      }
    } else if (inFence) {
      appendVisibleText(index, line, sourceOffset)
    } else {
      appendInlineVisibleMarkdown(index, line, sourceOffset)
    }

    sourceOffset += line.length + 1
  })

  return index
}

function getSnippet(text: string, from: number, to: number): string {
  const start = Math.max(0, from - 34)
  const end = Math.min(text.length, to + 34)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < text.length ? '...' : ''
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`
}

function findVisibleRanges(markdown: string, query: string, options: FindReplaceOptions) {
  const visible = buildVisibleMarkdownIndex(markdown)
  const needle = query.trim()
  if (!needle) return []
  const flags = options.caseSensitive ? 'g' : 'gi'
  const matcher = new RegExp(escapeRegExp(needle), flags)
  const ranges: Array<{ visibleFrom: number; visibleTo: number; markdownFrom: number; markdownTo: number; snippet: string }> = []
  let match: RegExpExecArray | null
  while ((match = matcher.exec(visible.text)) !== null) {
    const visibleFrom = match.index
    const visibleTo = match.index + match[0].length
    if (
      options.wholeWord &&
      (isWordChar(visible.text[visibleFrom - 1]) || isWordChar(visible.text[visibleTo]))
    ) {
      continue
    }
    const sourcePositions = visible.positions.slice(visibleFrom, visibleTo)
    if (sourcePositions.length === 0 || sourcePositions.some((position) => position < 0)) continue
    const markdownFrom = sourcePositions[0]
    const markdownTo = sourcePositions[sourcePositions.length - 1] + 1
    ranges.push({
      visibleFrom,
      visibleTo,
      markdownFrom,
      markdownTo,
      snippet: getSnippet(visible.text, visibleFrom, visibleTo),
    })
    if (match[0].length === 0) matcher.lastIndex += 1
  }
  return ranges
}

export function collectFindReplaceLocations(
  state: AppState,
  currentLocation: NoteLocation,
  scope: FindReplaceScope,
): Array<NoteLocation & { label: string; noteBodyId: string }> {
  const currentInfo = getLocationInfo(state, currentLocation)
  if (scope === 'note') {
    return currentInfo.noteBodyId
      ? [
          {
            ...currentLocation,
            label: getNoteLocationBreadcrumbLabel(state, currentLocation),
            noteBodyId: currentInfo.noteBodyId,
          },
        ]
      : []
  }
  const entries = listSearchableNoteLocations(state)
  return entries.filter((entry) => {
    if (scope === 'project') return true
    if (scope === 'domain') return entry.domainId === currentLocation.domainId
    if (scope === 'space') return entry.domainId === currentLocation.domainId && entry.spaceId === currentLocation.spaceId
    if (scope === 'parent') {
      return (
        entry.domainId === currentLocation.domainId &&
        entry.spaceId === currentLocation.spaceId &&
        entry.tabId === currentLocation.tabId
      )
    }
    return entry.noteBodyId === currentInfo.noteBodyId
  })
}

export function findVisibleMatches(
  state: AppState,
  currentLocation: NoteLocation,
  scope: FindReplaceScope,
  query: string,
  options: FindReplaceOptions,
): FindReplaceMatch[] {
  const matches: FindReplaceMatch[] = []
  const locations = collectFindReplaceLocations(state, currentLocation, scope)
  const noteBodiesById = new Map(state.noteBodies.map((body) => [body.id, body]))

  locations.forEach((location) => {
    const body = noteBodiesById.get(location.noteBodyId)
    if (!body) return
    body.aisles.forEach((aisle) => {
      const aisleBodyId = getAisleBodyId(aisle)
      const markdown = getAisleMarkdown(aisle, state.noteAisleBodies)
      findVisibleRanges(markdown, query, options).forEach((range, rangeIndex) => {
        matches.push({
          id: `${location.domainId}:${location.spaceId}:${location.tabId}:${location.subTabId ?? 'home'}:${aisleBodyId}:${range.markdownFrom}:${rangeIndex}`,
          location,
          label: location.label,
          noteBodyId: body.id,
          aisleId: aisle.id,
          aisleBodyId,
          ...range,
        })
      })
    })
  })

  return matches
}

export function applyFindReplacementToState(
  state: AppState,
  matches: FindReplaceMatch[],
  replacement: string,
): FindReplaceApplyResult {
  const byAisleBody = new Map<string, FindReplaceMatch[]>()
  matches.forEach((match) => {
    byAisleBody.set(match.aisleBodyId, [...(byAisleBody.get(match.aisleBodyId) ?? []), match])
  })

  let nextState = state
  const changedAisleBodyIds = new Set<string>()
  let replacementCount = 0

  byAisleBody.forEach((aisleMatches, aisleBodyId) => {
    const body = nextState.noteAisleBodies?.find((candidate) => candidate.id === aisleBodyId)
    const sourceMarkdown =
      body?.markdown ??
      nextState.noteBodies
        .flatMap((noteBody) => noteBody.aisles)
        .find((aisle) => getAisleBodyId(aisle) === aisleBodyId)?.markdown ??
      ''
    const ranges = [...aisleMatches]
      .sort((left, right) => right.markdownFrom - left.markdownFrom)
      .filter((match, index, sorted) =>
        index === 0 ||
        match.markdownFrom !== sorted[index - 1].markdownFrom ||
        match.markdownTo !== sorted[index - 1].markdownTo,
      )
    if (ranges.length === 0) return
    const nextMarkdown = normalizeMarkdownForPersistence(ranges.reduce(
      (markdown, match) => `${markdown.slice(0, match.markdownFrom)}${replacement}${markdown.slice(match.markdownTo)}`,
      sourceMarkdown,
    ))
    nextState = syncNoteAisleBodyMarkdownInState(nextState, aisleBodyId, nextMarkdown)
    changedAisleBodyIds.add(aisleBodyId)
    replacementCount += ranges.length
  })

  return { state: nextState, changedAisleBodyIds, replacementCount }
}
