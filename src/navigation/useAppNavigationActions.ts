import type { Editor } from '@toast-ui/editor'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { buildAisleEditorKey } from '../editor/aisle-editor'
import { applyAutoPurgeToAppState } from '../state/app-state'
import {
  insertSpaceAfterInActiveDomain,
  renameDomain,
  renameSpaceInActiveDomain,
  setActiveSpaceInActiveDomain,
  updateActiveSpaceDataInActiveDomain,
} from '../state/domains'
import { collectAppNavigationEntityIds, createReservedIdAllocator } from '../state/navigation-ids'
import { createNoteBodyContent, createSubTab, createTab, duplicateSpace } from '../state/workspace'
import {
  selectActivePrimeTabHome,
  selectPrimeTabWithMemory,
  selectSubTabWithMemory,
} from '../state/navigation-memory'
import { TRASH_HOME_ID } from '../trash/trash-model'
import {
  clearRenameDraftIfMatching,
  getRenameDraftCommitRequest,
  type RenameDraft,
  type RenameEntityType,
  type RenameTarget,
} from './rename-draft'
import {
  discardPendingCreatedDomainEdit,
  discardPendingCreatedSpaceEdit,
} from './pending-created-rename'
import type {
  AppState,
  ContextMenuState,
  PendingCreatedEdit,
  Tab,
  ViewMode,
  WorkspaceData,
} from '../types/app'
import type { PendingCursorRestore } from '../editor/useNoteCursorPersistence'
import type { AisleActivationSource } from '../editor/aisle-activation'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type CommitRenameOptions = {
  focusEditor?: boolean
}

type ActivateAisleEditor = (
  editorKey: string,
  options?: {
    focus?: boolean
    flushPrevious?: boolean
    allowDuringPendingRename?: boolean
    source?: AisleActivationSource
  },
) => boolean
type CloseEditorEphemera = (options?: { restoreEditorFocus?: boolean }) => void

type UseAppNavigationActionsParams = {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  viewMode: ViewMode
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  contextMenu: ContextMenuState | null
  setMenuOpen: Dispatch<SetStateAction<boolean>>
  setEditing: Dispatch<SetStateAction<{ type: EditableEntityType; id: string } | null>>
  editingRef: MutableRefObject<RenameTarget | null>
  renameDraftRef: MutableRefObject<RenameDraft | null>
  workspace: WorkspaceData
  activeTab: Tab
  activeNoteBodyId: string
  resolvedActiveAisleId: string
  editorRef: MutableRefObject<Editor | null>
  pendingCreatedEditRef: MutableRefObject<PendingCreatedEdit | null>
  skipRenameBlurRef: MutableRefObject<{ type: EditableEntityType; id: string } | null>
  pendingFocusToAisleIdRef: MutableRefObject<string | null>
  pendingCursorRestoreRef: MutableRefObject<PendingCursorRestore | null>
  closeEditorEphemeraRef: MutableRefObject<CloseEditorEphemera>
  activateAisleEditorRef: MutableRefObject<ActivateAisleEditor>
  arrangeModeActive: boolean
  exitArrangeMode: () => void
  saveActiveCursorBeforeNavigation: () => void
  updateActiveSpaceData: (updater: (data: WorkspaceData) => WorkspaceData) => void
  setTrashTabId: Dispatch<SetStateAction<string>>
  setTrashSubTabId: Dispatch<SetStateAction<string | null>>
}

