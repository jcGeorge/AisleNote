/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { getDestinationSortLabel } from '../arrange/tab-sort'
import { sanitizeName } from '../export/export-data'
import { applyTemplateToStageManagerSelection } from '../frontmatter/frontmatter-state'
import { DEFAULT_AUTO_REMOVE_DAYS } from '../settings/defaults'
import { applyAutoPurgeToAppState } from '../state/app-state'
import { createId, createWorkspaceDataFromTabs } from '../state/workspace'
import type {
  AppState,
  ContextMenuState,
  Domain,
  Space,
  StageManagerAction,
  StageManagerDraft,
  StageManagerParentSelection,
  StageManagerSelectionSnapshot,
  StageManagerSelectionState,
  StageManagerStep,
  Tab,
  ToastTone,
  ViewMode,
  WorkspaceData,
} from '../types/app'
import {
  buildStageManagerSelectionSnapshot,
  cycleStageManagerParentSelection,
  createDefaultStageManagerDraft,
  createStageManagerSelectionState,
  normalizeStageManagerParentSelection,
  toggleStageManagerSubTabSelection,
} from './selection'
import {
  buildStageManagerDomainAwareState,
  getStageManagerDomainSpaces,
  projectStageManagerDomains,
  replaceStageManagerDomainSpaces,
} from './domain-operations'
import {
  appendSubTabsToParent,
  buildStageManagerMovedSubTabs,
  cloneTabForTransfer,
  cloneSubTabForTransfer,
  createPromotedParentTab,
  stripStageManagerSelectionsFromWorkspace,
} from './transforms'
import {
  applyDestinationParentSubTabSort,
  applyDestinationSubTabSort,
  applyDestinationTabSort,
} from './destination-sort'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type UseStageManagerControllerParams = {
  state: AppState
  commitAppStateNow: (nextState: AppState) => Promise<AppState>
  activeSpace: Space
  workspace: WorkspaceData
  viewMode: ViewMode
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  setMenuOpen: Dispatch<SetStateAction<boolean>>
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>
  setEditing: Dispatch<SetStateAction<{ type: EditableEntityType; id: string } | null>>
  flushPendingContent: () => void
  exitArrangeMode: () => void
  returnToLastTabLikeView: () => void
  selectTab: (tabId: string) => void
  buildStateWithLatestEditorContent: () => AppState
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
}

type ValidationResult = {
  valid: boolean
  message: string
}

