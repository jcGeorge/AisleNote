import { Editor } from '@toast-ui/editor'
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { materializeDecoupledAisleCopies } from '../notes/aisle-links'
import { buildNoteCursorLocationKey } from '../notes/note-cursors'
import { getLocationInfo } from '../notes/note-locations'
import {
  cloneAisles,
  getAisleSignature,
  resolveNoteAisles,
  syncNoteBodyAisleStructureInState,
  syncNoteBodyAislesInState,
} from '../notes/aisle-body-state'
import { applyCursorLocationSnapshot } from '../notes/note-state'
import { createId, MAX_NOTE_AISLES } from '../state/workspace'
import type {
  AppState,
  ContextMenuState,
  NoteBody,
  NoteCursorLocation,
  NoteLocation,
  ResolvedNoteAisle,
  ToastTone,
  ViewMode,
} from '../types/app'
import {
  applyAisleStructuralEntryToState,
  canApplyAisleStructuralEntryToAisles,
  createAisleStructuralHistoryEntry,
  getResolvedAislesForStructuralSnapshot,
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
  activeNoteAisles: ResolvedNoteAisle[]
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
    const aisles = locationInfo.noteBodyId
      ? getResolvedAislesForStructuralSnapshot(sourceState, locationInfo.noteBodyId)
      : null
    if (!locationInfo.noteBodyId || !body || !aisles) return null
    const locationKey = buildNoteCursorLocationKey(location)
    return {
      location,
      locationKey,
      noteBodyId: locationInfo.noteBodyId,
      aisles,
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
    return body ? resolveNoteAisles(body.aisles, sourceState.noteAisleBodies) : null
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
    const nextState = applyAisleStructuralEntryToState(buildStateWithLatestEditorContent(), entry, direction)
    if (!nextState) return false
    setState(nextState)

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
    options: { beforeSnapshot?: AisleStructuralSnapshot | null; recordHistory?: boolean } = {},
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
    const newAisle: ResolvedNoteAisle = {
      id: createId(),
      aisleBodyId: createId(),
      markdown: normalizeMarkdownForPersistence(markdown),
    }
    const latestBeforeAddState = buildStateWithLatestEditorContent()
    const baseAisles =
      getResolvedAislesForStructuralSnapshot(latestBeforeAddState, beforeSnapshot.noteBodyId) ?? beforeSnapshot.aisles
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
      const body = previous.noteBodies.find((candidate) => candidate.id === beforeSnapshot.noteBodyId)
      if (!body) return previous
      if (afterAisles.length > MAX_NOTE_AISLES) return previous
      const withAisles = syncNoteBodyAislesInState(previous, beforeSnapshot.noteBodyId, afterAisles)
      return applyCursorLocationSnapshot(withAisles, afterSnapshot.locationKey, afterSnapshot.cursorLocation)
    })
    if (options.recordHistory !== false) {
      pushAisleStructuralHistory('add-aisle', beforeSnapshot, afterSnapshot)
    }
    setActiveAisleId(newAisle.id)
    pendingScrollToAisleIdRef.current = newAisle.id
    pendingFocusToAisleIdRef.current = newAisle.id
    closeAisleEditModal()
  }

  const applyAisleEditDraftToActiveNote = (
    nextAisles: ResolvedNoteAisle[],
    options: { decoupleAisleIds?: Iterable<string> } = {},
  ) => {
    if (!activeNoteBodyId) return
    const draftAisles = cloneAisles(nextAisles)
    const stagedDecoupleAisleIds = new Set(options.decoupleAisleIds ?? [])
    const afterAisleIds = draftAisles.map((aisle) => aisle.id)
    if (draftAisles.length <= 0) {
      pushToast('a note must keep at least one aisle.', 'warning')
      return
    }
    if (draftAisles.length > MAX_NOTE_AISLES) {
      pushToast(MAX_AISLE_WARNING_MESSAGE, 'warning')
      return
    }
    if (afterAisleIds.some((aisleId) => aisleId.trim().length <= 0) || new Set(afterAisleIds).size !== draftAisles.length) {
      pushToast('aisle changes could not be applied.', 'error')
      return
    }

    const latestState = buildStateWithLatestEditorContent()
    const beforeSnapshot = captureActiveAisleStructuralSnapshot(latestState)
    if (!beforeSnapshot) return
    const afterAisles = stagedDecoupleAisleIds.size > 0
      ? materializeDecoupledAisleCopies(latestState, draftAisles, stagedDecoupleAisleIds)
      : draftAisles
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
