export function shouldFocusPendingCursorRestore(
  pendingFocusAisleId: string | null | undefined,
  targetAisleId: string,
  shouldFocusSavedCursorRestore = false,
) {
  if (pendingFocusAisleId) return pendingFocusAisleId === targetAisleId
  return shouldFocusSavedCursorRestore
}

export function shouldFocusSavedCursorRestoreOnActivation(options: {
  previousNoteLocationKey: string
  activeNoteLocationKey: string
  previousViewMode: string | null | undefined
  viewMode: string
  hasSavedSelection: boolean
}) {
  if (!options.hasSavedSelection || options.viewMode !== 'main') return false
  if (options.previousNoteLocationKey && options.previousNoteLocationKey !== options.activeNoteLocationKey) return true
  return Boolean(options.previousViewMode && options.previousViewMode !== 'main')
}