export function useStageManagerController({
  state,
  commitAppStateNow,
  activeSpace,
  workspace,
  viewMode,
  setViewMode,
  setMenuOpen,
  setContextMenu,
  setEditing,
  flushPendingContent,
  exitArrangeMode,
  returnToLastTabLikeView,
  selectTab,
  buildStateWithLatestEditorContent,
  pushToast,
}: UseStageManagerControllerParams) {
  const [step, setStep] = useState<StageManagerStep>('select')
  const [action, setAction] = useState<StageManagerAction | null>(null)
  const [selections, setSelections] = useState<StageManagerSelectionState>({})
  const [draft, setDraft] = useState<StageManagerDraft>(createDefaultStageManagerDraft)

  const getParentSelection = (tab: Tab) => normalizeStageManagerParentSelection(tab, selections[tab.id])

  const updateSelectionForTab = (
    tab: Tab,
    updater: (selection: StageManagerParentSelection) => StageManagerParentSelection,
  ) => {
    setSelections((previous) => {
      const currentSelection = normalizeStageManagerParentSelection(tab, previous[tab.id])
      return {
        ...previous,
        [tab.id]: normalizeStageManagerParentSelection(tab, updater(currentSelection)),
      }
    })
  }

  const reset = (tabs: Tab[] = workspace.tabs) => {
    setStep('select')
    setAction(null)
    setSelections(createStageManagerSelectionState(tabs))
    setDraft(createDefaultStageManagerDraft())
  }

  const open = () => {
    if (viewMode !== 'main') return
    flushPendingContent()
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    exitArrangeMode()
    reset()
    setViewMode('stage-manager')
  }

  const end = () => {
    reset()
    returnToLastTabLikeView()
  }

  const updateDraft = (patch: Partial<StageManagerDraft>) => {
    setDraft((previous) => ({
      ...previous,
      ...patch,
    }))
  }

  const selectAll = () => {
    setSelections(
      Object.fromEntries(
        workspace.tabs.map((tab) => [
          tab.id,
          {
            mode: 'full',
            selectedSubTabIds: tab.subTabs.map((subTab) => subTab.id),
            cachedPartialSubTabIds: null,
            partialDirection: null,
          } satisfies StageManagerParentSelection,
        ]),
      ),
    )
  }

  const deselectAll = () => {
    setSelections(createStageManagerSelectionState(workspace.tabs))
  }

  const cycleParentSelection = (tab: Tab) => {
    updateSelectionForTab(tab, (selection) => {
      return cycleStageManagerParentSelection(tab, selection)
    })
  }

  const toggleSubTabSelection = (tab: Tab, subTabId: string) => {
    updateSelectionForTab(tab, (selection) => {
      return toggleStageManagerSubTabSelection(tab, selection, subTabId)
    })
  }

  const selectionSnapshot = useMemo(
    () => buildStageManagerSelectionSnapshot(workspace.tabs, selections),
    [workspace.tabs, selections],
  )

  const selectionCounts = useMemo(
    () => ({
      fullParentCount: selectionSnapshot.fullParents.length,
      partialParentCount: selectionSnapshot.partialParents.length,
      selectedSubTabCount:
        selectionSnapshot.fullParents.reduce((count, tab) => count + tab.subTabs.length, 0) + selectionSnapshot.looseSubTabs.length,
      hasSelection: selectionSnapshot.hasSelection,
    }),
    [selectionSnapshot],
  )

  const getDraftDomainId = (draftDomainId: string) =>
    draftDomainId && state.domains.some((domain) => domain.id === draftDomainId) ? draftDomainId : state.activeDomainId
  const getDomainSpaces = (domainId: string) => state.domains.find((domain) => domain.id === domainId)?.spaces ?? []
  const promoteDomainId = getDraftDomainId(draft.promoteDomainId)
  const demoteDomainId = getDraftDomainId(draft.demoteDomainId)
  const migrateDomainId = getDraftDomainId(draft.migrateDomainId)
  const migrateParentDomainId = getDraftDomainId(draft.migrateParentDomainId)
  const promoteDestinationSpaces = getDomainSpaces(promoteDomainId)
  const demoteSpaces = getDomainSpaces(demoteDomainId)
  const migrateParentSpaces = getDomainSpaces(migrateParentDomainId)
  const demoteSpace =
    demoteSpaces.find((space) => space.id === draft.demoteSpaceId) ??
    (demoteDomainId === state.activeDomainId ? activeSpace : demoteSpaces[0]) ??
    null
  const otherSpaces = useMemo(
    () =>
      getDomainSpaces(migrateDomainId).filter(
        (space) => !(migrateDomainId === state.activeDomainId && space.id === activeSpace.id),
      ),
    [activeSpace.id, migrateDomainId, state.activeDomainId, state.domains],
  )
  const demoteParentOptions = useMemo(
    () =>
      (demoteSpace?.data.tabs ?? []).filter(
        (tab) =>
          !(demoteDomainId === state.activeDomainId && demoteSpace?.id === activeSpace.id) ||
          !selectionSnapshot.fullParentIds.has(tab.id),
      ),
    [activeSpace.id, demoteDomainId, demoteSpace, selectionSnapshot.fullParentIds, state.activeDomainId],
  )
  const selectedPromoteSpace =
    draft.promoteSpaceMode === 'existing'
      ? promoteDestinationSpaces.find((space) => space.id === draft.promoteSpaceId) ?? null
      : null
  const selectedMigrateSpace =
    draft.migrateSpaceMode === 'existing' ? otherSpaces.find((space) => space.id === draft.migrateSpaceId) ?? null : null
  const selectedMigrateParentSpace =
    draft.migrateParentSpaceMode === 'current'
      ? activeSpace
      : draft.migrateParentSpaceMode === 'existing'
        ? migrateParentSpaces.find((space) => space.id === draft.migrateParentSpaceId) ?? null
        : null
  const migrateParentOptions = useMemo(() => {
    const destinationSpace = selectedMigrateParentSpace
    if (!destinationSpace) return []
    return destinationSpace.data.tabs.filter(
      (tab) => destinationSpace.id !== activeSpace.id || !selectionSnapshot.fullParentIds.has(tab.id),
    )
  }, [activeSpace.id, selectedMigrateParentSpace, selectionSnapshot.fullParentIds])
  const strayExistingParentOptions = useMemo(() => {
    const destinationSpace = selectedMigrateSpace
    if (!destinationSpace) return []
    return destinationSpace.data.tabs
  }, [selectedMigrateSpace])
  const strayHandlingSelectValue =
    draft.strayHandlingMode === 'selected-parent' ? `selected-parent:${draft.straySelectedParentId}` : draft.strayHandlingMode

  useEffect(() => {
    if (viewMode === 'stage-manager') return
    setStep('select')
    setAction(null)
    setSelections({})
    setDraft(createDefaultStageManagerDraft())
  }, [viewMode])

  useEffect(() => {
    if (viewMode !== 'stage-manager') return

    setDraft((previous) => {
      let changed = false
      let next = previous

      if (previous.promoteSpaceId && !promoteDestinationSpaces.some((space) => space.id === previous.promoteSpaceId)) {
        next = { ...next, promoteSpaceId: '' }
        changed = true
      }

      if (!previous.promoteDomainId) {
        next = { ...next, promoteDomainId: state.activeDomainId }
        changed = true
      }

      if (!previous.demoteDomainId) {
        next = { ...next, demoteDomainId: state.activeDomainId, demoteSpaceId: activeSpace.id }
        changed = true
      }

      if (previous.demoteSpaceId && !demoteSpaces.some((space) => space.id === previous.demoteSpaceId)) {
        next = { ...next, demoteSpaceId: demoteSpaces[0]?.id ?? '' }
        changed = true
      }

      if (previous.demoteParentId && !demoteParentOptions.some((tab) => tab.id === previous.demoteParentId)) {
        next = { ...next, demoteParentId: '' }
        changed = true
      }

      if (!previous.migrateDomainId) {
        next = { ...next, migrateDomainId: state.activeDomainId }
        changed = true
      }

      if (previous.migrateSpaceId && !otherSpaces.some((space) => space.id === previous.migrateSpaceId)) {
        next = { ...next, migrateSpaceId: '' }
        changed = true
      }

      if (
        previous.migrateParentSpaceId &&
        previous.migrateParentSpaceMode === 'existing' &&
        !migrateParentSpaces.some((space) => space.id === previous.migrateParentSpaceId)
      ) {
        next = { ...next, migrateParentSpaceId: '' }
        changed = true
      }

      if (!previous.migrateParentDomainId) {
        next = { ...next, migrateParentDomainId: state.activeDomainId }
        changed = true
      }

      if (previous.migrateParentId && !migrateParentOptions.some((tab) => tab.id === previous.migrateParentId)) {
        next = { ...next, migrateParentId: '' }
        changed = true
      }

      if (
        previous.straySelectedParentId &&
        !selectionSnapshot.fullParents.some((tab) => tab.id === previous.straySelectedParentId)
      ) {
        next = {
          ...next,
          straySelectedParentId: '',
          strayHandlingMode: previous.strayHandlingMode === 'selected-parent' ? 'promote' : previous.strayHandlingMode,
        }
        changed = true
      }

      if (previous.strayExistingParentId && !strayExistingParentOptions.some((tab) => tab.id === previous.strayExistingParentId)) {
        next = { ...next, strayExistingParentId: '' }
        changed = true
      }

      return changed ? next : previous
    })
  }, [
    viewMode,
    demoteParentOptions,
    demoteSpaces,
    migrateParentOptions,
    otherSpaces,
    promoteDestinationSpaces,
    migrateParentSpaces,
    selectionSnapshot.fullParents,
    strayExistingParentOptions,
    state.activeDomainId,
    activeSpace.id,
  ])

  const getActionValidation = (
    nextAction: StageManagerAction,
    snapshot: StageManagerSelectionSnapshot = buildStageManagerSelectionSnapshot(workspace.tabs, selections),
  ): ValidationResult => {
    if (!snapshot.hasSelection) {
      return {
        valid: false,
        message: 'select at least one parent or sub-tab before choosing an action.',
      }
    }

    if (nextAction === 'promote' && snapshot.fullParents.length > 1) {
      return {
        valid: false,
        message: 'multiple parent tabs cannot be promoted at the same time.',
      }
    }

    if (nextAction === 'demote' && snapshot.fullParents.length === 0) {
      return {
        valid: false,
        message: 'demote requires at least one fully selected parent tab.',
      }
    }

    return {
      valid: true,
      message: '',
    }
  }

  const selectAction = (nextAction: StageManagerAction) => {
    const snapshot = buildStageManagerSelectionSnapshot(workspace.tabs, selections)
    const validation = getActionValidation(nextAction, snapshot)
    if (!validation.valid) {
      setAction(null)
      pushToast(validation.message, 'warning')
      return
    }

    setAction(nextAction)

    if (nextAction === 'promote' && snapshot.fullParents.length === 1 && draft.newSpaceName.trim().length === 0) {
      updateDraft({ newSpaceName: snapshot.fullParents[0].title })
    }
    if (nextAction === 'frontmatter' && !draft.frontmatterTemplateId) {
      updateDraft({ frontmatterTemplateId: state.frontmatter.lastAppliedTemplateId })
    }
  }

  const handleParentClick = (tab: Tab) => {
    if (step !== 'select') {
      pushToast('go back to the selection step to change selected items.', 'error')
      return
    }

    if (workspace.activeTabId !== tab.id) {
      selectTab(tab.id)
      return
    }

    cycleParentSelection(tab)
  }

  const handleSubTabClick = (tab: Tab, subTabId: string) => {
    if (step !== 'select') {
      pushToast('go back to the selection step to change selected items.', 'error')
      return
    }

    toggleSubTabSelection(tab, subTabId)
  }

  const handleHomeClick = () => {
    if (step !== 'select') {
      pushToast('go back to the selection step to change selected items.', 'error')
      return
    }

    pushToast('home is selected automatically when the parent tab is fully selected.', 'error')
  }

  const getConfigureValidation = (): ValidationResult => {
    if (!action) {
      return {
        valid: false,
        message: 'choose a director action before continuing.',
      }
    }

    if (action === 'promote') {
      if (selectionSnapshot.fullParents.length === 1) {
        if (!draft.newSpaceName.trim()) {
          return {
            valid: false,
            message: 'name the new space for this promoted parent tab before continuing.',
          }
        }

        return { valid: true, message: '' }
      }

      if (draft.promoteSpaceMode === 'existing') {
        if (!selectedPromoteSpace) {
          return {
            valid: false,
            message: 'choose the destination space for the promoted sub-tabs before continuing.',
          }
        }
      } else if (!draft.newSpaceName.trim()) {
        return {
          valid: false,
          message: 'name the new destination space for the promoted sub-tabs before continuing.',
        }
      }

      return { valid: true, message: '' }
    }

    if (action === 'demote') {
      if (draft.demoteParentMode === 'existing') {
        if (!draft.demoteParentId) {
          return {
            valid: false,
            message: 'choose the parent tab that will receive the demoted items before continuing.',
          }
        }

        if (!demoteParentOptions.some((tab) => tab.id === draft.demoteParentId)) {
          return {
            valid: false,
            message: 'choose a valid destination parent for the demoted items before continuing.',
          }
        }

        if (selectionSnapshot.fullParentIds.has(draft.demoteParentId)) {
          return {
            valid: false,
            message: 'a selected parent tab cannot receive demoted items. choose a different destination parent.',
          }
        }
      } else if (!draft.demoteNewParentName.trim()) {
        return {
          valid: false,
          message: 'name the new parent tab that will receive the demoted items before continuing.',
        }
      }

      return { valid: true, message: '' }
    }

    if (action === 'migrate') {
      if (draft.migrateTarget === 'space') {
        if (draft.migrateSpaceMode === 'existing') {
          if (!selectedMigrateSpace) {
            return {
              valid: false,
              message: 'choose the destination space for this migration before continuing.',
            }
          }
        } else if (!draft.newSpaceName.trim()) {
          return {
            valid: false,
            message: 'name the new destination space before continuing.',
          }
        }

        if (selectionSnapshot.looseSubTabs.length > 0) {
          if (draft.strayHandlingMode === 'selected-parent') {
            if (!draft.straySelectedParentId || !selectionSnapshot.fullParentIds.has(draft.straySelectedParentId)) {
              return {
                valid: false,
                message: 'choose which selected parent should receive the stray sub-tabs before continuing.',
              }
            }
          } else if (draft.strayHandlingMode === 'existing-parent') {
            if (draft.migrateSpaceMode !== 'existing') {
              return {
                valid: false,
                message: 'existing destination parents are only available when migrating into an existing space.',
              }
            }
            if (!draft.strayExistingParentId || !strayExistingParentOptions.some((tab) => tab.id === draft.strayExistingParentId)) {
              return {
                valid: false,
                message: 'choose the destination parent for the stray sub-tabs before continuing.',
              }
            }
          } else if (draft.strayHandlingMode === 'new-parent' && !draft.strayNewParentName.trim()) {
            return {
              valid: false,
              message: 'name the new destination parent for the stray sub-tabs before continuing.',
            }
          }
        }

        return { valid: true, message: '' }
      }

      if (draft.migrateParentSpaceMode === 'existing' && !draft.migrateParentSpaceId) {
        return {
          valid: false,
          message: 'choose the destination space that contains the target parent before continuing.',
        }
      }

      if (draft.migrateParentSpaceMode === 'new') {
        if (!draft.newSpaceName.trim()) {
          return {
            valid: false,
            message: 'name the new destination space before continuing.',
          }
        }

        if (!draft.migrateNewParentName.trim()) {
          return {
            valid: false,
            message: 'name the new destination parent before continuing.',
          }
        }

        return { valid: true, message: '' }
      }

      if (draft.migrateParentMode === 'existing') {
        if (!draft.migrateParentId) {
          return {
            valid: false,
            message: 'choose the destination parent before continuing.',
          }
        }

        if (!migrateParentOptions.some((tab) => tab.id === draft.migrateParentId)) {
          return {
            valid: false,
            message: 'choose a valid destination parent before continuing.',
          }
        }

        if (selectedMigrateParentSpace?.id === activeSpace.id && selectionSnapshot.fullParentIds.has(draft.migrateParentId)) {
          return {
            valid: false,
            message: 'a selected parent tab cannot receive migrated items. choose a different destination parent.',
          }
        }
      } else if (!draft.migrateNewParentName.trim()) {
        return {
          valid: false,
          message: 'name the new destination parent before continuing.',
        }
      }

      return { valid: true, message: '' }
    }

    if (action === 'frontmatter') {
      if (!state.frontmatter.templates.some((template) => template.id === draft.frontmatterTemplateId)) {
        return {
          valid: false,
          message: 'choose a frontmatter template before continuing.',
        }
      }
      return { valid: true, message: '' }
    }

    return { valid: true, message: '' }
  }

  const reviewDetails = useMemo(() => {
    if (!action) return ['action: none selected']

    const details = [
      `selected parent tabs: ${selectionCounts.fullParentCount}`,
      `selected sub-tabs: ${selectionCounts.selectedSubTabCount}`,
      `action: ${action.replace('-', ' ')}`,
    ]

    if (action === 'promote') {
      if (selectionSnapshot.fullParents.length === 1) {
        details.push(`new space: ${sanitizeName(draft.newSpaceName || selectionSnapshot.fullParents[0].title)}`)
      } else if (draft.promoteSpaceMode === 'existing') {
        details.push(`destination space: ${selectedPromoteSpace?.name ?? 'none selected'}`)
      } else {
        details.push(`new space: ${sanitizeName(draft.newSpaceName || 'untitled')}`)
      }
      details.push(`destination order: ${getDestinationSortLabel(draft.destinationSortMode)}`)
    } else if (action === 'demote') {
      if (draft.demoteParentMode === 'existing') {
        details.push(
          `destination parent: ${demoteParentOptions.find((tab) => tab.id === draft.demoteParentId)?.title ?? 'none selected'}`,
        )
      } else {
        details.push(`new parent: ${sanitizeName(draft.demoteNewParentName || 'untitled')}`)
      }
      details.push(`destination order: ${getDestinationSortLabel(draft.destinationSortMode)}`)
    } else if (action === 'migrate') {
      if (draft.migrateTarget === 'space') {
        if (draft.migrateSpaceMode === 'existing') {
          details.push(`destination space: ${selectedMigrateSpace?.name ?? 'none selected'}`)
        } else {
          details.push(`new space: ${sanitizeName(draft.newSpaceName || 'untitled')}`)
        }
        if (selectionSnapshot.looseSubTabs.length > 0) {
          if (draft.strayHandlingMode === 'promote') {
            details.push('stray sub-tabs: promote to own prime tabs')
          } else if (draft.strayHandlingMode === 'selected-parent') {
            details.push(
              `stray sub-tabs: include under ${
                selectionSnapshot.fullParents.find((tab) => tab.id === draft.straySelectedParentId)?.title ?? 'selected parent'
              }`,
            )
          } else if (draft.strayHandlingMode === 'existing-parent') {
            details.push(
              `stray sub-tabs: include under ${
                strayExistingParentOptions.find((tab) => tab.id === draft.strayExistingParentId)?.title ?? 'existing parent'
              }`,
            )
          } else {
            details.push(`stray sub-tabs: include under new parent ${sanitizeName(draft.strayNewParentName || 'untitled')}`)
          }
        }
      } else {
        if (draft.migrateParentSpaceMode === 'current') {
          details.push(`destination space: ${activeSpace.name}`)
        } else if (draft.migrateParentSpaceMode === 'existing') {
          details.push(`destination space: ${state.spaces.find((space) => space.id === draft.migrateParentSpaceId)?.name ?? 'none selected'}`)
        } else {
          details.push(`new space: ${sanitizeName(draft.newSpaceName || 'untitled')}`)
        }

        if (draft.migrateParentSpaceMode === 'new' || draft.migrateParentMode === 'new') {
          details.push(`destination parent: ${sanitizeName(draft.migrateNewParentName || 'untitled')}`)
        } else {
          details.push(
            `destination parent: ${migrateParentOptions.find((tab) => tab.id === draft.migrateParentId)?.title ?? 'none selected'}`,
          )
        }
      }
      details.push(`destination order: ${getDestinationSortLabel(draft.destinationSortMode)}`)
    } else if (action === 'frontmatter') {
      const template = state.frontmatter.templates.find((candidate) => candidate.id === draft.frontmatterTemplateId)
      details.push(`template: ${template?.name ?? 'none selected'}`)
    } else if (action === 'mass-delete') {
      details.push(`mode: ${draft.massDeleteMode === 'trash' ? 'move to trash' : 'delete for real'}`)
    }

    return details
  }, [
    action,
    activeSpace.name,
    demoteParentOptions,
    draft,
    migrateParentOptions,
    selectedMigrateSpace,
    selectedPromoteSpace,
    selectionCounts,
    selectionSnapshot,
    state.frontmatter.templates,
    state.spaces,
    strayExistingParentOptions,
  ])

  const reviewWarning = useMemo(() => {
    if (action === 'mass-delete' && draft.massDeleteMode === 'permanent') {
      return 'This will permanently delete the current selection.'
    }
    if (action === 'migrate' && draft.migrateTarget === 'parent') {
      return 'Moving a parent into another parent demotes it into a sub-tab under that destination parent.'
    }
    if (action === 'demote') {
      return 'Each demoted parent becomes one sub-tab whose content comes from that parent home note.'
    }
    return ''
  }, [action, draft.massDeleteMode, draft.migrateTarget])

  const getApplyToastMessage = () => {
    if (action === 'mass-delete') {
      return draft.massDeleteMode === 'trash' ? 'selected items have been moved to trash.' : 'selected items have been deleted.'
    }
    if (action === 'promote') return 'selected items have been promoted.'
    if (action === 'demote') return 'selected items have been demoted.'
    if (action === 'migrate') return 'selected items have been migrated.'
    if (action === 'frontmatter') return 'frontmatter has been applied.'
    return 'director changes applied.'
  }

  const finishApply = (nextState: AppState, toastMessage: string, tone: ToastTone = 'success') => {
    const sanitizedState = applyAutoPurgeToAppState(nextState)
    void commitAppStateNow(sanitizedState)
    setViewMode('main')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    pushToast(toastMessage, tone)
  }

  const apply = () => {
    if (!action) {
      pushToast('choose a director action before applying.', 'warning')
      return
    }

    const validation = getConfigureValidation()
    if (!validation.valid) {
      pushToast(validation.message, 'warning')
      return
    }

    const latestState = buildStateWithLatestEditorContent()
    const currentSpace = latestState.spaces.find((space) => space.id === latestState.activeSpaceId)
    if (!currentSpace) return
    const projectedDomains = projectStageManagerDomains(latestState)
    const getSpacesFromDomains = getStageManagerDomainSpaces
    const replaceDomainSpaces = replaceStageManagerDomainSpaces
    const buildDomainAwareState = (domains: Domain[], activeDomainId = latestState.activeDomainId, activeSpaceId = latestState.activeSpaceId) =>
      buildStageManagerDomainAwareState(latestState, domains, activeDomainId, activeSpaceId)
    const sortDestinationTabs = (tabs: Tab[]) =>
      applyDestinationTabSort(tabs, latestState.noteBodies, draft.destinationSortMode)
    const sortDestinationSubTabs = (subTabs: Tab['subTabs']) =>
      applyDestinationSubTabSort(subTabs, latestState.noteBodies, draft.destinationSortMode)
    const sortDestinationParentSubTabs = (tabs: Tab[], parentId: string) =>
      applyDestinationParentSubTabSort(tabs, parentId, latestState.noteBodies, draft.destinationSortMode)

    const snapshot = buildStageManagerSelectionSnapshot(currentSpace.data.tabs, selections)
    if (!snapshot.hasSelection) {
      pushToast('select at least one parent or sub-tab before applying director.', 'warning')
      return
    }

    if (action === 'frontmatter') {
      const template = latestState.frontmatter.templates.find((candidate) => candidate.id === draft.frontmatterTemplateId)
      if (!template) {
        pushToast('choose a frontmatter template before applying director.', 'warning')
        return
      }
      finishApply(
        applyTemplateToStageManagerSelection(
          latestState,
          latestState.activeSpaceId,
          snapshot,
          template,
        ),
        getApplyToastMessage(),
      )
      return
    }

    if (action === 'mass-delete') {
      const nextSpaces = latestState.spaces.map((space) => {
        if (space.id !== latestState.activeSpaceId) return space

        const deletedTabs =
          draft.massDeleteMode === 'trash'
            ? [
                ...space.data.deletedTabs.map((entry) => ({ ...entry, tab: cloneTabForTransfer(entry.tab) })),
                ...snapshot.fullParents.map((tab) => ({
                  id: createId(),
                  tab: cloneTabForTransfer(tab),
                  deletedAt: Date.now(),
                })),
              ]
            : space.data.deletedTabs.map((entry) => ({ ...entry, tab: cloneTabForTransfer(entry.tab) }))

        const deletedSubTabs =
          draft.massDeleteMode === 'trash'
            ? [
                ...space.data.deletedSubTabs.map((entry) => ({ ...entry, subTab: cloneSubTabForTransfer(entry.subTab) })),
                ...snapshot.looseSubTabs.map(({ parentTab, subTab }) => ({
                  id: createId(),
                  parentTabId: parentTab.id,
                  parentTabTitle: parentTab.title,
                  subTab: cloneSubTabForTransfer(subTab),
                  deletedAt: Date.now(),
                })),
              ]
            : space.data.deletedSubTabs.map((entry) => ({ ...entry, subTab: cloneSubTabForTransfer(entry.subTab) }))

        const stripped = stripStageManagerSelectionsFromWorkspace(space.data, snapshot)
        return {
          ...space,
          data: createWorkspaceDataFromTabs(stripped.tabs, {
            activeTabId: stripped.activeTabId,
            deletedTabs,
            deletedSubTabs,
          }),
        }
      })

      finishApply(
        {
          ...latestState,
          spaces: nextSpaces,
        },
        getApplyToastMessage(),
      )
      return
    }

    if (action === 'promote') {
      const loosePromotedTabs = snapshot.looseSubTabs.map(({ subTab }) => createPromotedParentTab(subTab))
      const strippedCurrentData = stripStageManagerSelectionsFromWorkspace(currentSpace.data, snapshot)
      const nextSpaces = latestState.spaces.map((space) =>
        space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
      )

      if (snapshot.fullParents.length === 1) {
        const promotedParent = snapshot.fullParents[0]
        const mainTab: Tab = {
          id: createId(),
          title: 'main',
          noteBodyId: promotedParent.noteBodyId,
          homeContent: promotedParent.homeContent,
          activeSubTabId: null,
          subTabs: [],
        }
        const movedTabs = [
          mainTab,
          ...promotedParent.subTabs.map((subTab) => createPromotedParentTab(subTab)),
          ...loosePromotedTabs,
        ]
        const newSpaceId = createId()
        const newSpace: Space = {
          id: newSpaceId,
          name: sanitizeName(draft.newSpaceName || promotedParent.title),
          settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
          data: createWorkspaceDataFromTabs(sortDestinationTabs(movedTabs), { activeTabId: mainTab.id }),
        }
        const destinationDomainId = promoteDomainId
        let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, nextSpaces, latestState.activeSpaceId)
        const destinationBaseSpaces =
          destinationDomainId === latestState.activeDomainId ? nextSpaces : getSpacesFromDomains(nextDomains, destinationDomainId)
        const destinationSpaces = [...destinationBaseSpaces, newSpace]
        nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, destinationSpaces, newSpace.id)

        finishApply(
          buildDomainAwareState(
            nextDomains,
            state.ui.stageManagerOpenDestinationAfterApply ? destinationDomainId : latestState.activeDomainId,
            state.ui.stageManagerOpenDestinationAfterApply ? newSpace.id : latestState.activeSpaceId,
          ),
          getApplyToastMessage(),
        )
        return
      }

      if (draft.promoteSpaceMode === 'new') {
        const firstTabId = loosePromotedTabs[0]?.id ?? null
        const newSpace: Space = {
          id: createId(),
          name: sanitizeName(draft.newSpaceName || 'untitled'),
          settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
          data: createWorkspaceDataFromTabs(sortDestinationTabs(loosePromotedTabs), { activeTabId: firstTabId ?? undefined }),
        }
        const destinationDomainId = promoteDomainId
        let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, nextSpaces, latestState.activeSpaceId)
        const destinationBaseSpaces =
          destinationDomainId === latestState.activeDomainId ? nextSpaces : getSpacesFromDomains(nextDomains, destinationDomainId)
        const destinationSpaces = [...destinationBaseSpaces, newSpace]
        nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, destinationSpaces, newSpace.id)

        finishApply(
          buildDomainAwareState(
            nextDomains,
            state.ui.stageManagerOpenDestinationAfterApply ? destinationDomainId : latestState.activeDomainId,
            state.ui.stageManagerOpenDestinationAfterApply ? newSpace.id : latestState.activeSpaceId,
          ),
          getApplyToastMessage(),
        )
        return
      }

      const destinationDomainId = promoteDomainId
      const destinationSpaceId = draft.promoteSpaceId
      const destinationFirstTabId = loosePromotedTabs[0]?.id ?? null
      const domainsWithSource = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, nextSpaces, latestState.activeSpaceId)
      const destinationSpaces = getSpacesFromDomains(domainsWithSource, destinationDomainId).map((space) => {
        if (space.id !== destinationSpaceId) return space
        const destinationTabs = sortDestinationTabs([...space.data.tabs.map(cloneTabForTransfer), ...loosePromotedTabs])
        return {
          ...space,
          data: createWorkspaceDataFromTabs(destinationTabs, {
            activeTabId:
              state.ui.stageManagerOpenDestinationAfterApply && destinationFirstTabId
                ? destinationFirstTabId
                : space.data.activeTabId,
            deletedTabs: space.data.deletedTabs,
            deletedSubTabs: space.data.deletedSubTabs,
          }),
        }
      })
      const nextDomains = replaceDomainSpaces(domainsWithSource, destinationDomainId, destinationSpaces, destinationSpaceId)
      finishApply(
        buildDomainAwareState(
          nextDomains,
          state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId ? destinationDomainId : latestState.activeDomainId,
          state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId ? destinationSpaceId : latestState.activeSpaceId,
        ),
        getApplyToastMessage(),
      )
      return
    }

    if (action === 'demote') {
      const movedSubTabs = buildStageManagerMovedSubTabs(snapshot)
      const strippedCurrentData = stripStageManagerSelectionsFromWorkspace(currentSpace.data, snapshot)
      const destinationDomainId = demoteDomainId
      const destinationSpaceId = demoteSpace?.id ?? latestState.activeSpaceId
      const sameDestinationSpace = destinationDomainId === latestState.activeDomainId && destinationSpaceId === currentSpace.id

      let destinationParentId: string
      let destinationTabs: Tab[]
      const destinationSourceTabs = sameDestinationSpace
        ? strippedCurrentData.tabs
        : getSpacesFromDomains(projectedDomains, destinationDomainId).find((space) => space.id === destinationSpaceId)?.data.tabs ?? []
      if (draft.demoteParentMode === 'new') {
        destinationParentId = createId()
        const newParent: Tab = {
          id: destinationParentId,
          title: sanitizeName(draft.demoteNewParentName || 'untitled'),
          noteBodyId: createId(),
          homeContent: '',
          activeSubTabId: null,
          subTabs: movedSubTabs.map(cloneSubTabForTransfer),
        }
        destinationTabs = [...destinationSourceTabs.map(cloneTabForTransfer), newParent]
      } else {
        destinationParentId = draft.demoteParentId
        destinationTabs = appendSubTabsToParent(
          destinationSourceTabs,
          destinationParentId,
          movedSubTabs,
          state.ui.stageManagerOpenDestinationAfterApply,
        )
      }
      destinationTabs = sortDestinationParentSubTabs(destinationTabs, destinationParentId)
      const sourceSpaces = latestState.spaces.map((space) =>
        space.id !== currentSpace.id ? space : { ...space, data: strippedCurrentData },
      )
      let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, sourceSpaces, latestState.activeSpaceId)
      const destinationSpaces = getSpacesFromDomains(nextDomains, destinationDomainId).map((space) =>
        space.id !== destinationSpaceId
          ? space
          : {
              ...space,
              data: createWorkspaceDataFromTabs(destinationTabs, {
                activeTabId:
                  state.ui.stageManagerOpenDestinationAfterApply && destinationParentId
                    ? destinationParentId
                    : sameDestinationSpace
                      ? strippedCurrentData.activeTabId
                      : space.data.activeTabId,
                deletedTabs: space.data.deletedTabs,
                deletedSubTabs: space.data.deletedSubTabs,
              }),
            },
      )
      nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, destinationSpaces, destinationSpaceId)

      finishApply(
        buildDomainAwareState(
          nextDomains,
          state.ui.stageManagerOpenDestinationAfterApply ? destinationDomainId : latestState.activeDomainId,
          state.ui.stageManagerOpenDestinationAfterApply ? destinationSpaceId : latestState.activeSpaceId,
        ),
        getApplyToastMessage(),
      )
      return
    }

    const strippedCurrentData = stripStageManagerSelectionsFromWorkspace(currentSpace.data, snapshot)
    const movedParentTabs = snapshot.fullParents.map(cloneTabForTransfer)
    const looseMovedSubTabs = snapshot.looseSubTabs.map(({ subTab }) => cloneSubTabForTransfer(subTab))

    if (draft.migrateTarget === 'space') {
      const movedParentCopies = movedParentTabs.map(cloneTabForTransfer)
      const additionalDestinationTabs: Tab[] = []

      if (snapshot.looseSubTabs.length > 0) {
        if (draft.strayHandlingMode === 'promote') {
          additionalDestinationTabs.push(...looseMovedSubTabs.map((subTab) => createPromotedParentTab(subTab)))
        } else if (draft.strayHandlingMode === 'selected-parent') {
          const targetParentId = draft.straySelectedParentId
          const targetIndex = movedParentCopies.findIndex((tab) => tab.id === targetParentId)
          if (targetIndex >= 0) {
            movedParentCopies[targetIndex] = {
              ...movedParentCopies[targetIndex],
              subTabs: sortDestinationSubTabs([
                ...movedParentCopies[targetIndex].subTabs,
                ...looseMovedSubTabs.map(cloneSubTabForTransfer),
              ]),
            }
          }
        } else if (draft.strayHandlingMode === 'new-parent') {
          additionalDestinationTabs.push({
            id: createId(),
            title: sanitizeName(draft.strayNewParentName || 'untitled'),
            noteBodyId: createId(),
            homeContent: '',
            activeSubTabId: null,
            subTabs: sortDestinationSubTabs(looseMovedSubTabs.map(cloneSubTabForTransfer)),
          })
        }
      }

      if (draft.migrateSpaceMode === 'new') {
        const newSpaceId = createId()
        const destinationTabs =
          draft.strayHandlingMode === 'existing-parent'
            ? [...movedParentCopies]
            : [...movedParentCopies, ...additionalDestinationTabs]
        const fallbackTab = destinationTabs[0]?.id
        const newSpace: Space = {
          id: newSpaceId,
          name: sanitizeName(draft.newSpaceName || 'untitled'),
          settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
          data: createWorkspaceDataFromTabs(sortDestinationTabs(destinationTabs), { activeTabId: fallbackTab }),
        }
        const destinationDomainId = migrateDomainId
        const sourceSpaces = latestState.spaces.map((space) =>
          space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
        )
        let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, sourceSpaces, latestState.activeSpaceId)
        const destinationBaseSpaces =
          destinationDomainId === latestState.activeDomainId ? sourceSpaces : getSpacesFromDomains(nextDomains, destinationDomainId)
        const destinationSpaces = [...destinationBaseSpaces, newSpace]
        nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, destinationSpaces, newSpace.id)

        finishApply(
          buildDomainAwareState(
            nextDomains,
            state.ui.stageManagerOpenDestinationAfterApply ? destinationDomainId : latestState.activeDomainId,
            state.ui.stageManagerOpenDestinationAfterApply ? newSpace.id : latestState.activeSpaceId,
          ),
          getApplyToastMessage(),
        )
        return
      }

      const destinationDomainId = migrateDomainId
      const destinationSpaceId = draft.migrateSpaceId
      const sourceSpaces = latestState.spaces.map((space) =>
        space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
      )
      let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, sourceSpaces, latestState.activeSpaceId)
      const destinationSpaces = getSpacesFromDomains(nextDomains, destinationDomainId).map((space) => {
        if (space.id !== destinationSpaceId) return space

        let destinationTabs = [...space.data.tabs.map(cloneTabForTransfer), ...movedParentCopies]
        let destinationActiveTabId = state.ui.stageManagerOpenDestinationAfterApply
          ? movedParentCopies[0]?.id ?? additionalDestinationTabs[0]?.id ?? space.data.activeTabId
          : space.data.activeTabId

        if (draft.strayHandlingMode === 'existing-parent') {
          destinationTabs = appendSubTabsToParent(
            destinationTabs,
            draft.strayExistingParentId,
            looseMovedSubTabs,
            state.ui.stageManagerOpenDestinationAfterApply,
          )
          destinationTabs = sortDestinationParentSubTabs(destinationTabs, draft.strayExistingParentId)
          if (state.ui.stageManagerOpenDestinationAfterApply) {
            destinationActiveTabId = draft.strayExistingParentId
          }
        } else {
          destinationTabs = [...destinationTabs, ...additionalDestinationTabs]
        }
        destinationTabs = sortDestinationTabs(destinationTabs)

        return {
          ...space,
          data: createWorkspaceDataFromTabs(destinationTabs, {
            activeTabId: destinationActiveTabId,
            deletedTabs: space.data.deletedTabs,
            deletedSubTabs: space.data.deletedSubTabs,
          }),
        }
      })
      nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, destinationSpaces, destinationSpaceId)
      finishApply(
        buildDomainAwareState(
          nextDomains,
          state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId ? destinationDomainId : latestState.activeDomainId,
          state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId ? destinationSpaceId : latestState.activeSpaceId,
        ),
        getApplyToastMessage(),
      )
      return
    }

    const movedSubTabs = buildStageManagerMovedSubTabs(snapshot)

    if (draft.migrateParentSpaceMode === 'current') {
      let destinationParentId: string
      let destinationTabs: Tab[]
      if (draft.migrateParentMode === 'new') {
        destinationParentId = createId()
        const newParent: Tab = {
          id: destinationParentId,
          title: sanitizeName(draft.migrateNewParentName || 'untitled'),
          noteBodyId: createId(),
          homeContent: '',
          activeSubTabId: null,
          subTabs: movedSubTabs.map(cloneSubTabForTransfer),
        }
        destinationTabs = [...strippedCurrentData.tabs.map(cloneTabForTransfer), newParent]
      } else {
        destinationParentId = draft.migrateParentId
        destinationTabs = appendSubTabsToParent(
          strippedCurrentData.tabs,
          destinationParentId,
          movedSubTabs,
          state.ui.stageManagerOpenDestinationAfterApply,
        )
      }
      destinationTabs = sortDestinationParentSubTabs(destinationTabs, destinationParentId)

      finishApply(
        {
          ...latestState,
          spaces: latestState.spaces.map((space) =>
            space.id !== currentSpace.id
              ? space
              : {
                  ...space,
                  data: createWorkspaceDataFromTabs(destinationTabs, {
                    activeTabId:
                      state.ui.stageManagerOpenDestinationAfterApply && destinationParentId
                        ? destinationParentId
                        : strippedCurrentData.activeTabId,
                    deletedTabs: strippedCurrentData.deletedTabs,
                    deletedSubTabs: strippedCurrentData.deletedSubTabs,
                  }),
                },
          ),
        },
        getApplyToastMessage(),
      )
      return
    }

    if (draft.migrateParentSpaceMode === 'new') {
      const destinationParentId = createId()
      const newSpaceId = createId()
      const destinationDomainId = migrateParentDomainId
      const newParent: Tab = {
        id: destinationParentId,
        title: sanitizeName(draft.migrateNewParentName || 'untitled'),
        noteBodyId: createId(),
        homeContent: '',
        activeSubTabId: null,
        subTabs: sortDestinationSubTabs(movedSubTabs.map(cloneSubTabForTransfer)),
      }
      const newSpace: Space = {
        id: newSpaceId,
        name: sanitizeName(draft.newSpaceName || 'untitled'),
        settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
        data: createWorkspaceDataFromTabs([newParent], { activeTabId: destinationParentId }),
      }
      const sourceSpaces = latestState.spaces.map((space) =>
        space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
      )
      let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, sourceSpaces, latestState.activeSpaceId)
      const destinationBaseSpaces =
        destinationDomainId === latestState.activeDomainId ? sourceSpaces : getSpacesFromDomains(nextDomains, destinationDomainId)
      nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, [...destinationBaseSpaces, newSpace], newSpace.id)

      finishApply(
        buildDomainAwareState(
          nextDomains,
          state.ui.stageManagerOpenDestinationAfterApply ? destinationDomainId : latestState.activeDomainId,
          state.ui.stageManagerOpenDestinationAfterApply ? newSpace.id : latestState.activeSpaceId,
        ),
        getApplyToastMessage(),
      )
      return
    }

    const destinationDomainId = migrateParentDomainId
    const destinationSpaceId = draft.migrateParentSpaceId
    const sourceSpaces = latestState.spaces.map((space) =>
      space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
    )
    let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, sourceSpaces, latestState.activeSpaceId)
    const destinationSpaces = getSpacesFromDomains(nextDomains, destinationDomainId).map((space) => {
      if (space.id !== destinationSpaceId) return space

      let destinationParentId: string
      let destinationTabs: Tab[]
      if (draft.migrateParentMode === 'new') {
        destinationParentId = createId()
        const newParent: Tab = {
          id: destinationParentId,
          title: sanitizeName(draft.migrateNewParentName || 'untitled'),
          noteBodyId: createId(),
          homeContent: '',
          activeSubTabId: null,
          subTabs: movedSubTabs.map(cloneSubTabForTransfer),
        }
        destinationTabs = [...space.data.tabs.map(cloneTabForTransfer), newParent]
      } else {
        destinationParentId = draft.migrateParentId
        destinationTabs = appendSubTabsToParent(
          space.data.tabs,
          destinationParentId,
          movedSubTabs,
          state.ui.stageManagerOpenDestinationAfterApply,
        )
      }
      destinationTabs = sortDestinationParentSubTabs(destinationTabs, destinationParentId)

      return {
        ...space,
        data: createWorkspaceDataFromTabs(destinationTabs, {
          activeTabId:
            state.ui.stageManagerOpenDestinationAfterApply && destinationParentId
              ? destinationParentId
              : space.data.activeTabId,
          deletedTabs: space.data.deletedTabs,
          deletedSubTabs: space.data.deletedSubTabs,
        }),
      }
    })
    nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, destinationSpaces, destinationSpaceId)
    finishApply(
      buildDomainAwareState(
        nextDomains,
        state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId ? destinationDomainId : latestState.activeDomainId,
        state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId ? destinationSpaceId : latestState.activeSpaceId,
      ),
      getApplyToastMessage(),
    )
  }

  const previous = () => {
    if (step === 'select') return
    if (step === 'action') {
      setStep('select')
      return
    }
    if (step === 'configure') {
      setStep('action')
      return
    }
    setStep('configure')
  }

  const next = () => {
    if (step === 'select') {
      if (!selectionSnapshot.hasSelection) {
        pushToast('select at least one parent or sub-tab before continuing.', 'warning')
        return
      }
      setStep('action')
      return
    }

    if (step === 'action') {
      if (!action) {
        pushToast('choose a director action before continuing.', 'warning')
        return
      }
      const validation = getActionValidation(action, selectionSnapshot)
      if (!validation.valid) {
        setAction(null)
        pushToast(validation.message, 'warning')
        return
      }
      setStep('configure')
      return
    }

    if (step === 'configure') {
      const validation = getConfigureValidation()
      if (!validation.valid) {
        pushToast(validation.message, 'warning')
        return
      }
      setStep('review')
      return
    }

    pushToast('director execution will be added in the next chunk.', 'warning')
  }

  return {
    step,
    action,
    draft,
    selectionSnapshot,
    selectionCounts,
    promoteDomainId,
    promoteDestinationSpaces,
    demoteDomainId,
    demoteSpaces,
    demoteSpace,
    demoteParentOptions,
    migrateDomainId,
    otherSpaces,
    strayHandlingSelectValue,
    strayExistingParentOptions,
    migrateParentDomainId,
    migrateParentSpaces,
    migrateParentOptions,
    reviewDetails,
    reviewWarning,
    open,
    end,
    getParentSelection,
    handleParentClick,
    handleSubTabClick,
    handleHomeClick,
    selectAll,
    deselectAll,
    selectAction,
    updateDraft,
    previous,
    next,
    apply,
  }
}
