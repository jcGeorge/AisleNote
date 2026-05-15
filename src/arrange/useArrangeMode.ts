import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react'
import {
  ARRANGE_DRAG_START_SLOP_PX,
  ARRANGE_PRESS_DELAY_MS,
  ARRANGE_TAP_SLOP_PX,
  DEFAULT_ARRANGE_MODE,
  getArrangeRailInsertionTarget,
  isPointInsideElement,
  isPointInsideElementExact,
  moveItemByInsertion,
} from './arrange-utils'
import { moveArrangeItemToTrash } from './arrange-trash'
import { moveSpaceWithinActiveDomain } from '../state/domains'
import type {
  AppState,
  ArrangeDragItem,
  ArrangeDragSeed,
  ArrangeInsertPosition,
  ArrangeModeState,
  ArrangeScope,
  ArrangeSource,
  ArrangeTapCandidate,
  ArrangeTapCandidateSeed,
  ContextMenuState,
  Space,
  SpaceArrangeDragPreview,
  Tab,
  TabArrangeDragItem,
  TabArrangeDragPreview,
  ViewMode,
  WorkspaceData,
} from '../types/app'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

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
  exitAisleDeleteMode: () => void
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
  exitAisleDeleteMode,
}: UseArrangeModeParams) {
  const [mode, setMode] = useState<ArrangeModeState>(DEFAULT_ARRANGE_MODE)
  const [draggingItem, setDraggingItem] = useState<ArrangeDragItem | null>(null)
  const [spaceDragPreview, setSpaceDragPreview] = useState<SpaceArrangeDragPreview | null>(null)
  const [tabDragPreview, setTabDragPreview] = useState<TabArrangeDragPreview | null>(null)

  const primaryTabRailRef = useRef<HTMLDivElement | null>(null)
  const subTabRailRef = useRef<HTMLDivElement | null>(null)
  const spacesGridRef = useRef<HTMLDivElement | null>(null)
  const trashDropRef = useRef<HTMLButtonElement | null>(null)
  const pressTimerRef = useRef<number | null>(null)
  const tapCandidateRef = useRef<ArrangeTapCandidate | null>(null)
  const dragSeedRef = useRef<ArrangeDragSeed | null>(null)
  const spaceDragRef = useRef<SpaceArrangeDragPreview | null>(null)
  const tabDragRef = useRef<TabArrangeDragPreview | null>(null)
  const tabDragWindowCleanupRef = useRef<(() => void) | null>(null)
  const suppressClickRef = useRef<Set<string>>(new Set())
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
    exitAisleDeleteMode()
    if (suppressClickKey) {
      markClickSuppressed(suppressClickKey)
    }
    const scope: ArrangeScope | null = viewMode === 'spaces' ? 'spaces' : viewMode === 'main' ? 'tabs' : null
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
    })
  }

  const exit = () => {
    clearPressTimer()
    clearTapCandidate()
    clearDragSeed()
    suppressClickRef.current.clear()
    spaceDragRef.current = null
    tabDragRef.current = null
    detachTabDragWindowListeners()
    suppressNextSpaceArrangeExitRef.current = false
    setTrashDropTarget(false)
    setDraggingItem(null)
    setSpaceDragPreview(null)
    setTabDragPreview(null)
    setMode(DEFAULT_ARRANGE_MODE)
  }

  const startPress = (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragItem: ArrangeDragItem | null,
    suppressClickKey: string,
  ) => {
    if ((viewMode !== 'main' && viewMode !== 'spaces') || editing || mode.active) return
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
    const scope: ArrangeScope = dragItem.type === 'space' ? 'spaces' : 'tabs'
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
    })
  }

  const getSpaceInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    const grid = spacesGridRef.current
    if (!grid) return null
    return getArrangeRailInsertionTarget(
      grid,
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

  const startSpacePointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, space: Space) => {
    if (viewMode !== 'spaces') return
    const rect = event.currentTarget.getBoundingClientRect()
    const nextDrag: SpaceArrangeDragPreview = {
      spaceId: space.id,
      label: space.name,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }

    clearPressTimer()
    markTapDragged(`space:${space.id}`)
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
    updateSpaceDropTarget(clientX, clientY)
  }

  const moveSpaceToTarget = (
    draggedSpaceId: string,
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    if (draggedSpaceId === insertionTarget.targetId) return
    setState((previous) =>
      moveSpaceWithinActiveDomain(previous, draggedSpaceId, insertionTarget.targetId, insertionTarget.position),
    )
  }

  const finishSpacePointerDrag = (clientX: number, clientY: number) => {
    const drag = spaceDragRef.current
    if (!drag) return false

    const insertionTarget = getSpaceInsertionTargetFromPoint(clientX, clientY)
    markClickSuppressed(`space:${drag.spaceId}`)
    if (insertionTarget) {
      markClickSuppressed(`space:${insertionTarget.targetId}`)
      moveSpaceToTarget(drag.spaceId, insertionTarget)
    }

    suppressNextSpaceArrangeExitClick()
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
    setDraggingItem(null)
    setMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overSpaceId: null,
            overSpaceInsert: null,
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

  const handleSpacePointerUp = (event: ReactPointerEvent<HTMLButtonElement>, spaceId: string) => {
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
      finalizeTapCandidate(`space:${spaceId}`, event, exit)
      return
    }
    clearPressTimer()
  }

  const getParentInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    const rail = primaryTabRailRef.current
    if (!rail || !isPointInsideElement(rail, clientX, clientY, 14)) return null
    return getArrangeRailInsertionTarget(rail, '[data-arrange-tab-id]', 'data-arrange-tab-id', clientX, clientY)
  }

  const getSubTabInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    const rail = subTabRailRef.current
    if (!rail || !isPointInsideElement(rail, clientX, clientY, 14)) return null
    return getArrangeRailInsertionTarget(rail, '[data-arrange-subtab-id]', 'data-arrange-subtab-id', clientX, clientY)
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
          }
        : previous,
    )
  }

  const isPointOverTrashDrop = (clientX: number, clientY: number) =>
    isPointInsideElementExact(trashDropRef.current, clientX, clientY)

  const updateTabDropTarget = (item: TabArrangeDragItem, clientX: number, clientY: number) => {
    if (isPointOverTrashDrop(clientX, clientY)) {
      setTrashDropTarget(true)
      clearTabDropTarget()
      return { type: 'trash' as const }
    }

    setTrashDropTarget(false)

    if (item.type === 'tab') {
      const parentTarget = getParentInsertionTargetFromPoint(clientX, clientY)
      if (!parentTarget) {
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
            },
      )
      return { type: 'parent' as const, target: parentTarget }
    }

    if (item.type === 'subtab') {
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
              },
        )
        return { type: 'parent' as const, target: parentTarget }
      }

      const subTabTarget = getSubTabInsertionTargetFromPoint(clientX, clientY)
      if (subTabTarget && item.parentTabId === activeTab.id) {
        setMode((previous) =>
          previous.overSubTabId === subTabTarget.targetId && previous.overSubTabInsert === subTabTarget.position
            ? previous
            : {
                ...previous,
                overParentTabId: null,
                overParentInsert: null,
                overSubTabId: subTabTarget.targetId,
                overSubTabInsert: subTabTarget.position,
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
    const nextDrag: TabArrangeDragPreview = {
      item,
      label,
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
    prepareForDrag(item)
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

  const moveParentTabToTarget = (
    draggedTabId: string,
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    if (draggedTabId === insertionTarget.targetId) return
    updateActiveSpaceData((data) => {
      const fromIndex = data.tabs.findIndex((tab) => tab.id === draggedTabId)
      const toIndex = data.tabs.findIndex((tab) => tab.id === insertionTarget.targetId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return data
      return {
        ...data,
        tabs: moveItemByInsertion(data.tabs, fromIndex, toIndex, insertionTarget.position),
      }
    })
  }

  const moveSubTabToParent = (sourceParentTabId: string, subTabId: string, targetParentTabId: string) => {
    if (sourceParentTabId === targetParentTabId) return
    updateActiveSpaceData((data) => {
      const sourceParent = data.tabs.find((tab) => tab.id === sourceParentTabId)
      const targetParent = data.tabs.find((tab) => tab.id === targetParentTabId)
      if (!sourceParent || !targetParent) return data
      const movedSubTab = sourceParent.subTabs.find((subTab) => subTab.id === subTabId)
      if (!movedSubTab || targetParent.subTabs.some((subTab) => subTab.id === subTabId)) return data

      return {
        ...data,
        tabs: data.tabs.map((tab) => {
          if (tab.id === sourceParentTabId) {
            return {
              ...tab,
              activeSubTabId: tab.activeSubTabId === subTabId ? null : tab.activeSubTabId,
              subTabs: tab.subTabs.filter((subTab) => subTab.id !== subTabId),
            }
          }
          if (tab.id === targetParentTabId) {
            return {
              ...tab,
              subTabs: [...tab.subTabs, movedSubTab],
            }
          }
          return tab
        }),
      }
    })
  }

  const moveSubTabToTarget = (
    parentTabId: string,
    subTabId: string,
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    if (subTabId === insertionTarget.targetId) return
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== parentTabId) return tab
        const fromIndex = tab.subTabs.findIndex((subTab) => subTab.id === subTabId)
        const toIndex = tab.subTabs.findIndex((subTab) => subTab.id === insertionTarget.targetId)
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return tab
        return {
          ...tab,
          subTabs: moveItemByInsertion(tab.subTabs, fromIndex, toIndex, insertionTarget.position),
        }
      }),
    }))
  }

  const moveTabItemToTrash = (item: TabArrangeDragItem) => {
    updateActiveSpaceData((data) => moveArrangeItemToTrash(data, item))
  }

  const finishTabPointerDrag = (clientX: number, clientY: number) => {
    const drag = tabDragRef.current
    if (!drag) return false

    const { item } = drag
    const sourceKey = item.type === 'tab' ? `tab:${item.tabId}` : `subtab:${item.subTabId}`
    markClickSuppressed(sourceKey)

    if (isPointOverTrashDrop(clientX, clientY)) {
      moveTabItemToTrash(item)
      cleanupFinishedTabPointerDrag()
      return true
    }

    if (item.type === 'tab') {
      const parentTarget = getParentInsertionTargetFromPoint(clientX, clientY)
      if (parentTarget) {
        markClickSuppressed(`tab:${parentTarget.targetId}`)
        moveParentTabToTarget(item.tabId, parentTarget)
      }
    } else if (item.type === 'subtab') {
      const parentTarget = getParentInsertionTargetFromPoint(clientX, clientY)
      if (parentTarget) {
        markClickSuppressed(`tab:${parentTarget.targetId}`)
        moveSubTabToParent(item.parentTabId, item.subTabId, parentTarget.targetId)
      } else {
        const subTabTarget = getSubTabInsertionTargetFromPoint(clientX, clientY)
        if (subTabTarget && item.parentTabId === activeTab.id) {
          markClickSuppressed(`subtab:${subTabTarget.targetId}`)
          moveSubTabToTarget(item.parentTabId, item.subTabId, subTabTarget)
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
    setMode((previous) => (previous.active ? DEFAULT_ARRANGE_MODE : previous))
  }, [viewMode])

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
    if (!mode.active || mode.scope !== 'spaces' || viewMode !== 'spaces') return

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

  return {
    mode,
    draggingItem,
    spaceDragPreview,
    tabDragPreview,
    primaryTabRailRef,
    subTabRailRef,
    spacesGridRef,
    trashDropRef,
    isDraggingOverTrashDrop,
    suppressNextSpaceArrangeExitRef,
    clearPressTimer,
    clearTapCandidate,
    startDragSeed,
    startTapCandidate,
    finalizeTapCandidate,
    consumeClickSuppression,
    enter,
    exit,
    enterFromContext,
    startPress,
    handleSpacePointerMove,
    handleSpacePointerUp,
    cancelSpacePointerDrag,
    handleTabPointerMove,
    handleTabPointerUp,
    cancelTabPointerDrag,
  }
}
