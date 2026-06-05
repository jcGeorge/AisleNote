import { SCRATCHPAD_FIND_LOCATION } from '../notes/find-replace'
import { getAisleBodyId } from '../notes/note-markdown'
import { buildNoteLocationKey, listSearchableNoteLocations } from '../notes/note-locations'
import type { AppState, NoteLocation, NoteFilterKind } from '../types/app'
import {
  buildTagFilterIndex,
  getTagFilterCountLabel,
  getTagFilterParentKey,
  getTagFilterSpaceKey,
  normalizeTagKey,
  sortTagFilterTags,
  type TagFilterOccurrence,
  type TagFilterSortMode,
} from '../tags/tag-filter'

export type NoteFilterOptionType =
  | 'tag'
  | 'synced-note'
  | 'synced-aisle'
  | 'frontmatter-template'
  | 'frontmatter-property'

export type NoteFilterOption = {
  key: string
  label: string
  count: number
  type: NoteFilterOptionType
}

export type NoteFilterOccurrence = {
  kind: NoteFilterKind
  key: string
  label: string
  optionType: NoteFilterOptionType
  location: NoteLocation
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
  tagOccurrence?: TagFilterOccurrence
}

export type NoteFilterIndex = {
  kind: NoteFilterKind
  availableOptions: NoteFilterOption[]
  selectedKeys: string[]
  primaryKey: string
  allOccurrences: NoteFilterOccurrence[]
  selectedOccurrences: NoteFilterOccurrence[]
  domainCounts: Map<string, number>
  spaceCounts: Map<string, number>
  parentCounts: Map<string, number>
  noteCounts: Map<string, number>
  scratchpadCount: number
  occurrencesByLocation: Map<string, NoteFilterOccurrence[]>
  primaryOccurrencesByLocation: Map<string, NoteFilterOccurrence[]>
  firstMatchByDomain: Map<string, NoteLocation>
  firstMatchBySpace: Map<string, NoteLocation>
  firstMatchByParent: Map<string, NoteLocation>
}

type NormalLocation = ReturnType<typeof listSearchableNoteLocations>[number]

const SYNCED_NOTE_PREFIX = 'synced-note:'
const SYNCED_AISLE_PREFIX = 'synced-aisle:'
const FRONTMATTER_TEMPLATE_PREFIX = 'fm-template:'
const FRONTMATTER_PROPERTY_PREFIX = 'fm-property:'

export function getSyncedNoteFilterKey(noteBodyId: string): string {
  return `${SYNCED_NOTE_PREFIX}${noteBodyId}`
}

export function getSyncedAisleFilterKey(aisleBodyId: string): string {
  return `${SYNCED_AISLE_PREFIX}${aisleBodyId}`
}

export function getFrontmatterTemplateFilterKey(templateId: string): string {
  return `${FRONTMATTER_TEMPLATE_PREFIX}${templateId}`
}

export function normalizeFrontmatterPropertyFilterName(propertyName: string): string {
  return propertyName.trim().toLocaleLowerCase()
}

export function getFrontmatterPropertyFilterKey(propertyName: string): string {
  return `${FRONTMATTER_PROPERTY_PREFIX}${normalizeFrontmatterPropertyFilterName(propertyName)}`
}

export function getNoteFilterCountLabel(count: number): string {
  return getTagFilterCountLabel(count)
}

export function appendNoteFilterCount(label: string, count: number): string {
  return count > 0 ? `${label} (${getNoteFilterCountLabel(count)})` : label
}

export function sortNoteFilterOptions(options: NoteFilterOption[], sortMode: TagFilterSortMode = 'az'): NoteFilterOption[] {
  return [...options].sort((left, right) => {
    const labelCompare = left.label.localeCompare(right.label, undefined, { sensitivity: 'base', numeric: true })
    if (sortMode === 'az') return labelCompare || left.key.localeCompare(right.key)
    return right.count - left.count || labelCompare || left.key.localeCompare(right.key)
  })
}

function normalizeSelectedKeys(kind: NoteFilterKind, selectedKeys: string[]): string[] {
  const normalized = selectedKeys
    .map((key) => {
      if (kind === 'tags') return normalizeTagKey(key)
      if (kind === 'frontmatter' && key.startsWith(FRONTMATTER_PROPERTY_PREFIX)) {
        return getFrontmatterPropertyFilterKey(key.slice(FRONTMATTER_PROPERTY_PREFIX.length))
      }
      return key.trim()
    })
    .filter(Boolean)
  return Array.from(new Set(normalized))
}

