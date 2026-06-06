import type { ViewMode } from '../types/app'

export type NotesFilterModeState = {
  viewMode: ViewMode
  filterActive: boolean
  filterMenuOpen: boolean
}

export type NotesFilterExitState = NotesFilterModeState & {
  scratchpadActive: boolean
}

export type NotesFilterToggleIntent = 'exit-filter' | 'open-filter'

export function isNotesFilterModeActive({
  viewMode,
  filterActive,
  filterMenuOpen,
}: NotesFilterModeState): boolean {
  return viewMode === 'main' && (filterActive || filterMenuOpen)
}

export function getNotesFilterToggleIntent(state: NotesFilterModeState): NotesFilterToggleIntent {
  return isNotesFilterModeActive(state) ? 'exit-filter' : 'open-filter'
}

export function getNextNotesFilterExitState(state: NotesFilterExitState): NotesFilterExitState {
  if (!isNotesFilterModeActive(state)) return state
  return {
    ...state,
    filterActive: false,
    filterMenuOpen: false,
  }
}
