import { describe, expect, it } from 'vitest'
import type { NoteFilterIndex, NoteFilterOccurrence, NoteFilterOption } from '../filters/note-filter'
import type { NoteFilterKind, NoteFilterSettings, NoteLocation } from '../types/app'
import {
  getFirstSelectedNoteFilterLocation,
  getNoteFilterNavigationTarget,
  isNoteFilterLocationMatch,
  reconcileActiveNoteFilterSettings,
} from './note-filter-state'

const matchingLocation: NoteLocation = {
  domainId: 'domain-a',
  spaceId: 'space-a',
  tabId: 'parent-a',
  subTabId: null,
}

const otherLocation: NoteLocation = {
  domainId: 'domain-b',
  spaceId: 'space-b',
  tabId: 'parent-b',
  subTabId: 'sub-b',
}

const nonMatchingLocation: NoteLocation = {
  domainId: 'domain-c',
  spaceId: 'space-c',
  tabId: 'parent-c',
  subTabId: null,
}

function createFilter(kind: NoteFilterKind, selectedKeys: string[]): NoteFilterSettings {
  return {
    active: true,
    kind,
    tags: {
      selectedKeys: kind === 'tags' ? selectedKeys : [],
      sortMode: 'az',
    },
    synced: {
      selectedKeys: kind === 'synced' ? selectedKeys : [],
    },
    frontmatter: {
      selectedKeys: kind === 'frontmatter' ? selectedKeys : [],
    },
  }
}

function createOption(key: string, kind: NoteFilterKind): NoteFilterOption {
  return {
    key,
    label: key,
    count: 1,
    type: kind === 'tags' ? 'tag' : kind === 'synced' ? 'synced-note' : 'frontmatter-property',
  }
}

function createOccurrence(key: string, kind: NoteFilterKind, location: NoteLocation): NoteFilterOccurrence {
  return {
    kind,
    key,
    label: key,
    optionType: kind === 'tags' ? 'tag' : kind === 'synced' ? 'synced-note' : 'frontmatter-property',
    location,
    noteBodyId: 'body-1',
    aisleId: 'aisle-1',
    aisleBodyId: 'aisle-body-1',
  }
}

function createIndex(
  kind: NoteFilterKind,
  selectedKeys: string[],
  availableKeys: string[],
  occurrenceLocations: NoteLocation[] = [matchingLocation],
): NoteFilterIndex {
  const allOccurrences = availableKeys.flatMap((key) =>
    occurrenceLocations.map((location) => createOccurrence(key, kind, location)),
  )
  const selectedSet = new Set(selectedKeys)
  const selectedOccurrences = selectedSet.size > 0
    ? allOccurrences.filter((occurrence) => selectedSet.has(occurrence.key))
    : allOccurrences
  const noteCounts = new Map<string, number>()
  selectedOccurrences.forEach((occurrence) => {
    const locationKey = [
      occurrence.location.domainId,
      occurrence.location.spaceId,
      occurrence.location.tabId,
      occurrence.location.subTabId ?? '__home__',
    ].join('::')
    noteCounts.set(locationKey, (noteCounts.get(locationKey) ?? 0) + 1)
  })

  return {
    kind,
    availableOptions: availableKeys.map((key) => createOption(key, kind)),
    selectedKeys,
    primaryKey: selectedKeys[0] ?? '',
    allOccurrences,
    selectedOccurrences,
    domainCounts: new Map(),
    spaceCounts: new Map(),
    parentCounts: new Map(),
    noteCounts,
    scratchpadCount: 0,
    occurrencesByLocation: new Map(),
    primaryOccurrencesByLocation: new Map(),
    firstMatchByDomain: new Map(),
    firstMatchBySpace: new Map(),
    firstMatchByParent: new Map(),
  }
}

