import type { MouseEvent, Dispatch, SetStateAction, MutableRefObject } from 'react'
import type { ExportScope } from '../export/export-data'
import { buildFrontmatterDataFromRows, updateNoteBodyFrontmatter } from '../frontmatter/frontmatter-state'
import {
  buildNoteLocationKey,
  getDefaultNoteReferenceTarget,
  getLocationInfo,
  listNoteLocationsForBody,
} from '../notes/note-locations'
import { removeContextReferencesForNoteLocationsFromAppState } from '../notes/note-references'
import { applyNoteCopyToState } from './note-copy'
import { decoupleNoteLocationsInState } from './note-decouple'
import {
  getNotePreviewCleanupTargetsForDeleteTarget,
  getNotePreviewCleanupTargetsForTrash,
} from './delete-preview-cleanup'
import { removeDomain, removeSpaceFromActiveDomain } from '../state/domains'
import { collectAppNavigationEntityIds, createReservedIdAllocator } from '../state/navigation-ids'
import { createId, createTab } from '../state/workspace'
import { TRASH_HOME_ID } from '../trash/trash-model'
import { restoreTrashTarget, type TrashRestoreTarget } from '../trash/trash-restore'
import type {
  AppState,
  ContextMenuState,
  DeleteTarget,
  ModalState,
  NoteCopyMode,
  NoteLocation,
  ToastTone,
  TrashParentBucket,
  ViewMode,
  WorkspaceData,
} from '../types/app'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type UseAppOverlayActionsParams = {
  state: AppState
  stateRef: MutableRefObject<AppState>
  setState: Dispatch<SetStateAction<AppState>>
  viewMode: ViewMode
  contextMenu: ContextMenuState | null
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>
  modal: ModalState | null
  setModal: Dispatch<SetStateAction<ModalState | null>>
  setMenuOpen: Dispatch<SetStateAction<boolean>>
  setEditing: Dispatch<SetStateAction<{ type: EditableEntityType; id: string } | null>>
  activeSpaceId: string
  activeNoteLocation: NoteLocation
  updateActiveSpaceData: (updater: (data: WorkspaceData) => WorkspaceData) => void
  saveActiveCursorBeforeNavigation: () => void
  setTrashTabId: Dispatch<SetStateAction<string>>
  setTrashSubTabId: Dispatch<SetStateAction<string | null>>
  insertNoteReference: (modalState: Extract<ModalState, { type: 'insert-note-reference' }>) => boolean
  exportData: (scope: ExportScope, spaceId?: string) => void | Promise<unknown>
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
}

