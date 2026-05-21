export type EditorFocusIntent =
  | 'none'
  | 'initial-load'
  | 'note-navigation'
  | 'aisle-activation'
  | 'pointer-edit'
  | 'toolbar-command'
  | 'structural-history'

export function shouldFocusForEditorIntent(intent: EditorFocusIntent | null | undefined): boolean {
  return Boolean(intent && intent !== 'none' && intent !== 'initial-load')
}

export function getSavedCursorRestoreFocusIntent(options: {
  previousNoteLocationKey: string
  activeNoteLocationKey: string
  previousViewMode: string | null | undefined
  viewMode: string
  hasSavedSelection: boolean
}): EditorFocusIntent {
  if (!options.hasSavedSelection || options.viewMode !== 'main') return 'none'
  if (options.previousNoteLocationKey && options.previousNoteLocationKey !== options.activeNoteLocationKey) {
    return 'note-navigation'
  }
  if (options.previousViewMode && options.previousViewMode !== 'main') return 'note-navigation'
  return 'none'
}

export function getPendingCursorRestoreFocusIntent(options: {
  pendingFocusAisleId: string | null | undefined
  targetAisleId: string
  savedFocusIntent?: EditorFocusIntent | null
}): EditorFocusIntent {
  if (options.pendingFocusAisleId) {
    return options.pendingFocusAisleId === options.targetAisleId ? 'aisle-activation' : 'none'
  }
  return options.savedFocusIntent ?? 'none'
}
