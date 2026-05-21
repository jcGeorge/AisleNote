import { Editor } from '@toast-ui/editor'
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { buildNoteCursorLocationKey } from '../notes/note-cursors'
import { getLocationInfo } from '../notes/note-locations'
import {
  applyCursorLocationSnapshot,
  applyNoteLocationToState,
  cloneAisles,
  getAisleSignature,
  syncNoteBodyAisleStructureInState,
  syncNoteBodyAislesInState,
} from '../notes/note-state'
import { createId, MAX_NOTE_AISLES } from '../state/workspace'
import type {
  AppState,
  ContextMenuState,
  NoteAisle,
  NoteBody,
  NoteCursorLocation,
  NoteLocation,
  ToastTone,
  ViewMode,
} from '../types/app'
import type { AisleAddTipSource } from '../tips/tips'
import {
  canApplyAisleStructuralEntryToAisles,
  createAisleStructuralHistoryEntry,
  getAisleStructuralTargetSnapshot,
  type AisleStructuralHistoryEntry,
  type AisleStructuralSnapshot,
} from './aisle-structural-history'
import { MAX_AISLE_WARNING_MESSAGE } from './aisle-edit-draft'
import type { PendingCursorRestore } from './useNoteCursorPersistence'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type UseAisleControllerParams = {
  setState: Dispatch<SetStateAction<AppState>>
  viewMode: ViewMode
  activeNoteBodyId: string
  activeNoteBody: NoteBody | null
  activeNoteAisles: NoteAisle[]
  activeDomainIdRef: MutableRefObject<string>
  activeSpaceIdRef: MutableRefObject<string>
  activeTabIdRef: MutableRefObject<string>
  activeSubTabIdRef: MutableRefObject<string | null>
  activeAisleIdRef: MutableRefObject<string>
  editorRef: MutableRefObject<Editor | null>
  pendingScrollToAisleIdRef: MutableRefObject<string | null>
  pendingFocusToAisleIdRef: MutableRefObject<string | null>
  pendingCursorRestoreRef: MutableRefObject<PendingCursorRestore | null>
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  setActiveAisleId: Dispatch<SetStateAction<string>>
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>
  setMenuOpen: Dispatch<SetStateAction<boolean>>
  setEditing: Dispatch<SetStateAction<{ type: EditableEntityType; id: string } | null>>
  buildStateWithLatestEditorContent: () => AppState
  flushPendingContent: () => void
  saveActiveCursorLocation: () => void
  getNormalizedEditorMarkdown: (editor: Editor) => string
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
  onAisleAddedForTips: (source: AisleAddTipSource) => void
}

