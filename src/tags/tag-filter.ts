import { buildVisibleMarkdownIndex } from '../notes/find-replace'
import { getAisleBodyId, getAisleMarkdown } from '../notes/note-markdown'
import { buildNoteLocationKey } from '../notes/note-locations'
import { SCRATCHPAD_FIND_LOCATION } from '../notes/find-replace'
import { getNotebookIndexContext, type NotebookIndexContext, type NotebookOrderedLocation } from '../filters/notebook-index-context'
import type { AppState, NoteAisleBody, NoteBody, NoteLocation } from '../types/app'
import { extractMarkdownTagRanges, normalizeTagLabel } from './tags.js'

export type TagFilterSortMode = 'az' | 'occurrences'

export type TagFilterTagSummary = {
  key: string
  label: string
  count: number
}

export type TagFilterOccurrence = {
  key: string
  label: string
  text: string
  location: NoteLocation
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
  tagOrdinalInAisle: number
  markdownFrom: number
  markdownTo: number
  visibleFrom: number
  visibleTo: number
}

export type TagFilterIndex = {
  availableTags: TagFilterTagSummary[]
  selectedTagKeys: string[]
  primaryTagKey: string
  allOccurrences: TagFilterOccurrence[]
  selectedOccurrences: TagFilterOccurrence[]
  noteCounts: Map<string, number>
  scratchpadCount: number
  primaryOccurrencesByLocation: Map<string, TagFilterOccurrence[]>
  firstMatchByNote: Map<string, NoteLocation>
}

export function normalizeTagKey(tag: string): string {
  return normalizeTagLabel(tag).toLocaleLowerCase()
}

export function getTagFilterCountLabel(count: number): string {
  return count > 99 ? '>99' : String(Math.max(0, count))
}

export function appendTagFilterCount(label: string, count: number): string {
  return count > 0 ? `${label} (${getTagFilterCountLabel(count)})` : label
}

export function sortTagFilterTags(tags: TagFilterTagSummary[], sortMode: TagFilterSortMode): TagFilterTagSummary[] {
  return [...tags].sort((left, right) => {
    const labelCompare = left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    if (sortMode === 'az') return labelCompare || left.key.localeCompare(right.key)
    return right.count - left.count || labelCompare || left.key.localeCompare(right.key)
  })
}

