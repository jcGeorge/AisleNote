import type { ViewMode } from '../types/app'

export type NotesScratchpadToggleIntent = 'open-note' | 'open-scratchpad' | 'return-current'
export type NotesScratchpadToggleState = {
  viewMode: ViewMode
  scratchpadActive: boolean
}

export function getNotesScratchpadToggleIntent(
  viewMode: ViewMode,
  scratchpadActive: boolean,
): NotesScratchpadToggleIntent {
  if (viewMode === 'settings') return 'return-current'
  return viewMode === 'main' && !scratchpadActive ? 'open-scratchpad' : 'open-note'
}

export function getNextNotesScratchpadToggleState({
  viewMode,
  scratchpadActive,
}: NotesScratchpadToggleState): NotesScratchpadToggleState {
  const intent = getNotesScratchpadToggleIntent(viewMode, scratchpadActive)
  if (intent === 'return-current') return { viewMode: 'main', scratchpadActive }
  return intent === 'open-scratchpad'
    ? { viewMode: 'main', scratchpadActive: true }
    : { viewMode: 'main', scratchpadActive: false }
}
