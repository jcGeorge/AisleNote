import type { ViewMode } from '../types/app'

export type NotesTrashToggleIntent = 'open-main' | 'open-trash'
export type NotesTrashToggleState = {
  viewMode: ViewMode
  scratchpadActive: boolean
}

export function getNotesTrashToggleIntent(viewMode: ViewMode): NotesTrashToggleIntent {
  return viewMode === 'main' ? 'open-trash' : 'open-main'
}

export function getNextNotesTrashToggleState({
  viewMode,
  scratchpadActive,
}: NotesTrashToggleState): NotesTrashToggleState {
  if (viewMode === 'main' && scratchpadActive) return { viewMode: 'main', scratchpadActive: true }

  return getNotesTrashToggleIntent(viewMode) === 'open-trash'
    ? { viewMode: 'trash', scratchpadActive: false }
    : { viewMode: 'main', scratchpadActive: false }
}
