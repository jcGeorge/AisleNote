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
} from './arrange-selection'
import { resolveArrangeSelectionClick } from './arrange-active-context'
import {
  clearArrangeModeLiveDragState,
  shouldClearArrangeSelectionAfterLiveDragFinish,
  type ArrangeLiveDragFinishKind,
  type ArrangeLiveDragItemKind,
  type ArrangeLiveDragResetScope,
} from './arrange-drag-session'
import { copyTabArrangeCarryPreview, isSubTabDropOnSourceSpace } from './arrange-guided-prompt'
import { attachArrangeWindowDragListeners } from './arrange-window-drag'
import { blurActiveArrangeRailControl, blurArrangeRailControl } from './arrange-focus-cleanup'
import { projectActiveDomainState, setActiveDomain, setActiveSpaceInActiveDomain } from '../state/domains'
import { selectPrimeTabWithMemory, selectSubTabWithMemory } from '../state/navigation-memory'
import { collectAppNavigationEntityIds, createReservedIdAllocator } from '../state/navigation-ids'
import { createSpace, createTab } from '../state/workspace'
import type {
  AppState,
  ArrangeDragItem,
  ArrangeDragSeed,
  ArrangeHierarchyDropRequest,
  ArrangeInsertPosition,
  ArrangeModeState,
  ArrangePreviewGhostItem,
  ArrangeSelectionState,
  ArrangeSelectionKind,
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
  onArrangeSpaceMovedAcrossDomains?: (spaceNames: string[], targetDomainName: string) => void
  onArrangeParentMoveBlocked?: () => void
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

const FALLBACK_GHOST_ITEM_OFFSETS = [
  { x: -34, y: -18 },
  { x: -58, y: 18 },
]

export function getArrangePreviewGhostItems({
  rail,
  selector,
  attributeName,
  selectedIds,
  draggedId,
  getLabel,
  previewLeft,
  previewTop,
  fallbackWidth,
  fallbackHeight,
}: {
  rail: HTMLElement | null
  selector: string
  attributeName: string
  selectedIds: readonly string[]
  draggedId: string
  getLabel: (id: string) => string | undefined
  previewLeft: number
  previewTop: number
  fallbackWidth: number
  fallbackHeight: number
}): ArrangePreviewGhostItem[] {
  const elements = rail ? Array.from(rail.querySelectorAll<HTMLElement>(selector)) : []
  const elementsById = new Map(
    elements
      .map((element) => [element.getAttribute(attributeName) ?? '', element] as const)
      .filter(([id]) => Boolean(id)),
  )
  const ghosts: ArrangePreviewGhostItem[] = []
  for (const id of selectedIds) {
    if (id === draggedId) continue
    const label = getLabel(id)
    if (!label) continue
    const element = elementsById.get(id)
    const rect = element?.getBoundingClientRect()
    const fallbackOffset = FALLBACK_GHOST_ITEM_OFFSETS[ghosts.length % FALLBACK_GHOST_ITEM_OFFSETS.length]
    ghosts.push({
      id,
      label,
      x: rect ? rect.left - previewLeft : fallbackOffset.x,
      y: rect ? rect.top - previewTop : fallbackOffset.y,
      width: rect?.width ?? fallbackWidth,
      height: rect?.height ?? fallbackHeight,
    })
  }
  return ghosts
}

function wouldInsertionMoveItems<T extends { id: string }>(
  items: T[] | undefined,
  selectedIds: string[],
  targetId: string,
  position: ArrangeInsertPosition,
) {
  if (!items) return false
  return moveSelectedItemsByInsertion(items, selectedIds, targetId, position) !== items
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
  onArrangeSpaceMovedAcrossDomains,
  onArrangeParentMoveBlocked,
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
  const dragWindowCleanupRef = useRef<(() => void) | null>(null)
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

  const detachArrangeDragWindowListeners = () => {
    dragWindowCleanupRef.current?.()
    dragWindowCleanupRef.current = null
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

  const applyArrangeSelectionActiveReplacement = (
    kind: ArrangeSelectionKind,
    replacementId: string | null,
  ) => {
    if (!replacementId) return
    flushPendingContent()
    if (kind === 'domain') {
      setState((previous) => setActiveDomain(previous, replacementId))
      return
    }
    if (kind === 'space') {
      setState((previous) => setActiveSpaceInActiveDomain(previous, replacementId))
      return
    }
    if (kind === 'parent') {
      updateActiveSpaceData((data) => selectPrimeTabWithMemory(data, replacementId))
      return
    }
    if (kind === 'subtab') {
      updateActiveSpaceData((data) => selectSubTabWithMemory(data, replacementId))
    }
  }

  const handleArrangeSelectionClick = ({
    kind,
    parentTabId = null,
    domainId = null,
    itemId,
    orderedIds,
    currentId,
    modifiers,
  }: {
    kind: ArrangeSelectionKind
    parentTabId?: string | null
    domainId?: string | null
    itemId: string
    orderedIds: string[]
    currentId: string | null
    modifiers: SelectionClickModifiers
  }) => {
    const { nextSelection, activeReplacementId } = resolveArrangeSelectionClick({
      selection,
      kind,
      parentTabId,
      domainId,
      itemId,
      orderedIds,
      currentId,
      modifiers,
    })
    setSelection(nextSelection)
    applyArrangeSelectionActiveReplacement(kind, activeReplacementId)
  }

  const handleParentSelectionClick = (tabId: string, modifiers: SelectionClickModifiers) => {
    if (viewMode !== 'main' || !isSelectionModifier(modifiers)) return false
    clearPressTimer()
    clearTapCandidate()
    clearDragSeed()
    enterArrangeModeForSelection('tabs')
    handleArrangeSelectionClick({
      kind: 'parent',
      itemId: tabId,
      orderedIds: workspace.tabs.map((tab) => tab.id),
      currentId: workspace.activeTabId,
      modifiers,
    })
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
    handleArrangeSelectionClick({
      kind: 'subtab',
      parentTabId,
      itemId: subTabId,
      orderedIds: activeTab.subTabs.map((subTab) => subTab.id),
      currentId: activeTab.activeSubTabId,
      modifiers,
    })
    return true
  }

  const handleDomainSelectionClick = (domainId: string, modifiers: SelectionClickModifiers) => {
    if (viewMode !== 'main' || !isSelectionModifier(modifiers)) return false
    clearPressTimer()
    clearTapCandidate()
    clearDragSeed()
    enterArrangeModeForSelection('domains')
    handleArrangeSelectionClick({
      kind: 'domain',
      itemId: domainId,
      orderedIds: state.domains.map((domain) => domain.id),
      currentId: state.activeDomainId,
      modifiers,
    })
    return true
  }

  const handleSpaceSelectionClick = (spaceId: string, modifiers: SelectionClickModifiers) => {
    if (viewMode !== 'main' || !isSelectionModifier(modifiers)) return false
    clearPressTimer()
    clearTapCandidate()
    clearDragSeed()
    enterArrangeModeForSelection('spaces')
    handleArrangeSelectionClick({
      kind: 'space',
      domainId: state.activeDomainId,
      itemId: spaceId,
      orderedIds: state.spaces.map((space) => space.id),
      currentId: state.activeSpaceId,
      modifiers,
    })
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
    detachArrangeDragWindowListeners()
    suppressNextDomainArrangeExitRef.current = false
    suppressNextSpaceArrangeExitRef.current = false
    setTrashDropTarget(false)
    setDraggingItem(null)
    setDomainDragPreview(null)
    setSpaceDragPreview(null)
    setTabDragPreview(null)
    setHierarchyRevealLevel(0)
    clearSelection()
    blurActiveArrangeRailControl()
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

  const resetArrangeLiveDragMode = (scope: ArrangeLiveDragResetScope = 'all') => {
    setMode((previous) => clearArrangeModeLiveDragState(previous, scope))
  }

  const completeArrangeLiveDrag = ({
    itemKind,
    finishKind,
    clearPointerDrag,
    resetScope = 'all',
    clearPress = false,
  }: {
    itemKind: ArrangeLiveDragItemKind
    finishKind: ArrangeLiveDragFinishKind
    clearPointerDrag: () => void
    resetScope?: ArrangeLiveDragResetScope
    clearPress?: boolean
  }) => {
    if (shouldClearArrangeSelectionAfterLiveDragFinish({ itemKind, finishKind })) {
      clearSelection()
    }
    clearPointerDrag()
    clearTapCandidate()
    clearDragSeed()
    if (clearPress) clearPressTimer()
    setTrashDropTarget(false)
    setDraggingItem(null)
    resetArrangeLiveDragMode(resetScope)
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
    detachArrangeDragWindowListeners()
    setDomainDragPreview(null)
    blurActiveArrangeRailControl()
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

  const startDomainPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, domain: Domain) => {
    if (viewMode !== 'main') return
    const rect = event.currentTarget.getBoundingClientRect()
    const itemIsSelected = selection.kind === 'domain' && selection.selectedIds.includes(domain.id)
    const dragIds = itemIsSelected ? getSelectedDomainDragIds(domain.id) : [domain.id]
    const previewLabel = domain.name
    const nextDrag: DomainArrangeDragPreview = {
      domainId: domain.id,
      selectedDomainIds: dragIds,
      dragCount: dragIds.length,
      ghostItems: getArrangePreviewGhostItems({
        rail: domainsGridRef.current,
        selector: '[data-arrange-domain-id]',
        attributeName: 'data-arrange-domain-id',
        selectedIds: dragIds,
        draggedId: domain.id,
        getLabel: (id) => state.domains.find((entry) => entry.id === id)?.name,
        previewLeft: rect.left,
        previewTop: rect.top,
        fallbackWidth: rect.width,
        fallbackHeight: rect.height,
      }),
      label: previewLabel,
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
    blurArrangeRailControl(event.currentTarget)
    attachDomainDragWindowListeners()
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
    if (!drag) return null

    const insertionTarget = getDomainInsertionTargetFromPoint(clientX, clientY)
    const dragIds = drag.selectedDomainIds ?? [drag.domainId]
    markClickSuppressed(`domain:${drag.domainId}`)
    if (isPointOverTrashDrop(clientX, clientY)) {
      const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(state))
      const movedDomainCount = projectActiveDomainState(state).domains.filter((domain) => dragIds.includes(domain.id)).length
      const finishKind: ArrangeLiveDragFinishKind =
        projectActiveDomainState(state).domains.length - movedDomainCount < 1 ? 'blocked' : 'trash'
      setState((previous) => {
        const result = moveSelectedDomainsToTrash(previous, dragIds, createEntityId)
        if (result.reason === 'last-domain') onArrangeDomainMoveBlocked?.('last-domain')
        return result.state
      })
      completeArrangeLiveDrag({ itemKind: 'domain', finishKind, clearPointerDrag: clearDomainPointerDrag })
      return finishKind
    }
    let finishKind: ArrangeLiveDragFinishKind = 'noop'
    if (insertionTarget) {
      const didMoveDomain = wouldInsertionMoveItems(
        projectActiveDomainState(state).domains,
        dragIds,
        insertionTarget.targetId,
        insertionTarget.position,
      )
      if (didMoveDomain) {
        markClickSuppressed(`domain:${insertionTarget.targetId}`)
        moveDomainToTarget(dragIds, insertionTarget)
        finishKind = 'reorder'
      }
    }

    suppressNextDomainArrangeExitClick()
    completeArrangeLiveDrag({ itemKind: 'domain', finishKind, clearPointerDrag: clearDomainPointerDrag })
    return finishKind
  }

  const cancelDomainPointerDrag = () => {
    completeArrangeLiveDrag({
      itemKind: 'domain',
      finishKind: 'noop',
      clearPointerDrag: clearDomainPointerDrag,
      resetScope: 'domains',
      clearPress: true,
    })
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
    detachArrangeDragWindowListeners()
    setSpaceDragPreview(null)
    blurActiveArrangeRailControl()
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

  const startSpacePointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, space: Space) => {
    if (viewMode !== 'main') return
    const rect = event.currentTarget.getBoundingClientRect()
    const itemIsSelected =
      selection.kind === 'space' && selection.domainId === state.activeDomainId && selection.selectedIds.includes(space.id)
    const dragIds = itemIsSelected ? getSelectedSpaceDragIds(space.id) : [space.id]
    const previewLabel = space.name
    const nextDrag: SpaceArrangeDragPreview = {
      spaceId: space.id,
      sourceDomainId: state.activeDomainId,
      selectedSpaceIds: dragIds,
      dragCount: dragIds.length,
      ghostItems: getArrangePreviewGhostItems({
        rail: spacesGridRef.current,
        selector: '[data-arrange-space-id]',
        attributeName: 'data-arrange-space-id',
        selectedIds: dragIds,
        draggedId: space.id,
        getLabel: (id) => state.spaces.find((entry) => entry.id === id)?.name,
        previewLeft: rect.left,
        previewTop: rect.top,
        fallbackWidth: rect.width,
        fallbackHeight: rect.height,
      }),
      label: previewLabel,
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
    blurArrangeRailControl(event.currentTarget)
    attachSpaceDragWindowListeners()
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
    if (!drag) return null

    const insertionTarget = getSpaceInsertionTargetFromPoint(clientX, clientY)
    const dragIds = drag.selectedSpaceIds ?? [drag.spaceId]
    markClickSuppressed(`space:${drag.spaceId}`)
    if (isPointOverTrashDrop(clientX, clientY)) {
      const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(state))
      const sourceDomain = projectActiveDomainState(state).domains.find((domain) => domain.id === drag.sourceDomainId)
      const movedSpaceCount = sourceDomain?.spaces.filter((space) => dragIds.includes(space.id)).length ?? 0
      const finishKind: ArrangeLiveDragFinishKind =
        sourceDomain && sourceDomain.spaces.length - movedSpaceCount < 1 ? 'blocked' : 'trash'
      setState((previous) => {
        const result = moveSelectedSpacesToTrash(previous, drag.sourceDomainId, dragIds, createEntityId)
        if (result.reason === 'last-space') onArrangeSpaceMoveBlocked?.('last-space')
        return result.state
      })
      completeArrangeLiveDrag({ itemKind: 'space', finishKind, clearPointerDrag: clearSpacePointerDrag })
      return finishKind
    }
    let finishKind: ArrangeLiveDragFinishKind = 'noop'
    const domainTarget = getDomainItemTargetFromPoint(clientX, clientY)
    if (domainTarget) {
      markClickSuppressed(`domain:${domainTarget.targetId}`)
      const projected = projectActiveDomainState(state)
      const sourceDomain = projected.domains.find((domain) => domain.id === drag.sourceDomainId)
      const targetDomain = projected.domains.find((domain) => domain.id === domainTarget.targetId)
      const movedSpaces = sourceDomain?.spaces.filter((space) => dragIds.includes(space.id)) ?? []
      const shouldNotifyCrossDomainMove =
        drag.sourceDomainId !== domainTarget.targetId &&
        !!sourceDomain &&
        !!targetDomain &&
        movedSpaces.length > 0
      if (shouldNotifyCrossDomainMove) {
        const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(state))
        setState((previous) => {
          const result = moveSelectedSpacesToDomain(previous, drag.sourceDomainId, dragIds, domainTarget.targetId, {
            createFallbackSpace: () => createSpace('space', createEntityId),
          })
          if (result.reason === 'last-space') onArrangeSpaceMoveBlocked?.('last-space')
          return result.state
        })
        onArrangeSpaceMovedAcrossDomains?.(
          movedSpaces.map((space) => space.name),
          targetDomain.name,
        )
        finishKind = 'cross-domain-move'
      }
      suppressNextSpaceArrangeExitClick()
      completeArrangeLiveDrag({ itemKind: 'space', finishKind, clearPointerDrag: clearSpacePointerDrag })
      return finishKind
    }
    if (insertionTarget) {
      const didMoveSpace = wouldInsertionMoveItems(
        projectActiveDomainState(state).domains.find((domain) => domain.id === drag.sourceDomainId)?.spaces,
        dragIds,
        insertionTarget.targetId,
        insertionTarget.position,
      )
      if (didMoveSpace) {
        markClickSuppressed(`space:${insertionTarget.targetId}`)
        moveSpaceToTarget(dragIds, insertionTarget)
        finishKind = 'reorder'
      }
    }

    suppressNextSpaceArrangeExitClick()
    completeArrangeLiveDrag({ itemKind: 'space', finishKind, clearPointerDrag: clearSpacePointerDrag })
    return finishKind
  }

  const cancelSpacePointerDrag = () => {
    completeArrangeLiveDrag({
      itemKind: 'space',
      finishKind: 'noop',
      clearPointerDrag: clearSpacePointerDrag,
      resetScope: 'all',
      clearPress: true,
    })
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
    detachArrangeDragWindowListeners()
    setTabDragPreview(null)
    blurActiveArrangeRailControl()
  }

  const cleanupFinishedTabPointerDrag = (
    itemKind: Extract<ArrangeLiveDragItemKind, 'parent' | 'subtab'>,
    finishKind: ArrangeLiveDragFinishKind = 'noop',
  ) => {
    completeArrangeLiveDrag({ itemKind, finishKind, clearPointerDrag: clearTabPointerDrag })
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
    const previewLabel = label
    const draggedId = item.type === 'tab' ? item.tabId : item.subTabId
    const rail = item.type === 'tab' ? primaryTabRailRef.current : subTabRailRef.current
    const selector = item.type === 'tab' ? '[data-arrange-tab-id]' : '[data-arrange-subtab-id]'
    const attributeName = item.type === 'tab' ? 'data-arrange-tab-id' : 'data-arrange-subtab-id'
    const nextDrag: TabArrangeDragPreview = {
      item,
      label: previewLabel,
      variant,
      dragCount: dragIds.length,
      ghostItems: getArrangePreviewGhostItems({
        rail,
        selector,
        attributeName,
        selectedIds: dragIds,
        draggedId,
        getLabel: (id) =>
          item.type === 'tab'
            ? workspace.tabs.find((tab) => tab.id === id)?.title
            : activeTab.subTabs.find((subTab) => subTab.id === id)?.title,
        previewLeft: rect.left,
        previewTop: rect.top,
        fallbackWidth: rect.width,
        fallbackHeight: rect.height,
      }),
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
    blurArrangeRailControl(event.currentTarget)
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
      if (item.type === 'tab') {
        const selectedIds = new Set(dragIds)
        if (data.tabs.length > 0 && data.tabs.every((tab) => selectedIds.has(tab.id))) {
          onArrangeParentMoveBlocked?.()
          return data
        }
      }
      return item.type === 'tab'
        ? moveSelectedParentTabsToTrash(data, dragIds, options)
        : moveSelectedSubTabsToTrash(data, item.parentTabId, dragIds, options)
    })
  }

  const finishTabPointerDrag = (clientX: number, clientY: number) => {
    const drag = tabDragRef.current
    if (!drag) return null

    const { item } = drag
    const itemKind: Extract<ArrangeLiveDragItemKind, 'parent' | 'subtab'> = item.type === 'tab' ? 'parent' : 'subtab'
    const sourceKey = item.type === 'tab' ? `tab:${item.tabId}` : `subtab:${item.subTabId}`
    const dragIds = tabDragGroupRef.current?.ids ?? getTabDragIds(item)
    const carriedPreview = copyTabArrangeCarryPreview(drag, clientX, clientY)
    markClickSuppressed(sourceKey)
    let finishKind: ArrangeLiveDragFinishKind = 'noop'

    if (isPointOverTrashDrop(clientX, clientY)) {
      const selectedIds = new Set(dragIds)
      finishKind =
        item.type === 'tab' && workspace.tabs.length > 0 && workspace.tabs.every((tab) => selectedIds.has(tab.id))
          ? 'blocked'
          : 'trash'
      moveTabItemsToTrash(item, dragIds)
      cleanupFinishedTabPointerDrag(itemKind, finishKind)
      return finishKind
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
      finishKind = 'hierarchy-drop'
      cleanupFinishedTabPointerDrag(itemKind, finishKind)
      return finishKind
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
        finishKind = 'hierarchy-drop'
        cleanupFinishedTabPointerDrag(itemKind, finishKind)
      } else {
        finishKind = 'noop'
        cleanupFinishedTabPointerDrag(itemKind, 'noop')
      }
      return finishKind
    }

    if (item.type === 'tab') {
      const parentTarget = getParentInsertionTargetFromPoint(clientX, clientY)
      if (parentTarget && !dragIds.includes(parentTarget.targetId)) {
        markClickSuppressed(`tab:${parentTarget.targetId}`)
        moveParentTabsToTarget(dragIds, parentTarget)
        finishKind = 'reorder'
      }
    } else if (item.type === 'subtab') {
      const parentTarget = getParentInsertionTargetFromPoint(clientX, clientY)
      if (parentTarget && parentTarget.targetId !== item.parentTabId) {
        markClickSuppressed(`tab:${parentTarget.targetId}`)
        moveSubTabsToParent(item.parentTabId, dragIds, parentTarget.targetId)
        finishKind = 'reorder'
      } else {
        const subTabTarget = getSubTabInsertionTargetFromPoint(clientX, clientY)
        if (subTabTarget && item.parentTabId === activeTab.id && !dragIds.includes(subTabTarget.targetId)) {
          markClickSuppressed(`subtab:${subTabTarget.targetId}`)
          moveSubTabsToTarget(item.parentTabId, dragIds, subTabTarget)
          finishKind = 'reorder'
        }
      }
    }

    cleanupFinishedTabPointerDrag(itemKind, finishKind)
    return finishKind
  }

  const cancelTabPointerDrag = () => {
    completeArrangeLiveDrag({
      itemKind: 'parent',
      finishKind: 'noop',
      clearPointerDrag: clearTabPointerDrag,
      resetScope: 'all',
      clearPress: true,
    })
  }

  const attachDomainDragWindowListeners = () => {
    detachArrangeDragWindowListeners()
    dragWindowCleanupRef.current = attachArrangeWindowDragListeners(window, {
      isActive: () => domainDragRef.current !== null,
      getCurrentPoint: () => {
        const activeDrag = domainDragRef.current
        return activeDrag ? { clientX: activeDrag.currentX, clientY: activeDrag.currentY } : null
      },
      onMarkDragged: () => {
        const activeDrag = domainDragRef.current
        if (activeDrag) markTapDragged(`domain:${activeDrag.domainId}`)
      },
      onMove: ({ clientX, clientY }) => updateDomainPointerDrag(clientX, clientY),
      onFinish: ({ clientX, clientY }) => finishDomainPointerDrag(clientX, clientY),
      onCancel: () => cancelDomainPointerDrag(),
    })
  }

  const attachSpaceDragWindowListeners = () => {
    detachArrangeDragWindowListeners()
    dragWindowCleanupRef.current = attachArrangeWindowDragListeners(window, {
      isActive: () => spaceDragRef.current !== null,
      getCurrentPoint: () => {
        const activeDrag = spaceDragRef.current
        return activeDrag ? { clientX: activeDrag.currentX, clientY: activeDrag.currentY } : null
      },
      onMarkDragged: () => {
        const activeDrag = spaceDragRef.current
        if (activeDrag) markTapDragged(`space:${activeDrag.spaceId}`)
      },
      onMove: ({ clientX, clientY }) => updateSpacePointerDrag(clientX, clientY),
      onFinish: ({ clientX, clientY }) => finishSpacePointerDrag(clientX, clientY),
      onCancel: () => cancelSpacePointerDrag(),
    })
  }

  const attachTabDragWindowListeners = () => {
    detachArrangeDragWindowListeners()
    dragWindowCleanupRef.current = attachArrangeWindowDragListeners(window, {
      isActive: () => tabDragRef.current !== null,
      getCurrentPoint: () => {
        const activeDrag = tabDragRef.current
        return activeDrag ? { clientX: activeDrag.currentX, clientY: activeDrag.currentY } : null
      },
      onMarkDragged: () => {
        const activeDrag = tabDragRef.current
        if (!activeDrag) return
        const key = activeDrag.item.type === 'tab' ? `tab:${activeDrag.item.tabId}` : `subtab:${activeDrag.item.subTabId}`
        markTapDragged(key)
      },
      onMove: ({ clientX, clientY }) => updateTabPointerDrag(clientX, clientY),
      onFinish: ({ clientX, clientY }) => finishTabPointerDrag(clientX, clientY),
      onCancel: () => cancelTabPointerDrag(),
    })
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

  useEffect(
    () => () => {
      clearPressTimer()
      detachArrangeDragWindowListeners()
    },
    [],
  )

  useEffect(() => {
    if (viewMode === 'main') return
    clearPressTimer()
    clearTapCandidate()
    clearDragSeed()
    detachArrangeDragWindowListeners()
    domainDragRef.current = null
    spaceDragRef.current = null
    tabDragRef.current = null
    tabDragGroupRef.current = null
    isDraggingOverTrashDropRef.current = false
    setIsDraggingOverTrashDrop(false)
    setDraggingItem(null)
    setDomainDragPreview(null)
    setSpaceDragPreview(null)
    setTabDragPreview(null)
    clearSelection()
    setHierarchyRevealLevel(0)
    blurActiveArrangeRailControl()
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
