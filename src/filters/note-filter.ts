import { SCRATCHPAD_FIND_LOCATION } from '../notes/find-replace'
import { MARKDOWN_LINK_PATTERN } from '../markdown/image-asset-refs.js'
import { splitAssetMetadataFromUrl } from '../markdown/asset-metadata.js'
import { resolveAssetDisplayUrl } from '../markdown/image-asset-registry'
import { getMediaDisplayTitle, getMediaKindFromUrl, type MediaKind } from '../media/media-utils'
import { getAisleBodyId, getAisleMarkdown } from '../notes/note-markdown'
import { buildNoteLocationKey, type NoteSearchEntry } from '../notes/note-locations'
import type { AppState, NoteBody, NoteLocation, NoteFilterKind } from '../types/app'
import {
  buildTagFilterIndex,
  getTagFilterCountLabel,
  normalizeTagKey,
  sortTagFilterTags,
  type TagFilterOccurrence,
  type TagFilterSortMode,
} from '../tags/tag-filter'
import { getVaultIndexContext, type VaultIndexContext } from './vault-index-context'

export type NoteFilterOptionType =
  | 'tag'
  | 'synced-aisle'
  | 'frontmatter-template'
  | 'frontmatter-property'
  | 'frontmatter-value'
  | 'media-image'
  | 'media-audio'
  | 'media-video'

export type NoteFilterMediaKind = 'image' | MediaKind

export type NoteFilterOption = {
  key: string
  label: string
  count: number
  type: NoteFilterOptionType
  mediaKind?: NoteFilterMediaKind
  source?: string
  previewUrl?: string
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
  mediaKind?: NoteFilterMediaKind
  source?: string
  previewUrl?: string
}

export type NoteFilterIndex = {
  kind: NoteFilterKind
  availableOptions: NoteFilterOption[]
  selectedKeys: string[]
  primaryKey: string
  allOccurrences: NoteFilterOccurrence[]
  selectedOccurrences: NoteFilterOccurrence[]
  noteCounts: Map<string, number>
  scratchpadCount: number
  occurrencesByLocation: Map<string, NoteFilterOccurrence[]>
  primaryOccurrencesByLocation: Map<string, NoteFilterOccurrence[]>
  firstMatchByNote: Map<string, NoteLocation>
}

type NormalLocation = NoteSearchEntry

const SYNCED_AISLE_PREFIX = 'synced-aisle:'
const FRONTMATTER_TEMPLATE_PREFIX = 'fm-template:'
const FRONTMATTER_PROPERTY_PREFIX = 'fm-property:'
const MEDIA_FILTER_PREFIX = 'media:'

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

export function getMediaFilterKey(kind: NoteFilterMediaKind, source: string): string {
  return `${MEDIA_FILTER_PREFIX}${kind}:${source}`
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
    noteCounts: new Map(),
    scratchpadCount: 0,
    occurrencesByLocation: new Map(),
    primaryOccurrencesByLocation: new Map(),
    firstMatchByNote: new Map(),
  }
}

export function getEmptyNoteFilterIndex(kind: NoteFilterKind, selectedKeys: string[] = []): NoteFilterIndex {
  return createEmptyIndex(kind, normalizeSelectedKeys(kind, selectedKeys), [], [])
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

  if (occurrence.location.noteId === SCRATCHPAD_FIND_LOCATION.noteId) {
    index.scratchpadCount += 1
  }
}

