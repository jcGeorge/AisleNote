import type { AppState, NoteLocation } from '../types/app'
import { buildNoteLocationKey, getLocationInfo } from './note-locations'
import { listNotebookNotes } from '../state/notebook'

export const DEFAULT_SAFE_NOTE_LOCATION: NoteLocation = {
  noteId: '',
}

export type SafeNoteSelection = {
  location: NoteLocation
  noteBodyId: string
  reason: 'preferred' | 'first-valid' | 'preferred-only'
}

type SafeNoteSelectionOptions = {
  preferredLocation?: NoteLocation
  excludedLocation?: NoteLocation | null
}

function getResolvedSelection(
  sourceState: AppState,
  location: NoteLocation,
  reason: SafeNoteSelection['reason'],
): SafeNoteSelection | null {
  const info = getLocationInfo(sourceState, location)
  if (!info.note || !info.noteBodyId) return null
  return {
    location,
    noteBodyId: info.noteBodyId,
    reason,
  }
}

function isExcluded(location: NoteLocation, excludedLocation: NoteLocation | null | undefined): boolean {
  return excludedLocation ? buildNoteLocationKey(location) === buildNoteLocationKey(excludedLocation) : false
}

export function getSafeNoteSelection(
  sourceState: AppState,
  options: SafeNoteSelectionOptions = {},
): SafeNoteSelection | null {
  const preferredLocation = options.preferredLocation ?? DEFAULT_SAFE_NOTE_LOCATION
  const preferredSelection = getResolvedSelection(sourceState, preferredLocation, 'preferred')
  if (preferredSelection && !isExcluded(preferredSelection.location, options.excludedLocation)) {
    return preferredSelection
  }
  for (const { note } of listNotebookNotes(sourceState.notebook.items)) {
    const location = { noteId: note.id }
    if (!isExcluded(location, options.excludedLocation)) {
      return {
        location,
        noteBodyId: note.noteBodyId,
        reason: 'first-valid',
      }
    }
  }

  return preferredSelection ? { ...preferredSelection, reason: 'preferred-only' } : null
}

export function selectSafeNoteLocation(sourceState: AppState, location: NoteLocation): AppState {
  if (!location.noteId || sourceState.notebook.activeNoteId === location.noteId) return sourceState
  return {
    ...sourceState,
    notebook: {
      ...sourceState.notebook,
      activeNoteId: location.noteId,
    },
  }
}
