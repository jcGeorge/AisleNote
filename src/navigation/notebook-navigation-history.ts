import { useCallback, useEffect, useRef } from 'react'
import type { AppState, ViewMode } from '../types/app'
import { findNotebookNote } from '../state/notebook'

export const MAX_NOTEBOOK_NAVIGATION_HISTORY_ENTRIES = 100

export type NotebookNavigationLocation = {
  noteId: string
  aisleId?: string
}

export type ResolvedNotebookNavigationLocation = {
  noteId: string
  aisleId: string
}

export type NotebookNavigationHistoryEntry = {
  noteId: string
}

export type NotebookNavigationHistoryState = {
  entries: NotebookNavigationHistoryEntry[]
  index: number
}

export type NotebookNavigationResult = {
  state: NotebookNavigationHistoryState
  location: NotebookNavigationLocation | null
}

export function createNotebookNavigationHistoryState(): NotebookNavigationHistoryState {
  return {
    entries: [],
    index: -1,
  }
}

export function areNotebookNavigationLocationsEqual(
  left: NotebookNavigationLocation,
  right: NotebookNavigationLocation,
): boolean {
  return left.noteId.trim() === right.noteId.trim()
}

function normalizeNotebookNavigationHistoryEntry(location: NotebookNavigationLocation): NotebookNavigationHistoryEntry {
  return {
    noteId: location.noteId.trim(),
  }
}

export function pushNotebookNavigationLocation(
  state: NotebookNavigationHistoryState,
  nextLocation: NotebookNavigationLocation,
  maxEntries = MAX_NOTEBOOK_NAVIGATION_HISTORY_ENTRIES,
): NotebookNavigationHistoryState {
  const location = normalizeNotebookNavigationHistoryEntry(nextLocation)
  if (!location.noteId) return state

  const activeEntries = state.entries.slice(0, state.index + 1)
  const current = activeEntries.at(-1)
  if (current && areNotebookNavigationLocationsEqual(current, location)) return state

  const entries = [...activeEntries, location]
  const boundedMaxEntries = Math.max(1, Math.floor(maxEntries))
  const trimmedEntries = entries.slice(Math.max(0, entries.length - boundedMaxEntries))
  return {
    entries: trimmedEntries,
    index: trimmedEntries.length - 1,
  }
}

export function navigateNotebookNavigationHistoryBy(
  state: NotebookNavigationHistoryState,
  delta: number,
  resolveLocation: (location: NotebookNavigationLocation) => NotebookNavigationLocation | null,
): NotebookNavigationResult {
  const step = delta < 0 ? -1 : delta > 0 ? 1 : 0
  if (!step || state.entries.length === 0 || state.index < 0) {
    return { state, location: null }
  }

  const entries = [...state.entries]
  let index = Math.min(Math.max(state.index, 0), entries.length - 1)
  let targetIndex = index + step

  while (targetIndex >= 0 && targetIndex < entries.length) {
    const resolvedLocation = resolveLocation(entries[targetIndex])
    if (resolvedLocation) {
      entries[targetIndex] = normalizeNotebookNavigationHistoryEntry(resolvedLocation)
      return {
        state: {
          entries,
          index: targetIndex,
        },
        location: entries[targetIndex],
      }
    }

    entries.splice(targetIndex, 1)
    if (targetIndex <= index) index -= 1
    if (entries.length === 0) {
      return {
        state: createNotebookNavigationHistoryState(),
        location: null,
      }
    }

    if (step < 0) targetIndex -= 1
  }

  return {
    state: {
      entries,
      index: Math.min(Math.max(index, -1), entries.length - 1),
    },
    location: null,
  }
}

export function resolveNotebookNavigationLocation(
  state: AppState,
  location: NotebookNavigationLocation,
): ResolvedNotebookNavigationLocation | null {
  const notePath = findNotebookNote(state.notebook.items, location.noteId)
  if (!notePath) return null

  const noteBody = state.noteBodies.find((candidate) => candidate.id === notePath.note.noteBodyId) ?? null
  if (!noteBody || noteBody.aisles.length === 0) return null

  const requestedAisleId = location.aisleId?.trim() ?? ''
  const requestedAisle = noteBody.aisles.find((aisle) => aisle.id === requestedAisleId)
  if (requestedAisle) return { noteId: notePath.note.id, aisleId: requestedAisle.id }

  const savedAisleId = state.ui.noteCursorLocations[notePath.note.id]?.activeAisleId ?? ''
  const savedAisle = noteBody.aisles.find((aisle) => aisle.id === savedAisleId)
  return {
    noteId: notePath.note.id,
    aisleId: savedAisle?.id ?? noteBody.aisles[0]?.id ?? '',
  }
}

export function useNotebookNavigationHistory({
  viewMode,
  activeNoteId,
  resolveLocation,
  onApplyLocation,
}: {
  viewMode: ViewMode
  activeNoteId: string
  resolveLocation: (location: NotebookNavigationLocation) => NotebookNavigationLocation | null
  onApplyLocation: (location: NotebookNavigationLocation) => void
}) {
  const historyRef = useRef<NotebookNavigationHistoryState>(createNotebookNavigationHistoryState())
  const applyingHistoryLocationRef = useRef<NotebookNavigationLocation | null>(null)
  const resolveLocationRef = useRef(resolveLocation)
  const onApplyLocationRef = useRef(onApplyLocation)
  resolveLocationRef.current = resolveLocation
  onApplyLocationRef.current = onApplyLocation

  useEffect(() => {
    if (viewMode !== 'main') return
    if (!activeNoteId) return
    const snapshot = {
      noteId: activeNoteId,
    }
    const applyingLocation = applyingHistoryLocationRef.current
    if (applyingLocation) {
      applyingHistoryLocationRef.current = null
      if (areNotebookNavigationLocationsEqual(applyingLocation, snapshot)) return
    }

    historyRef.current = pushNotebookNavigationLocation(historyRef.current, snapshot)
  }, [activeNoteId, viewMode])

  const navigateNotebookHistoryBy = useCallback((delta: number) => {
    const result = navigateNotebookNavigationHistoryBy(historyRef.current, delta, (location) =>
      resolveLocationRef.current(location),
    )
    historyRef.current = result.state
    if (!result.location) return false

    applyingHistoryLocationRef.current = result.location
    onApplyLocationRef.current(result.location)
    return true
  }, [])

  return {
    navigateNotebookHistoryBy,
  }
}
