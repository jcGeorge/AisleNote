import { buildVisibleMarkdownIndex } from '../notes/find-replace'
import { getAisleBodyId, getAisleMarkdown } from '../notes/note-markdown'
import { buildNoteLocationKey } from '../notes/note-locations'
import { SCRATCHPAD_FIND_LOCATION } from '../notes/find-replace'
import { getScratchpadNoteBody } from '../state/scratchpad'
import type { AppState, Domain, NoteBody, NoteLocation } from '../types/app'
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
  domainCounts: Map<string, number>
  spaceCounts: Map<string, number>
  parentCounts: Map<string, number>
  noteCounts: Map<string, number>
  scratchpadCount: number
  primaryOccurrencesByLocation: Map<string, TagFilterOccurrence[]>
  firstMatchByDomain: Map<string, NoteLocation>
  firstMatchBySpace: Map<string, NoteLocation>
  firstMatchByParent: Map<string, NoteLocation>
}

type OrderedLocation = {
  location: NoteLocation
  noteBodyId: string
}

export function normalizeTagKey(tag: string): string {
  return normalizeTagLabel(tag).toLocaleLowerCase()
}

export function getTagFilterSpaceKey(domainId: string, spaceId: string): string {
  return `${domainId}::${spaceId}`
}

export function getTagFilterParentKey(domainId: string, spaceId: string, tabId: string): string {
  return `${domainId}::${spaceId}::${tabId}`
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

function getDomainsWithActiveProjection(sourceState: AppState): Domain[] {
  return sourceState.domains.map((domain) =>
    domain.id === sourceState.activeDomainId
      ? { ...domain, activeSpaceId: sourceState.activeSpaceId, spaces: sourceState.spaces }
      : domain,
  )
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
  state: AppState,
) {
  if (!body) return
  body.aisles.forEach((aisle) => {
    const markdown = getAisleMarkdown(aisle, state.noteAisleBodies)
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

function collectOrderedLocations(state: AppState): OrderedLocation[] {
  const locations: OrderedLocation[] = []
  getDomainsWithActiveProjection(state).forEach((domain) => {
    domain.spaces.forEach((space) => {
      space.data.tabs.forEach((tab) => {
        locations.push({
          location: {
            domainId: domain.id,
            spaceId: space.id,
            tabId: tab.id,
            subTabId: null,
          },
          noteBodyId: tab.noteBodyId,
        })
        tab.subTabs.forEach((subTab) => {
          locations.push({
            location: {
              domainId: domain.id,
              spaceId: space.id,
              tabId: tab.id,
              subTabId: subTab.id,
            },
            noteBodyId: subTab.noteBodyId,
          })
        })
      })
    })
  })
  return locations
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

  if (occurrence.location.domainId === SCRATCHPAD_FIND_LOCATION.domainId) {
    index.scratchpadCount += 1
    return
  }

  incrementCount(index.domainCounts, occurrence.location.domainId)
  incrementCount(index.spaceCounts, getTagFilterSpaceKey(occurrence.location.domainId, occurrence.location.spaceId))
  incrementCount(
    index.parentCounts,
    getTagFilterParentKey(occurrence.location.domainId, occurrence.location.spaceId, occurrence.location.tabId),
  )
}

function populateFirstMatches(index: TagFilterIndex, orderedLocations: OrderedLocation[]) {
  orderedLocations.forEach(({ location }) => {
    const locationKey = buildNoteLocationKey(location)
    if ((index.noteCounts.get(locationKey) ?? 0) <= 0) return
    addFirstMatch(index.firstMatchByDomain, location.domainId, location)
    addFirstMatch(index.firstMatchBySpace, getTagFilterSpaceKey(location.domainId, location.spaceId), location)
    addFirstMatch(index.firstMatchByParent, getTagFilterParentKey(location.domainId, location.spaceId, location.tabId), location)
  })
}

export function buildTagFilterIndex(state: AppState, selectedTagKeys: string[] = []): TagFilterIndex {
  const occurrences: TagFilterOccurrence[] = []
  const tagSummariesByKey = new Map<string, TagFilterTagSummary>()
  const noteBodiesById = new Map(state.noteBodies.map((body) => [body.id, body]))
  const orderedLocations = collectOrderedLocations(state)

  orderedLocations.forEach(({ location, noteBodyId }) => {
    pushLocationOccurrences(occurrences, tagSummariesByKey, location, noteBodiesById.get(noteBodyId), state)
  })

  const scratchpadBody = getScratchpadNoteBody(state)
  if (scratchpadBody) {
    pushLocationOccurrences(occurrences, tagSummariesByKey, SCRATCHPAD_FIND_LOCATION, scratchpadBody, state)
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
    domainCounts: new Map(),
    spaceCounts: new Map(),
    parentCounts: new Map(),
    noteCounts: new Map(),
    scratchpadCount: 0,
    primaryOccurrencesByLocation: new Map(),
    firstMatchByDomain: new Map(),
    firstMatchBySpace: new Map(),
    firstMatchByParent: new Map(),
  }

  index.selectedOccurrences.forEach((occurrence) => addSelectedOccurrenceToCounts(index, occurrence))
  populateFirstMatches(index, orderedLocations)
  return index
}

export function getFirstMatchingLocationForDomain(index: TagFilterIndex, domainId: string): NoteLocation | null {
  return index.firstMatchByDomain.get(domainId) ?? null
}

export function getFirstMatchingLocationForSpace(
  index: TagFilterIndex,
  domainId: string,
  spaceId: string,
): NoteLocation | null {
  return index.firstMatchBySpace.get(getTagFilterSpaceKey(domainId, spaceId)) ?? null
}

export function getFirstMatchingLocationForParent(
  index: TagFilterIndex,
  domainId: string,
  spaceId: string,
  tabId: string,
): NoteLocation | null {
  return index.firstMatchByParent.get(getTagFilterParentKey(domainId, spaceId, tabId)) ?? null
}

export function getPrimaryTagOccurrencesForLocation(
  index: TagFilterIndex,
  location: NoteLocation,
): TagFilterOccurrence[] {
  return index.primaryOccurrencesByLocation.get(buildNoteLocationKey(location)) ?? []
}
