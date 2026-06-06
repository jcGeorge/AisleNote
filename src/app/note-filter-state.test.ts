import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { NoteFilterIndex, NoteFilterOccurrence, NoteFilterOption } from '../filters/note-filter'
import type { NoteFilterKind, NoteFilterSettings, NoteLocation } from '../types/app'
import {
  getFirstSelectedNoteFilterLocation,
  getNoteFilterRailVisibility,
  getNoteFilterNavigationTarget,
  isNoteFilterLocationMatch,
  isScratchpadOnlyNoteFilterActive,
  reconcileActiveNoteFilterSettings,
} from './note-filter-state'

const appControllerSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), './useAppController.tsx'), 'utf8')

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
    media: {
      selectedKeys: kind === 'media' ? selectedKeys : [],
    },
  }
}

function createOption(key: string, kind: NoteFilterKind): NoteFilterOption {
  return {
    key,
    label: key,
    count: 1,
    type:
      kind === 'tags'
        ? 'tag'
        : kind === 'synced'
          ? 'synced-note'
          : kind === 'media'
            ? 'media-image'
            : 'frontmatter-property',
  }
}

function createOccurrence(key: string, kind: NoteFilterKind, location: NoteLocation): NoteFilterOccurrence {
  return {
    kind,
    key,
    label: key,
    optionType:
      kind === 'tags'
        ? 'tag'
        : kind === 'synced'
          ? 'synced-note'
          : kind === 'media'
            ? 'media-image'
            : 'frontmatter-property',
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
  const domainCounts = new Map<string, number>()
  selectedOccurrences.forEach((occurrence) => {
    const locationKey = [
      occurrence.location.domainId,
      occurrence.location.spaceId,
      occurrence.location.tabId,
      occurrence.location.subTabId ?? '__home__',
    ].join('::')
    noteCounts.set(locationKey, (noteCounts.get(locationKey) ?? 0) + 1)
    domainCounts.set(occurrence.location.domainId, (domainCounts.get(occurrence.location.domainId) ?? 0) + 1)
  })

  return {
    kind,
    availableOptions: availableKeys.map((key) => createOption(key, kind)),
    selectedKeys,
    primaryKey: selectedKeys[0] ?? '',
    allOccurrences,
    selectedOccurrences,
    domainCounts,
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

  it('applies the same stale-key cleanup to tag, frontmatter, and media selections', () => {
    const tagResult = reconcileActiveNoteFilterSettings(
      createFilter('tags', ['tag:missing']),
      createIndex('tags', ['tag:missing'], ['tag:kept']),
    )
    const frontmatterResult = reconcileActiveNoteFilterSettings(
      createFilter('frontmatter', ['fm-property:missing']),
      createIndex('frontmatter', ['fm-property:missing'], ['fm-property:kept']),
    )
    const mediaResult = reconcileActiveNoteFilterSettings(
      createFilter('media', ['media:image:missing']),
      createIndex('media', ['media:image:missing'], ['media:image:kept']),
    )

    expect(tagResult.filter.tags.selectedKeys).toEqual([])
    expect(tagResult.filter.active).toBe(true)
    expect(frontmatterResult.filter.frontmatter.selectedKeys).toEqual([])
    expect(frontmatterResult.filter.active).toBe(true)
    expect(mediaResult.filter.media.selectedKeys).toEqual([])
    expect(mediaResult.filter.active).toBe(true)
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

describe('note filter rail visibility', () => {
  it('keeps only the top controls rail and scratchpad rail for scratchpad-only active filters', () => {
    const index: NoteFilterIndex = {
      ...createIndex('tags', ['tag:scratchpad'], ['tag:scratchpad'], []),
      scratchpadCount: 2,
    }

    expect(isScratchpadOnlyNoteFilterActive(true, index)).toBe(true)
    expect(getNoteFilterRailVisibility({
      filterActive: true,
      index,
      showCompactDomains: true,
      showCompactSpaces: true,
    })).toEqual({
      scratchpadOnlyFilterActive: true,
      renderCompactDomainRail: true,
      renderCompactSpaceRail: false,
      renderParentRail: false,
      showNoteWorkspaceTabs: false,
    })
  })

  it('keeps normal filtered rails when the active filter has any regular note match', () => {
    const index = {
      ...createIndex('tags', ['tag:regular'], ['tag:regular'], [matchingLocation]),
      scratchpadCount: 2,
    }

    expect(isScratchpadOnlyNoteFilterActive(true, index)).toBe(false)
    expect(getNoteFilterRailVisibility({
      filterActive: true,
      index,
      showCompactDomains: true,
      showCompactSpaces: true,
    })).toEqual({
      scratchpadOnlyFilterActive: false,
      renderCompactDomainRail: true,
      renderCompactSpaceRail: true,
      renderParentRail: true,
      showNoteWorkspaceTabs: true,
    })
  })

  it('does not alter rails for inactive saved scratchpad filter counts', () => {
    const index: NoteFilterIndex = {
      ...createIndex('frontmatter', ['fm-property:status'], ['fm-property:status'], []),
      scratchpadCount: 1,
    }

    expect(isScratchpadOnlyNoteFilterActive(false, index)).toBe(false)
    expect(getNoteFilterRailVisibility({
      filterActive: false,
      index,
      showCompactDomains: false,
      showCompactSpaces: false,
    })).toEqual({
      scratchpadOnlyFilterActive: false,
      renderCompactDomainRail: false,
      renderCompactSpaceRail: false,
      renderParentRail: true,
      showNoteWorkspaceTabs: true,
    })
  })

  it('routes scratchpad-only rail visibility through the controller render gates', () => {
    expect(appControllerSource).toContain('const noteFilterRailVisibility = getNoteFilterRailVisibility({')
    expect(appControllerSource).toContain('domains={visibleTagFilteredDomains}')
    expect(appControllerSource).toContain('spaces={visibleTagFilteredSpaces}')
    expect(appControllerSource).toContain('workspace={visibleTagFilteredWorkspace}')
    expect(appControllerSource).toContain('showNoteWorkspaceTabs={noteFilterRailVisibility.showNoteWorkspaceTabs}')
    expect(appControllerSource).toContain('showHomeTab={!(tagFilterActive && activeHomeTagCount <= 0)}')
    expect(appControllerSource).toContain("viewMode === 'main' && noteFilterRailVisibility.renderCompactDomainRail")
    expect(appControllerSource).toContain("viewMode === 'main' && noteFilterRailVisibility.renderCompactSpaceRail")
    expect(appControllerSource).toContain("viewMode !== 'main' || noteFilterRailVisibility.renderParentRail")
  })

  it('routes media option clicks through single-selection occurrence cycling', () => {
    expect(appControllerSource).toContain("if (noteFilterKind === 'media')")
    expect(appControllerSource).toContain(
      'const matchingOccurrences = noteFilterIndex.allOccurrences.filter((occurrence) => occurrence.key === key)',
    )
    expect(appControllerSource).toContain('setNoteFilterCycleByOption(matchingOccurrences.length > 0 ? { [key]: nextIndex } : {})')
    expect(appControllerSource).toContain("kind: 'media'")
    expect(appControllerSource).toContain('selectedKeys: [key]')
    expect(appControllerSource).toContain('if (occurrence) openNoteFilterOccurrence(occurrence)')
  })
})
