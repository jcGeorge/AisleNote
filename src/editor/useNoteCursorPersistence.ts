import type { Editor } from '@toast-ui/editor'
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { TextSelection } from 'prosemirror-state'
import { buildAisleEditorKey } from './aisle-editor'
import {
  getEditorCursorSelection,
  getWysiwygView,
  restoreEditorCursorSelection,
} from './prosemirror-utils'
import { clampNoteCursorSelection } from '../notes/note-cursors'
import { updateCursorLocationInState } from '../notes/note-state'
import type { AppState, NoteAisle, NoteCursorSelection, ViewMode } from '../types/app'
import {
  getCursorRestoreFocusIntent,
  getSavedCursorRestoreIntentOnActivation,
  shouldFocusSavedCursorRestoreOnActivation,
  type EditorFocusIntent,
} from './cursor-restore-focus'
import { shouldFocusForEditorIntent } from './focus-intent'

export type PendingCursorRestore = {
  noteLocationKey: string
  aisleId: string
  selection: NoteCursorSelection | null
  focus?: boolean
  focusIntent?: EditorFocusIntent
}

type UseNoteCursorPersistenceParams = {
  setState: Dispatch<SetStateAction<AppState>>
  editorRef: MutableRefObject<Editor | null>
  activeEditorAisleIdRef: MutableRefObject<string>
  viewMode: ViewMode
  activeNoteBodyId: string
  activeNoteLocationKey: string
  activeNoteAisles: NoteAisle[]
  activeAisleId: string
  activeAisleIdRef: MutableRefObject<string>
  activeNoteLocationKeyRef: MutableRefObject<string>
  isMainViewRef: MutableRefObject<boolean>
  noteCursorLocations: AppState['ui']['noteCursorLocations']
  pendingScrollToAisleIdRef: MutableRefObject<string | null>
  setActiveAisleId: Dispatch<SetStateAction<string>>
}

type UsePendingNoteCursorRestoreParams = {
  viewMode: ViewMode
  activeNoteBodyId: string
  activeNoteAisles: NoteAisle[]
  resolvedActiveAisleId: string
  activeNoteLocationKey: string
  editing: unknown
  editorRef: MutableRefObject<Editor | null>
  pendingCreatedEditRef: MutableRefObject<unknown>
  pendingFocusToAisleIdRef: MutableRefObject<string | null>
  pendingCursorRestoreRef: MutableRefObject<PendingCursorRestore | null>
  pendingNavigationTopAisleIdRef: MutableRefObject<string | null>
  activateAisleEditor: (editorKey: string, options?: { focus?: boolean; flushPrevious?: boolean; allowDuringPendingRename?: boolean }) => boolean
}

export function getPersistableCursorSelectionForActiveEditor({
  activeAisleId,
  activeEditorAisleId,
  rawSelection,
  docSize,
  updatedAt,
}: {
  activeAisleId: string
  activeEditorAisleId: string
  rawSelection: ReturnType<typeof getEditorCursorSelection>
  docSize: number
  updatedAt: number
}): NoteCursorSelection | null {
  if (!rawSelection || activeEditorAisleId !== activeAisleId) return null
  return clampNoteCursorSelection({ ...rawSelection, updatedAt }, docSize)
}