function incrementCount(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function getVisibleRangeForMarkdownRange(
  visiblePositions: number[],
  markdownFrom: number,
  markdownTo: number,
): { visibleFrom: number; visibleTo: number } | null {
  let visibleFrom = -1
  let visibleTo = -1
  visiblePositions.forEach((position, index) => {
    if (position < markdownFrom || position >= markdownTo) return
    if (visibleFrom < 0) visibleFrom = index
    visibleTo = index + 1
  })
  return visibleFrom >= 0 && visibleTo > visibleFrom ? { visibleFrom, visibleTo } : null
}

function pushLocationOccurrences(
  occurrences: TagFilterOccurrence[],
  tagSummariesByKey: Map<string, TagFilterTagSummary>,
  location: NoteLocation,
  body: NoteBody | null | undefined,
  aisleBodiesById: Map<string, NoteAisleBody>,
) {
  if (!body) return
  body.aisles.forEach((aisle) => {
    const markdown = getAisleMarkdown(aisle, aisleBodiesById)
    const visible = buildVisibleMarkdownIndex(markdown)
    const ordinalByTagKey = new Map<string, number>()
    extractMarkdownTagRanges(markdown).forEach((range) => {
      const key = normalizeTagKey(range.tag)
      if (!key) return
      const visibleRange = getVisibleRangeForMarkdownRange(visible.positions, range.from, range.to)
      if (!visibleRange) return
      const tagOrdinalInAisle = ordinalByTagKey.get(key) ?? 0
      ordinalByTagKey.set(key, tagOrdinalInAisle + 1)
      const summary = tagSummariesByKey.get(key)
      if (summary) {
        summary.count += 1
      } else {
        tagSummariesByKey.set(key, { key, label: normalizeTagLabel(range.tag), count: 1 })
      }
      occurrences.push({
        key,
        label: normalizeTagLabel(range.tag),
        text: range.text,
        location,
        noteBodyId: body.id,
        aisleId: aisle.id,
        aisleBodyId: getAisleBodyId(aisle),
        tagOrdinalInAisle,
        markdownFrom: range.from,
        markdownTo: range.to,
        ...visibleRange,
      })
    })
  })
}

function addFirstMatch(map: Map<string, NoteLocation>, key: string, location: NoteLocation) {
  if (!map.has(key)) map.set(key, location)
}

function addSelectedOccurrenceToCounts(index: TagFilterIndex, occurrence: TagFilterOccurrence) {
  const locationKey = buildNoteLocationKey(occurrence.location)
  incrementCount(index.noteCounts, locationKey)
  if (occurrence.key === index.primaryTagKey) {
    const current = index.primaryOccurrencesByLocation.get(locationKey) ?? []
    index.primaryOccurrencesByLocation.set(locationKey, [...current, occurrence])
  }

  if (occurrence.location.noteId === SCRATCHPAD_FIND_LOCATION.noteId) {
    index.scratchpadCount += 1
  }
}

function populateFirstMatches(index: TagFilterIndex, orderedLocations: NotebookOrderedLocation[]) {
  orderedLocations.forEach(({ location }) => {
    const locationKey = buildNoteLocationKey(location)
    if ((index.noteCounts.get(locationKey) ?? 0) <= 0) return
    addFirstMatch(index.firstMatchByNote, locationKey, location)
  })
}

export function buildTagFilterIndex(
  state: AppState,
  selectedTagKeys: string[] = [],
  context?: NotebookIndexContext,
): TagFilterIndex {
  const indexContext = getNotebookIndexContext(state, context)
  const occurrences: TagFilterOccurrence[] = []
  const tagSummariesByKey = new Map<string, TagFilterTagSummary>()
  const { aisleBodiesById, noteBodiesById, orderedLocations, scratchpadBody } = indexContext

  orderedLocations.forEach(({ location, noteBodyId }) => {
    pushLocationOccurrences(occurrences, tagSummariesByKey, location, noteBodiesById.get(noteBodyId), aisleBodiesById)
  })

  if (scratchpadBody) {
    pushLocationOccurrences(occurrences, tagSummariesByKey, SCRATCHPAD_FIND_LOCATION, scratchpadBody, aisleBodiesById)
  }

  const normalizedSelectedKeys = Array.from(
    new Set(selectedTagKeys.map(normalizeTagKey).filter(Boolean)),
  )
  const selectedTagSet = new Set(normalizedSelectedKeys)
  const index: TagFilterIndex = {
    availableTags: sortTagFilterTags(Array.from(tagSummariesByKey.values()), 'az'),
    selectedTagKeys: normalizedSelectedKeys,
    primaryTagKey: normalizedSelectedKeys[0] ?? '',
    allOccurrences: occurrences,
    selectedOccurrences: selectedTagSet.size > 0
      ? occurrences.filter((occurrence) => selectedTagSet.has(occurrence.key))
      : [],
    noteCounts: new Map(),
    scratchpadCount: 0,
    primaryOccurrencesByLocation: new Map(),
    firstMatchByNote: new Map(),
  }

  index.selectedOccurrences.forEach((occurrence) => addSelectedOccurrenceToCounts(index, occurrence))
  populateFirstMatches(index, orderedLocations)
  return index
}

export function getFirstMatchingLocationForNote(
  index: TagFilterIndex,
  location: NoteLocation,
): NoteLocation | null {
  return index.firstMatchByNote.get(buildNoteLocationKey(location)) ?? null
}

export function getPrimaryTagOccurrencesForLocation(
  index: TagFilterIndex,
  location: NoteLocation,
): TagFilterOccurrence[] {
  return index.primaryOccurrencesByLocation.get(buildNoteLocationKey(location)) ?? []
}
