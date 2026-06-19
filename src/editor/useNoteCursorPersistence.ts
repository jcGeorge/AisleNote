import type { Editor } from '@toast-ui/editor'
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { buildAisleEditorKey } from './aisle-editor'
import {
  getEditorDocSize,
  getEditorCursorSelection,
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
import type { AisleActivationSource } from './aisle-activation'

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

export function getPendingCursorRestoreTargetAisleId({
  pendingFocusAisleId,
  pendingCursorRestore,
  activeNoteLocationKey,
  suppressSavedCursorRestore,
}: {
  pendingFocusAisleId: string | null | undefined
  pendingCursorRestore: Pick<PendingCursorRestore, 'noteLocationKey' | 'aisleId'> | null | undefined
  activeNoteLocationKey: string
  suppressSavedCursorRestore: boolean
}): string {
  const restoreAisleId =
    !suppressSavedCursorRestore && pendingCursorRestore?.noteLocationKey === activeNoteLocationKey
      ? pendingCursorRestore.aisleId
      : ''
  return pendingFocusAisleId || restoreAisleId
}

export function shouldClearSuppressedSavedCursorRestore({
  pendingFocusAisleId,
  pendingCursorRestore,
  activeNoteLocationKey,
  suppressSavedCursorRestore,
}: {
  pendingFocusAisleId: string | null | undefined
  pendingCursorRestore: Pick<PendingCursorRestore, 'noteLocationKey'> | null | undefined
  activeNoteLocationKey: string
  suppressSavedCursorRestore: boolean
}): boolean {
  return Boolean(
    suppressSavedCursorRestore &&
      !pendingFocusAisleId &&
      pendingCursorRestore?.noteLocationKey === activeNoteLocationKey,
  )
}

export function isPendingCursorRestoreTargetCurrent({
  pendingFocusAisleId,
  pendingCursorRestore,
  activeNoteLocationKey,
  suppressSavedCursorRestore,
  expectedTargetAisleId,
}: {
  pendingFocusAisleId: string | null | undefined
  pendingCursorRestore: Pick<PendingCursorRestore, 'noteLocationKey' | 'aisleId'> | null | undefined
  activeNoteLocationKey: string
  suppressSavedCursorRestore: boolean
  expectedTargetAisleId: string
}): boolean {
  return getPendingCursorRestoreTargetAisleId({
    pendingFocusAisleId,
    pendingCursorRestore,
    activeNoteLocationKey,
    suppressSavedCursorRestore,
  }) === expectedTargetAisleId
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
  suppressSavedCursorRestoreRef?: { readonly current: unknown }
  activateAisleEditor: (
    editorKey: string,
    options?: {
      focus?: boolean
      flushPrevious?: boolean
      focusAtClientPoint?: { clientX: number; clientY: number }
      allowDuringPendingRename?: boolean
      source?: AisleActivationSource
    },
  ) => boolean
}

function buildCursorSelectionCacheKey(noteLocationKey: string, aisleId: string): string {
  return `${noteLocationKey}::${aisleId}`
}

export function getCachedOrStoredCursorSelection(
  cursorSelectionCache: Map<string, NoteCursorSelection | null>,
  noteCursorLocations: AppState['ui']['noteCursorLocations'],
  noteLocationKey: string,
  aisleId: string,
): NoteCursorSelection | null {
  const key = buildCursorSelectionCacheKey(noteLocationKey, aisleId)
  if (cursorSelectionCache.has(key)) {
    return cursorSelectionCache.get(key) ?? null
  }
  return noteCursorLocations[noteLocationKey]?.aisles[aisleId] ?? null
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
  const cursorSelectionCacheRef = useRef<Map<string, NoteCursorSelection | null>>(new Map())

  const cacheCursorSelection = (noteLocationKey: string, aisleId: string, selection: NoteCursorSelection | null) => {
    cursorSelectionCacheRef.current.set(buildCursorSelectionCacheKey(noteLocationKey, aisleId), selection)
  }

  const getSavedCursorSelection = (noteLocationKey: string, aisleId: string) => {
    return getCachedOrStoredCursorSelection(
      cursorSelectionCacheRef.current,
      noteCursorLocations,
      noteLocationKey,
      aisleId,
    )
  }

  const readActiveCursorSnapshot = (): {
    noteLocationKey: string
    aisleId: string
    selection: NoteCursorSelection | null
  } | null => {
    if (!isMainViewRef.current) return null
    const aisleId = activeAisleIdRef.current
    const noteLocationKey = activeNoteLocationKeyRef.current
    if (!aisleId || !noteLocationKey) return null
    const currentEditor = editorRef.current
    if (!currentEditor || activeEditorAisleIdRef.current !== aisleId) {
      return { noteLocationKey, aisleId, selection: null }
    }

    const rawSelection = getEditorCursorSelection(currentEditor)
    const selection = getPersistableCursorSelectionForActiveEditor({
      activeAisleId: aisleId,
      activeEditorAisleId: activeEditorAisleIdRef.current,
      rawSelection,
      docSize: getEditorDocSize(currentEditor),
      updatedAt: Date.now(),
    })
    return { noteLocationKey, aisleId, selection }
  }

  const applyCursorSnapshotToState = (
    previous: AppState,
    snapshot: { noteLocationKey: string; aisleId: string; selection: NoteCursorSelection | null } | null,
  ): AppState => {
    if (!snapshot) return previous
    const { noteLocationKey, aisleId, selection } = snapshot
    cacheCursorSelection(noteLocationKey, aisleId, selection)
    return updateCursorLocationInState(previous, noteLocationKey, aisleId, selection)
  }

  const applyActiveCursorToState = (previous: AppState): AppState =>
    applyCursorSnapshotToState(previous, readActiveCursorSnapshot())

  const saveActiveCursorLocation = () => {
    const snapshot = readActiveCursorSnapshot()
    if (snapshot) {
      cacheCursorSelection(snapshot.noteLocationKey, snapshot.aisleId, snapshot.selection)
    }
    setState((previous) => applyCursorSnapshotToState(previous, snapshot))
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
    getSavedCursorSelection,
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
  suppressSavedCursorRestoreRef,
  activateAisleEditor,
}: UsePendingNoteCursorRestoreParams) => {
  useEffect(() => {
    const pendingAisleId = pendingFocusToAisleIdRef.current
    const pendingCursorRestore = pendingCursorRestoreRef.current
    const suppressSavedCursorRestore = Boolean(suppressSavedCursorRestoreRef?.current)
    const targetAisleId = getPendingCursorRestoreTargetAisleId({
      pendingFocusAisleId: pendingAisleId,
      pendingCursorRestore,
      activeNoteLocationKey,
      suppressSavedCursorRestore,
    })
    if (shouldClearSuppressedSavedCursorRestore({
      pendingFocusAisleId: pendingAisleId,
      pendingCursorRestore,
      activeNoteLocationKey,
      suppressSavedCursorRestore,
    })) {
      pendingCursorRestoreRef.current = null
    }
    if (viewMode !== 'main' || !activeNoteBodyId || !targetAisleId) return
    if (pendingCreatedEditRef.current) return
    const focusIntent = getCursorRestoreFocusIntent({
      pendingFocusAisleId: pendingAisleId,
      targetAisleId,
      savedFocusIntent: pendingCursorRestore?.focusIntent ?? (pendingCursorRestore?.focus ? 'note-navigation' : 'none'),
    })
    const shouldFocus = shouldFocusForEditorIntent(focusIntent)

    const animationFrame = window.requestAnimationFrame(() => {
      if (!isPendingCursorRestoreTargetCurrent({
        pendingFocusAisleId: pendingFocusToAisleIdRef.current,
        pendingCursorRestore: pendingCursorRestoreRef.current,
        activeNoteLocationKey,
        suppressSavedCursorRestore: Boolean(suppressSavedCursorRestoreRef?.current),
        expectedTargetAisleId: targetAisleId,
      })) {
        return
      }
      const editorKey = buildAisleEditorKey(activeNoteBodyId, targetAisleId)
      if (activateAisleEditor(editorKey, { focus: shouldFocus })) {
        if (pendingNavigationTopAisleIdRef.current === targetAisleId) {
          const docSize = getEditorDocSize(editorRef.current)
          const topPosition = Math.min(1, Math.max(0, docSize))
          restoreEditorCursorSelection(editorRef.current, { anchor: topPosition, head: topPosition }, { focus: shouldFocus })
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
    suppressSavedCursorRestoreRef,
  ])
}