function incrementCount(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function createEmptyIndex(kind: NoteFilterKind, selectedKeys: string[], options: NoteFilterOption[], occurrences: NoteFilterOccurrence[]): NoteFilterIndex {
  return {
    kind,
    availableOptions: options,
    selectedKeys,
    primaryKey: selectedKeys[0] ?? '',
    allOccurrences: occurrences,
    selectedOccurrences: [],
    domainCounts: new Map(),
    spaceCounts: new Map(),
    parentCounts: new Map(),
    noteCounts: new Map(),
    scratchpadCount: 0,
    occurrencesByLocation: new Map(),
    primaryOccurrencesByLocation: new Map(),
    firstMatchByDomain: new Map(),
    firstMatchBySpace: new Map(),
    firstMatchByParent: new Map(),
  }
}

function addFirstMatch(map: Map<string, NoteLocation>, key: string, location: NoteLocation) {
  if (!map.has(key)) map.set(key, location)
}

function addSelectedOccurrenceToCounts(index: NoteFilterIndex, occurrence: NoteFilterOccurrence) {
  const locationKey = buildNoteLocationKey(occurrence.location)
  incrementCount(index.noteCounts, locationKey)
  const currentOccurrences = index.occurrencesByLocation.get(locationKey) ?? []
  index.occurrencesByLocation.set(locationKey, [...currentOccurrences, occurrence])
  if (occurrence.key === index.primaryKey) {
    const currentPrimary = index.primaryOccurrencesByLocation.get(locationKey) ?? []
    index.primaryOccurrencesByLocation.set(locationKey, [...currentPrimary, occurrence])
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

function populateFirstMatches(index: NoteFilterIndex, orderedLocations: NoteLocation[]) {
  orderedLocations.forEach((location) => {
    const locationKey = buildNoteLocationKey(location)
    if ((index.noteCounts.get(locationKey) ?? 0) <= 0) return
    addFirstMatch(index.firstMatchByDomain, location.domainId, location)
    addFirstMatch(index.firstMatchBySpace, getTagFilterSpaceKey(location.domainId, location.spaceId), location)
    addFirstMatch(index.firstMatchByParent, getTagFilterParentKey(location.domainId, location.spaceId, location.tabId), location)
  })
}

function finalizeIndex(
  kind: NoteFilterKind,
  selectedKeys: string[],
  options: NoteFilterOption[],
  occurrences: NoteFilterOccurrence[],
  orderedLocations: NoteLocation[],
): NoteFilterIndex {
  const normalizedSelectedKeys = normalizeSelectedKeys(kind, selectedKeys)
  const selectedSet = new Set(normalizedSelectedKeys)
  const index = createEmptyIndex(kind, normalizedSelectedKeys, sortNoteFilterOptions(options), occurrences)
  index.selectedOccurrences =
    selectedSet.size > 0 ? occurrences.filter((occurrence) => selectedSet.has(occurrence.key)) : occurrences
  index.selectedOccurrences.forEach((occurrence) => addSelectedOccurrenceToCounts(index, occurrence))
  populateFirstMatches(index, orderedLocations)
  return index
}

function buildTagNoteFilterIndex(state: AppState, selectedKeys: string[]): NoteFilterIndex {
  const availableOnlyIndex = buildTagFilterIndex(state, [])
  const normalizedSelectedKeys = normalizeSelectedKeys('tags', selectedKeys)
  const effectiveKeys = normalizedSelectedKeys.length > 0
    ? normalizedSelectedKeys
    : availableOnlyIndex.availableTags.map((tag) => tag.key)
  const tagIndex = buildTagFilterIndex(state, effectiveKeys)
  const orderedLocations = listSearchableNoteLocations(state).map((entry) => ({
    domainId: entry.domainId,
    spaceId: entry.spaceId,
    tabId: entry.tabId,
    subTabId: entry.subTabId,
  }))
  const options: NoteFilterOption[] = tagIndex.availableTags.map((tag) => ({
    ...tag,
    type: 'tag',
  }))
  const occurrences: NoteFilterOccurrence[] = tagIndex.allOccurrences.map((occurrence) => ({
    kind: 'tags',
    key: occurrence.key,
    label: occurrence.label,
    optionType: 'tag',
    location: occurrence.location,
    noteBodyId: occurrence.noteBodyId,
    aisleId: occurrence.aisleId,
    aisleBodyId: occurrence.aisleBodyId,
    tagOccurrence: occurrence,
  }))
  return finalizeIndex('tags', normalizedSelectedKeys, options, occurrences, orderedLocations)
}

function buildOptionLabel(locations: NormalLocation[], fallback: string): string {
  const first = locations[0]
  if (!first) return fallback
  return first.noteName === 'home'
    ? `${first.parentName} / home`
    : `${first.parentName} / ${first.noteName}`
}

function getBodyAisles(state: AppState, noteBodyId: string) {
  return state.noteBodies.find((body) => body.id === noteBodyId)?.aisles ?? []
}

function buildSyncedNoteFilterIndex(state: AppState, selectedKeys: string[]): NoteFilterIndex {
  const locations = listSearchableNoteLocations(state)
  const locationsByBodyId = new Map<string, NormalLocation[]>()
  locations.forEach((location) => {
    locationsByBodyId.set(location.noteBodyId, [...(locationsByBodyId.get(location.noteBodyId) ?? []), location])
  })

  const options: NoteFilterOption[] = []
  const occurrences: NoteFilterOccurrence[] = []
  locationsByBodyId.forEach((bodyLocations, noteBodyId) => {
    if (bodyLocations.length <= 1) return
    const key = getSyncedNoteFilterKey(noteBodyId)
    options.push({
      key,
      label: buildOptionLabel(bodyLocations, 'synced note'),
      count: bodyLocations.length,
      type: 'synced-note',
    })
    bodyLocations.forEach((location) => {
      const firstAisle = getBodyAisles(state, noteBodyId)[0]
      if (!firstAisle) return
      occurrences.push({
        kind: 'synced',
        key,
        label: buildOptionLabel(bodyLocations, 'synced note'),
        optionType: 'synced-note',
        location,
        noteBodyId,
        aisleId: firstAisle.id,
        aisleBodyId: getAisleBodyId(firstAisle),
      })
    })
  })

  const aisleSlotsByBodyId = new Map<string, {
    key: string
    location: NormalLocation
    noteBodyId: string
    aisleId: string
    aisleBodyId: string
  }[]>()
  locations.forEach((location) => {
    getBodyAisles(state, location.noteBodyId).forEach((aisle) => {
      const aisleBodyId = getAisleBodyId(aisle)
      if (!aisleBodyId) return
      const slotKey = `${location.noteBodyId}::${aisle.id}`
      const current = aisleSlotsByBodyId.get(aisleBodyId) ?? []
      if (current.some((slot) => slot.key === slotKey)) return
      aisleSlotsByBodyId.set(aisleBodyId, [
        ...current,
        { key: slotKey, location, noteBodyId: location.noteBodyId, aisleId: aisle.id, aisleBodyId },
      ])
    })
  })

  aisleSlotsByBodyId.forEach((slots, aisleBodyId) => {
    const noteBodyIds = new Set(slots.map((slot) => slot.noteBodyId))
    if (noteBodyIds.size <= 1) return
    const key = getSyncedAisleFilterKey(aisleBodyId)
    const label = buildOptionLabel(slots.map((slot) => slot.location), 'synced aisle')
    options.push({
      key,
      label,
      count: slots.length,
      type: 'synced-aisle',
    })
    slots.forEach((slot) => {
      occurrences.push({
        kind: 'synced',
        key,
        label,
        optionType: 'synced-aisle',
        location: slot.location,
        noteBodyId: slot.noteBodyId,
        aisleId: slot.aisleId,
        aisleBodyId,
      })
    })
  })

  return finalizeIndex(
    'synced',
    selectedKeys,
    options,
    occurrences,
    locations.map((entry) => ({
      domainId: entry.domainId,
      spaceId: entry.spaceId,
      tabId: entry.tabId,
      subTabId: entry.subTabId,
    })),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function buildFrontmatterNoteFilterIndex(state: AppState, selectedKeys: string[]): NoteFilterIndex {
  const locations = listSearchableNoteLocations(state)
  const templatesById = new Map(state.frontmatter.templates.map((template) => [template.id, template]))
  const optionsByKey = new Map<string, NoteFilterOption>()
  const occurrences: NoteFilterOccurrence[] = []
  const aisleBodiesById = new Map((state.noteAisleBodies ?? []).map((body) => [body.id, body]))

  const pushOption = (option: NoteFilterOption) => {
    const current = optionsByKey.get(option.key)
    if (current) {
      optionsByKey.set(option.key, { ...current, count: current.count + option.count })
      return
    }
    optionsByKey.set(option.key, option)
  }

  locations.forEach((location) => {
    getBodyAisles(state, location.noteBodyId).forEach((aisle) => {
      const aisleBodyId = getAisleBodyId(aisle)
      const aisleBody = aisleBodiesById.get(aisleBodyId)
      if (aisleBody?.frontmatterStatus !== 'valid' || !isRecord(aisleBody.frontmatter)) return

      const template = aisleBody.frontmatterMeta?.templateId
        ? templatesById.get(aisleBody.frontmatterMeta.templateId) ?? null
        : null
      if (template) {
        const key = getFrontmatterTemplateFilterKey(template.id)
        pushOption({ key, label: template.name, count: 1, type: 'frontmatter-template' })
        occurrences.push({
          kind: 'frontmatter',
          key,
          label: template.name,
          optionType: 'frontmatter-template',
          location,
          noteBodyId: location.noteBodyId,
          aisleId: aisle.id,
          aisleBodyId,
        })
      }

      Object.keys(aisleBody.frontmatter).forEach((propertyName) => {
        const key = getFrontmatterPropertyFilterKey(propertyName)
        const normalized = normalizeFrontmatterPropertyFilterName(propertyName)
        if (!normalized) return
        pushOption({ key, label: propertyName, count: 1, type: 'frontmatter-property' })
        occurrences.push({
          kind: 'frontmatter',
          key,
          label: propertyName,
          optionType: 'frontmatter-property',
          location,
          noteBodyId: location.noteBodyId,
          aisleId: aisle.id,
          aisleBodyId,
        })
      })
    })
  })

  return finalizeIndex(
    'frontmatter',
    selectedKeys,
    Array.from(optionsByKey.values()),
    occurrences,
    locations.map((entry) => ({
      domainId: entry.domainId,
      spaceId: entry.spaceId,
      tabId: entry.tabId,
      subTabId: entry.subTabId,
    })),
  )
}

export function buildNoteFilterIndex(
  state: AppState,
  kind: NoteFilterKind,
  selectedKeys: string[] = [],
): NoteFilterIndex {
  if (kind === 'tags') return buildTagNoteFilterIndex(state, selectedKeys)
  if (kind === 'synced') return buildSyncedNoteFilterIndex(state, selectedKeys)
  return buildFrontmatterNoteFilterIndex(state, selectedKeys)
}

export function getFirstMatchingNoteFilterLocationForDomain(index: NoteFilterIndex, domainId: string): NoteLocation | null {
  return index.firstMatchByDomain.get(domainId) ?? null
}

export function getFirstMatchingNoteFilterLocationForSpace(
  index: NoteFilterIndex,
  domainId: string,
  spaceId: string,
): NoteLocation | null {
  return index.firstMatchBySpace.get(getTagFilterSpaceKey(domainId, spaceId)) ?? null
}

export function getFirstMatchingNoteFilterLocationForParent(
  index: NoteFilterIndex,
  domainId: string,
  spaceId: string,
  tabId: string,
): NoteLocation | null {
  return index.firstMatchByParent.get(getTagFilterParentKey(domainId, spaceId, tabId)) ?? null
}

export function getNoteFilterOccurrencesForLocation(
  index: NoteFilterIndex,
  location: NoteLocation,
): NoteFilterOccurrence[] {
  return index.occurrencesByLocation.get(buildNoteLocationKey(location)) ?? []
}

export function getPrimaryNoteFilterOccurrencesForLocation(
  index: NoteFilterIndex,
  location: NoteLocation,
): NoteFilterOccurrence[] {
  return index.primaryOccurrencesByLocation.get(buildNoteLocationKey(location)) ?? []
}

export { getTagFilterParentKey as getNoteFilterParentKey, getTagFilterSpaceKey as getNoteFilterSpaceKey, sortTagFilterTags }