export const useAisleController = ({
  setState,
  viewMode,
  activeNoteBodyId,
  activeNoteBody,
  activeNoteAisles,
  activeDomainIdRef,
  activeSpaceIdRef,
  activeTabIdRef,
  activeSubTabIdRef,
  activeAisleIdRef,
  editorRef,
  pendingScrollToAisleIdRef,
  pendingFocusToAisleIdRef,
  pendingCursorRestoreRef,
  setViewMode,
  setActiveAisleId,
  setContextMenu,
  setMenuOpen,
  setEditing,
  buildStateWithLatestEditorContent,
  flushPendingContent,
  saveActiveCursorLocation,
  getNormalizedEditorMarkdown,
  pushToast,
  onAisleAddedForTips,
}: UseAisleControllerParams) => {
  const [aisleEditModalOpen, setAisleEditModalOpen] = useState(false)
  const structuralUndoStackRef = useRef<AisleStructuralHistoryEntry[]>([])
  const structuralRedoStackRef = useRef<AisleStructuralHistoryEntry[]>([])
  const runAisleStructuralHistoryRef = useRef<(direction: 'undo' | 'redo') => boolean>(() => false)

  const closeAisleEditModal = () => {
    setAisleEditModalOpen(false)
  }

  const openAisleEditModal = () => {
    if (viewMode !== 'main' || !activeNoteBody) return
    saveActiveCursorLocation()
    flushPendingContent()
    setContextMenu(null)
    setMenuOpen(false)
    setEditing(null)
    setAisleEditModalOpen(true)
  }

  const captureActiveAisleStructuralSnapshot = (
    sourceState = buildStateWithLatestEditorContent(),
  ): AisleStructuralSnapshot | null => {
    const location: NoteLocation = {
      domainId: activeDomainIdRef.current,
      spaceId: activeSpaceIdRef.current,
      tabId: activeTabIdRef.current,
      subTabId: activeSubTabIdRef.current,
    }
    const locationInfo = getLocationInfo(sourceState, location)
    const body = sourceState.noteBodies.find((candidate) => candidate.id === locationInfo.noteBodyId) ?? null
    if (!locationInfo.noteBodyId || !body) return null
    const locationKey = buildNoteCursorLocationKey(location)
    return {
      location,
      locationKey,
      noteBodyId: locationInfo.noteBodyId,
      aisles: cloneAisles(body.aisles),
      activeAisleId: activeAisleIdRef.current,
      cursorLocation: sourceState.ui.noteCursorLocations[locationKey] ?? null,
    }
  }

  const pushAisleStructuralHistory = (
    type: AisleStructuralHistoryEntry['type'],
    before: AisleStructuralSnapshot,
    after: AisleStructuralSnapshot,
  ) => {
    if (before.noteBodyId !== after.noteBodyId) return
    structuralUndoStackRef.current = [
      ...structuralUndoStackRef.current.slice(-99),
      createAisleStructuralHistoryEntry(type, before, after),
    ]
    structuralRedoStackRef.current = []
  }

  const getActiveNoteStructuralScopeKey = () =>
    [
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current ?? '__home__',
    ].join('::')

  const getCurrentAislesForEntry = (entry: AisleStructuralHistoryEntry, sourceState = buildStateWithLatestEditorContent()) => {
    const body = sourceState.noteBodies.find((candidate) => candidate.id === entry.noteBodyId) ?? null
    return body?.aisles ?? null
  }

  const canApplyAisleStructuralEntry = (entry: AisleStructuralHistoryEntry, direction: 'undo' | 'redo') => {
    const currentAisles = getCurrentAislesForEntry(entry)
    return currentAisles ? canApplyAisleStructuralEntryToAisles(entry, direction, currentAisles) : false
  }

  const applyAisleStructuralEntry = (entry: AisleStructuralHistoryEntry, direction: 'undo' | 'redo') => {
    if (!canApplyAisleStructuralEntry(entry, direction)) return false
    saveActiveCursorLocation()
    flushPendingContent()

    const target = getAisleStructuralTargetSnapshot(entry, direction)
    setState((previous) => {
      const body = previous.noteBodies.find((candidate) => candidate.id === entry.noteBodyId) ?? null
      if (!body || !canApplyAisleStructuralEntryToAisles(entry, direction, body.aisles)) return previous
      const withAisles = syncNoteBodyAisleStructureInState(previous, entry.noteBodyId, target.aisles)
      const withLocation = applyNoteLocationToState(withAisles, target.location)
      return applyCursorLocationSnapshot(withLocation, target.locationKey, target.cursorLocation)
    })

    setViewMode('main')
    setActiveAisleId(target.activeAisleId)
    pendingScrollToAisleIdRef.current = target.activeAisleId
    pendingFocusToAisleIdRef.current = target.activeAisleId
    pendingCursorRestoreRef.current = {
      noteLocationKey: target.locationKey,
      aisleId: target.activeAisleId,
      selection: target.cursorLocation?.aisles[target.activeAisleId] ?? null,
    }
    setContextMenu(null)
    setMenuOpen(false)
    setEditing(null)
    closeAisleEditModal()
    return true
  }

  const runAisleStructuralHistory = (direction: 'undo' | 'redo') => {
    const sourceStack = direction === 'undo' ? structuralUndoStackRef.current : structuralRedoStackRef.current
    const entry = sourceStack[sourceStack.length - 1]
    if (!entry || !applyAisleStructuralEntry(entry, direction)) return false
    if (direction === 'undo') {
      structuralUndoStackRef.current = structuralUndoStackRef.current.slice(0, -1)
      structuralRedoStackRef.current = [...structuralRedoStackRef.current, entry]
    } else {
      structuralRedoStackRef.current = structuralRedoStackRef.current.slice(0, -1)
      structuralUndoStackRef.current = [...structuralUndoStackRef.current, entry]
    }
    return true
  }
  runAisleStructuralHistoryRef.current = runAisleStructuralHistory

  const scheduleAisleStructuralHistoryFallback = (direction: 'undo' | 'redo') => {
    const noteScopeKey = getActiveNoteStructuralScopeKey()
    const editorAtStart = editorRef.current
    const beforeMarkdown = editorAtStart ? getNormalizedEditorMarkdown(editorAtStart) : null
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (noteScopeKey !== getActiveNoteStructuralScopeKey()) return
        const editorAfter = editorRef.current
        const afterMarkdown = editorAfter ? getNormalizedEditorMarkdown(editorAfter) : null
        if (editorAfter === editorAtStart && beforeMarkdown !== null && afterMarkdown !== beforeMarkdown) return
        runAisleStructuralHistoryRef.current(direction)
      })
    })
  }

  const addAisleToActiveNote = (
    markdown = '',
    options: { beforeSnapshot?: AisleStructuralSnapshot | null; recordHistory?: boolean; source?: AisleAddTipSource } = {},
  ) => {
    if (!activeNoteBodyId) return
    const currentAisleCount = activeNoteBody?.aisles.length ?? 0
    if (currentAisleCount <= 0) return
    if (currentAisleCount >= MAX_NOTE_AISLES) {
      pushToast(MAX_AISLE_WARNING_MESSAGE, 'warning')
      return
    }

    const beforeSnapshot = options.beforeSnapshot ?? captureActiveAisleStructuralSnapshot()
    if (!beforeSnapshot) return
    const newAisle: NoteAisle = { id: createId(), markdown: normalizeMarkdownForPersistence(markdown) }
    const latestBeforeAddState = buildStateWithLatestEditorContent()
    const latestBeforeAddBody =
      latestBeforeAddState.noteBodies.find((candidate) => candidate.id === beforeSnapshot.noteBodyId) ?? null
    const baseAisles = latestBeforeAddBody ? cloneAisles(latestBeforeAddBody.aisles) : beforeSnapshot.aisles
    flushPendingContent()
    const afterAisles = [...baseAisles, newAisle]
    const afterCursorLocation: NoteCursorLocation = {
      activeAisleId: newAisle.id,
      aisles: {
        ...(beforeSnapshot.cursorLocation?.aisles ?? {}),
        [newAisle.id]: {
          anchor: 1,
          head: 1,
          updatedAt: Date.now(),
        },
      },
      updatedAt: Date.now(),
    }
    const afterSnapshot: AisleStructuralSnapshot = {
      ...beforeSnapshot,
      aisles: afterAisles,
      activeAisleId: newAisle.id,
      cursorLocation: afterCursorLocation,
    }
    setState((previous) => {
      const body = previous.noteBodies.find((candidate) => candidate.id === activeNoteBodyId)
      if (!body) return previous
      if (body.aisles.length >= MAX_NOTE_AISLES) return previous
      const withAisles = syncNoteBodyAislesInState(previous, activeNoteBodyId, [...body.aisles, newAisle])
      return applyCursorLocationSnapshot(withAisles, afterSnapshot.locationKey, afterSnapshot.cursorLocation)
    })
    if (options.recordHistory !== false) {
      pushAisleStructuralHistory('add-aisle', beforeSnapshot, afterSnapshot)
    }
    setActiveAisleId(newAisle.id)
    pendingScrollToAisleIdRef.current = newAisle.id
    pendingFocusToAisleIdRef.current = newAisle.id
    onAisleAddedForTips(options.source ?? 'ui')
    closeAisleEditModal()
  }

  const applyAisleEditDraftToActiveNote = (nextAisles: NoteAisle[]) => {
    if (!activeNoteBodyId) return
    const afterAisles = cloneAisles(nextAisles)
    const afterAisleIds = afterAisles.map((aisle) => aisle.id)
    if (afterAisles.length <= 0) {
      pushToast('a note must keep at least one aisle.', 'warning')
      return
    }
    if (afterAisles.length > MAX_NOTE_AISLES) {
      pushToast(MAX_AISLE_WARNING_MESSAGE, 'warning')
      return
    }
    if (afterAisleIds.some((aisleId) => aisleId.trim().length <= 0) || new Set(afterAisleIds).size !== afterAisles.length) {
      pushToast('aisle changes could not be applied.', 'error')
      return
    }

    const latestState = buildStateWithLatestEditorContent()
    const beforeSnapshot = captureActiveAisleStructuralSnapshot(latestState)
    if (!beforeSnapshot) return
    if (getAisleSignature(beforeSnapshot.aisles) === getAisleSignature(afterAisles)) {
      closeAisleEditModal()
      return
    }

    flushPendingContent()
    const afterAisleIdSet = new Set(afterAisleIds)
    const afterActiveAisleId = afterAisleIdSet.has(beforeSnapshot.activeAisleId)
      ? beforeSnapshot.activeAisleId
      : afterAisles[0]?.id ?? ''
    const afterAisleCursors = Object.fromEntries(
      Object.entries(beforeSnapshot.cursorLocation?.aisles ?? {}).filter(([aisleId]) => afterAisleIdSet.has(aisleId)),
    ) as NoteCursorLocation['aisles']
    const afterCursorLocation: NoteCursorLocation = {
      activeAisleId: afterActiveAisleId,
      aisles: afterAisleCursors,
      updatedAt: Date.now(),
    }
    const afterSnapshot: AisleStructuralSnapshot = {
      ...beforeSnapshot,
      aisles: afterAisles,
      activeAisleId: afterActiveAisleId,
      cursorLocation: afterCursorLocation,
    }
    setState((previous) => {
      const body = previous.noteBodies.find((candidate) => candidate.id === beforeSnapshot.noteBodyId)
      if (!body) return previous
      const withAisles = syncNoteBodyAisleStructureInState(previous, beforeSnapshot.noteBodyId, afterAisles)
      return applyCursorLocationSnapshot(withAisles, afterSnapshot.locationKey, afterSnapshot.cursorLocation)
    })
    pushAisleStructuralHistory('edit-aisles', beforeSnapshot, afterSnapshot)
    setActiveAisleId(afterActiveAisleId)
    pendingScrollToAisleIdRef.current = afterActiveAisleId
    pendingFocusToAisleIdRef.current = afterActiveAisleId
    pendingCursorRestoreRef.current = {
      noteLocationKey: afterSnapshot.locationKey,
      aisleId: afterActiveAisleId,
      selection: afterCursorLocation.aisles[afterActiveAisleId] ?? null,
    }
    closeAisleEditModal()
  }

  useEffect(() => {
    if ((viewMode !== 'main' || activeNoteAisles.length <= 0) && aisleEditModalOpen) {
      closeAisleEditModal()
    }
  }, [activeNoteAisles.length, aisleEditModalOpen, viewMode])

  return {
    aisleEditModalOpen,
    openAisleEditModal,
    closeAisleEditModal,
    captureActiveAisleStructuralSnapshot,
    runAisleStructuralHistory,
    scheduleAisleStructuralHistoryFallback,
    addAisleToActiveNote,
    applyAisleEditDraftToActiveNote,
  }
}
