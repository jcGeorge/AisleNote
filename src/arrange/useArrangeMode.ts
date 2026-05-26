import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react'
import {
  ARRANGE_DRAG_START_SLOP_PX,
  ARRANGE_PRESS_DELAY_MS,
  ARRANGE_TAP_SLOP_PX,
  DEFAULT_ARRANGE_MODE,
  isPointInsideElementExact,
} from './arrange-utils'
import {
  EXACT_RAIL_HIT_PADDING_PX,
  TAB_RAIL_HIT_PADDING_PX,
  getArrangeRailItemTargetFromElement,
  getArrangeRailInsertionTargetFromElement,
} from './arrange-hit-testing'
import {
  EMPTY_ARRANGE_SELECTION,
  isSelectionModifier,
  moveSelectedDomainsByInsertion,
  moveSelectedDomainsToTrash,
  moveSelectedItemsByInsertion,
  moveSelectedParentTabsToTrash,
  moveSelectedSpacesToDomain,
  moveSelectedSpacesToTrash,
  moveSelectedSpacesWithinDomain,
  moveSelectedSubTabsToParentTab,
  moveSelectedSubTabsToTrash,
  normalizeArrangeSelection,
  updateArrangeSelectionForClick,
} from './arrange-selection'
import { copyTabArrangeCarryPreview, isSubTabDropOnSourceSpace } from './arrange-guided-prompt'
import { collectAppNavigationEntityIds, createReservedIdAllocator } from '../state/navigation-ids'
import { createTab } from '../state/workspace'
import type {
  AppState,
  ArrangeDragItem,
  ArrangeDragSeed,
  ArrangeHierarchyDropRequest,
  ArrangeInsertPosition,
  ArrangeModeState,
  ArrangeSelectionState,
  ArrangeScope,
  ArrangeSource,
  ArrangeTapCandidate,
  ArrangeTapCandidateSeed,
  ContextMenuState,
  Domain,
  DomainArrangeDragPreview,
  Space,
  SpaceArrangeDragPreview,
  Tab,
  TabArrangeDragItem,
  TabArrangeDragPreview,
  SelectionClickModifiers,
  ViewMode,
  WorkspaceData,
} from '../types/app'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'
export type ArrangeHierarchyRevealLevel = 0 | 1 | 2

type UseArrangeModeParams = {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  viewMode: ViewMode
  editing: { type: EditableEntityType; id: string } | null
  contextMenu: ContextMenuState | null
  workspace: WorkspaceData
  activeTab: Tab
  flushPendingContent: () => void
  updateActiveSpaceData: (updater: (data: WorkspaceData) => WorkspaceData) => void
  setMenuOpen: Dispatch<SetStateAction<boolean>>
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>
  setEditing: Dispatch<SetStateAction<{ type: EditableEntityType; id: string } | null>>
  closeAisleEditModal: () => void
  onArrangeHierarchyDrop?: (request: ArrangeHierarchyDropRequest, carriedPreview: TabArrangeDragPreview) => void
  onArrangeDomainMoveBlocked?: (reason: 'last-domain') => void
  onArrangeSpaceMoveBlocked?: (reason: 'last-space') => void
}

function areArrangeSelectionsEqual(left: ArrangeSelectionState, right: ArrangeSelectionState) {
  return (
    left.kind === right.kind &&
    left.parentTabId === right.parentTabId &&
    left.domainId === right.domainId &&
    left.anchorId === right.anchorId &&
    left.selectedIds.length === right.selectedIds.length &&
    left.selectedIds.every((id, index) => id === right.selectedIds[index])
  )
}

export function getNextArrangeHierarchyRevealLevel(
  currentLevel: ArrangeHierarchyRevealLevel,
  persistedLevel: ArrangeHierarchyRevealLevel,
): ArrangeHierarchyRevealLevel {
  const visibleLevel = Math.max(currentLevel, persistedLevel)
  return visibleLevel >= 2 ? 2 : ((visibleLevel + 1) as ArrangeHierarchyRevealLevel)
}

