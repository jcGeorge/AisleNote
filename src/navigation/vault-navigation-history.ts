import { useCallback, useEffect, useRef } from 'react'
import type { AppState, ViewMode } from '../types/app'
import { findVaultNote } from '../state/vault'

export const MAX_VAULT_NAVIGATION_HISTORY_ENTRIES = 100

export type VaultNavigationLocation = {
  noteId: string
  aisleId?: string
}

export type ResolvedVaultNavigationLocation = {
  noteId: string
  aisleId: string
}

export type VaultNavigationHistoryEntry = {
  noteId: string
}

export type VaultNavigationHistoryState = {
  entries: VaultNavigationHistoryEntry[]
  index: number
}

export type VaultNavigationResult = {
  state: VaultNavigationHistoryState
  location: VaultNavigationLocation | null
}

export function createVaultNavigationHistoryState(): VaultNavigationHistoryState {
  return {
    entries: [],
    index: -1,
  }
}

export function areVaultNavigationLocationsEqual(
  left: VaultNavigationLocation,
  right: VaultNavigationLocation,
): boolean {
  return left.noteId.trim() === right.noteId.trim()
}

function normalizeVaultNavigationHistoryEntry(location: VaultNavigationLocation): VaultNavigationHistoryEntry {
  return {
    noteId: location.noteId.trim(),
  }
}

export function pushVaultNavigationLocation(
  state: VaultNavigationHistoryState,
  nextLocation: VaultNavigationLocation,
  maxEntries = MAX_VAULT_NAVIGATION_HISTORY_ENTRIES,
): VaultNavigationHistoryState {
  const location = normalizeVaultNavigationHistoryEntry(nextLocation)
  if (!location.noteId) return state

  const activeEntries = state.entries.slice(0, state.index + 1)
  const current = activeEntries.at(-1)
  if (current && areVaultNavigationLocationsEqual(current, location)) return state

  const entries = [...activeEntries, location]
  const boundedMaxEntries = Math.max(1, Math.floor(maxEntries))
  const trimmedEntries = entries.slice(Math.max(0, entries.length - boundedMaxEntries))
  return {
    entries: trimmedEntries,
    index: trimmedEntries.length - 1,
  }
}

export function navigateVaultNavigationHistoryBy(
  state: VaultNavigationHistoryState,
  delta: number,
  resolveLocation: (location: VaultNavigationLocation) => VaultNavigationLocation | null,
): VaultNavigationResult {
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
      entries[targetIndex] = normalizeVaultNavigationHistoryEntry(resolvedLocation)
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
        state: createVaultNavigationHistoryState(),
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

export function resolveVaultNavigationLocation(
  state: AppState,
  location: VaultNavigationLocation,
): ResolvedVaultNavigationLocation | null {
  const notePath = findVaultNote(state.vault.items, location.noteId)
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

export function useVaultNavigationHistory({
  viewMode,
  activeNoteId,
  resolveLocation,
  onApplyLocation,
}: {
  viewMode: ViewMode
  activeNoteId: string
  resolveLocation: (location: VaultNavigationLocation) => VaultNavigationLocation | null
  onApplyLocation: (location: VaultNavigationLocation) => void
}) {
  const historyRef = useRef<VaultNavigationHistoryState>(createVaultNavigationHistoryState())
  const applyingHistoryLocationRef = useRef<VaultNavigationLocation | null>(null)
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
      if (areVaultNavigationLocationsEqual(applyingLocation, snapshot)) return
    }

    historyRef.current = pushVaultNavigationLocation(historyRef.current, snapshot)
  }, [activeNoteId, viewMode])

  const navigateVaultHistoryBy = useCallback((delta: number) => {
    const result = navigateVaultNavigationHistoryBy(historyRef.current, delta, (location) =>
      resolveLocationRef.current(location),
    )
    historyRef.current = result.state
    if (!result.location) return false

    applyingHistoryLocationRef.current = result.location
    onApplyLocationRef.current(result.location)
    return true
  }, [])

  return {
    navigateVaultHistoryBy,
  }
}