function populateFirstMatches(index: NoteFilterIndex, orderedLocations: NoteLocation[]) {
  orderedLocations.forEach((location) => {
    const locationKey = buildNoteLocationKey(location)
    if ((index.noteCounts.get(locationKey) ?? 0) <= 0) return
    addFirstMatch(index.firstMatchByNote, locationKey, location)
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

function buildTagNoteFilterIndex(
  state: AppState,
  selectedKeys: string[],
  context?: VaultIndexContext,
): NoteFilterIndex {
  const indexContext = getVaultIndexContext(state, context)
  const normalizedSelectedKeys = normalizeSelectedKeys('tags', selectedKeys)
  const tagIndex = buildTagFilterIndex(state, normalizedSelectedKeys, indexContext)
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
  return finalizeIndex('tags', normalizedSelectedKeys, options, occurrences, indexContext.orderedNoteLocations)
}

function buildOptionLabel(locations: NormalLocation[], fallback: string): string {
  const first = locations[0]
  if (!first) return fallback
  return first.folderPath ? `${first.folderPath} / ${first.noteName}` : first.noteName
}

function getBodyAisles(context: VaultIndexContext, noteBodyId: string) {
  return context.noteBodiesById.get(noteBodyId)?.aisles ?? []
}

function getNoteLocationFromEntry(entry: NormalLocation): NoteLocation {
  return {
    noteId: entry.noteId,
  }
}

function buildSyncedFilterIndex(
  state: AppState,
  selectedKeys: string[],
  context?: VaultIndexContext,
): NoteFilterIndex {
  const indexContext = getVaultIndexContext(state, context)
  const locations = indexContext.locations
  const options: NoteFilterOption[] = []
  const occurrences: NoteFilterOccurrence[] = []
  const aisleSlotsByBodyId = new Map<string, {
    key: string
    location: NormalLocation
    noteBodyId: string
    aisleId: string
    aisleBodyId: string
  }[]>()
  locations.forEach((location) => {
    getBodyAisles(indexContext, location.noteBodyId).forEach((aisle) => {
      const aisleBodyId = getAisleBodyId(aisle)
      if (!aisleBodyId) return
      const slotKey = `${location.noteId}::${location.noteBodyId}::${aisle.id}`
      const current = aisleSlotsByBodyId.get(aisleBodyId) ?? []
      if (current.some((slot) => slot.key === slotKey)) return
      aisleSlotsByBodyId.set(aisleBodyId, [
        ...current,
        { key: slotKey, location, noteBodyId: location.noteBodyId, aisleId: aisle.id, aisleBodyId },
      ])
    })
  })

  aisleSlotsByBodyId.forEach((slots, aisleBodyId) => {
    if (slots.length <= 1) return
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
    indexContext.orderedNoteLocations,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function buildFrontmatterNoteFilterIndex(
  state: AppState,
  selectedKeys: string[],
  context?: VaultIndexContext,
): NoteFilterIndex {
  const indexContext = getVaultIndexContext(state, context)
  const locations = indexContext.locations
  const templatesById = indexContext.templatesById
  const optionsByKey = new Map<string, NoteFilterOption>()
  const occurrences: NoteFilterOccurrence[] = []

  const pushOption = (option: NoteFilterOption) => {
    const current = optionsByKey.get(option.key)
    if (current) {
      optionsByKey.set(option.key, { ...current, count: current.count + option.count })
      return
    }
    optionsByKey.set(option.key, option)
  }

  locations.forEach((location) => {
    getBodyAisles(indexContext, location.noteBodyId).forEach((aisle) => {
      const aisleBodyId = getAisleBodyId(aisle)
      const aisleBody = indexContext.aisleBodiesById.get(aisleBodyId)
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
    indexContext.orderedNoteLocations,
  )
}

export type ExtractedMediaFilterReference = {
  key: string
  label: string
  kind: NoteFilterMediaKind
  source: string
  previewUrl?: string
}

function unescapeMarkdownLabel(value: string): string {
  return value.replace(/\\([\\[\]])/g, '$1').trim()
}

function normalizeMarkdownLinkSource(value: string): string {
  const trimmed = String(value ?? '').trim()
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1).trim() : trimmed
}

function normalizeMediaFilterSource(value: string): string {
  return splitAssetMetadataFromUrl(normalizeMarkdownLinkSource(value)).assetUrl.trim()
}

function getSourceFileName(source: string): string {
  const normalized = normalizeMediaFilterSource(source)
  if (!normalized || normalized.startsWith('data:')) return ''

  try {
    const parsed = new URL(normalized, 'https://aislenote.local')
    const segment = parsed.pathname.split('/').pop() ?? ''
    return decodeURIComponent(segment).trim()
  } catch {
    const withoutFragment = normalized.split('#')[0] ?? ''
    const withoutQuery = withoutFragment.split('?')[0] ?? ''
    const segment = withoutQuery.split('/').pop() ?? ''
    try {
      return decodeURIComponent(segment).trim()
    } catch {
      return segment.trim()
    }
  }
}

function getMediaFallbackLabel(source: string, kind: NoteFilterMediaKind): string {
  const fileName = getSourceFileName(source)
  if (fileName) return kind === 'image' ? fileName : getMediaDisplayTitle(fileName, kind)
  return kind
}

export function extractMediaFilterReferences(markdown: string): ExtractedMediaFilterReference[] {
  const references: ExtractedMediaFilterReference[] = []
  const pattern = new RegExp(MARKDOWN_LINK_PATTERN.source, MARKDOWN_LINK_PATTERN.flags)

  for (const match of String(markdown ?? '').matchAll(pattern)) {
    const image = match[1] === '!'
    const label = unescapeMarkdownLabel(match[2] ?? '')
    const source = normalizeMediaFilterSource(match[3] ?? '')
    if (!source) continue

    if (image) {
      const kind: NoteFilterMediaKind = 'image'
      references.push({
        key: getMediaFilterKey(kind, source),
        label: label || getMediaFallbackLabel(source, kind),
        kind,
        source,
        previewUrl: resolveAssetDisplayUrl(source),
      })
      continue
    }

    const mediaKind = getMediaKindFromUrl(source)
    if (!mediaKind) continue
    references.push({
      key: getMediaFilterKey(mediaKind, source),
      label: getMediaDisplayTitle(label || getMediaFallbackLabel(source, mediaKind), mediaKind),
      kind: mediaKind,
      source,
    })
  }

  return references
}

function buildMediaNoteFilterIndex(
  state: AppState,
  selectedKeys: string[],
  context?: VaultIndexContext,
): NoteFilterIndex {
  const indexContext = getVaultIndexContext(state, context)
  const locations = indexContext.locations
  const optionsByKey = new Map<string, NoteFilterOption>()
  const occurrences: NoteFilterOccurrence[] = []

  const pushLocationMedia = (location: NoteLocation, body: NoteBody | null | undefined) => {
    if (!body) return
    body.aisles.forEach((aisle) => {
      const aisleBodyId = getAisleBodyId(aisle)
      const references = extractMediaFilterReferences(getAisleMarkdown(aisle, indexContext.aisleBodiesById))
      references.forEach((reference) => {
        const current = optionsByKey.get(reference.key)
        if (current) {
          optionsByKey.set(reference.key, { ...current, count: current.count + 1 })
        } else {
          optionsByKey.set(reference.key, {
            key: reference.key,
            label: reference.label,
            count: 1,
            type: `media-${reference.kind}` as NoteFilterOptionType,
            mediaKind: reference.kind,
            source: reference.source,
            previewUrl: reference.previewUrl,
          })
        }
        occurrences.push({
          kind: 'media',
          key: reference.key,
          label: reference.label,
          optionType: `media-${reference.kind}` as NoteFilterOptionType,
          location,
          noteBodyId: body.id,
          aisleId: aisle.id,
          aisleBodyId,
          mediaKind: reference.kind,
          source: reference.source,
          previewUrl: reference.previewUrl,
        })
      })
    })
  }

  locations.forEach((entry) => {
    pushLocationMedia(getNoteLocationFromEntry(entry), indexContext.noteBodiesById.get(entry.noteBodyId))
  })

  pushLocationMedia(SCRATCHPAD_FIND_LOCATION, indexContext.scratchpadBody)

  return finalizeIndex(
    'media',
    selectedKeys,
    Array.from(optionsByKey.values()),
    occurrences,
    indexContext.orderedNoteLocations,
  )
}

export function buildNoteFilterIndex(
  state: AppState,
  kind: NoteFilterKind,
  selectedKeys: string[] = [],
  context?: VaultIndexContext,
): NoteFilterIndex {
  if (kind === 'tags') return buildTagNoteFilterIndex(state, selectedKeys, context)
  if (kind === 'synced') return buildSyncedFilterIndex(state, selectedKeys, context)
  if (kind === 'frontmatter') return buildFrontmatterNoteFilterIndex(state, selectedKeys, context)
  return buildMediaNoteFilterIndex(state, selectedKeys, context)
}

export function getFirstMatchingNoteFilterLocation(
  index: NoteFilterIndex,
  location: NoteLocation,
): NoteLocation | null {
  return index.firstMatchByNote.get(buildNoteLocationKey(location)) ?? null
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

export { sortTagFilterTags }
