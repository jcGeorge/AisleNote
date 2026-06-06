import type { NoteFilterIndex } from '../filters/note-filter'
import { buildNoteLocationKey } from '../notes/note-locations'
import type { NoteFilterSettings, NoteLocation } from '../types/app'

export type NoteFilterReconciliationResult = {
  filter: NoteFilterSettings
  changed: boolean
  removedKeys: string[]
}

function withCurrentKindSelectedKeys(filter: NoteFilterSettings, selectedKeys: string[]): NoteFilterSettings {
  const kind = filter.kind
  return {
    ...filter,
    [kind]: {
      ...filter[kind],
      selectedKeys,
    },
  } as NoteFilterSettings
}

export function reconcileActiveNoteFilterSettings(
  filter: NoteFilterSettings,
  index: NoteFilterIndex,
): NoteFilterReconciliationResult {
  if (!filter.active) return { filter, changed: false, removedKeys: [] }

  const availableKeys = new Set(index.availableOptions.map((option) => option.key))
  const selectedKeys = index.selectedKeys
  const validSelectedKeys = selectedKeys.filter((key) => availableKeys.has(key))
  const removedKeys = selectedKeys.filter((key) => !availableKeys.has(key))
  const noRemainingOptions = index.availableOptions.length <= 0 || index.allOccurrences.length <= 0

  if (removedKeys.length <= 0 && !(selectedKeys.length <= 0 && noRemainingOptions)) {
    return { filter, changed: false, removedKeys: [] }
  }

  const clearedFilter = withCurrentKindSelectedKeys(filter, validSelectedKeys)
  return {
    filter: validSelectedKeys.length <= 0 && noRemainingOptions
      ? { ...clearedFilter, active: false }
      : clearedFilter,
    changed: true,
    removedKeys,
  }
}

export function isNoteFilterLocationMatch(index: NoteFilterIndex, location: NoteLocation): boolean {
  return (index.noteCounts.get(buildNoteLocationKey(location)) ?? 0) > 0
}

export function getFirstSelectedNoteFilterLocation(index: NoteFilterIndex): NoteLocation | null {
  return index.selectedOccurrences[0]?.location ?? null
}

export function getNoteFilterNavigationTarget(
  index: NoteFilterIndex,
  currentLocation: NoteLocation,
): NoteLocation | null {
  if (isNoteFilterLocationMatch(index, currentLocation)) return null
  return getFirstSelectedNoteFilterLocation(index)
}
