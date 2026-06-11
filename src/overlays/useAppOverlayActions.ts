import type { MouseEvent, Dispatch, SetStateAction, MutableRefObject } from 'react'
import { buildFrontmatterDataFromRows, updateAisleFrontmatter } from '../frontmatter/frontmatter-state'
import {
  buildNoteLocationKey,
  getDefaultNoteReferenceTarget,
  getLocationInfo,
  listNoteLocationsForBody,
} from '../notes/note-locations'
import { removeNoteReferencesForDeletedLocations } from '../notes/note-reference-commands'
import { getNoteCopyCreatedToast } from '../notes/copy-reference-labels'
import { applyNoteCopyToState } from './note-copy'
import { decoupleNoteLocationsInState } from './note-decouple'
import {
  getNoteReferenceCleanupTargetsForDeleteTarget,
  getNoteReferenceCleanupTargetsForTrash,
} from './note-reference-cleanup'
import { projectActiveDomainState } from '../state/domains'
import { collectAppNavigationEntityIds, createReservedIdAllocator } from '../state/navigation-ids'
import { createId } from '../state/workspace'
import {
  permanentlyDeleteDeletedDomainTrashItem,
  deleteAllDomainAndSpaceTrash,
  moveDomainToTrash,
  moveSpaceToTrash,
  permanentlyDeleteLiveDomain,
  permanentlyDeleteLiveSpace,
  permanentlyDeleteTrashDomain,
  permanentlyDeleteTrashSpace,
  restoreDeletedDomainTrashItem,
  restoreAllTrashInAppState,
  restoreTrashDomain,
  restoreTrashSpace,
} from '../trash/domain-space-trash'
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
type NavigationContextMenuOptions = {
  force?: boolean
}