export function useArrangeMode({
  state,
  setState,
  viewMode,
  editing,
  contextMenu,
  workspace,
  activeTab,
  flushPendingContent,
  updateActiveSpaceData,
  setMenuOpen,
  setContextMenu,
  setEditing,
  closeAisleEditModal,
  onArrangeHierarchyDrop,
  onArrangeDomainMoveBlocked,
  onArrangeSpaceMoveBlocked,
}: UseArrangeModeParams) {
  const [mode, setMode] = useState<ArrangeModeState>(DEFAULT_ARRANGE_MODE)
  const [hierarchyRevealLevel, setHierarchyRevealLevel] = useState<ArrangeHierarchyRevealLevel>(0)
  const [draggingItem, setDraggingItem] = useState<ArrangeDragItem | null>(null)
  const [domainDragPreview, setDomainDragPreview] = useState<DomainArrangeDragPreview | null>(null)
  const [spaceDragPreview, setSpaceDragPreview] = useState<SpaceArrangeDragPreview | null>(null)
  const [tabDragPreview, setTabDragPreview] = useState<TabArrangeDragPreview | null>(null)
  const [selection, setSelection] = useState<ArrangeSelectionState>(EMPTY_ARRANGE_SELECTION)

  const primaryTabRailRef = useRef<HTMLDivElement | null>(null)
  const subTabRailRef = useRef<HTMLDivElement | null>(null)
  const domainsGridRef = useRef<HTMLDivElement | null>(null)
  const spacesGridRef = useRef<HTMLDivElement | null>(null)
  const trashDropRef = useRef<HTMLButtonElement | null>(null)
  const pressTimerRef = useRef<number | null>(null)
  const tapCandidateRef = useRef<ArrangeTapCandidate | null>(null)
  const dragSeedRef = useRef<ArrangeDragSeed | null>(null)
  const domainDragRef = useRef<DomainArrangeDragPreview | null>(null)
  const spaceDragRef = useRef<SpaceArrangeDragPreview | null>(null)
  const tabDragRef = useRef<TabArrangeDragPreview | null>(null)
  const tabDragGroupRef = useRef<{ item: TabArrangeDragItem; ids: string[] } | null>(null)
  const tabDragWindowCleanupRef = useRef<(() => void) | null>(null)
  const suppressClickRef = useRef<Set<string>>(new Set())
  const suppressNextDomainArrangeExitRef = useRef(false)
  const suppressNextSpaceArrangeExitRef = useRef(false)
  const isDraggingOverTrashDropRef = useRef(false)
  const [isDraggingOverTrashDrop, setIsDraggingOverTrashDrop] = useState(false)

  const clearPressTimer = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }

  const clearTapCandidate = () => {
    tapCandidateRef.current = null
  }

  const clearDragSeed = () => {
    dragSeedRef.current = null
  }

  const clearSelection = () => {
    setSelection(EMPTY_ARRANGE_SELECTION)
  }

  const setTrashDropTarget = (active: boolean) => {
    if (isDraggingOverTrashDropRef.current === active) return
    isDraggingOverTrashDropRef.current = active
    setIsDraggingOverTrashDrop(active)
  }

  const detachTabDragWindowListeners = () => {
    tabDragWindowCleanupRef.current?.()
    tabDragWindowCleanupRef.current = null
  }

  const startDragSeed = (key: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    dragSeedRef.current = {
      key,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const startTapCandidate = (candidate: ArrangeTapCandidateSeed, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!mode.active || event.button !== 0) return
    tapCandidateRef.current = {
      ...candidate,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
    }
  }

  const markTapDragged = (key: string) => {
    const candidate = tapCandidateRef.current
    if (!candidate || candidate.key !== key) return
    tapCandidateRef.current = {
      ...candidate,
      dragged: true,
    }
  }

  const markClickSuppressed = (...keys: string[]) => {
    keys.forEach((key) => suppressClickRef.current.add(key))
  }

  const consumeClickSuppression = (key: string) => {
    if (!suppressClickRef.current.has(key)) return false
    suppressClickRef.current.delete(key)
    return true
  }

  const finalizeTapCandidate = (
    key: string,
    event: ReactPointerEvent<HTMLButtonElement>,
    onActivate: () => void,
  ) => {
    if (!mode.active) return
    const candidate = tapCandidateRef.current
    tapCandidateRef.current = null
    if (!candidate || candidate.key !== key || candidate.dragged) return
    const deltaX = event.clientX - candidate.startX
    const deltaY = event.clientY - candidate.startY
    if (Math.hypot(deltaX, deltaY) > ARRANGE_TAP_SLOP_PX) return
    if (consumeClickSuppression(key)) return
    onActivate()
  }

  const enter = (source: ArrangeSource, dragItem: ArrangeDragItem | null = null, suppressClickKey?: string) => {
    flushPendingContent()
    clearPressTimer()
    clearDragSeed()
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    closeAisleEditModal()
    if (suppressClickKey) {
      markClickSuppressed(suppressClickKey)
    }
    const scope: ArrangeScope | null =
      dragItem?.type === 'domain'
        ? 'domains'
        : dragItem?.type === 'space'
          ? 'spaces'
          : dragItem?.type === 'tab' || dragItem?.type === 'subtab'
            ? 'tabs'
            : viewMode === 'main'
              ? 'tabs'
              : null
    setMode({
      active: true,
      scope,
      source,
      dragItem,
      overParentTabId: null,
      overParentInsert: null,
      overSubTabId: null,
      overSubTabInsert: null,
      overSpaceId: null,
      overSpaceInsert: null,
      overDomainId: null,
      overDomainInsert: null,
    })
  }

  const enterArrangeModeForSelection = (scope: ArrangeScope) => {
    if (mode.active && mode.scope === scope) return
    enter('press')
    setMode((previous) => (previous.active ? { ...previous, scope } : previous))
  }

  const handleParentSelectionClick = (tabId: string, modifiers: SelectionClickModifiers) => {
    if (viewMode !== 'main' || !isSelectionModifier(modifiers)) return false
    clearPressTimer()
    clearTapCandidate()
    clearDragSeed()
    enterArrangeModeForSelection('tabs')
    setSelection((previous) =>
      updateArrangeSelectionForClick({
        selection: previous,
        kind: 'parent',
        itemId: tabId,
        orderedIds: workspace.tabs.map((tab) => tab.id),
        currentId: workspace.activeTabId,
        modifiers,
      }),
    )
    return true
  }

  const handleSubTabSelectionClick = (
    parentTabId: string,
    subTabId: string,
    modifiers: SelectionClickModifiers,
  ) => {
    if (viewMode !== 'main' || !isSelectionModifier(modifiers) || parentTabId !== activeTab.id) return false
    clearPressTimer()
    clearTapCandidate()
    clearDragSeed()
    enterArrangeModeForSelection('tabs')
    setSelection((previous) =>
      updateArrangeSelectionForClick({
        selection: previous,
        kind: 'subtab',
        parentTabId,
        itemId: subTabId,
        orderedIds: activeTab.subTabs.map((subTab) => subTab.id),
        currentId: activeTab.activeSubTabId,
        modifiers,
      }),
    )
    return true
  }

  const handleDomainSelectionClick = (domainId: string, modifiers: SelectionClickModifiers) => {
    if (viewMode !== 'main' || !isSelectionModifier(modifiers)) return false
    clearPressTimer()
    clearTapCandidate()
    clearDragSeed()
    enterArrangeModeForSelection('domains')
    setSelection((previous) =>
      updateArrangeSelectionForClick({
        selection: previous,
        kind: 'domain',
        itemId: domainId,
        orderedIds: state.domains.map((domain) => domain.id),
        currentId: state.activeDomainId,
        modifiers,
      }),
    )
    return true
  }

  const handleSpaceSelectionClick = (spaceId: string, modifiers: SelectionClickModifiers) => {
    if (viewMode !== 'main' || !isSelectionModifier(modifiers)) return false
    clearPressTimer()
    clearTapCandidate()
    clearDragSeed()
    enterArrangeModeForSelection('spaces')
    setSelection((previous) =>
      updateArrangeSelectionForClick({
        selection: previous,
        kind: 'space',
        domainId: state.activeDomainId,
        itemId: spaceId,
        orderedIds: state.spaces.map((space) => space.id),
        currentId: state.activeSpaceId,
        modifiers,
      }),
    )
    return true
  }

  const exit = () => {
    clearPressTimer()
    clearTapCandidate()
    clearDragSeed()
    suppressClickRef.current.clear()
    domainDragRef.current = null
    spaceDragRef.current = null
    tabDragRef.current = null
    tabDragGroupRef.current = null
    detachTabDragWindowListeners()
    suppressNextDomainArrangeExitRef.current = false
    suppressNextSpaceArrangeExitRef.current = false
    setTrashDropTarget(false)
    setDraggingItem(null)
    setDomainDragPreview(null)
    setSpaceDragPreview(null)
    setTabDragPreview(null)
    setHierarchyRevealLevel(0)
    clearSelection()
    setMode(DEFAULT_ARRANGE_MODE)
  }

  const advanceHierarchyReveal = () => {
    if (!mode.active || viewMode !== 'main') return
    const persistedHierarchyLevel: ArrangeHierarchyRevealLevel = state.ui.alwaysShowDomains
      ? 2
      : state.ui.alwaysShowSpaces
        ? 1
        : 0
    setHierarchyRevealLevel((level) => getNextArrangeHierarchyRevealLevel(level, persistedHierarchyLevel))
  }

  const startPress = (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragItem: ArrangeDragItem | null,
    suppressClickKey: string,
  ) => {
    if (viewMode !== 'main' || editing || mode.active) return
    if (event.button !== 0) return
    clearPressTimer()
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null
      enter('press', dragItem, suppressClickKey)
    }, ARRANGE_PRESS_DELAY_MS)
  }

  const buildDragItemFromContextMenu = (): ArrangeDragItem | null => {
    if (!contextMenu) return null
    if (contextMenu.type === 'tab') {
      return { type: 'tab', tabId: contextMenu.tabId }
    }
    if (contextMenu.type === 'subtab') {
      return {
        type: 'subtab',
        parentTabId: contextMenu.tabId,
        subTabId: contextMenu.subTabId,
      }
    }
    if (contextMenu.type === 'space') {
      return { type: 'space', spaceId: contextMenu.spaceId }
    }
    if (contextMenu.type === 'domain') {
      return { type: 'domain', domainId: contextMenu.domainId }
    }
    return null
  }

  const enterFromContext = () => {
    const dragItem = buildDragItemFromContextMenu()
    if (!dragItem) return
    enter('context', dragItem)
  }

  const prepareForDrag = (dragItem: ArrangeDragItem) => {
    flushPendingContent()
    clearPressTimer()
    clearTapCandidate()
    clearDragSeed()
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    setDraggingItem(dragItem)
    setTrashDropTarget(false)
    const scope: ArrangeScope = dragItem.type === 'domain' ? 'domains' : dragItem.type === 'space' ? 'spaces' : 'tabs'
    setMode({
      active: true,
      scope,
      source: 'press',
      dragItem,
      overParentTabId: dragItem.type === 'tab' ? dragItem.tabId : null,
      overParentInsert: dragItem.type === 'tab' ? 'after' : null,
      overSubTabId: dragItem.type === 'subtab' ? dragItem.subTabId : null,
      overSubTabInsert: dragItem.type === 'subtab' ? 'after' : null,
      overSpaceId: dragItem.type === 'space' ? dragItem.spaceId : null,
      overSpaceInsert: dragItem.type === 'space' ? 'after' : null,
      overDomainId: dragItem.type === 'domain' ? dragItem.domainId : null,
      overDomainInsert: dragItem.type === 'domain' ? 'after' : null,
    })
  }

  const getDomainInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    return getArrangeRailInsertionTargetFromElement(
      domainsGridRef.current,
      '[data-arrange-domain-id]',
      'data-arrange-domain-id',
      clientX,
      clientY,
      EXACT_RAIL_HIT_PADDING_PX,
    )
  }

  const getDomainItemTargetFromPoint = (clientX: number, clientY: number) => {
    return getArrangeRailItemTargetFromElement(
      domainsGridRef.current,
      '[data-arrange-domain-id]',
      'data-arrange-domain-id',
      clientX,
      clientY,
    )
  }

  const clearDomainDropTarget = () => {
    setMode((previous) =>
      previous.active
        ? {
            ...previous,
            overDomainId: null,
            overDomainInsert: null,
          }
        : previous,
    )
  }

  const updateDomainDropTarget = (clientX: number, clientY: number) => {
    const insertionTarget = getDomainInsertionTargetFromPoint(clientX, clientY)
    if (!insertionTarget) {
      clearDomainDropTarget()
      return null
    }
    const draggedDomainIds = domainDragRef.current?.selectedDomainIds ?? []
    if (draggedDomainIds.includes(insertionTarget.targetId)) {
      clearDomainDropTarget()
      return null
    }

    setMode((previous) =>
      previous.overDomainId === insertionTarget.targetId && previous.overDomainInsert === insertionTarget.position
        ? previous
        : {
            ...previous,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: null,
            overSpaceInsert: null,
            overDomainId: insertionTarget.targetId,
            overDomainInsert: insertionTarget.position,
          },
    )
    return insertionTarget
  }

  const clearDomainPointerDrag = () => {
    domainDragRef.current = null
    setDomainDragPreview(null)
  }

  const suppressNextDomainArrangeExitClick = () => {
    suppressNextDomainArrangeExitRef.current = true
    window.setTimeout(() => {
      suppressNextDomainArrangeExitRef.current = false
    }, 0)
  }

  const getSelectedDomainDragIds = (domainId: string) => {
    if (selection.kind !== 'domain' || !selection.selectedIds.includes(domainId)) return [domainId]
    const selectedIdSet = new Set(selection.selectedIds)
    return state.domains.filter((domain) => selectedIdSet.has(domain.id)).map((domain) => domain.id)
  }

  const getDomainDragPreviewLabel = (domainId: string, fallbackLabel: string) => {
    const dragIds = getSelectedDomainDragIds(domainId)
    if (dragIds.length <= 1) return fallbackLabel
    const firstLabel = state.domains.find((domain) => domain.id === dragIds[0])?.name
    return `${firstLabel ?? fallbackLabel} + ${dragIds.length - 1}`
  }

  const startDomainPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, domain: Domain) => {
    if (viewMode !== 'main') return
    const rect = event.currentTarget.getBoundingClientRect()
    const itemIsSelected = selection.kind === 'domain' && selection.selectedIds.includes(domain.id)
    const dragIds = itemIsSelected ? getSelectedDomainDragIds(domain.id) : [domain.id]
    const nextDrag: DomainArrangeDragPreview = {
      domainId: domain.id,
      selectedDomainIds: dragIds,
      label: itemIsSelected ? getDomainDragPreviewLabel(domain.id, domain.name) : domain.name,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }

    clearPressTimer()
    markTapDragged(`domain:${domain.id}`)
    if (!itemIsSelected) {
      clearSelection()
    }
    prepareForDrag({ type: 'domain', domainId: domain.id })
    domainDragRef.current = nextDrag
    setDomainDragPreview(nextDrag)
    updateDomainDropTarget(event.clientX, event.clientY)
  }

  const updateDomainPointerDrag = (clientX: number, clientY: number) => {
    const drag = domainDragRef.current
    if (!drag) return
    const nextDrag: DomainArrangeDragPreview = {
      ...drag,
      currentX: clientX,
      currentY: clientY,
    }
    domainDragRef.current = nextDrag
    setDomainDragPreview(nextDrag)
    if (isPointOverTrashDrop(clientX, clientY)) {
      setTrashDropTarget(true)
      clearDomainDropTarget()
      return
    }
    setTrashDropTarget(false)
    updateDomainDropTarget(clientX, clientY)
  }

  const moveDomainToTarget = (
    draggedDomainIds: string[],
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    if (draggedDomainIds.includes(insertionTarget.targetId)) return
    setState((previous) =>
      moveSelectedDomainsByInsertion(previous, draggedDomainIds, insertionTarget.targetId, insertionTarget.position),
    )
  }

  const finishDomainPointerDrag = (clientX: number, clientY: number) => {
    const drag = domainDragRef.current
    if (!drag) return false

    const insertionTarget = getDomainInsertionTargetFromPoint(clientX, clientY)
    const dragIds = drag.selectedDomainIds ?? [drag.domainId]
    markClickSuppressed(`domain:${drag.domainId}`)
    if (isPointOverTrashDrop(clientX, clientY)) {
      const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(state))
      setState((previous) => {
        const result = moveSelectedDomainsToTrash(previous, dragIds, createEntityId)
        if (result.reason === 'last-domain') onArrangeDomainMoveBlocked?.('last-domain')
        return result.state
      })
      setTrashDropTarget(false)
      clearSelection()
      clearDomainPointerDrag()
      clearTapCandidate()
      clearDragSeed()
      setDraggingItem(null)
      setMode((previous) =>
        previous.active
          ? {
              ...previous,
              dragItem: null,
              overParentTabId: null,
              overParentInsert: null,
              overSubTabId: null,
              overSubTabInsert: null,
              overSpaceId: null,
              overSpaceInsert: null,
              overDomainId: null,
              overDomainInsert: null,
            }
          : previous,
      )
      return true
    }
    if (insertionTarget) {
      markClickSuppressed(`domain:${insertionTarget.targetId}`)
      moveDomainToTarget(dragIds, insertionTarget)
    }

    suppressNextDomainArrangeExitClick()
    clearSelection()
    clearDomainPointerDrag()
    clearTapCandidate()
    clearDragSeed()
    setDraggingItem(null)
    setMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: null,
            overSpaceInsert: null,
            overDomainId: null,
            overDomainInsert: null,
          }
        : previous,
    )
    return true
  }

  const cancelDomainPointerDrag = () => {
    clearDomainPointerDrag()
    clearTapCandidate()
    clearDragSeed()
    clearPressTimer()
    setTrashDropTarget(false)
    setDraggingItem(null)
    setMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overDomainId: null,
            overDomainInsert: null,
          }
        : previous,
    )
  }

  const handleDomainPointerMove = (event: ReactPointerEvent<HTMLButtonElement>, domain: Domain) => {
    if (event.buttons !== 1) return

    const activeDrag = domainDragRef.current
    if (activeDrag?.domainId === domain.id) {
      event.preventDefault()
      markTapDragged(`domain:${domain.id}`)
      updateDomainPointerDrag(event.clientX, event.clientY)
      return
    }

    const seed = dragSeedRef.current
    if (!seed || seed.key !== `domain:${domain.id}`) return
    const deltaX = event.clientX - seed.startX
    const deltaY = event.clientY - seed.startY
    if (Math.hypot(deltaX, deltaY) < ARRANGE_DRAG_START_SLOP_PX) return

    event.preventDefault()
    startDomainPointerDrag(event, domain)
  }

  const handleDomainPointerUp = (
    event: ReactPointerEvent<HTMLButtonElement>,
    domainId: string,
    onTapWhileArranging: () => void = exit,
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (finishDomainPointerDrag(event.clientX, event.clientY)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    clearDragSeed()
    if (mode.active && mode.scope === 'domains') {
      finalizeTapCandidate(`domain:${domainId}`, event, onTapWhileArranging)
      return
    }
    clearPressTimer()
  }

  const getSpaceInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    return getArrangeRailInsertionTargetFromElement(
      spacesGridRef.current,
      '[data-arrange-space-id]',
      'data-arrange-space-id',
      clientX,
      clientY,
      EXACT_RAIL_HIT_PADDING_PX,
    )
  }

  const getSpaceItemTargetFromPoint = (clientX: number, clientY: number) => {
    return getArrangeRailItemTargetFromElement(
      spacesGridRef.current,
      '[data-arrange-space-id]',
      'data-arrange-space-id',
      clientX,
      clientY,
    )
  }

  const clearSpaceDropTarget = () => {
    setMode((previous) =>
      previous.active
        ? {
            ...previous,
            overSpaceId: null,
            overSpaceInsert: null,
            overDomainId: null,
            overDomainInsert: null,
          }
        : previous,
    )
  }

  const updateSpaceDropTarget = (clientX: number, clientY: number) => {
    const insertionTarget = getSpaceInsertionTargetFromPoint(clientX, clientY)
    if (!insertionTarget) {
      clearSpaceDropTarget()
      return null
    }
    const draggedSpaceIds = spaceDragRef.current?.selectedSpaceIds ?? []
    if (draggedSpaceIds.includes(insertionTarget.targetId)) {
      clearSpaceDropTarget()
      return null
    }

    setMode((previous) =>
      previous.overSpaceId === insertionTarget.targetId && previous.overSpaceInsert === insertionTarget.position
        ? previous
        : {
            ...previous,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: insertionTarget.targetId,
            overSpaceInsert: insertionTarget.position,
            overDomainId: null,
            overDomainInsert: null,
          },
    )
    return insertionTarget
  }

  const clearSpacePointerDrag = () => {
    spaceDragRef.current = null
    setSpaceDragPreview(null)
  }

  const suppressNextSpaceArrangeExitClick = () => {
    suppressNextSpaceArrangeExitRef.current = true
    window.setTimeout(() => {
      suppressNextSpaceArrangeExitRef.current = false
    }, 0)
  }

  const getSelectedSpaceDragIds = (spaceId: string) => {
    if (
      selection.kind !== 'space' ||
      selection.domainId !== state.activeDomainId ||
      !selection.selectedIds.includes(spaceId)
    ) {
      return [spaceId]
    }
    const selectedIdSet = new Set(selection.selectedIds)
    return state.spaces.filter((entry) => selectedIdSet.has(entry.id)).map((entry) => entry.id)
  }

  const getSpaceDragPreviewLabel = (spaceId: string, fallbackLabel: string) => {
    const dragIds = getSelectedSpaceDragIds(spaceId)
    if (dragIds.length <= 1) return fallbackLabel
    const firstLabel = state.spaces.find((entry) => entry.id === dragIds[0])?.name
    return `${firstLabel ?? fallbackLabel} + ${dragIds.length - 1}`
  }

  const startSpacePointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, space: Space) => {
    if (viewMode !== 'main') return
    const rect = event.currentTarget.getBoundingClientRect()
    const itemIsSelected =
      selection.kind === 'space' && selection.domainId === state.activeDomainId && selection.selectedIds.includes(space.id)
    const dragIds = itemIsSelected ? getSelectedSpaceDragIds(space.id) : [space.id]
    const nextDrag: SpaceArrangeDragPreview = {
      spaceId: space.id,
      sourceDomainId: state.activeDomainId,
      selectedSpaceIds: dragIds,
      label: itemIsSelected ? getSpaceDragPreviewLabel(space.id, space.name) : space.name,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }

    clearPressTimer()
    markTapDragged(`space:${space.id}`)
    if (!itemIsSelected) {
      clearSelection()
    }
    prepareForDrag({ type: 'space', spaceId: space.id })
    spaceDragRef.current = nextDrag
    setSpaceDragPreview(nextDrag)
    updateSpaceDropTarget(event.clientX, event.clientY)
  }

  const updateSpacePointerDrag = (clientX: number, clientY: number) => {
    const drag = spaceDragRef.current
    if (!drag) return
    const nextDrag: SpaceArrangeDragPreview = {
      ...drag,
      currentX: clientX,
      currentY: clientY,
    }
    spaceDragRef.current = nextDrag
    setSpaceDragPreview(nextDrag)
    if (isPointOverTrashDrop(clientX, clientY)) {
      setTrashDropTarget(true)
      clearSpaceDropTarget()
      return
    }
    setTrashDropTarget(false)
    const domainTarget = getDomainItemTargetFromPoint(clientX, clientY)
    if (domainTarget) {
      setMode((previous) =>
        previous.overDomainId === domainTarget.targetId &&
        previous.overDomainInsert === null &&
        previous.overSpaceId === null &&
        previous.overSpaceInsert === null
          ? previous
          : {
              ...previous,
              overParentTabId: null,
              overParentInsert: null,
              overSubTabId: null,
              overSubTabInsert: null,
              overSpaceId: null,
              overSpaceInsert: null,
              overDomainId: domainTarget.targetId,
              overDomainInsert: null,
            },
      )
      return
    }
    updateSpaceDropTarget(clientX, clientY)
  }

  const moveSpaceToTarget = (
    draggedSpaceIds: string[],
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    if (draggedSpaceIds.includes(insertionTarget.targetId)) return
    setState((previous) =>
      moveSelectedSpacesWithinDomain(
        previous,
        state.activeDomainId,
        draggedSpaceIds,
        insertionTarget.targetId,
        insertionTarget.position,
      ),
    )
  }

  const finishSpacePointerDrag = (clientX: number, clientY: number) => {
    const drag = spaceDragRef.current
    if (!drag) return false

    const insertionTarget = getSpaceInsertionTargetFromPoint(clientX, clientY)
    const dragIds = drag.selectedSpaceIds ?? [drag.spaceId]
    markClickSuppressed(`space:${drag.spaceId}`)
    if (isPointOverTrashDrop(clientX, clientY)) {
      const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(state))
      setState((previous) => {
        const result = moveSelectedSpacesToTrash(previous, drag.sourceDomainId, dragIds, createEntityId)
        if (result.reason === 'last-space') onArrangeSpaceMoveBlocked?.('last-space')
        return result.state
      })
      setTrashDropTarget(false)
      clearSelection()
      clearSpacePointerDrag()
      clearTapCandidate()
      clearDragSeed()
      setDraggingItem(null)
      setMode((previous) =>
        previous.active
          ? {
              ...previous,
              dragItem: null,
              overParentTabId: null,
              overParentInsert: null,
              overSubTabId: null,
              overSubTabInsert: null,
              overSpaceId: null,
              overSpaceInsert: null,
              overDomainId: null,
              overDomainInsert: null,
            }
          : previous,
      )
      return true
    }
    const domainTarget = getDomainItemTargetFromPoint(clientX, clientY)
    if (domainTarget) {
      markClickSuppressed(`domain:${domainTarget.targetId}`)
      setState((previous) => {
        const result = moveSelectedSpacesToDomain(previous, drag.sourceDomainId, dragIds, domainTarget.targetId)
        if (result.reason === 'last-space') onArrangeSpaceMoveBlocked?.('last-space')
        return result.state
      })
      suppressNextSpaceArrangeExitClick()
      clearSelection()
      clearSpacePointerDrag()
      clearTapCandidate()
      clearDragSeed()
      setDraggingItem(null)
      setMode((previous) =>
        previous.active
          ? {
              ...previous,
              dragItem: null,
              overParentTabId: null,
              overParentInsert: null,
              overSubTabId: null,
              overSubTabInsert: null,
              overSpaceId: null,
              overSpaceInsert: null,
              overDomainId: null,
              overDomainInsert: null,
            }
          : previous,
      )
      return true
    }
    if (insertionTarget) {
      markClickSuppressed(`space:${insertionTarget.targetId}`)
      moveSpaceToTarget(dragIds, insertionTarget)
    }

    suppressNextSpaceArrangeExitClick()
    clearSelection()
    clearSpacePointerDrag()
    clearTapCandidate()
    clearDragSeed()
    setDraggingItem(null)
    setMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: null,
            overSpaceInsert: null,
            overDomainId: null,
            overDomainInsert: null,
          }
        : previous,
    )
    return true
  }

  const cancelSpacePointerDrag = () => {
    clearSpacePointerDrag()
    clearTapCandidate()
    clearDragSeed()
    clearPressTimer()
    setTrashDropTarget(false)
    setDraggingItem(null)
    setMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overSpaceId: null,
            overSpaceInsert: null,
            overDomainId: null,
            overDomainInsert: null,
          }
        : previous,
    )
  }

  const handleSpacePointerMove = (event: ReactPointerEvent<HTMLButtonElement>, space: Space) => {
    if (event.buttons !== 1) return

    const activeDrag = spaceDragRef.current
    if (activeDrag?.spaceId === space.id) {
      event.preventDefault()
      markTapDragged(`space:${space.id}`)
      updateSpacePointerDrag(event.clientX, event.clientY)
      return
    }

    const seed = dragSeedRef.current
    if (!seed || seed.key !== `space:${space.id}`) return
    const deltaX = event.clientX - seed.startX
    const deltaY = event.clientY - seed.startY
    if (Math.hypot(deltaX, deltaY) < ARRANGE_DRAG_START_SLOP_PX) return

    event.preventDefault()
    startSpacePointerDrag(event, space)
  }

  const handleSpacePointerUp = (
    event: ReactPointerEvent<HTMLButtonElement>,
    spaceId: string,
    onTapWhileArranging: () => void = exit,
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (finishSpacePointerDrag(event.clientX, event.clientY)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    clearDragSeed()
    if (mode.active && mode.scope === 'spaces') {
      finalizeTapCandidate(`space:${spaceId}`, event, onTapWhileArranging)
      return
    }
    clearPressTimer()
  }

  const getParentInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    return getArrangeRailInsertionTargetFromElement(
      primaryTabRailRef.current,
      '[data-arrange-tab-id]',
      'data-arrange-tab-id',
      clientX,
      clientY,
      TAB_RAIL_HIT_PADDING_PX,
    )
  }

  const getSubTabInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    return getArrangeRailInsertionTargetFromElement(
      subTabRailRef.current,
      '[data-arrange-subtab-id]',
      'data-arrange-subtab-id',
      clientX,
      clientY,
      TAB_RAIL_HIT_PADDING_PX,
    )
  }

  const clearTabDropTarget = () => {
    setMode((previous) =>
      previous.active
        ? {
            ...previous,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: null,
            overSpaceInsert: null,
            overDomainId: null,
            overDomainInsert: null,
          }
        : previous,
    )
  }

  const isPointOverTrashDrop = (clientX: number, clientY: number) =>
    isPointInsideElementExact(trashDropRef.current, clientX, clientY)

  const isSameTabArrangeItem = (left: TabArrangeDragItem, right: TabArrangeDragItem) =>
    left.type === right.type &&
    (left.type === 'tab'
      ? right.type === 'tab' && left.tabId === right.tabId
      : right.type === 'subtab' && left.parentTabId === right.parentTabId && left.subTabId === right.subTabId)

  const isTabArrangeItemSelected = (item: TabArrangeDragItem) => {
    if (item.type === 'tab') {
      return selection.kind === 'parent' && selection.selectedIds.includes(item.tabId)
    }
    return (
      selection.kind === 'subtab' &&
      selection.parentTabId === item.parentTabId &&
      selection.selectedIds.includes(item.subTabId)
    )
  }

  const getSelectedParentDragIds = (tabId: string) => {
    if (selection.kind !== 'parent' || !selection.selectedIds.includes(tabId)) return [tabId]
    const selectedIdSet = new Set(selection.selectedIds)
    return workspace.tabs.filter((tab) => selectedIdSet.has(tab.id)).map((tab) => tab.id)
  }

  const getSelectedSubTabDragIds = (parentTabId: string, subTabId: string) => {
    if (
      selection.kind !== 'subtab' ||
      selection.parentTabId !== parentTabId ||
      !selection.selectedIds.includes(subTabId)
    ) {
      return [subTabId]
    }
    const selectedIdSet = new Set(selection.selectedIds)
    return activeTab.subTabs.filter((subTab) => selectedIdSet.has(subTab.id)).map((subTab) => subTab.id)
  }

  const getTabDragIds = (item: TabArrangeDragItem) =>
    item.type === 'tab' ? getSelectedParentDragIds(item.tabId) : getSelectedSubTabDragIds(item.parentTabId, item.subTabId)

  const getActiveTabDragIds = (item: TabArrangeDragItem) => {
    const activeGroup = tabDragGroupRef.current
    if (activeGroup && isSameTabArrangeItem(activeGroup.item, item)) return activeGroup.ids
    return getTabDragIds(item)
  }

  const getTabDragPreviewLabel = (item: TabArrangeDragItem, fallbackLabel: string) => {
    const dragIds = getTabDragIds(item)
    if (dragIds.length <= 1) return fallbackLabel
    const firstLabel =
      item.type === 'tab'
        ? workspace.tabs.find((tab) => tab.id === dragIds[0])?.title
        : activeTab.subTabs.find((subTab) => subTab.id === dragIds[0])?.title
    return `${firstLabel ?? fallbackLabel} + ${dragIds.length - 1}`
  }

  const updateTabDropTarget = (item: TabArrangeDragItem, clientX: number, clientY: number) => {
    if (isPointOverTrashDrop(clientX, clientY)) {
      setTrashDropTarget(true)
      clearTabDropTarget()
      return { type: 'trash' as const }
    }

    setTrashDropTarget(false)

    if (item.type === 'tab') {
      const dragIds = getActiveTabDragIds(item)
      const domainTarget = getDomainItemTargetFromPoint(clientX, clientY)
      if (domainTarget) {
        setMode((previous) =>
          previous.overDomainId === domainTarget.targetId &&
          previous.overDomainInsert === null &&
          previous.overSpaceId === null &&
          previous.overSpaceInsert === null
            ? previous
            : {
                ...previous,
                overParentTabId: null,
                overParentInsert: null,
                overSubTabId: null,
                overSubTabInsert: null,
                overSpaceId: null,
                overSpaceInsert: null,
                overDomainId: domainTarget.targetId,
                overDomainInsert: null,
              },
        )
        return { type: 'domain' as const, target: domainTarget }
      }

      const spaceTarget = getSpaceItemTargetFromPoint(clientX, clientY)
      if (spaceTarget) {
        setMode((previous) =>
          previous.overSpaceId === spaceTarget.targetId &&
          previous.overSpaceInsert === null &&
          previous.overDomainId === null &&
          previous.overDomainInsert === null
            ? previous
            : {
                ...previous,
                overParentTabId: null,
                overParentInsert: null,
                overSubTabId: null,
                overSubTabInsert: null,
                overSpaceId: spaceTarget.targetId,
                overSpaceInsert: null,
                overDomainId: null,
                overDomainInsert: null,
              },
        )
        return { type: 'space' as const, target: spaceTarget }
      }

      const parentTarget = getParentInsertionTargetFromPoint(clientX, clientY)
      if (!parentTarget || dragIds.includes(parentTarget.targetId)) {
        clearTabDropTarget()
        return null
      }

      setMode((previous) =>
        previous.overParentTabId === parentTarget.targetId && previous.overParentInsert === parentTarget.position
          ? previous
          : {
              ...previous,
              overParentTabId: parentTarget.targetId,
              overParentInsert: parentTarget.position,
              overSubTabId: null,
              overSubTabInsert: null,
              overSpaceId: null,
              overSpaceInsert: null,
              overDomainId: null,
              overDomainInsert: null,
            },
      )
      return { type: 'parent' as const, target: parentTarget }
    }

    if (item.type === 'subtab') {
      const dragIds = getActiveTabDragIds(item)
      const domainTarget = getDomainItemTargetFromPoint(clientX, clientY)
      if (domainTarget) {
        setMode((previous) =>
          previous.overDomainId === domainTarget.targetId &&
          previous.overDomainInsert === null &&
          previous.overSpaceId === null &&
          previous.overSpaceInsert === null
            ? previous
            : {
                ...previous,
                overParentTabId: null,
                overParentInsert: null,
                overSubTabId: null,
                overSubTabInsert: null,
                overSpaceId: null,
                overSpaceInsert: null,
                overDomainId: domainTarget.targetId,
                overDomainInsert: null,
              },
        )
        return { type: 'domain' as const, target: domainTarget }
      }

      const spaceTarget = getSpaceItemTargetFromPoint(clientX, clientY)
      if (spaceTarget) {
        setMode((previous) =>
          previous.overSpaceId === spaceTarget.targetId &&
          previous.overSpaceInsert === null &&
          previous.overDomainId === null &&
          previous.overDomainInsert === null
            ? previous
            : {
                ...previous,
                overParentTabId: null,
                overParentInsert: null,
                overSubTabId: null,
                overSubTabInsert: null,
                overSpaceId: spaceTarget.targetId,
                overSpaceInsert: null,
                overDomainId: null,
                overDomainInsert: null,
              },
        )
        return { type: 'space' as const, target: spaceTarget }
      }

      const parentTarget = getParentInsertionTargetFromPoint(clientX, clientY)
      if (parentTarget) {
        setMode((previous) =>
          previous.overParentTabId === parentTarget.targetId &&
          previous.overParentInsert === null &&
          previous.overSubTabId === null &&
          previous.overSubTabInsert === null
            ? previous
            : {
                ...previous,
                overParentTabId: parentTarget.targetId,
                overParentInsert: null,
                overSubTabId: null,
                overSubTabInsert: null,
                overSpaceId: null,
                overSpaceInsert: null,
                overDomainId: null,
                overDomainInsert: null,
              },
        )
        return { type: 'parent' as const, target: parentTarget }
      }

      const subTabTarget = getSubTabInsertionTargetFromPoint(clientX, clientY)
      if (subTabTarget && item.parentTabId === activeTab.id && !dragIds.includes(subTabTarget.targetId)) {
        setMode((previous) =>
          previous.overSubTabId === subTabTarget.targetId && previous.overSubTabInsert === subTabTarget.position
            ? previous
            : {
                ...previous,
                overParentTabId: null,
                overParentInsert: null,
                overSubTabId: subTabTarget.targetId,
                overSubTabInsert: subTabTarget.position,
                overSpaceId: null,
                overSpaceInsert: null,
                overDomainId: null,
                overDomainInsert: null,
              },
        )
        return { type: 'subtab' as const, target: subTabTarget }
      }
    }

    clearTabDropTarget()
    return null
  }

  const clearTabPointerDrag = () => {
    tabDragRef.current = null
    tabDragGroupRef.current = null
    detachTabDragWindowListeners()
    setTabDragPreview(null)
  }

  const cleanupFinishedTabPointerDrag = () => {
    clearTabPointerDrag()
    clearTapCandidate()
    clearDragSeed()
    setTrashDropTarget(false)
    setDraggingItem(null)
    setMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: null,
            overSpaceInsert: null,
            overDomainId: null,
            overDomainInsert: null,
          }
        : previous,
    )
  }

  const startTabPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: TabArrangeDragItem,
    label: string,
    variant: TabArrangeDragPreview['variant'],
  ) => {
    if (viewMode !== 'main') return
    const rect = event.currentTarget.getBoundingClientRect()
    const itemIsSelected = isTabArrangeItemSelected(item)
    const dragIds = itemIsSelected ? getTabDragIds(item) : [item.type === 'tab' ? item.tabId : item.subTabId]
    const previewLabel = itemIsSelected ? getTabDragPreviewLabel(item, label) : label
    const nextDrag: TabArrangeDragPreview = {
      item,
      label: previewLabel,
      variant,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }

    clearPressTimer()
    markTapDragged(item.type === 'tab' ? `tab:${item.tabId}` : `subtab:${item.subTabId}`)
    if (!itemIsSelected) {
      clearSelection()
    }
    prepareForDrag(item)
    tabDragGroupRef.current = { item, ids: dragIds }
    tabDragRef.current = nextDrag
    setTabDragPreview(nextDrag)
    attachTabDragWindowListeners()
    updateTabDropTarget(item, event.clientX, event.clientY)
  }

  const updateTabPointerDrag = (clientX: number, clientY: number) => {
    const drag = tabDragRef.current
    if (!drag) return
    const nextDrag: TabArrangeDragPreview = {
      ...drag,
      currentX: clientX,
      currentY: clientY,
    }
    tabDragRef.current = nextDrag
    setTabDragPreview(nextDrag)
    updateTabDropTarget(drag.item, clientX, clientY)
  }

  const moveParentTabsToTarget = (
    draggedTabIds: string[],
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: moveSelectedItemsByInsertion(data.tabs, draggedTabIds, insertionTarget.targetId, insertionTarget.position),
    }))
  }

  const moveSubTabsToParent = (sourceParentTabId: string, subTabIds: string[], targetParentTabId: string) => {
    updateActiveSpaceData((data) => moveSelectedSubTabsToParentTab(data, sourceParentTabId, subTabIds, targetParentTabId))
  }

  const moveSubTabsToTarget = (
    parentTabId: string,
    subTabIds: string[],
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== parentTabId) return tab
        return {
          ...tab,
          subTabs: moveSelectedItemsByInsertion(tab.subTabs, subTabIds, insertionTarget.targetId, insertionTarget.position),
        }
      }),
    }))
  }

  const moveTabItemsToTrash = (item: TabArrangeDragItem, dragIds: string[]) => {
    const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(state))
    updateActiveSpaceData((data) => {
      const options = {
        createDeletedEntryId: createEntityId,
        createFallbackTab: () => createTab('tab', createEntityId),
      }
      return item.type === 'tab'
        ? moveSelectedParentTabsToTrash(data, dragIds, options)
        : moveSelectedSubTabsToTrash(data, item.parentTabId, dragIds, options)
    })
  }

  const finishTabPointerDrag = (clientX: number, clientY: number) => {
    const drag = tabDragRef.current
    if (!drag) return false

    const { item } = drag
    const sourceKey = item.type === 'tab' ? `tab:${item.tabId}` : `subtab:${item.subTabId}`
    const dragIds = tabDragGroupRef.current?.ids ?? getTabDragIds(item)
    const carriedPreview = copyTabArrangeCarryPreview(drag, clientX, clientY)
    markClickSuppressed(sourceKey)

    if (isPointOverTrashDrop(clientX, clientY)) {
      moveTabItemsToTrash(item, dragIds)
      clearSelection()
      cleanupFinishedTabPointerDrag()
      return true
    }

    const domainTarget = getDomainItemTargetFromPoint(clientX, clientY)
    if (domainTarget) {
      markClickSuppressed(`domain:${domainTarget.targetId}`)
      onArrangeHierarchyDrop?.(
        {
          sourceDomainId: state.activeDomainId,
          sourceSpaceId: state.activeSpaceId,
          item:
            item.type === 'tab'
              ? { type: 'parent', parentTabIds: dragIds }
              : { type: 'subtab', parentTabId: item.parentTabId, subTabIds: dragIds },
          target: { type: 'domain', domainId: domainTarget.targetId },
        },
        carriedPreview,
      )
      clearSelection()
      cleanupFinishedTabPointerDrag()
      return true
    }

    const spaceTarget = getSpaceItemTargetFromPoint(clientX, clientY)
    if (spaceTarget) {
      markClickSuppressed(`space:${spaceTarget.targetId}`)
      const request: ArrangeHierarchyDropRequest = {
        sourceDomainId: state.activeDomainId,
        sourceSpaceId: state.activeSpaceId,
        item:
          item.type === 'tab'
            ? { type: 'parent', parentTabIds: dragIds }
            : { type: 'subtab', parentTabId: item.parentTabId, subTabIds: dragIds },
        target: { type: 'space', domainId: state.activeDomainId, spaceId: spaceTarget.targetId },
      }
      if (!isSubTabDropOnSourceSpace(request)) {
        onArrangeHierarchyDrop?.(request, carriedPreview)
        clearSelection()
      }
      cleanupFinishedTabPointerDrag()
      return true
    }

    if (item.type === 'tab') {
      const parentTarget = getParentInsertionTargetFromPoint(clientX, clientY)
      if (parentTarget && !dragIds.includes(parentTarget.targetId)) {
        markClickSuppressed(`tab:${parentTarget.targetId}`)
        moveParentTabsToTarget(dragIds, parentTarget)
      }
    } else if (item.type === 'subtab') {
      const parentTarget = getParentInsertionTargetFromPoint(clientX, clientY)
      if (parentTarget) {
        markClickSuppressed(`tab:${parentTarget.targetId}`)
        moveSubTabsToParent(item.parentTabId, dragIds, parentTarget.targetId)
      } else {
        const subTabTarget = getSubTabInsertionTargetFromPoint(clientX, clientY)
        if (subTabTarget && item.parentTabId === activeTab.id && !dragIds.includes(subTabTarget.targetId)) {
          markClickSuppressed(`subtab:${subTabTarget.targetId}`)
          moveSubTabsToTarget(item.parentTabId, dragIds, subTabTarget)
        }
      }
    }

    cleanupFinishedTabPointerDrag()
    return true
  }

  const cancelTabPointerDrag = () => {
    clearTabPointerDrag()
    clearTapCandidate()
    clearDragSeed()
    clearPressTimer()
    setTrashDropTarget(false)
    setDraggingItem(null)
    setMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: null,
            overSpaceInsert: null,
            overDomainId: null,
            overDomainInsert: null,
          }
        : previous,
    )
  }

  const attachTabDragWindowListeners = () => {
    detachTabDragWindowListeners()

    const getActiveDragKey = () => {
      const activeDrag = tabDragRef.current
      if (!activeDrag) return null
      return activeDrag.item.type === 'tab' ? `tab:${activeDrag.item.tabId}` : `subtab:${activeDrag.item.subTabId}`
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      const activeDrag = tabDragRef.current
      if (!activeDrag) return
      const key = getActiveDragKey()
      if (key) markTapDragged(key)

      if (event.buttons === 0) {
        finishTabPointerDrag(activeDrag.currentX, activeDrag.currentY)
        return
      }

      event.preventDefault()
      updateTabPointerDrag(event.clientX, event.clientY)
    }

    const handleWindowPointerUp = (event: PointerEvent) => {
      if (!tabDragRef.current) return
      event.preventDefault()
      event.stopPropagation()
      finishTabPointerDrag(event.clientX, event.clientY)
    }

    const handleWindowPointerCancel = () => {
      if (!tabDragRef.current) return
      cancelTabPointerDrag()
    }

    window.addEventListener('pointermove', handleWindowPointerMove, true)
    window.addEventListener('pointerup', handleWindowPointerUp, true)
    window.addEventListener('pointercancel', handleWindowPointerCancel, true)
    window.addEventListener('blur', handleWindowPointerCancel)
    tabDragWindowCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleWindowPointerMove, true)
      window.removeEventListener('pointerup', handleWindowPointerUp, true)
      window.removeEventListener('pointercancel', handleWindowPointerCancel, true)
      window.removeEventListener('blur', handleWindowPointerCancel)
    }
  }

  const handleTabPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: TabArrangeDragItem,
    label: string,
    variant: TabArrangeDragPreview['variant'],
  ) => {
    if (event.buttons !== 1) return

    const activeDrag = tabDragRef.current
    if (activeDrag) {
      event.preventDefault()
      const key = activeDrag.item.type === 'tab' ? `tab:${activeDrag.item.tabId}` : `subtab:${activeDrag.item.subTabId}`
      markTapDragged(key)
      updateTabPointerDrag(event.clientX, event.clientY)
      return
    }

    const key = item.type === 'tab' ? `tab:${item.tabId}` : `subtab:${item.subTabId}`
    const seed = dragSeedRef.current
    if (!seed || seed.key !== key) return
    const deltaX = event.clientX - seed.startX
    const deltaY = event.clientY - seed.startY
    if (Math.hypot(deltaX, deltaY) < ARRANGE_DRAG_START_SLOP_PX) return

    event.preventDefault()
    startTabPointerDrag(event, item, label, variant)
  }

  const handleTabPointerUp = (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: string,
    onTapWhileArranging: () => void,
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (finishTabPointerDrag(event.clientX, event.clientY)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    clearDragSeed()
    if (mode.active) {
      finalizeTapCandidate(key, event, onTapWhileArranging)
      return
    }
    clearPressTimer()
  }

  useEffect(() => () => clearPressTimer(), [])

  useEffect(() => {
    if (viewMode === 'main') return
    isDraggingOverTrashDropRef.current = false
    setIsDraggingOverTrashDrop(false)
    clearSelection()
    setHierarchyRevealLevel(0)
    setMode((previous) => (previous.active ? DEFAULT_ARRANGE_MODE : previous))
  }, [viewMode])

  useEffect(() => {
    setSelection((previous) => {
      const next = normalizeArrangeSelection({
        selection: previous,
        orderedParentIds: workspace.tabs.map((tab) => tab.id),
        activeParentTabId: activeTab.id,
        orderedActiveSubTabIds: activeTab.subTabs.map((subTab) => subTab.id),
        orderedDomainIds: state.domains.map((domain) => domain.id),
        activeDomainId: state.activeDomainId,
        orderedActiveDomainSpaceIds: state.spaces.map((space) => space.id),
      })
      return areArrangeSelectionsEqual(previous, next) ? previous : next
    })
  }, [workspace.tabs, activeTab.id, activeTab.subTabs, state.domains, state.activeDomainId, state.spaces])

  useEffect(() => {
    if (!mode.active || mode.scope !== 'tabs' || viewMode !== 'main') return

    setMode((previous) => {
      if (!previous.active) return previous

      const validParentTabIds = new Set(workspace.tabs.map((tab) => tab.id))
      let nextDragItem = previous.dragItem
      let nextOverParentTabId = previous.overParentTabId
      let nextOverParentInsert = previous.overParentInsert
      let nextOverSubTabId = previous.overSubTabId
      let nextOverSubTabInsert = previous.overSubTabInsert

      if (nextDragItem?.type === 'tab' && !validParentTabIds.has(nextDragItem.tabId)) {
        nextDragItem = null
      }

      const currentDragItem = nextDragItem
      if (currentDragItem?.type === 'subtab') {
        const sourceParent = workspace.tabs.find((tab) => tab.id === currentDragItem.parentTabId)
        if (!sourceParent || !sourceParent.subTabs.some((subTab) => subTab.id === currentDragItem.subTabId)) {
          nextDragItem = null
        }
      }

      if (nextOverParentTabId && !validParentTabIds.has(nextOverParentTabId)) {
        nextOverParentTabId = null
        nextOverParentInsert = null
      }

      if (nextOverSubTabId && !activeTab.subTabs.some((subTab) => subTab.id === nextOverSubTabId)) {
        nextOverSubTabId = null
        nextOverSubTabInsert = null
      }

      if (nextDragItem?.type !== 'tab' && nextOverParentInsert) {
        nextOverParentInsert = null
      }

      if (nextDragItem?.type !== 'subtab' && nextOverSubTabInsert) {
        nextOverSubTabInsert = null
      }

      if (
        nextDragItem === previous.dragItem &&
        nextOverParentTabId === previous.overParentTabId &&
        nextOverParentInsert === previous.overParentInsert &&
        nextOverSubTabId === previous.overSubTabId &&
        nextOverSubTabInsert === previous.overSubTabInsert
      ) {
        return previous
      }

      return {
        ...previous,
        dragItem: nextDragItem,
        overParentTabId: nextOverParentTabId,
        overParentInsert: nextOverParentInsert,
        overSubTabId: nextOverSubTabId,
        overSubTabInsert: nextOverSubTabInsert,
      }
    })
  }, [mode.active, mode.scope, viewMode, workspace.tabs, activeTab.subTabs])

  useEffect(() => {
    if (!mode.active || mode.scope !== 'spaces' || viewMode !== 'main') return

    setMode((previous) => {
      if (!previous.active || previous.scope !== 'spaces') return previous

      const validSpaceIds = new Set(state.spaces.map((space) => space.id))
      let nextDragItem = previous.dragItem
      let nextOverSpaceId = previous.overSpaceId
      let nextOverSpaceInsert = previous.overSpaceInsert

      if (nextDragItem?.type === 'space' && !validSpaceIds.has(nextDragItem.spaceId)) {
        nextDragItem = null
      }

      if (nextOverSpaceId && !validSpaceIds.has(nextOverSpaceId)) {
        nextOverSpaceId = null
        nextOverSpaceInsert = null
      }

      if (nextDragItem?.type !== 'space' && nextOverSpaceInsert) {
        nextOverSpaceInsert = null
      }

      if (
        nextDragItem === previous.dragItem &&
        nextOverSpaceId === previous.overSpaceId &&
        nextOverSpaceInsert === previous.overSpaceInsert
      ) {
        return previous
      }

      return {
        ...previous,
        dragItem: nextDragItem,
        overSpaceId: nextOverSpaceId,
        overSpaceInsert: nextOverSpaceInsert,
      }
    })
  }, [mode.active, mode.scope, viewMode, state.spaces])

  useEffect(() => {
    if (!mode.active || mode.scope !== 'domains' || viewMode !== 'main') return

    setMode((previous) => {
      if (!previous.active || previous.scope !== 'domains') return previous

      const validDomainIds = new Set(state.domains.map((domain) => domain.id))
      let nextDragItem = previous.dragItem
      let nextOverDomainId = previous.overDomainId
      let nextOverDomainInsert = previous.overDomainInsert

      if (nextDragItem?.type === 'domain' && !validDomainIds.has(nextDragItem.domainId)) {
        nextDragItem = null
      }

      if (nextOverDomainId && !validDomainIds.has(nextOverDomainId)) {
        nextOverDomainId = null
        nextOverDomainInsert = null
      }

      if (nextDragItem?.type !== 'domain' && nextOverDomainInsert) {
        nextOverDomainInsert = null
      }

      if (
        nextDragItem === previous.dragItem &&
        nextOverDomainId === previous.overDomainId &&
        nextOverDomainInsert === previous.overDomainInsert
      ) {
        return previous
      }

      return {
        ...previous,
        dragItem: nextDragItem,
        overDomainId: nextOverDomainId,
        overDomainInsert: nextOverDomainInsert,
      }
    })
  }, [mode.active, mode.scope, viewMode, state.domains])

  return {
    mode,
    hierarchyRevealLevel,
    draggingItem,
    domainDragPreview,
    spaceDragPreview,
    tabDragPreview,
    selection,
    primaryTabRailRef,
    subTabRailRef,
    domainsGridRef,
    spacesGridRef,
    trashDropRef,
    isDraggingOverTrashDrop,
    suppressNextDomainArrangeExitRef,
    suppressNextSpaceArrangeExitRef,
    clearPressTimer,
    clearTapCandidate,
    clearSelection,
    startDragSeed,
    startTapCandidate,
    finalizeTapCandidate,
    consumeClickSuppression,
    enter,
    exit,
    advanceHierarchyReveal,
    enterFromContext,
    startPress,
    handleParentSelectionClick,
    handleSubTabSelectionClick,
    handleDomainSelectionClick,
    handleSpaceSelectionClick,
    handleDomainPointerMove,
    handleDomainPointerUp,
    cancelDomainPointerDrag,
    handleSpacePointerMove,
    handleSpacePointerUp,
    cancelSpacePointerDrag,
    handleTabPointerMove,
    handleTabPointerUp,
    cancelTabPointerDrag,
  }
}