export const useNoteCursorPersistence = ({
  setState,
  editorRef,
  activeEditorAisleIdRef,
  viewMode,
  activeNoteBodyId,
  activeNoteLocationKey,
  activeNoteAisles,
  activeAisleId,
  activeAisleIdRef,
  activeNoteLocationKeyRef,
  isMainViewRef,
  noteCursorLocations,
  pendingScrollToAisleIdRef,
  setActiveAisleId,
}: UseNoteCursorPersistenceParams) => {
  const previousNoteLocationKeyRef = useRef('')
  const previousViewModeRef = useRef<ViewMode | null>(null)
  const pendingCursorRestoreRef = useRef<PendingCursorRestore | null>(null)

  const applyActiveCursorToState = (previous: AppState): AppState => {
    if (!isMainViewRef.current) return previous
    const aisleId = activeAisleIdRef.current
    const noteLocationKey = activeNoteLocationKeyRef.current
    if (!aisleId || !noteLocationKey) return previous
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)
    if (!currentEditor || !view || activeEditorAisleIdRef.current !== aisleId) {
      return updateCursorLocationInState(previous, noteLocationKey, aisleId, null)
    }

    const rawSelection = getEditorCursorSelection(currentEditor)
    const selection = getPersistableCursorSelectionForActiveEditor({
      activeAisleId: aisleId,
      activeEditorAisleId: activeEditorAisleIdRef.current,
      rawSelection,
      docSize: view.state.doc.content.size,
      updatedAt: Date.now(),
    })
    return updateCursorLocationInState(previous, noteLocationKey, aisleId, selection)
  }

  const saveActiveCursorLocation = () => {
    setState((previous) => applyActiveCursorToState(previous))
  }

  useEffect(() => {
    const previousViewMode = previousViewModeRef.current
    previousViewModeRef.current = viewMode
    if (viewMode !== 'main' || !activeNoteBodyId) return
    if (previousNoteLocationKeyRef.current === activeNoteLocationKey && previousViewMode === 'main') return
    const previousNoteLocationKey = previousNoteLocationKeyRef.current
    previousNoteLocationKeyRef.current = activeNoteLocationKey

    const savedLocation = noteCursorLocations[activeNoteLocationKey] ?? null
    const preferredAisleId =
      savedLocation && activeNoteAisles.some((aisle) => aisle.id === savedLocation.activeAisleId)
        ? savedLocation.activeAisleId
        : activeNoteAisles[0]?.id ?? ''
    const savedSelection = savedLocation?.aisles[preferredAisleId] ?? null
    if (!preferredAisleId) {
      pendingCursorRestoreRef.current = null
      return
    }

    pendingCursorRestoreRef.current = {
      noteLocationKey: activeNoteLocationKey,
      aisleId: preferredAisleId,
      selection: savedSelection,
      focusIntent: getSavedCursorRestoreIntentOnActivation({
        previousNoteLocationKey,
        activeNoteLocationKey,
        previousViewMode,
        viewMode,
        hasSavedSelection: Boolean(savedSelection),
      }),
      focus: shouldFocusSavedCursorRestoreOnActivation({
        previousNoteLocationKey,
        activeNoteLocationKey,
        previousViewMode,
        viewMode,
        hasSavedSelection: Boolean(savedSelection),
      }),
    }
    pendingScrollToAisleIdRef.current = preferredAisleId
    if (preferredAisleId !== activeAisleId) {
      setActiveAisleId(preferredAisleId)
    }
  }, [
    viewMode,
    activeNoteBodyId,
    activeNoteLocationKey,
    activeNoteAisles,
    activeAisleId,
    noteCursorLocations,
    pendingScrollToAisleIdRef,
    setActiveAisleId,
  ])

  return {
    pendingCursorRestoreRef,
    applyActiveCursorToState,
    saveActiveCursorLocation,
  }
}

export const usePendingNoteCursorRestore = ({
  viewMode,
  activeNoteBodyId,
  activeNoteAisles,
  resolvedActiveAisleId,
  activeNoteLocationKey,
  editing,
  editorRef,
  pendingCreatedEditRef,
  pendingFocusToAisleIdRef,
  pendingCursorRestoreRef,
  pendingNavigationTopAisleIdRef,
  activateAisleEditor,
}: UsePendingNoteCursorRestoreParams) => {
  useEffect(() => {
    const pendingAisleId = pendingFocusToAisleIdRef.current
    const pendingCursorRestore = pendingCursorRestoreRef.current
    const restoreAisleId =
      pendingCursorRestore?.noteLocationKey === activeNoteLocationKey ? pendingCursorRestore.aisleId : ''
    const targetAisleId = pendingAisleId || restoreAisleId
    if (viewMode !== 'main' || !activeNoteBodyId || !targetAisleId) return
    if (pendingCreatedEditRef.current) return
    const focusIntent = getCursorRestoreFocusIntent({
      pendingFocusAisleId: pendingAisleId,
      targetAisleId,
      savedFocusIntent: pendingCursorRestore?.focusIntent ?? (pendingCursorRestore?.focus ? 'note-navigation' : 'none'),
    })
    const shouldFocus = shouldFocusForEditorIntent(focusIntent)

    const animationFrame = window.requestAnimationFrame(() => {
      const editorKey = buildAisleEditorKey(activeNoteBodyId, targetAisleId)
      if (activateAisleEditor(editorKey, { focus: shouldFocus })) {
        if (pendingNavigationTopAisleIdRef.current === targetAisleId) {
          const view = getWysiwygView(editorRef.current)
          const docSize = view?.state?.doc?.content?.size ?? 0
          if (view && typeof view.dispatch === 'function') {
            const topPosition = Math.min(1, Math.max(0, docSize))
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, topPosition, topPosition)).scrollIntoView())
          }
          pendingNavigationTopAisleIdRef.current = null
          pendingCursorRestoreRef.current = null
        }
        if (pendingFocusToAisleIdRef.current === targetAisleId) {
          pendingFocusToAisleIdRef.current = null
        }
        const pending = pendingCursorRestoreRef.current
        if (pending?.noteLocationKey === activeNoteLocationKey && pending.aisleId === targetAisleId) {
          if (pending.selection) {
            restoreEditorCursorSelection(editorRef.current, pending.selection, { focus: shouldFocus })
          }
          pendingCursorRestoreRef.current = null
        }
      }
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [
    viewMode,
    activeNoteBodyId,
    activeNoteAisles.length,
    resolvedActiveAisleId,
    activeNoteLocationKey,
    editing,
    activateAisleEditor,
    editorRef,
    pendingCreatedEditRef,
    pendingFocusToAisleIdRef,
    pendingCursorRestoreRef,
    pendingNavigationTopAisleIdRef,
  ])
}