export function formatMovedToTrashToast(kind: 'domain' | 'space' | 'parent tab' | 'tab', name: string) {
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} "${name}" has been moved to trash.`
}

export const LAST_DOMAIN_TOAST =
  'At least one domain must remain. To delete this notebook, switch to another notebook first, then delete this notebook folder from your file system.'
export const LAST_SPACE_TOAST = 'At least one space must remain.'
export const LAST_PARENT_TAB_TOAST = 'At least one parent tab must remain.'

type UseAppOverlayActionsParams = {
  state: AppState
  stateRef: MutableRefObject<AppState>
  setState: Dispatch<SetStateAction<AppState>>
  viewMode: ViewMode
  navigationContextMenusDisabled?: boolean
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
  setTrashDomainId?: Dispatch<SetStateAction<string>>
  setTrashSpaceId?: Dispatch<SetStateAction<string>>
  insertNoteReference: (modalState: Extract<ModalState, { type: 'insert-note-reference' }>) => boolean
  exportSpace: (spaceId?: string) => void | Promise<unknown>
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
}

export const useAppOverlayActions = ({
  state,
  stateRef,
  setState,
  viewMode,
  navigationContextMenusDisabled = false,
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
  setTrashDomainId,
  setTrashSpaceId,
  insertNoteReference,
  exportSpace,
  pushToast,
}: UseAppOverlayActionsParams) => {
  const activeSpace = state.spaces.find((space) => space.id === activeSpaceId) ?? state.spaces[0]

  const getActiveSpaceSnapshot = () =>
    stateRef.current.spaces.find((space) => space.id === activeSpaceId) ?? stateRef.current.spaces[0] ?? activeSpace

  const suppressNavigationContextMenuIfDisabled = (event: MouseEvent<HTMLButtonElement>) => {
    if (!navigationContextMenusDisabled) return false
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu(null)
    return true
  }

  const removeNoteReferencesForLocations = (locations: NoteLocation[], resolverState = stateRef.current) => {
    if (locations.length === 0) return
    setState((previous) => {
      const nextState = removeNoteReferencesForDeletedLocations(previous, locations, resolverState)
      if (nextState !== previous) {
        stateRef.current = nextState
      }
      return nextState
    })
  }

  const openContextMenuForTab = (
    event: MouseEvent<HTMLButtonElement>,
    tabId: string,
    options: NavigationContextMenuOptions = {},
  ) => {
    if (viewMode !== 'main') return
    if (!options.force && suppressNavigationContextMenuIfDisabled(event)) return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'tab', tabId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForSubTab = (
    event: MouseEvent<HTMLButtonElement>,
    tabId: string,
    subTabId: string,
    options: NavigationContextMenuOptions = {},
  ) => {
    if (viewMode !== 'main') return
    if (!options.force && suppressNavigationContextMenuIfDisabled(event)) return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'subtab', tabId, subTabId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForHomeTab = (
    event: MouseEvent<HTMLButtonElement>,
    tabId: string,
    options: NavigationContextMenuOptions = {},
  ) => {
    if (viewMode !== 'main') return
    if (!options.force && suppressNavigationContextMenuIfDisabled(event)) return
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
      deletedDomainEntryId: trashParent.deletedDomainEntryId,
      deletedSpaceEntryId: trashParent.deletedSpaceEntryId,
      domainId: trashParent.domainId,
      spaceId: trashParent.spaceId,
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
      deletedDomainEntryId: trashParent.deletedDomainEntryId,
      deletedSpaceEntryId: trashParent.deletedSpaceEntryId,
      domainId: trashParent.domainId,
      spaceId: trashParent.spaceId,
      parentTabId: trashParent.parentTabId,
      subTabId: currentSubTabId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openContextMenuForTrashDomain = (
    event: MouseEvent<HTMLButtonElement>,
    deletedDomainEntryId: string,
    domainId: string,
  ) => {
    if (viewMode !== 'trash') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({
      type: 'trash-domain',
      deletedDomainEntryId,
      domainId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openContextMenuForTrashSpace = (
    event: MouseEvent<HTMLButtonElement>,
    payload: {
      source: 'deleted-space' | 'deleted-domain-space'
      deletedSpaceEntryId?: string | null
      deletedDomainEntryId?: string
      domainId: string
      spaceId: string
    },
  ) => {
    if (viewMode !== 'trash') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({
      type: 'trash-space',
      ...payload,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openContextMenuForSpace = (
    event: MouseEvent<HTMLButtonElement>,
    spaceId: string,
    options: NavigationContextMenuOptions = {},
  ) => {
    if (viewMode !== 'main') return
    if (!options.force && suppressNavigationContextMenuIfDisabled(event)) return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'space', spaceId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForDomain = (
    event: MouseEvent<HTMLButtonElement>,
    domainId: string,
    options: NavigationContextMenuOptions = {},
  ) => {
    if (viewMode !== 'main') return
    if (!options.force && suppressNavigationContextMenuIfDisabled(event)) return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'domain', domainId, x: event.clientX, y: event.clientY })
  }

  const buildDeleteTargetFromContextMenu = (): DeleteTarget | null => {
    if (!contextMenu) return null
    switch (contextMenu.type) {
      case 'tab':
        return { type: 'tab', tabId: contextMenu.tabId }
      case 'subtab':
        return { type: 'subtab', tabId: contextMenu.tabId, subTabId: contextMenu.subTabId }
      case 'trash-tab':
        return {
          type: 'trash-tab',
          source: contextMenu.source,
          deletedTabEntryId: contextMenu.deletedTabEntryId,
          deletedDomainEntryId: contextMenu.deletedDomainEntryId,
          deletedSpaceEntryId: contextMenu.deletedSpaceEntryId,
          domainId: contextMenu.domainId,
          spaceId: contextMenu.spaceId,
          parentTabId: contextMenu.parentTabId,
        }
      case 'trash-subtab':
        return {
          type: 'trash-subtab',
          source: contextMenu.source,
          deletedTabEntryId: contextMenu.deletedTabEntryId,
          deletedDomainEntryId: contextMenu.deletedDomainEntryId,
          deletedSpaceEntryId: contextMenu.deletedSpaceEntryId,
          domainId: contextMenu.domainId,
          spaceId: contextMenu.spaceId,
          parentTabId: contextMenu.parentTabId,
          subTabId: contextMenu.subTabId,
        }
      case 'trash-domain':
        return {
          type: 'trash-domain',
          deletedDomainEntryId: contextMenu.deletedDomainEntryId,
          domainId: contextMenu.domainId,
        }
      case 'trash-space':
        return {
          type: 'trash-space',
          source: contextMenu.source,
          deletedSpaceEntryId: contextMenu.deletedSpaceEntryId,
          deletedDomainEntryId: contextMenu.deletedDomainEntryId,
          domainId: contextMenu.domainId,
          spaceId: contextMenu.spaceId,
        }
      case 'space':
        return { type: 'space', spaceId: contextMenu.spaceId }
      case 'domain':
        return { type: 'domain', domainId: contextMenu.domainId }
      default:
        return null
    }
  }

  const openDeleteModalFromContext = (permanent: boolean) => {
    const target = buildDeleteTargetFromContextMenu()
    if (!target) return
    setModal({ type: 'delete-target', target, permanent })
    setContextMenu(null)
  }

  const deleteSpace = (spaceId: string, permanent: boolean) => {
    setState((previous) => {
      const projected = projectActiveDomainState(previous)
      const spaceName = projected.spaces.find((space) => space.id === spaceId)?.name ?? 'space'
      const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(previous))
      const result = permanent
        ? permanentlyDeleteLiveSpace(previous, previous.activeDomainId, spaceId)
        : moveSpaceToTrash(previous, previous.activeDomainId, spaceId, createEntityId)
      if (result.reason === 'last-space') pushToast(LAST_SPACE_TOAST, 'warning')
      if (result.changed && !permanent) pushToast(formatMovedToTrashToast('space', spaceName), 'success')
      return result.state
    })
  }

  const deleteDomain = (domainId: string, permanent: boolean) => {
    setState((previous) => {
      const projected = projectActiveDomainState(previous)
      const domainName = projected.domains.find((domain) => domain.id === domainId)?.name ?? 'domain'
      const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(previous))
      const result = permanent
        ? permanentlyDeleteLiveDomain(previous, domainId)
        : moveDomainToTrash(previous, domainId, createEntityId)
      if (result.reason === 'last-domain') pushToast(LAST_DOMAIN_TOAST, 'warning')
      if (result.changed && !permanent) pushToast(formatMovedToTrashToast('domain', domainName), 'success')
      return result.state
    })
  }

  const deleteTarget = (target: DeleteTarget, permanent: boolean) => {
    saveActiveCursorBeforeNavigation()
    if (target.type === 'domain') {
      deleteDomain(target.domainId, permanent)
      return
    }

    if (target.type === 'trash-domain') {
      setState((previous) => permanentlyDeleteTrashDomain(previous, target.deletedDomainEntryId))
      setTrashDomainId?.('')
      setTrashSpaceId?.('')
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
      return
    }

    if (target.type === 'trash-space') {
      setState((previous) => permanentlyDeleteTrashSpace(previous, target))
      setTrashSpaceId?.('')
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
      return
    }

    let nextToastMessage: string | null = null
    const cleanupResolverState = stateRef.current
    const cleanupSpace = getActiveSpaceSnapshot()
    const shouldRemoveReferences =
      permanent || cleanupResolverState.ui.removeNoteReferencesOnTrash !== false
    const referenceCleanupTargets = shouldRemoveReferences
      ? getNoteReferenceCleanupTargetsForDeleteTarget(
          cleanupSpace.data,
          cleanupResolverState.activeDomainId,
          cleanupSpace.id,
          target,
        )
      : []

    if (target.type === 'space') {
      deleteSpace(target.spaceId, permanent)
      return
    }

    if (
      (target.type === 'trash-tab' || target.type === 'trash-subtab') &&
      target.source === 'deleted-domain-tab'
    ) {
      setState((previous) => permanentlyDeleteDeletedDomainTrashItem(previous, target))
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
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
        const remaining = data.tabs.filter((tab) => tab.id !== target.tabId)
        if (remaining.length === 0) {
          nextToastMessage = LAST_PARENT_TAB_TOAST
          return data
        }
        if (!permanent) {
          nextToastMessage = formatMovedToTrashToast('parent tab', tabToDelete.title)
        }

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
        nextToastMessage = formatMovedToTrashToast('tab', subToDelete.title)
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
      pushToast(nextToastMessage, nextToastMessage === LAST_PARENT_TAB_TOAST ? 'warning' : 'success')
    }
    removeNoteReferencesForLocations(referenceCleanupTargets, cleanupResolverState)
  }

  const isTrashTarget = (
    target: DeleteTarget,
  ): target is Extract<DeleteTarget, { type: 'trash-domain' | 'trash-space' | 'trash-tab' | 'trash-subtab' }> =>
    target.type === 'trash-domain' ||
    target.type === 'trash-space' ||
    target.type === 'trash-tab' ||
    target.type === 'trash-subtab'

  const deleteTrashTargetsForReal = (targets: readonly DeleteTarget[]) => {
    const trashTargets = targets.filter(isTrashTarget)
    if (trashTargets.length === 0) return
    for (const target of trashTargets) {
      deleteTarget(target, true)
    }
    pushToast(
      trashTargets.length === 1 ? 'Item deleted for real.' : `${trashTargets.length} items deleted for real.`,
      'success',
    )
  }

  const deleteFromContext = () => {
    const target = buildDeleteTargetFromContextMenu()
    if (!target) return
    setContextMenu(null)
    deleteTarget(target, false)
  }

  const restoreTrashTargetFromTarget = (target: DeleteTarget, options: { silent?: boolean } = {}) => {
    if (
      !target ||
      (target.type !== 'trash-tab' &&
        target.type !== 'trash-subtab' &&
        target.type !== 'trash-domain' &&
        target.type !== 'trash-space')
    ) {
      return false
    }

    if (target.type === 'trash-domain') {
      const result = restoreTrashDomain(stateRef.current, target.deletedDomainEntryId)
      stateRef.current = result.state
      setState(result.state)
      if (!result.changed) {
        if (!options.silent) pushToast('That domain is no longer in trash.', 'warning')
        return false
      }
      setTrashDomainId?.('')
      setTrashSpaceId?.('')
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
      if (!options.silent) pushToast('Domain restored from trash.', 'success')
      return true
    }

    if (target.type === 'trash-space') {
      const result = restoreTrashSpace(stateRef.current, target)
      stateRef.current = result.state
      setState(result.state)
      if (result.reason === 'missing-domain') {
        if (!options.silent) pushToast('Restore the domain first.', 'warning')
        return false
      }
      if (result.changed) {
        setTrashDomainId?.('')
        setTrashSpaceId?.('')
        setTrashTabId(TRASH_HOME_ID)
        setTrashSubTabId(null)
        if (!options.silent) pushToast('Space restored from trash.', 'success')
        return true
      }
      if (!options.silent) pushToast('That space is no longer in trash.', 'warning')
      return false
    }

    if (
      (target.type === 'trash-tab' || target.type === 'trash-subtab') &&
      target.source === 'deleted-domain-tab'
    ) {
      const result = restoreDeletedDomainTrashItem(stateRef.current, target)
      stateRef.current = result.state
      setState(result.state)
      if (result.changed) {
        setTrashDomainId?.('')
        setTrashSpaceId?.('')
        setTrashTabId(TRASH_HOME_ID)
        setTrashSubTabId(null)
        if (!options.silent) pushToast('Item restored from trash.', 'success')
        return true
      }
      if (!options.silent) pushToast('That item is no longer in trash.', 'warning')
      return false
    }

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
    if (!options.silent) pushToast('Item restored from trash.', 'success')
    return true
  }

  const restoreTrashTargets = (targets: readonly DeleteTarget[]) => {
    const trashTargets = targets.filter(isTrashTarget)
    if (trashTargets.length === 0) return
    let restoredCount = 0
    for (const target of trashTargets) {
      if (restoreTrashTargetFromTarget(target, { silent: true })) {
        restoredCount += 1
      }
    }
    if (restoredCount <= 0) {
      pushToast('Selected trash items are no longer available.', 'warning')
      return
    }
    pushToast(
      restoredCount === 1 ? 'Item restored from trash.' : `${restoredCount} items restored from trash.`,
      'success',
    )
  }

  const restoreFromContext = () => {
    const target = buildDeleteTargetFromContextMenu()
    if (!target) return
    setContextMenu(null)
    restoreTrashTargetFromTarget(target)
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
      location: source,
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
    setState((previous) => restoreAllTrashInAppState(previous))
    setState((previous) => {
      const restoredSpaces = previous.domains.map((domain) => ({
        ...domain,
        spaces: domain.spaces.map((space) => {
          let tabs = [...space.data.tabs]
          for (const entry of space.data.deletedTabs) {
            if (tabs.some((tab) => tab.id === entry.tab.id)) continue
            tabs = [...tabs, entry.tab]
          }

          for (const entry of space.data.deletedSubTabs) {
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
                  activeSubTabId: null,
                  subTabs: [entry.subTab],
                },
              ]
            }
          }

          return {
            ...space,
            data: {
              ...space.data,
              activeTabId: tabs.some((tab) => tab.id === space.data.activeTabId)
                ? space.data.activeTabId
                : tabs[0].id,
              tabs,
              deletedTabs: [],
              deletedSubTabs: [],
            },
          }
        }),
      }))
      return projectActiveDomainState({
        ...previous,
        domains: restoredSpaces,
        spaces:
          restoredSpaces.find((domain) => domain.id === previous.activeDomainId)?.spaces ?? previous.spaces,
      })
    })
    setTrashDomainId?.('')
    setTrashSpaceId?.('')
    setTrashTabId(TRASH_HOME_ID)
    setTrashSubTabId(null)
  }

  const deleteAllTrash = () => {
    saveActiveCursorBeforeNavigation()
    const cleanupResolverState = stateRef.current
    const cleanupSpace = getActiveSpaceSnapshot()
    const referenceCleanupTargets = getNoteReferenceCleanupTargetsForTrash(
      cleanupSpace.data,
      cleanupResolverState.activeDomainId,
      cleanupSpace.id,
    )
    setState((previous) => {
      const noDomainTrash = deleteAllDomainAndSpaceTrash(previous)
      return projectActiveDomainState({
        ...noDomainTrash,
        domains: noDomainTrash.domains.map((domain) => ({
          ...domain,
          spaces: domain.spaces.map((space) => ({
            ...space,
            data: { ...space.data, deletedTabs: [], deletedSubTabs: [] },
          })),
        })),
        spaces: noDomainTrash.spaces.map((space) => ({
          ...space,
          data: { ...space.data, deletedTabs: [], deletedSubTabs: [] },
        })),
      })
    })
    removeNoteReferencesForLocations(referenceCleanupTargets, cleanupResolverState)
    setTrashDomainId?.('')
    setTrashSpaceId?.('')
    setTrashTabId(TRASH_HOME_ID)
    setTrashSubTabId(null)
  }

  const confirmModal = () => {
    if (!modal) return

    if (modal.type === 'export-space') {
      const spaceId = modal.spaceId
      setModal(null)
      void exportSpace(spaceId)
      return
    }

    if (modal.type === 'copy-note') {
      const targetInfo = getLocationInfo(stateRef.current, modal.target)
      const targetBody = targetInfo.noteBodyId
        ? stateRef.current.noteBodies.find((candidate) => candidate.id === targetInfo.noteBodyId)
        : null
      if (!targetInfo.noteBodyId || (modal.mode === 'independent' && !targetBody)) {
        setModal(null)
        pushToast('Choose an existing note.', 'warning')
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
        pushToast('Choose a different note to copy.', 'warning')
        return
      }
      if (result.status === 'missing-target') {
        setModal(null)
        pushToast('Choose an existing note.', 'warning')
        return
      }
      if (result.state !== stateRef.current) {
        stateRef.current = result.state
        setState(result.state)
      }
      setModal(null)
      pushToast(
        result.status === 'already-linked'
          ? 'notes already synced.'
          : getNoteCopyCreatedToast(modal.mode),
        'success',
      )
      return
    }

    if (modal.type === 'deduplicate-note') {
      setDecoupledItemsKeepData(modal.keepData)
      const keepKeys = new Set(modal.keepLocationKeys)
      if (keepKeys.size === 0) {
        pushToast('Select at least one note to retain the information.', 'error')
        return
      }
      const appliedState = decoupleNoteLocationsInState(stateRef.current, modal.noteBodyId, keepKeys, modal.keepData)
      stateRef.current = appliedState
      setState(appliedState)
      setModal(null)
      pushToast('Notes de-coupled.', 'success')
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
        aisleBodyId: modal.aisleBodyId,
      })
      if (!result.ok) {
        pushToast(result.message, 'error')
        return
      }
      const nextState = updateAisleFrontmatter(
        stateRef.current,
        modal.aisleBodyId,
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
      pushToast((nextState.noteAisleBodies ?? []).find((body) => body.id === modal.aisleBodyId)?.frontmatter ? 'Frontmatter saved.' : 'Frontmatter removed.', 'success')
      return
    }

    if (modal.type === 'delete-target') {
      deleteTarget(modal.target, modal.permanent)
    }

    if (modal.type === 'delete-trash-targets') deleteTrashTargetsForReal(modal.targets)
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
    openContextMenuForTrashDomain,
    openContextMenuForTrashSpace,
    openContextMenuForSpace,
    openContextMenuForDomain,
    openDeleteModalFromContext,
    deleteFromContext,
    restoreFromContext,
    restoreTrashTargets,
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
    deleteTrashTargetsForReal,
    restoreAllTrash,
    deleteAllTrash,
    confirmModal,
  }
}