export const useAppNavigationActions = ({
  state,
  setState,
  viewMode,
  setViewMode,
  contextMenu,
  setMenuOpen,
  setEditing,
  editingRef,
  renameDraftRef,
  workspace,
  activeTab,
  activeNoteBodyId,
  resolvedActiveAisleId,
  editorRef,
  pendingCreatedEditRef,
  skipRenameBlurRef,
  pendingFocusToAisleIdRef,
  pendingCursorRestoreRef,
  closeEditorEphemeraRef,
  activateAisleEditorRef,
  arrangeModeActive,
  exitArrangeMode,
  saveActiveCursorBeforeNavigation,
  updateActiveSpaceData,
  setTrashTabId,
  setTrashSubTabId,
}: UseAppNavigationActionsParams) => {
  const clearRenameDraft = (type: RenameEntityType, id: string) => {
    renameDraftRef.current = clearRenameDraftIfMatching(renameDraftRef.current, type, id)
  }

  const commitRename = (
    type: EditableEntityType,
    id: string,
    nextTitle: string,
    options: CommitRenameOptions = {},
  ) => {
    const isPendingCreatedRename =
      pendingCreatedEditRef.current?.type === type && pendingCreatedEditRef.current.id === id
    if ((type === 'tab' || type === 'subtab') && !isPendingCreatedRename) {
      saveActiveCursorBeforeNavigation()
    }
    const title = nextTitle.trim()
    setEditing(null)
    clearRenameDraft(type, id)
    if (isPendingCreatedRename) {
      pendingCreatedEditRef.current = null
    }
    if (!title) return

    if (type === 'domain') {
      setState((previous) => renameDomain(previous, id, title))
      return
    }

    if (type === 'space') {
      setState((previous) => renameSpaceInActiveDomain(previous, id, title))
      return
    }

    const focusEditorSoon = () => {
      if (viewMode !== 'main') return
      window.requestAnimationFrame(() => {
        const editorKey =
          activeNoteBodyId && resolvedActiveAisleId ? buildAisleEditorKey(activeNoteBodyId, resolvedActiveAisleId) : ''
        if (editorKey && activateAisleEditorRef.current(editorKey, { focus: true, allowDuringPendingRename: true })) return
        editorRef.current?.focus()
      })
    }

    if (type === 'tab') {
      updateActiveSpaceData((data) => ({
        ...data,
        tabs: data.tabs.map((tab) => (tab.id === id ? { ...tab, title } : tab)),
      }))
      if (options.focusEditor !== false) focusEditorSoon()
      return
    }

    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== data.activeTabId) return tab
        return {
          ...tab,
          subTabs: tab.subTabs.map((sub) => (sub.id === id ? { ...sub, title } : sub)),
        }
      }),
    }))

    if (options.focusEditor !== false) focusEditorSoon()
  }

  const commitActiveRenameBeforeAction = () => {
    const request = getRenameDraftCommitRequest(renameDraftRef.current, editingRef.current)
    if (!request) return false
    skipRenameBlurRef.current = { type: request.type, id: request.id }
    commitRename(request.type, request.id, request.value, { focusEditor: request.focusEditor })
    return true
  }

  const shouldSkipRenameBlur = (type: EditableEntityType, id: string) => {
    const next = skipRenameBlurRef.current
    if (!next || next.type !== type || next.id !== id) return false
    skipRenameBlurRef.current = null
    return true
  }

  const discardPendingCreatedEdit = (type: EditableEntityType, id: string) => {
    const pending = pendingCreatedEditRef.current
    if (!pending || pending.type !== type || pending.id !== id) {
      setEditing(null)
      clearRenameDraft(type, id)
      return
    }

    pendingCreatedEditRef.current = null
    setEditing(null)
    clearRenameDraft(type, id)

    if (pending.type === 'tab') {
      updateActiveSpaceData((data) => {
        const remainingTabs = data.tabs.filter((tab) => tab.id !== id)
        const fallbackTabId =
          remainingTabs.find((tab) => tab.id === pending.previousTabId)?.id ?? remainingTabs[0]?.id ?? data.activeTabId
        return {
          ...data,
          activeTabId: fallbackTabId,
          tabs: remainingTabs,
        }
      })
      return
    }

    if (pending.type === 'space') {
      setState((previous) => discardPendingCreatedSpaceEdit(previous, pending))
      return
    }

    if (pending.type === 'domain') {
      setState((previous) => discardPendingCreatedDomainEdit(previous, pending))
      return
    }

    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== pending.parentTabId) return tab
        const remainingSubTabs = tab.subTabs.filter((subTab) => subTab.id !== id)
        const fallbackSubTabId =
          remainingSubTabs.find((subTab) => subTab.id === pending.previousSubTabId)?.id ?? null
        return {
          ...tab,
          activeSubTabId: fallbackSubTabId,
          subTabs: remainingSubTabs,
        }
      }),
    }))
  }

  const cancelRename = (type: EditableEntityType, id: string) => {
    skipRenameBlurRef.current = { type, id }
    clearRenameDraft(type, id)
    discardPendingCreatedEdit(type, id)
  }

  const addTab = () => {
    commitActiveRenameBeforeAction()
    saveActiveCursorBeforeNavigation()
    pendingFocusToAisleIdRef.current = null
    pendingCursorRestoreRef.current = null
    const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(state))
    const noteContent = createNoteBodyContent('', createEntityId)
    const { noteBody, aisleBody } = noteContent
    const newTab = {
      ...createTab('tab', createEntityId),
      noteBodyId: noteBody.id,
    }

    setState((previous) => {
      const sanitizedPrevious = applyAutoPurgeToAppState(previous)
      const next = updateActiveSpaceDataInActiveDomain(sanitizedPrevious, (data) => ({
        ...data,
        activeTabId: newTab.id,
        tabs: [...data.tabs, newTab],
      }))
      return {
        ...next,
        noteBodies: next.noteBodies.some((body) => body.id === noteBody.id) ? next.noteBodies : [...next.noteBodies, noteBody],
        noteAisleBodies: (next.noteAisleBodies ?? []).some((body) => body.id === aisleBody.id)
          ? next.noteAisleBodies
          : [...(next.noteAisleBodies ?? []), aisleBody],
      }
    })

    pendingCreatedEditRef.current = { type: 'tab', id: newTab.id, previousTabId: workspace.activeTabId }
    setEditing({ type: 'tab', id: newTab.id })
  }

  const addSubTab = () => {
    commitActiveRenameBeforeAction()
    saveActiveCursorBeforeNavigation()
    pendingFocusToAisleIdRef.current = null
    pendingCursorRestoreRef.current = null
    const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(state))
    const noteContent = createNoteBodyContent('', createEntityId)
    const { noteBody, aisleBody } = noteContent
    const newSubTab = { ...createSubTab('tab', createEntityId), noteBodyId: noteBody.id }

    setState((previous) => {
      const sanitizedPrevious = applyAutoPurgeToAppState(previous)
      const next = updateActiveSpaceDataInActiveDomain(sanitizedPrevious, (data) => ({
        ...data,
        tabs: data.tabs.map((tab) =>
          tab.id === data.activeTabId
            ? { ...tab, activeSubTabId: newSubTab.id, subTabs: [...tab.subTabs, newSubTab] }
            : tab,
        ),
      }))
      return {
        ...next,
        noteBodies: next.noteBodies.some((body) => body.id === noteBody.id) ? next.noteBodies : [...next.noteBodies, noteBody],
        noteAisleBodies: (next.noteAisleBodies ?? []).some((body) => body.id === aisleBody.id)
          ? next.noteAisleBodies
          : [...(next.noteAisleBodies ?? []), aisleBody],
      }
    })

    pendingCreatedEditRef.current = {
      type: 'subtab',
      id: newSubTab.id,
      parentTabId: activeTab.id,
      previousSubTabId: activeTab.activeSubTabId,
    }
    setEditing({ type: 'subtab', id: newSubTab.id })
  }

  const selectTab = (tabId: string) => {
    const target = workspace.tabs.find((tab) => tab.id === tabId)
    if (!target) return
    if (activeTab.id === tabId && activeTab.activeSubTabId === null) return
    commitActiveRenameBeforeAction()
    saveActiveCursorBeforeNavigation()
    closeEditorEphemeraRef.current()
    updateActiveSpaceData((data) => selectPrimeTabWithMemory(data, tabId))
  }

  const selectSubTab = (subTabId: string) => {
    if (activeTab.activeSubTabId === subTabId) return
    commitActiveRenameBeforeAction()
    saveActiveCursorBeforeNavigation()
    closeEditorEphemeraRef.current()
    updateActiveSpaceData((data) => selectSubTabWithMemory(data, subTabId))
  }

  const selectParentHomeTab = () => {
    if (activeTab.activeSubTabId === null) return
    commitActiveRenameBeforeAction()
    saveActiveCursorBeforeNavigation()
    closeEditorEphemeraRef.current()
    updateActiveSpaceData((data) => selectActivePrimeTabHome(data))
  }

  const openSpace = (spaceId: string) => {
    commitActiveRenameBeforeAction()
    saveActiveCursorBeforeNavigation()
    closeEditorEphemeraRef.current()
    if (arrangeModeActive) {
      exitArrangeMode()
    }
    setState((previous) => setActiveSpaceInActiveDomain(previous, spaceId))
    setViewMode('main')
    closeEditorEphemeraRef.current()
    setMenuOpen(false)
    setEditing(null)
  }

  const duplicateSpaceFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'space') return
    commitActiveRenameBeforeAction()
    const sourceSpace = state.spaces.find((space) => space.id === contextMenu.spaceId)
    if (!sourceSpace) {
      closeEditorEphemeraRef.current()
      return
    }

    const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(state))
    const duplicatedSpace = duplicateSpace(sourceSpace, state.spaces.map((space) => space.name), createEntityId)

    setState((previous) => insertSpaceAfterInActiveDomain(previous, sourceSpace.id, duplicatedSpace))

    setViewMode('main')
    setEditing({ type: 'space', id: duplicatedSpace.id })
    closeEditorEphemeraRef.current()
    setMenuOpen(false)
  }

  const toggleTrashView = () => {
    commitActiveRenameBeforeAction()
    saveActiveCursorBeforeNavigation()
    closeEditorEphemeraRef.current()
    setMenuOpen(false)

    setViewMode((previous) => {
      if (previous === 'trash') return 'main'
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
      return 'trash'
    })
  }

  const openSettings = () => {
    commitActiveRenameBeforeAction()
    saveActiveCursorBeforeNavigation()
    closeEditorEphemeraRef.current()
    setMenuOpen(false)
    setViewMode('settings')
  }

  return {
    commitRename,
    commitActiveRenameBeforeAction,
    shouldSkipRenameBlur,
    cancelRename,
    addTab,
    addSubTab,
    selectTab,
    selectSubTab,
    selectParentHomeTab,
    openSpace,
    duplicateSpaceFromContext,
    toggleTrashView,
    openSettings,
  }
}
