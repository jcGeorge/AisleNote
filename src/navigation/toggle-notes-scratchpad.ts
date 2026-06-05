import type { ViewMode } from '../types/app'

export type NotesScratchpadToggleIntent = 'open-note' | 'open-scratchpad'
export type NotesScratchpadToggleState = {
  viewMode: ViewMode
  scratchpadActive: boolean
}

export function getNotesScratchpadToggleIntent(
  viewMode: ViewMode,
  scratchpadActive: boolean,
): NotesScratchpadToggleIntent {
  return viewMode === 'main' && !scratchpadActive ? 'open-scratchpad' : 'open-note'
}

export function getNextNotesScratchpadToggleState({
  viewMode,
  scratchpadActive,
}: NotesScratchpadToggleState): NotesScratchpadToggleState {
  return getNotesScratchpadToggleIntent(viewMode, scratchpadActive) === 'open-scratchpad'
    ? { viewMode: 'main', scratchpadActive: true }
    : { viewMode: 'main', scratchpadActive: false }
}
