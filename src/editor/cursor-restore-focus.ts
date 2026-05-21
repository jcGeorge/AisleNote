import {
  getPendingCursorRestoreFocusIntent,
  getSavedCursorRestoreFocusIntent,
  shouldFocusForEditorIntent,
  type EditorFocusIntent,
} from './focus-intent'

export type { EditorFocusIntent }

export function shouldFocusPendingCursorRestore(
  pendingFocusAisleId: string | null | undefined,
  targetAisleId: string,
  shouldFocusSavedCursorRestore = false,
) {
  return shouldFocusForEditorIntent(getPendingCursorRestoreFocusIntent({
    pendingFocusAisleId,
    targetAisleId,
    savedFocusIntent: shouldFocusSavedCursorRestore ? 'note-navigation' : 'none',
  }))
}

export function getCursorRestoreFocusIntent(options: {
  pendingFocusAisleId: string | null | undefined
  targetAisleId: string
  savedFocusIntent?: EditorFocusIntent | null
}) {
  return getPendingCursorRestoreFocusIntent(options)
}

export function shouldFocusSavedCursorRestoreOnActivation(options: {
  previousNoteLocationKey: string
  activeNoteLocationKey: string
  previousViewMode: string | null | undefined
  viewMode: string
  hasSavedSelection: boolean
}) {
  return shouldFocusForEditorIntent(getSavedCursorRestoreFocusIntent(options))
}

export function getSavedCursorRestoreIntentOnActivation(options: {
  previousNoteLocationKey: string
  activeNoteLocationKey: string
  previousViewMode: string | null | undefined
  viewMode: string
  hasSavedSelection: boolean
}) {
  return getSavedCursorRestoreFocusIntent(options)
}