export const useAppOverlayActions = ({
  state,
  stateRef,
  setState,
  viewMode,
  contextMenu,
  setContextMenu,
  modal,
  setModal,
  setMenuOpen,
  setEditing,
  activeSpaceId,
  activeNoteLocation,
  updateActiveSpaceData,
  saveActiveCursorBeforeNavigation,
  setTrashTabId,
  setTrashSubTabId,
  insertNoteReference,
  exportData,
  pushToast,
}: UseAppOverlayActionsParams) => {
  const activeSpace = state.spaces.find((space) => space.id === activeSpaceId) ?? state.spaces[0]

  const getActiveSpaceSnapshot = () =>
    stateRef.current.spaces.find((space) => space.id === activeSpaceId) ?? stateRef.current.spaces[0] ?? activeSpace

  const removeNotePreviewsForLocations = (locations: NoteLocation[]) => {
    if (locations.length === 0) return
    setState((previous) => {
      const nextState = removeContextReferencesForNoteLocationsFromAppState(previous, locations)
      if (nextState !== previous) {
        stateRef.current = nextState
      }
      return nextState
    })
  }

  const openContextMenuForTab = (event: MouseEvent<HTMLButtonElement>, tabId: string) => {
    if (viewMode !== 'main') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'tab', tabId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForSubTab = (event: MouseEvent<HTMLButtonElement>, tabId: string, subTabId: string) => {
    if (viewMode !== 'main') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'subtab', tabId, subTabId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForHomeTab = (event: MouseEvent<HTMLButtonElement>, tabId: string) => {
    if (viewMode !== 'main') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'home-tab', tabId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForTrashTab = (event: MouseEvent<HTMLButtonElement>, trashParent: TrashParentBucket) => {
    if (viewMode !== 'trash') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({
      type: 'trash-tab',
      source: trashParent.source,
      deletedTabEntryId: trashParent.deletedTabEntryId,
      parentTabId: trashParent.parentTabId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openContextMenuForTrashSubTab = (
    event: MouseEvent<HTMLButtonElement>,
    trashParent: TrashParentBucket,
    currentSubTabId: string,
  ) => {
    if (viewMode !== 'trash') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({
      type: 'trash-subtab',
      source: trashParent.source,
      deletedTabEntryId: trashParent.deletedTabEntryId,
      parentTabId: trashParent.parentTabId,
      subTabId: currentSubTabId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openContextMenuForSpace = (event: MouseEvent<HTMLButtonElement>, spaceId: string) => {
    if (viewMode !== 'spaces') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'space', spaceId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForDomain = (event: MouseEvent<HTMLButtonElement>, domainId: string) => {
    if (viewMode !== 'domains') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'domain', domainId, x: event.clientX, y: event.clientY })
  }

  const buildDeleteTargetFromContextMenu = (): DeleteTarget | null => {
    if (!contextMenu) return null
    return contextMenu.type === 'tab'
      ? { type: 'tab', tabId: contextMenu.tabId }
      : contextMenu.type === 'subtab'
        ? { type: 'subtab', tabId: contextMenu.tabId, subTabId: contextMenu.subTabId }
        : contextMenu.type === 'image' ||
            contextMenu.type === 'editor' ||
            contextMenu.type === 'internal-note-link' ||
            contextMenu.type === 'home-tab'
          ? null
        : contextMenu.type === 'trash-tab'
          ? {
              type: 'trash-tab',
              source: contextMenu.source,
              deletedTabEntryId: contextMenu.deletedTabEntryId,
              parentTabId: contextMenu.parentTabId,
            }
          : contextMenu.type === 'trash-subtab'
            ? {
                type: 'trash-subtab',
                source: contextMenu.source,
                deletedTabEntryId: contextMenu.deletedTabEntryId,
                parentTabId: contextMenu.parentTabId,
                subTabId: contextMenu.subTabId,
              }
            : contextMenu.type === 'space'
              ? { type: 'space', spaceId: contextMenu.spaceId }
              : { type: 'domain', domainId: contextMenu.domainId }
  }

  const openDeleteModalFromContext = (permanent: boolean) => {
    const target = buildDeleteTargetFromContextMenu()
    if (!target) return
    setModal({ type: 'delete-target', target, permanent })
    setContextMenu(null)
  }

  const deleteSpace = (spaceId: string) => {
    setState((previous) => removeSpaceFromActiveDomain(previous, spaceId))
  }

  const deleteDomain = (domainId: string) => {
    setState((previous) => removeDomain(previous, domainId))
  }

  const deleteTarget = (target: DeleteTarget, permanent: boolean) => {
    saveActiveCursorBeforeNavigation()
    if (target.type === 'domain') {
      deleteDomain(target.domainId)
      return
    }

    let nextToastMessage: string | null = null
    const cleanupSpace = getActiveSpaceSnapshot()
    const previewCleanupTargets = getNotePreviewCleanupTargetsForDeleteTarget(
      cleanupSpace.data,
      stateRef.current.activeDomainId,
      cleanupSpace.id,
      target,
    )

    if (target.type === 'space') {
      deleteSpace(target.spaceId)
      return
    }

    const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(stateRef.current))
    updateActiveSpaceData((data) => {
      if (target.type === 'trash-tab') {
        if (target.source === 'subtabs-only') {
          return {
            ...data,
            deletedSubTabs: data.deletedSubTabs.filter((entry) => entry.parentTabId !== target.parentTabId),
          }
        }

        return {
          ...data,
          deletedTabs: data.deletedTabs.filter((entry) => entry.id !== target.deletedTabEntryId),
        }
      }

      if (target.type === 'trash-subtab') {
        if (target.source === 'deleted-tab' && target.deletedTabEntryId) {
          return {
            ...data,
            deletedTabs: data.deletedTabs.map((entry) =>
              entry.id !== target.deletedTabEntryId
                ? entry
                : {
                    ...entry,
                    tab: {
                      ...entry.tab,
                      subTabs: entry.tab.subTabs.filter((sub) => sub.id !== target.subTabId),
                    },
                  },
            ),
          }
        }

        return {
          ...data,
          deletedSubTabs: data.deletedSubTabs.filter((entry) => entry.id !== target.subTabId),
        }
      }

      if (target.type === 'tab') {
        const tabToDelete = data.tabs.find((tab) => tab.id === target.tabId)
        if (!tabToDelete) return data
        if (!permanent) {
          nextToastMessage = 'tab has been moved to trash.'
        }

        const remaining = data.tabs.filter((tab) => tab.id !== target.tabId)
        const deletedTabs = permanent
          ? data.deletedTabs
          : [
              ...data.deletedTabs,
              {
                id: createEntityId(),
                tab: tabToDelete,
                deletedAt: Date.now(),
              },
            ]

        if (remaining.length === 0) {
          const fallback = createTab('tab', createEntityId)
          return {
            ...data,
            activeTabId: fallback.id,
            tabs: [fallback],
            deletedTabs,
          }
        }

        const nextActiveId = data.activeTabId === target.tabId ? remaining[0].id : data.activeTabId
        return {
          ...data,
          activeTabId: nextActiveId,
          tabs: remaining.map((tab) => (tab.id === nextActiveId ? { ...tab, activeSubTabId: null } : tab)),
          deletedTabs,
        }
      }

      const parent = data.tabs.find((tab) => tab.id === target.tabId)
      if (!parent) return data
      const subToDelete = parent.subTabs.find((sub) => sub.id === target.subTabId)
      if (!subToDelete) return data
      if (!permanent) {
        nextToastMessage = 'tab has been moved to trash.'
      }

      return {
        ...data,
        tabs: data.tabs.map((tab) =>
          tab.id === target.tabId
            ? {
                ...tab,
                activeSubTabId: tab.activeSubTabId === target.subTabId ? null : tab.activeSubTabId,
                subTabs: tab.subTabs.filter((sub) => sub.id !== target.subTabId),
              }
            : tab,
        ),
        deletedSubTabs: permanent
          ? data.deletedSubTabs
          : [
              ...data.deletedSubTabs,
              {
                id: createEntityId(),
                parentTabId: parent.id,
                parentTabTitle: parent.title,
                subTab: subToDelete,
                deletedAt: Date.now(),
              },
            ],
      }
    })
    if (target.type === 'trash-tab') {
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
    }
    if (target.type === 'trash-subtab') {
      setTrashSubTabId(null)
    }
    if (nextToastMessage) {
      pushToast(nextToastMessage, 'success')
    }
    removeNotePreviewsForLocations(previewCleanupTargets)
  }

  const deleteFromContext = () => {
    const target = buildDeleteTargetFromContextMenu()
    if (!target) return
    setContextMenu(null)
    deleteTarget(target, false)
  }

  const restoreFromContext = () => {
    const target = buildDeleteTargetFromContextMenu()
    if (!target || (target.type !== 'trash-tab' && target.type !== 'trash-subtab')) return
    setContextMenu(null)
    updateActiveSpaceData((data) =>
      restoreTrashTarget(data, target as TrashRestoreTarget, {
        createParentNoteBodyId: createId,
      }),
    )
    if (target.type === 'trash-tab') {
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
    } else {
      setTrashSubTabId(null)
    }
    pushToast('item restored from trash.', 'success')
  }

  const getLastNoteCopyMode = (): NoteCopyMode => stateRef.current.ui.lastNoteCopyMode ?? 'independent'

  const setLastNoteCopyMode = (mode: NoteCopyMode) => {
    const nextState = {
      ...stateRef.current,
      ui: {
        ...stateRef.current.ui,
        lastNoteCopyMode: mode,
      },
    }
    stateRef.current = nextState
    setState(nextState)
  }

  const getDecoupledItemsKeepData = () => stateRef.current.ui.decoupledItemsKeepData ?? true

  const setDecoupledItemsKeepData = (keepData: boolean) => {
    const nextState = {
      ...stateRef.current,
      ui: {
        ...stateRef.current.ui,
        decoupledItemsKeepData: keepData,
      },
    }
    stateRef.current = nextState
    setState(nextState)
  }

  const openCopyModalForLocation = (source: NoteLocation, mode: NoteCopyMode = getLastNoteCopyMode()) => {
    saveActiveCursorBeforeNavigation()
    const target = getDefaultNoteReferenceTarget(state, source)
    setModal({
      type: 'copy-note',
      mode,
      destinationMode: 'replace',
      source,
      target,
    })
  }

  const openDeduplicateModalForLocation = (source: NoteLocation) => {
    const noteBodyId = getLocationInfo(stateRef.current, source).noteBodyId
    if (!noteBodyId) return
    const locations = listNoteLocationsForBody(stateRef.current, noteBodyId)
    setModal({
      type: 'deduplicate-note',
      noteBodyId,
      keepLocationKeys: locations.map((location) => buildNoteLocationKey(location)),
      keepData: getDecoupledItemsKeepData(),
    })
  }

  const openCopyModalFromContext = () => {
    if (!contextMenu || (contextMenu.type !== 'tab' && contextMenu.type !== 'subtab' && contextMenu.type !== 'home-tab')) return
    openCopyModalForLocation({
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      tabId: contextMenu.tabId,
      subTabId: contextMenu.type === 'subtab' ? contextMenu.subTabId : null,
    })
    setContextMenu(null)
  }

  const openCopyModalForActiveNote = () => {
    if (viewMode !== 'main') return
    openCopyModalForLocation(activeNoteLocation)
  }

  const openDeduplicateModalFromContext = () => {
    if (!contextMenu || (contextMenu.type !== 'tab' && contextMenu.type !== 'subtab')) return
    const source: NoteLocation = {
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      tabId: contextMenu.tabId,
      subTabId: contextMenu.type === 'subtab' ? contextMenu.subTabId : null,
    }
    openDeduplicateModalForLocation(source)
    setContextMenu(null)
  }

  const openDeduplicateModalForActiveNote = () => {
    if (viewMode !== 'main') return
    saveActiveCursorBeforeNavigation()
    openDeduplicateModalForLocation(activeNoteLocation)
  }

  const getCurrentDuplicateCount = () => {
    const location = contextMenu && (contextMenu.type === 'tab' || contextMenu.type === 'subtab')
      ? {
          domainId: state.activeDomainId,
          spaceId: activeSpace.id,
          tabId: contextMenu.tabId,
          subTabId: contextMenu.type === 'subtab' ? contextMenu.subTabId : null,
        }
      : null
    if (!location) return 0
    const noteBodyId = getLocationInfo(state, location).noteBodyId
    return noteBodyId ? listNoteLocationsForBody(state, noteBodyId).length : 0
  }

  const beginRenameSpaceFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'space') return
    setEditing({ type: 'space', id: contextMenu.spaceId })
    setContextMenu(null)
  }

  const beginRenameDomainFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'domain') return
    setEditing({ type: 'domain', id: contextMenu.domainId })
    setContextMenu(null)
  }

  const restoreAllTrash = () => {
    updateActiveSpaceData((data) => {
      let tabs = [...data.tabs]
      for (const entry of data.deletedTabs) {
        if (tabs.some((tab) => tab.id === entry.tab.id)) continue
        tabs = [...tabs, entry.tab]
      }

      for (const entry of data.deletedSubTabs) {
        const parentIndex = tabs.findIndex((tab) => tab.id === entry.parentTabId)
        if (parentIndex >= 0) {
          const parent = tabs[parentIndex]
          if (!parent.subTabs.some((sub) => sub.id === entry.subTab.id)) {
            tabs[parentIndex] = { ...parent, subTabs: [...parent.subTabs, entry.subTab] }
          }
        } else {
          tabs = [
            ...tabs,
            {
              id: entry.parentTabId,
              title: entry.parentTabTitle,
              noteBodyId: createId(),
              homeContent: '',
              activeSubTabId: null,
              subTabs: [entry.subTab],
            },
          ]
        }
      }

      return {
        ...data,
        activeTabId: tabs.some((tab) => tab.id === data.activeTabId) ? data.activeTabId : tabs[0].id,
        tabs,
        deletedTabs: [],
        deletedSubTabs: [],
      }
    })

    setTrashTabId(TRASH_HOME_ID)
    setTrashSubTabId(null)
  }

  const deleteAllTrash = () => {
    saveActiveCursorBeforeNavigation()
    const cleanupSpace = getActiveSpaceSnapshot()
    const previewCleanupTargets = getNotePreviewCleanupTargetsForTrash(
      cleanupSpace.data,
      stateRef.current.activeDomainId,
      cleanupSpace.id,
    )
    updateActiveSpaceData((data) => ({ ...data, deletedTabs: [], deletedSubTabs: [] }))
    removeNotePreviewsForLocations(previewCleanupTargets)
    setTrashTabId(TRASH_HOME_ID)
    setTrashSubTabId(null)
  }

  const confirmModal = () => {
    if (!modal) return

    if (modal.type === 'export-space') {
      const spaceId = modal.spaceId
      setModal(null)
      void exportData('space', spaceId)
      return
    }

    if (modal.type === 'copy-note') {
      const targetInfo = getLocationInfo(stateRef.current, modal.target)
      const targetBody = targetInfo.noteBodyId
        ? stateRef.current.noteBodies.find((candidate) => candidate.id === targetInfo.noteBodyId)
        : null
      if (!targetInfo.noteBodyId || (modal.mode === 'independent' && !targetBody)) {
        setModal(null)
        pushToast('choose an existing note.', 'warning')
        return
      }

      const result = applyNoteCopyToState(
        stateRef.current,
        modal.source,
        modal.target,
        modal.mode,
        modal.destinationMode,
      )
      if (result.status === 'self-copy') {
        setModal(null)
        pushToast('choose a different note to copy.', 'warning')
        return
      }
      if (result.status === 'missing-target') {
        setModal(null)
        pushToast('choose an existing note.', 'warning')
        return
      }
      if (result.state !== stateRef.current) {
        stateRef.current = result.state
        setState(result.state)
      }
      setModal(null)
      pushToast(
        result.status === 'already-linked'
          ? 'notes already linked.'
          : modal.mode === 'linked'
            ? 'linked copy created.'
            : 'note copied.',
        'success',
      )
      return
    }

    if (modal.type === 'deduplicate-note') {
      setDecoupledItemsKeepData(modal.keepData)
      const keepKeys = new Set(modal.keepLocationKeys)
      if (keepKeys.size === 0) {
        pushToast('select at least one note to retain the information', 'error')
        return
      }
      const appliedState = decoupleNoteLocationsInState(stateRef.current, modal.noteBodyId, keepKeys, modal.keepData)
      stateRef.current = appliedState
      setState(appliedState)
      setModal(null)
      pushToast('notes de-coupled.', 'success')
      return
    }

    if (modal.type === 'insert-note-reference') {
      if (insertNoteReference(modal)) {
        setModal(null)
      }
      return
    }

    if (modal.type === 'frontmatter-note') {
      const result = buildFrontmatterDataFromRows(stateRef.current, modal.noteBodyId, modal.location, modal.rows, {
        selectedTemplateId: modal.selectedTemplateId,
        templateDerived: modal.templateDerived,
      })
      if (!result.ok) {
        pushToast(result.message, 'error')
        return
      }
      const nextState = updateNoteBodyFrontmatter(
        stateRef.current,
        modal.noteBodyId,
        result.frontmatter,
        {
          templateId: modal.selectedTemplateId || null,
          templateDerived: modal.templateDerived,
          templateFieldOrigins: result.templateFieldOrigins,
          templateRemovedFieldIds: result.templateRemovedFieldIds,
          computedFields: result.computedFields,
        },
      )
      stateRef.current = nextState
      setState(nextState)
      setModal(null)
      result.warnings.forEach((warning) => pushToast(warning, 'warning'))
      pushToast(nextState.noteBodies.find((body) => body.id === modal.noteBodyId)?.frontmatter ? 'frontmatter saved.' : 'frontmatter removed.', 'success')
      return
    }

    if (modal.type === 'delete-target') {
      deleteTarget(modal.target, modal.permanent)
    }

    if (modal.type === 'trash-restore-all') restoreAllTrash()
    if (modal.type === 'trash-delete-all') deleteAllTrash()

    setModal(null)
  }

  return {
    openContextMenuForTab,
    openContextMenuForSubTab,
    openContextMenuForHomeTab,
    openContextMenuForTrashTab,
    openContextMenuForTrashSubTab,
    openContextMenuForSpace,
    openContextMenuForDomain,
    openDeleteModalFromContext,
    deleteFromContext,
    restoreFromContext,
    openCopyModalFromContext,
    openCopyModalForActiveNote,
    openDeduplicateModalFromContext,
    openDeduplicateModalForActiveNote,
    setDecoupledItemsKeepData,
    setLastNoteCopyMode,
    getCurrentDuplicateCount,
    beginRenameSpaceFromContext,
    beginRenameDomainFromContext,
    deleteTarget,
    restoreAllTrash,
    deleteAllTrash,
    confirmModal,
  }
}