describe('note filter state reconciliation', () => {
  it('keeps a selected synced key when it is still available', () => {
    const filter = createFilter('synced', ['synced-note:body-a'])
    const index = createIndex('synced', ['synced-note:body-a'], ['synced-note:body-a'])

    expect(reconcileActiveNoteFilterSettings(filter, index)).toEqual({
      filter,
      changed: false,
      removedKeys: [],
    })
  })

  it('removes a stale synced key after de-coupling while keeping remaining options active', () => {
    const filter = createFilter('synced', ['synced-note:removed'])
    const index = createIndex('synced', ['synced-note:removed'], ['synced-note:other'])
    const result = reconcileActiveNoteFilterSettings(filter, index)

    expect(result.changed).toBe(true)
    expect(result.removedKeys).toEqual(['synced-note:removed'])
    expect(result.filter.active).toBe(true)
    expect(result.filter.synced.selectedKeys).toEqual([])
  })

  it('keeps only valid keys when selected synced keys are mixed with stale keys', () => {
    const filter = createFilter('synced', ['synced-note:kept', 'synced-note:removed'])
    const index = createIndex(
      'synced',
      ['synced-note:kept', 'synced-note:removed'],
      ['synced-note:kept', 'synced-note:other'],
    )
    const result = reconcileActiveNoteFilterSettings(filter, index)

    expect(result.changed).toBe(true)
    expect(result.removedKeys).toEqual(['synced-note:removed'])
    expect(result.filter.active).toBe(true)
    expect(result.filter.synced.selectedKeys).toEqual(['synced-note:kept'])
  })

  it('exits active filter mode when no selected or available options remain', () => {
    const filter = createFilter('synced', ['synced-note:removed'])
    const index = createIndex('synced', ['synced-note:removed'], [])
    const result = reconcileActiveNoteFilterSettings(filter, index)

    expect(result.changed).toBe(true)
    expect(result.removedKeys).toEqual(['synced-note:removed'])
    expect(result.filter.active).toBe(false)
    expect(result.filter.synced.selectedKeys).toEqual([])
  })

  it('applies the same stale-key cleanup to tag and frontmatter selections', () => {
    const tagResult = reconcileActiveNoteFilterSettings(
      createFilter('tags', ['tag:missing']),
      createIndex('tags', ['tag:missing'], ['tag:kept']),
    )
    const frontmatterResult = reconcileActiveNoteFilterSettings(
      createFilter('frontmatter', ['fm-property:missing']),
      createIndex('frontmatter', ['fm-property:missing'], ['fm-property:kept']),
    )

    expect(tagResult.filter.tags.selectedKeys).toEqual([])
    expect(tagResult.filter.active).toBe(true)
    expect(frontmatterResult.filter.frontmatter.selectedKeys).toEqual([])
    expect(frontmatterResult.filter.active).toBe(true)
  })
})

describe('note filter active match navigation', () => {
  it('does not request navigation when the current note is already a match', () => {
    const index = createIndex('synced', ['synced-note:body-a'], ['synced-note:body-a'], [
      matchingLocation,
      otherLocation,
    ])

    expect(isNoteFilterLocationMatch(index, otherLocation)).toBe(true)
    expect(getNoteFilterNavigationTarget(index, otherLocation)).toBeNull()
  })

  it('returns the first selected occurrence when the current note is not a match', () => {
    const index = createIndex('synced', ['synced-note:body-a'], ['synced-note:body-a'], [
      matchingLocation,
      otherLocation,
    ])

    expect(isNoteFilterLocationMatch(index, nonMatchingLocation)).toBe(false)
    expect(getFirstSelectedNoteFilterLocation(index)).toEqual(matchingLocation)
    expect(getNoteFilterNavigationTarget(index, nonMatchingLocation)).toEqual(matchingLocation)
  })

  it('does not navigate when no selected occurrences exist', () => {
    const index = createIndex('synced', ['synced-note:removed'], ['synced-note:other'])

    expect(getFirstSelectedNoteFilterLocation(index)).toBeNull()
    expect(getNoteFilterNavigationTarget(index, nonMatchingLocation)).toBeNull()
  })
})
