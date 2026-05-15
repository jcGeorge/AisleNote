import { Editor } from '@toast-ui/editor'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { buildAisleEditorKey } from '../editor/aisle-editor'
import { applyAutoPurgeToAppState } from '../state/app-state'
import {
  addDomain,
  addSpaceToActiveDomain,
  createDomain,
  insertSpaceAfterInActiveDomain,
  renameDomain,
  renameSpaceInActiveDomain,
  setActiveDomain,
  setActiveSpaceInActiveDomain,
  updateActiveSpaceDataInActiveDomain,
} from '../state/domains'
import { createNoteBody, createSpace, createSubTab, createTab, duplicateSpace } from '../state/workspace'
import { TRASH_HOME_ID } from '../trash/trash-model'
import type {
  AppState,
  ContextMenuState,
  PendingContent,
  PendingCreatedEdit,
  Tab,
  ViewMode,
  WorkspaceData,
} from '../types/app'
import type { PendingCursorRestore } from '../editor/useNoteCursorPersistence'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type ActivateAisleEditor = (
  editorKey: string,
  options?: { focus?: boolean; flushPrevious?: boolean; allowDuringPendingRename?: boolean },
) => boolean

type UseAppNavigationActionsParams = {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  viewMode: ViewMode
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  contextMenu: ContextMenuState | null
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>
  setMenuOpen: Dispatch<SetStateAction<boolean>>
  setEditing: Dispatch<SetStateAction<{ type: EditableEntityType; id: string } | null>>
  workspace: WorkspaceData
  activeTab: Tab
  activeNoteBodyId: string
  resolvedActiveAisleId: string
  activeSpaceIdRef: MutableRefObject<string>
  editorRef: MutableRefObject<Editor | null>
  pendingContentRef: MutableRefObject<PendingContent | null>
  pendingCreatedEditRef: MutableRefObject<PendingCreatedEdit | null>
  skipRenameBlurRef: MutableRefObject<{ type: EditableEntityType; id: string } | null>
  saveTimerRef: MutableRefObject<number | null>
  lastEditorMarkdownRef: MutableRefObject<string>
  pendingFocusToAisleIdRef: MutableRefObject<string | null>
  pendingCursorRestoreRef: MutableRefObject<PendingCursorRestore | null>
  closeImageToolsRef: MutableRefObject<() => void>
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
  setContextMenu,
  setMenuOpen,
  setEditing,
  workspace,
  activeTab,
  activeNoteBodyId,
  resolvedActiveAisleId,
  activeSpaceIdRef,
  editorRef,
  pendingContentRef,
  pendingCreatedEditRef,
  skipRenameBlurRef,
  saveTimerRef,
  lastEditorMarkdownRef,
  pendingFocusToAisleIdRef,
  pendingCursorRestoreRef,
  closeImageToolsRef,
  activateAisleEditorRef,
  arrangeModeActive,
  exitArrangeMode,
  saveActiveCursorBeforeNavigation,
  updateActiveSpaceData,
  setTrashTabId,
  setTrashSubTabId,
}: UseAppNavigationActionsParams) => {
  const commitRename = (type: EditableEntityType, id: string, nextTitle: string) => {
    const isPendingCreatedRename =
      (type === 'tab' || type === 'subtab') &&
      pendingCreatedEditRef.current?.type === type &&
      pendingCreatedEditRef.current.id === id

    if ((type === 'tab' || type === 'subtab') && !isPendingCreatedRename) {
      saveActiveCursorBeforeNavigation()
    }
    const title = nextTitle.trim()
    setEditing(null)
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
      focusEditorSoon()
      return
    }

    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== data.activeTabId) return tab
        return {
          ...tab,
          subTabs: tab.subTabs.map((sub) => {
            if (sub.id !== id) return sub
            const pending = pendingContentRef.current
            const pendingMatches =
              pending &&
              pending.spaceId === activeSpaceIdRef.current &&
              pending.tabId === data.activeTabId &&
              pending.subTabId === id
            const latest = pendingMatches ? pending.markdown : editorRef.current ? lastEditorMarkdownRef.current : sub.content
            return { ...sub, title, content: latest }
          }),
        }
      }),
    }))

    pendingContentRef.current = null
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    focusEditorSoon()
  }

  const shouldSkipRenameBlur = (type: EditableEntityType, id: string) => {
    const next = skipRenameBlurRef.current
    if (!next || next.type !== type || next.id !== id) return false
    skipRenameBlurRef.current = null
    return true
  }

  const discardPendingCreatedEdit = (type: 'tab' | 'subtab', id: string) => {
    const pending = pendingCreatedEditRef.current
    if (!pending || pending.type !== type || pending.id !== id) {
      setEditing(null)
      return
    }

    pendingCreatedEditRef.current = null
    setEditing(null)

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
    if (type === 'space' || type === 'domain') {
      setEditing(null)
      return
    }
    discardPendingCreatedEdit(type, id)
  }

  const addTab = () => {
    saveActiveCursorBeforeNavigation()
    pendingFocusToAisleIdRef.current = null
    pendingCursorRestoreRef.current = null
    const noteBody = createNoteBody('')
    const newTab = {
      ...createTab('tab'),
      noteBodyId: noteBody.id,
      homeContent: '',
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
      }
    })

    pendingCreatedEditRef.current = { type: 'tab', id: newTab.id, previousTabId: workspace.activeTabId }
    setEditing({ type: 'tab', id: newTab.id })
  }

  const addSubTab = () => {
    saveActiveCursorBeforeNavigation()
    pendingFocusToAisleIdRef.current = null
    pendingCursorRestoreRef.current = null
    const noteBody = createNoteBody('')
    const newSubTab = { ...createSubTab('tab', ''), noteBodyId: noteBody.id }

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
    if (activeTab.id === tabId && activeTab.activeSubTabId === null) return
    saveActiveCursorBeforeNavigation()
    closeImageToolsRef.current()
    updateActiveSpaceData((data) => ({
      ...data,
      activeTabId: tabId,
      tabs: data.tabs.map((tab) => (tab.id === tabId ? { ...tab, activeSubTabId: null } : tab)),
    }))
  }

  const selectSubTab = (subTabId: string) => {
    if (activeTab.activeSubTabId === subTabId) return
    saveActiveCursorBeforeNavigation()
    closeImageToolsRef.current()
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) =>
        tab.id === data.activeTabId ? { ...tab, activeSubTabId: subTabId } : tab,
      ),
    }))
  }

  const selectParentHomeTab = () => {
    if (activeTab.activeSubTabId === null) return
    saveActiveCursorBeforeNavigation()
    closeImageToolsRef.current()
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) =>
        tab.id === data.activeTabId ? { ...tab, activeSubTabId: null } : tab,
      ),
    }))
  }

  const openSpace = (spaceId: string) => {
    saveActiveCursorBeforeNavigation()
    closeImageToolsRef.current()
    if (arrangeModeActive) {
      exitArrangeMode()
    }
    setState((previous) => setActiveSpaceInActiveDomain(previous, spaceId))
    setViewMode('main')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const addSpace = () => {
    saveActiveCursorBeforeNavigation()
    const newSpace = createSpace('New Space')
    setState((previous) => addSpaceToActiveDomain(previous, newSpace))
    setViewMode('spaces')
    setEditing({ type: 'space', id: newSpace.id })
    setMenuOpen(false)
  }

  const duplicateSpaceFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'space') return
    const sourceSpace = state.spaces.find((space) => space.id === contextMenu.spaceId)
    if (!sourceSpace) {
      setContextMenu(null)
      return
    }

    const duplicatedSpace = duplicateSpace(sourceSpace, state.spaces.map((space) => space.name))

    setState((previous) => insertSpaceAfterInActiveDomain(previous, sourceSpace.id, duplicatedSpace))

    setViewMode('spaces')
    setEditing({ type: 'space', id: duplicatedSpace.id })
    setMenuOpen(false)
    setContextMenu(null)
  }

  const openSpacesView = () => {
    saveActiveCursorBeforeNavigation()
    if (arrangeModeActive) {
      exitArrangeMode()
    }
    setViewMode('spaces')
    setMenuOpen(false)
    setContextMenu(null)
  }

  const openDomainsView = () => {
    saveActiveCursorBeforeNavigation()
    if (arrangeModeActive) {
      exitArrangeMode()
    }
    setViewMode('domains')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const openDomain = (domainId: string) => {
    saveActiveCursorBeforeNavigation()
    if (arrangeModeActive) {
      exitArrangeMode()
    }
    setState((previous) => setActiveDomain(previous, domainId))
    setViewMode('spaces')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const addDomainFromPage = () => {
    saveActiveCursorBeforeNavigation()
    const newDomain = createDomain('New Domain')
    setState((previous) => addDomain(previous, newDomain))
    setViewMode('domains')
    setEditing({ type: 'domain', id: newDomain.id })
    setMenuOpen(false)
    setContextMenu(null)
  }

  const toggleTrashView = () => {
    saveActiveCursorBeforeNavigation()
    setMenuOpen(false)
    setContextMenu(null)

    setViewMode((previous) => {
      if (previous === 'trash') return 'main'
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
      return 'trash'
    })
  }

  const openSettings = () => {
    if (viewMode === 'spaces' || viewMode === 'domains') return
    saveActiveCursorBeforeNavigation()
    setMenuOpen(false)
    setContextMenu(null)
    setViewMode('settings')
  }

  return {
    commitRename,
    shouldSkipRenameBlur,
    cancelRename,
    addTab,
    addSubTab,
    selectTab,
    selectSubTab,
    selectParentHomeTab,
    openSpace,
    addSpace,
    duplicateSpaceFromContext,
    openSpacesView,
    openDomainsView,
    openDomain,
    addDomainFromPage,
    toggleTrashView,
    openSettings,
  }
}
