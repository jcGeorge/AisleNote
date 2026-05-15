import { Editor } from '@toast-ui/editor'
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { buildAisleEditorKey } from './aisle-editor'
import {
  getEditorCursorSelection,
  getWysiwygView,
  restoreEditorCursorSelection,
} from './prosemirror-utils'
import { clampNoteCursorSelection } from '../notes/note-cursors'
import { updateCursorLocationInState } from '../notes/note-state'
import type { AppState, NoteAisle, NoteCursorSelection, ViewMode } from '../types/app'

export type PendingCursorRestore = {
  noteLocationKey: string
  aisleId: string
  selection: NoteCursorSelection | null
}

type UseNoteCursorPersistenceParams = {
  setState: Dispatch<SetStateAction<AppState>>
  editorRef: MutableRefObject<Editor | null>
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
  activateAisleEditor: (editorKey: string, options?: { focus?: boolean; flushPrevious?: boolean; allowDuringPendingRename?: boolean }) => boolean
}

export const useNoteCursorPersistence = ({
  setState,
  editorRef,
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
  const pendingCursorRestoreRef = useRef<PendingCursorRestore | null>(null)

  const applyActiveCursorToState = (previous: AppState): AppState => {
    if (!isMainViewRef.current) return previous
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)
    const aisleId = activeAisleIdRef.current
    const noteLocationKey = activeNoteLocationKeyRef.current
    if (!currentEditor || !view || !aisleId || !noteLocationKey) return previous

    const rawSelection = getEditorCursorSelection(currentEditor)
    const selection = rawSelection
      ? clampNoteCursorSelection({ ...rawSelection, updatedAt: Date.now() }, view.state.doc.content.size)
      : null
    return updateCursorLocationInState(previous, noteLocationKey, aisleId, selection)
  }

  const saveActiveCursorLocation = () => {
    setState((previous) => applyActiveCursorToState(previous))
  }

  useEffect(() => {
    if (viewMode !== 'main' || !activeNoteBodyId) return
    if (previousNoteLocationKeyRef.current === activeNoteLocationKey) return
    previousNoteLocationKeyRef.current = activeNoteLocationKey

    const savedLocation = noteCursorLocations[activeNoteLocationKey] ?? null
    const preferredAisleId =
      savedLocation && activeNoteAisles.some((aisle) => aisle.id === savedLocation.activeAisleId)
        ? savedLocation.activeAisleId
        : activeNoteAisles[0]?.id ?? ''
    if (!preferredAisleId) {
      pendingCursorRestoreRef.current = null
      return
    }

    pendingCursorRestoreRef.current = {
      noteLocationKey: activeNoteLocationKey,
      aisleId: preferredAisleId,
      selection: savedLocation?.aisles[preferredAisleId] ?? null,
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

    const animationFrame = window.requestAnimationFrame(() => {
      const editorKey = buildAisleEditorKey(activeNoteBodyId, targetAisleId)
      if (activateAisleEditor(editorKey, { focus: true })) {
        if (pendingFocusToAisleIdRef.current === targetAisleId) {
          pendingFocusToAisleIdRef.current = null
        }
        const pending = pendingCursorRestoreRef.current
        if (pending?.noteLocationKey === activeNoteLocationKey && pending.aisleId === targetAisleId) {
          if (pending.selection) {
            restoreEditorCursorSelection(editorRef.current, pending.selection)
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
  ])
}
