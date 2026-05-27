import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { Editor } from '@toast-ui/editor'
import {
  getNoteMentionQueryAtSelection,
  getWysiwygView,
  type NoteMentionQuery,
} from '../editor/prosemirror-utils'
import type { AppState, NoteCopyMode, NoteLocation, ViewMode } from '../types/app'
import {
  NOTE_MENTION_ACTIONS,
  buildNoteMentionNavigatorRows,
  createDefaultNoteMentionSelection,
  filterNoteMentionSearchEntries,
  getNoteMentionAisleItems,
  getNoteMentionSearchEntryDetails,
  getNoteMentionSearchSelectionAfterClick,
  getNoteMentionSearchSelectionAfterHover,
  getNoteMentionSearchSelectionAfterKeyboard,
  getNoteMentionSelectedAisleId,
  getNoteMentionTarget,
  isNoteMentionCopyAction,
  moveNoteMentionActiveRow,
  moveNoteMentionSelectionInRow,
  resolveNoteMentionSelection,
  updateNoteMentionSelectionForRow,
  type NoteMentionAction,
  type NoteMentionNavigatorItem,
  type NoteMentionNavigatorRowId,
  type NoteMentionSearchEntryDetails,
  type NoteMentionSearchFocusStage,
  type NoteMentionSearchSelectionState,
  type NoteMentionSelection,
  type NoteMentionTarget,
} from './note-mention-picker'
import { shouldDismissEmptyNoteMentionOnSpace } from './note-mention-keyboard'
import { listSearchableNoteLocations, type NoteSearchEntry } from './note-locations'
import type { NoteReferenceAction, NoteReferenceCommandResult } from './note-reference-model'

type NoteMentionMenuState = {
  top: number
  left: number
  anchor: NoteMentionMenuAnchor
  query: NoteMentionQuery
  selection: NoteMentionSelection
  activeRow: NoteMentionNavigatorRowId
  searchAisleId?: string | null
}

export type NoteMentionMenuAnchor = {
  top: number
  bottom: number
  left: number
}

export type NoteMentionMenuSize = {
  width: number
  height: number
}

export type NoteMentionMenuPosition = {
  top: number
  left: number
}

export type NoteMentionViewport = {
  width: number
  height: number
}

type UseNoteMentionControllerParams = {
  viewMode: ViewMode
  state: AppState
  stateRef: MutableRefObject<AppState>
  activeNoteLocation: NoteLocation
  editorRef: MutableRefObject<Editor | null>
  editorEventRootRef: MutableRefObject<HTMLElement | null>
  activeAisleIdRef: MutableRefObject<string>
  getCurrentNoteLocation: () => NoteLocation
  insertNoteReferenceFromMention: (params: {
    target: NoteMentionTarget
    action: NoteReferenceAction
    from: number
    to: number
  }) => NoteReferenceCommandResult
  replaceCurrentNoteFromMention: (params: {
    target: NoteMentionTarget
    mode: NoteCopyMode
  }) => NoteReferenceCommandResult
  requireCopyConfirmation: boolean
  syncToolbarFormatState: () => void
}

export function noteMentionQueryMatches(left: NoteMentionQuery | null, right: NoteMentionQuery | null): boolean {
  return Boolean(left && right && left.from === right.from && left.to === right.to && left.query === right.query)
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.max(min, Math.min(max, value))
}

function getViewport(): NoteMentionViewport {
  return {
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  }
}

export function getViewportSafeNoteMentionMenuPosition(
  anchor: NoteMentionMenuAnchor,
  menuSize: NoteMentionMenuSize,
  viewport: NoteMentionViewport,
  gap = 8,
): NoteMentionMenuPosition {
  const maxLeft = Math.max(gap, viewport.width - menuSize.width - gap)
  const belowTop = anchor.bottom + gap
  const aboveTop = anchor.top - menuSize.height - gap
  const hasRoomBelow = belowTop + menuSize.height <= viewport.height - gap
  const hasRoomAbove = aboveTop >= gap
  const belowSpace = Math.max(0, viewport.height - gap - belowTop)
  const aboveSpace = Math.max(0, anchor.top - gap)
  const preferredTop = hasRoomBelow || (!hasRoomAbove && belowSpace >= aboveSpace) ? belowTop : aboveTop

  return {
    top: clamp(preferredTop, gap, Math.max(gap, viewport.height - menuSize.height - gap)),
    left: clamp(anchor.left, gap, maxLeft),
  }
}

function getMenuAnchor(
  editorRef: MutableRefObject<Editor | null>,
  editorEventRootRef: MutableRefObject<HTMLElement | null>,
  activeAisleIdRef: MutableRefObject<string>,
  docPosition?: number,
): NoteMentionMenuAnchor {
  const view = getWysiwygView(editorRef.current)

  try {
    const position = typeof docPosition === 'number' ? docPosition : view?.state?.selection?.from
    const coords = typeof position === 'number' ? view?.coordsAtPos?.(position) : null
    if (coords) {
      return {
        top: coords.top,
        bottom: coords.bottom,
        left: coords.left,
      }
    }
  } catch {
    // Fall back to the active aisle pane below.
  }

  const escapedAisleId =
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(activeAisleIdRef.current) : activeAisleIdRef.current
  const activePane = editorEventRootRef.current?.querySelector<HTMLElement>(`[data-aisle-id="${escapedAisleId}"]`)
  const rect = activePane?.getBoundingClientRect()
  const top = (rect?.top ?? 84) + 12
  return {
    top,
    bottom: top,
    left: (rect?.left ?? 16) + 12,
  }
}

function getEstimatedMenuSize(itemCount: number, viewport: NoteMentionViewport, options: { searchMode?: boolean } = {}): NoteMentionMenuSize {
  const maxWidth = options.searchMode ? 744 : 620
  return {
    width: Math.min(maxWidth, Math.max(0, viewport.width - 16)),
    height: Math.min(380, Math.max(48, itemCount * 36 + 18)),
  }
}

function toReferenceAction(action: NoteMentionAction): NoteReferenceAction {
  return action === 'context' ? 'preview' : 'link'
}

function getCopyModeForMentionAction(action: NoteMentionAction): NoteCopyMode {
  return action === 'synced-copy' ? 'linked' : 'independent'
}

export function useNoteMentionController({
  viewMode,
  state,
  stateRef,
  activeNoteLocation,
  editorRef,
  editorEventRootRef,
  activeAisleIdRef,
  getCurrentNoteLocation,
  insertNoteReferenceFromMention,
  replaceCurrentNoteFromMention,
  requireCopyConfirmation,
  syncToolbarFormatState,
}: UseNoteMentionControllerParams) {
  const [menu, setMenu] = useState<NoteMentionMenuState | null>(null)
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const [selectedSearchIndex, setSelectedSearchIndex] = useState<number | null>(null)
  const [searchFocusStage, setSearchFocusStage] = useState<NoteMentionSearchFocusStage>('typing')
  const [focusedAisleIndex, setFocusedAisleIndex] = useState(0)
  const [focusedActionIndex, setFocusedActionIndex] = useState(0)
  const [focusedConfirmIndex, setFocusedConfirmIndex] = useState(0)
  const [pendingCopyAction, setPendingCopyAction] = useState<NoteMentionAction | null>(null)
  const activeSearchIndexRef = useRef(0)
  const selectedSearchIndexRef = useRef<number | null>(null)
  const searchFocusStageRef = useRef<NoteMentionSearchFocusStage>('typing')
  const focusedAisleIndexRef = useRef(0)
  const focusedActionIndexRef = useRef(0)
  const focusedConfirmIndexRef = useRef(0)
  const pendingCopyActionRef = useRef<NoteMentionAction | null>(null)
  const menuRef = useRef<NoteMentionMenuState | null>(null)
  const dismissedQueryRef = useRef<NoteMentionQuery | null>(null)
  const closeMenuRef = useRef<(options?: { restoreEditorFocus?: boolean }) => void>(() => {})
  const chooseSearchEntryRef = useRef<(entry: NoteSearchEntry, action: NoteMentionAction) => void>(() => {})
  const chooseTargetRef = useRef<(target: NoteMentionTarget, action: NoteMentionAction) => void>(() => {})
  const chooseFocusedSearchActionRef = useRef<(action: NoteMentionAction) => void>(() => {})
  const confirmPendingCopyActionRef = useRef<() => void>(() => {})
  const cancelPendingCopyActionRef = useRef<() => void>(() => {})

  menuRef.current = menu
  activeSearchIndexRef.current = activeSearchIndex
  selectedSearchIndexRef.current = selectedSearchIndex
  searchFocusStageRef.current = searchFocusStage
  focusedAisleIndexRef.current = focusedAisleIndex
  focusedActionIndexRef.current = focusedActionIndex
  focusedConfirmIndexRef.current = focusedConfirmIndex
  pendingCopyActionRef.current = pendingCopyAction

  const closeMenu = useCallback((options: { restoreEditorFocus?: boolean } = {}) => {
    const editorToRestore = options.restoreEditorFocus ? editorRef.current : null
    activeSearchIndexRef.current = 0
    selectedSearchIndexRef.current = null
    searchFocusStageRef.current = 'typing'
    focusedAisleIndexRef.current = 0
    focusedActionIndexRef.current = 0
    focusedConfirmIndexRef.current = 0
    pendingCopyActionRef.current = null
    setActiveSearchIndex(0)
    setSelectedSearchIndex(null)
    setSearchFocusStage('typing')
    setFocusedAisleIndex(0)
    setFocusedActionIndex(0)
    setFocusedConfirmIndex(0)
    setPendingCopyAction(null)
    setMenu(null)
    if (!editorToRestore) return
    window.requestAnimationFrame(() => {
      if (editorRef.current !== editorToRestore) return
      editorToRestore.focus()
      syncToolbarFormatState()
    })
  }, [editorRef, syncToolbarFormatState])
  closeMenuRef.current = closeMenu

  const dismissCurrentQuery = useCallback(() => {
    const currentMenu = menuRef.current
    const currentQuery = currentMenu?.query ?? getNoteMentionQueryAtSelection(getWysiwygView(editorRef.current))
    if (currentQuery) dismissedQueryRef.current = currentQuery
    closeMenuRef.current()
  }, [editorRef])

  const setSearchStage = useCallback((stage: NoteMentionSearchFocusStage) => {
    searchFocusStageRef.current = stage
    setSearchFocusStage(stage)
  }, [])

  const setFocusedAisle = useCallback((index: number) => {
    const nextIndex = Math.max(0, index)
    focusedAisleIndexRef.current = nextIndex
    setFocusedAisleIndex(nextIndex)
  }, [])

  const setFocusedAction = useCallback((index: number) => {
    const nextIndex = clamp(index, 0, NOTE_MENTION_ACTIONS.length - 1)
    focusedActionIndexRef.current = nextIndex
    setFocusedActionIndex(nextIndex)
  }, [])

  const setFocusedConfirm = useCallback((index: number) => {
    const nextIndex = clamp(index, 0, 1)
    focusedConfirmIndexRef.current = nextIndex
    setFocusedConfirmIndex(nextIndex)
  }, [])

  const clearPendingCopyAction = useCallback(() => {
    pendingCopyActionRef.current = null
    setPendingCopyAction(null)
  }, [])

  const setPendingCopy = useCallback((action: NoteMentionAction | null) => {
    pendingCopyActionRef.current = action
    setPendingCopyAction(action)
  }, [])

  const getSearchEntries = useCallback(
    (query: string) => filterNoteMentionSearchEntries(listSearchableNoteLocations(stateRef.current), query, activeNoteLocation),
    [activeNoteLocation, stateRef],
  )

  useEffect(() => {
    if (viewMode !== 'main') closeMenu()
  }, [closeMenu, viewMode])

  const getEntryLocation = useCallback((entry: NoteSearchEntry): NoteLocation => ({
    domainId: entry.domainId,
    spaceId: entry.spaceId,
    tabId: entry.tabId,
    subTabId: entry.subTabId,
  }), [])

  const getAisleItemsForEntry = useCallback((entry: NoteSearchEntry) =>
    getNoteMentionAisleItems(stateRef.current, getEntryLocation(entry)), [getEntryLocation, stateRef])

  const setFocusedAisleForEntry = useCallback((entry: NoteSearchEntry) => {
    const aisleItems = getAisleItemsForEntry(entry)
    const selectedAisleId = getNoteMentionSelectedAisleId(stateRef.current, getEntryLocation(entry), menuRef.current?.searchAisleId)
    const selectedIndex = Math.max(0, aisleItems.findIndex((item) => item.id === selectedAisleId))
    setFocusedAisle(selectedIndex)
  }, [getAisleItemsForEntry, getEntryLocation, setFocusedAisle, stateRef])

  const getNextSearchStageForEntry = useCallback((entry: NoteSearchEntry): NoteMentionSearchFocusStage =>
    getAisleItemsForEntry(entry).length > 0 ? 'aisles' : 'actions', [getAisleItemsForEntry])

  const restoreEditorFocus = useCallback(() => {
    const editorToRestore = editorRef.current
    if (!editorToRestore) return
    window.requestAnimationFrame(() => {
      if (editorRef.current !== editorToRestore) return
      editorToRestore.focus()
      syncToolbarFormatState()
    })
  }, [editorRef, syncToolbarFormatState])

  const getCurrentSearchSelectionState = useCallback((): NoteMentionSearchSelectionState => ({
    activeIndex: activeSearchIndexRef.current,
    selectedIndex: selectedSearchIndexRef.current,
    searchAisleId: menuRef.current?.searchAisleId ?? null,
  }), [])

  const applySearchSelectionState = useCallback((nextState: NoteMentionSearchSelectionState) => {
    const nextAisleId = nextState.searchAisleId ?? null
    const currentAisleId = menuRef.current?.searchAisleId ?? null
    const activeChanged = activeSearchIndexRef.current !== nextState.activeIndex
    const selectedChanged = selectedSearchIndexRef.current !== nextState.selectedIndex
    const aisleChanged = currentAisleId !== nextAisleId
    if (!activeChanged && !selectedChanged && !aisleChanged) return

    activeSearchIndexRef.current = nextState.activeIndex
    selectedSearchIndexRef.current = nextState.selectedIndex
    setActiveSearchIndex(nextState.activeIndex)
    setSelectedSearchIndex(nextState.selectedIndex)
    setMenu((current) => (current ? { ...current, searchAisleId: nextAisleId } : current))
  }, [])

  const highlightSearchResult = useCallback((index: number) => {
    applySearchSelectionState(getNoteMentionSearchSelectionAfterHover(getCurrentSearchSelectionState(), index))
  }, [applySearchSelectionState, getCurrentSearchSelectionState])

  const selectSearchResult = useCallback((index: number) => {
    applySearchSelectionState(getNoteMentionSearchSelectionAfterClick(getCurrentSearchSelectionState(), index))
    const currentMenu = menuRef.current
    const entry = currentMenu ? getSearchEntries(currentMenu.query.query)[index] : null
    if (entry) {
      setFocusedAisleForEntry(entry)
      setSearchStage(getNextSearchStageForEntry(entry))
    }
    clearPendingCopyAction()
  }, [
    applySearchSelectionState,
    clearPendingCopyAction,
    getCurrentSearchSelectionState,
    getNextSearchStageForEntry,
    getSearchEntries,
    setFocusedAisleForEntry,
    setSearchStage,
  ])

  const moveSearchResultFromKeyboard = useCallback((index: number) => {
    applySearchSelectionState(getNoteMentionSearchSelectionAfterKeyboard(getCurrentSearchSelectionState(), index))
    setSearchStage('results')
    clearPendingCopyAction()
  }, [applySearchSelectionState, clearPendingCopyAction, getCurrentSearchSelectionState, setSearchStage])

  const clampSearchSelection = useCallback((entriesLength: number, options: { clearSelection?: boolean } = {}) => {
    const maxIndex = Math.max(0, entriesLength - 1)
    const nextActiveIndex = Math.max(0, Math.min(maxIndex, activeSearchIndexRef.current))
    const nextSelectedIndex =
      options.clearSelection || selectedSearchIndexRef.current === null
        ? null
        : Math.max(0, Math.min(maxIndex, selectedSearchIndexRef.current))
    activeSearchIndexRef.current = nextActiveIndex
    selectedSearchIndexRef.current = nextSelectedIndex
    setActiveSearchIndex(nextActiveIndex)
    setSelectedSearchIndex(nextSelectedIndex)
  }, [])

  const refreshQuery = useCallback(() => {
    if (viewMode !== 'main' || !editorRef.current) return
    const query = getNoteMentionQueryAtSelection(getWysiwygView(editorRef.current))
    if (!query) {
      dismissedQueryRef.current = null
      if (menuRef.current) closeMenuRef.current()
      return
    }
    if (noteMentionQueryMatches(dismissedQueryRef.current, query)) {
      if (menuRef.current) closeMenuRef.current()
      return
    }
    dismissedQueryRef.current = null
    const entries = query.query.trim().length > 0 ? getSearchEntries(query.query) : []
    const currentLocation = getCurrentNoteLocation()
    const currentMenu = menuRef.current
    const selection = currentMenu
      ? resolveNoteMentionSelection(stateRef.current, currentMenu.selection)
      : createDefaultNoteMentionSelection(stateRef.current, currentLocation)
    const itemCount = query.query.trim().length > 0 ? Math.max(1, entries.length) : 6
    const viewport = getViewport()
    const anchor = getMenuAnchor(
      editorRef,
      editorEventRootRef,
      activeAisleIdRef,
      query.to,
    )
    const queryChanged = currentMenu?.query.query !== query.query
    clampSearchSelection(entries.length, { clearSelection: queryChanged })
    if (queryChanged || !currentMenu) {
      setSearchStage('typing')
      setFocusedAisle(0)
      setFocusedAction(0)
      setFocusedConfirm(0)
      clearPendingCopyAction()
    }
    setMenu({
      ...getViewportSafeNoteMentionMenuPosition(
        anchor,
        getEstimatedMenuSize(itemCount, viewport, { searchMode: query.query.trim().length > 0 }),
        viewport,
      ),
      anchor,
      query,
      selection,
      activeRow: currentMenu?.activeRow ?? 'space',
      searchAisleId: queryChanged ? null : currentMenu?.searchAisleId ?? null,
    })
  }, [
    activeAisleIdRef,
    editorEventRootRef,
    editorRef,
    getCurrentNoteLocation,
    getSearchEntries,
    clampSearchSelection,
    clearPendingCopyAction,
    stateRef,
    setFocusedAction,
    setFocusedAisle,
    setFocusedConfirm,
    setSearchStage,
    viewMode,
  ])

  const chooseTarget = useCallback((target: NoteMentionTarget, action: NoteMentionAction) => {
    const currentMenu = menuRef.current
    if (!currentMenu) return
    if (isNoteMentionCopyAction(action)) {
      const result = replaceCurrentNoteFromMention({
        target,
        mode: getCopyModeForMentionAction(action),
      })
      if (result.handled) closeMenu()
      return
    }
    insertNoteReferenceFromMention({
      target,
      action: toReferenceAction(action),
      from: currentMenu.query.from,
      to: currentMenu.query.to,
    })
    closeMenu()
  }, [closeMenu, insertNoteReferenceFromMention, replaceCurrentNoteFromMention])
  chooseTargetRef.current = chooseTarget

  const getSearchEntryTarget = useCallback((entry: NoteSearchEntry): NoteMentionTarget => {
    const target = getEntryLocation(entry)
    const aisleId = getNoteMentionSelectedAisleId(stateRef.current, target, menuRef.current?.searchAisleId)
    return aisleId ? { ...target, aisleIds: [aisleId] } : target
  }, [getEntryLocation, stateRef])

  const chooseSearchEntry = useCallback((entry: NoteSearchEntry, action: NoteMentionAction) => {
    chooseTargetRef.current(getSearchEntryTarget(entry), action)
  }, [getSearchEntryTarget])
  chooseSearchEntryRef.current = chooseSearchEntry

  const chooseFocusedSearchAction = useCallback((action: NoteMentionAction) => {
    const currentMenu = menuRef.current
    if (!currentMenu) return
    const entries = getSearchEntries(currentMenu.query.query)
    const index = selectedSearchIndexRef.current ?? activeSearchIndexRef.current
    const entry = entries[clamp(index, 0, entries.length - 1)]
    if (!entry) return
    if (isNoteMentionCopyAction(action)) {
      if (!requireCopyConfirmation) {
        chooseSearchEntryRef.current(entry, action)
        return
      }
      setPendingCopy(action)
      setFocusedConfirm(0)
      setSearchStage('copy-confirm')
      return
    }
    chooseSearchEntryRef.current(entry, action)
  }, [getSearchEntries, requireCopyConfirmation, setFocusedConfirm, setPendingCopy, setSearchStage])
  chooseFocusedSearchActionRef.current = chooseFocusedSearchAction

  const confirmPendingCopyAction = useCallback(() => {
    const action = pendingCopyActionRef.current
    if (!action || !isNoteMentionCopyAction(action)) return
    const currentMenu = menuRef.current
    if (!currentMenu) return
    const entries = getSearchEntries(currentMenu.query.query)
    const index = selectedSearchIndexRef.current ?? activeSearchIndexRef.current
    const entry = entries[clamp(index, 0, entries.length - 1)]
    if (!entry) return
    chooseSearchEntryRef.current(entry, action)
  }, [getSearchEntries])
  confirmPendingCopyActionRef.current = confirmPendingCopyAction

  const cancelPendingCopyAction = useCallback(() => {
    clearPendingCopyAction()
    setSearchStage('actions')
  }, [clearPendingCopyAction, setSearchStage])
  cancelPendingCopyActionRef.current = cancelPendingCopyAction

  const setActiveRow = useCallback((rowId: NoteMentionNavigatorRowId) => {
    setMenu((current) => (current ? { ...current, activeRow: rowId } : current))
  }, [])

  const selectNavigatorItem = useCallback((rowId: NoteMentionNavigatorRowId, itemId: string) => {
    setMenu((current) =>
      current
        ? {
            ...current,
            activeRow: rowId,
            selection: updateNoteMentionSelectionForRow(stateRef.current, current.selection, rowId, itemId),
          }
        : current,
    )
  }, [stateRef])

  const selectSearchAisle = useCallback((aisleId: string) => {
    const currentMenu = menuRef.current
    if (currentMenu?.query.query.trim()) {
      const entries = getSearchEntries(currentMenu.query.query)
      const entry = entries[selectedSearchIndexRef.current ?? activeSearchIndexRef.current]
      const aisleItems = entry ? getAisleItemsForEntry(entry) : []
      const nextIndex = aisleItems.findIndex((item) => item.id === aisleId)
      setFocusedAisle(Math.max(0, nextIndex))
      setSearchStage('actions')
      clearPendingCopyAction()
    }
    setMenu((current) => (current ? { ...current, searchAisleId: aisleId } : current))
  }, [clearPendingCopyAction, getAisleItemsForEntry, getSearchEntries, setFocusedAisle, setSearchStage])

  useEffect(() => {
    if (!menu) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldDismissEmptyNoteMentionOnSpace(event, menu.query.query)) {
        dismissedQueryRef.current = menu.query
        closeMenuRef.current()
        return
      }

      const searchMode = menu.query.query.trim().length > 0
      const entries = searchMode ? getSearchEntries(menu.query.query) : []
      const itemCount = entries.length
      const baseSearchIndex = selectedSearchIndexRef.current ?? activeSearchIndex
      const normalizedActiveIndex = Math.max(0, Math.min(Math.max(0, itemCount - 1), baseSearchIndex))
      const entry = entries[normalizedActiveIndex]
      const searchAisleItems = entry ? getNoteMentionAisleItems(stateRef.current, {
        domainId: entry.domainId,
        spaceId: entry.spaceId,
        tabId: entry.tabId,
        subTabId: entry.subTabId,
      }) : []
      const isPreviewShortcut = !searchMode && event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
      const isNavigatorHorizontalKey = !searchMode && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      const isSearchHorizontalKey = searchMode && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      const isHandledKey =
        event.key === 'Escape' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === 'Enter' ||
        event.key === 'Tab' ||
        isNavigatorHorizontalKey ||
        isSearchHorizontalKey
      if (!isHandledKey || event.altKey || ((event.metaKey || event.ctrlKey) && !searchMode && !isPreviewShortcut) || (event.shiftKey && event.key !== 'Tab')) return
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        if (searchMode && (searchFocusStageRef.current !== 'typing' || selectedSearchIndexRef.current !== null || pendingCopyActionRef.current)) {
          applySearchSelectionState({
            activeIndex: activeSearchIndexRef.current,
            selectedIndex: null,
            searchAisleId: null,
          })
          setSearchStage('typing')
          setFocusedAisle(0)
          setFocusedAction(0)
          setFocusedConfirm(0)
          clearPendingCopyAction()
          restoreEditorFocus()
          return
        }
        dismissedQueryRef.current = menu.query
        closeMenuRef.current({ restoreEditorFocus: true })
        return
      }

      if (!searchMode) {
        if (event.key === 'ArrowDown') {
          setMenu((current) => {
            if (!current) return current
            const rowIds = buildNoteMentionNavigatorRows(stateRef.current, current.selection).map((row) => row.id)
            return { ...current, activeRow: moveNoteMentionActiveRow(current.activeRow, 1, rowIds) }
          })
          return
        }
        if (event.key === 'ArrowUp') {
          setMenu((current) => {
            if (!current) return current
            const rowIds = buildNoteMentionNavigatorRows(stateRef.current, current.selection).map((row) => row.id)
            return { ...current, activeRow: moveNoteMentionActiveRow(current.activeRow, -1, rowIds) }
          })
          return
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          const delta = event.key === 'ArrowRight' ? 1 : -1
          setMenu((current) =>
            current
              ? {
                  ...current,
                  selection: moveNoteMentionSelectionInRow(stateRef.current, current.selection, current.activeRow, delta),
                }
              : current,
          )
          return
        }
        if (event.key === 'Home' || event.key === 'End') {
          setMenu((current) => {
            if (!current) return current
            const rowIds = buildNoteMentionNavigatorRows(stateRef.current, current.selection).map((row) => row.id)
            return { ...current, activeRow: event.key === 'Home' ? 'domain' : rowIds[rowIds.length - 1] ?? 'note' }
          })
          return
        }
        chooseTargetRef.current(getNoteMentionTarget(menu.selection), isPreviewShortcut ? 'context' : 'link')
        return
      }

      if (itemCount <= 0) return

      const lockSearchResult = (index: number) => {
        const nextIndex = clamp(index, 0, itemCount - 1)
        const nextEntry = entries[nextIndex]
        if (!nextEntry) return
        applySearchSelectionState(getNoteMentionSearchSelectionAfterClick(getCurrentSearchSelectionState(), nextIndex))
        setFocusedAisleForEntry(nextEntry)
        setFocusedAction(0)
        setFocusedConfirm(0)
        clearPendingCopyAction()
        setSearchStage(getNextSearchStageForEntry(nextEntry))
      }

      const selectAisleIndex = (index: number, nextStage?: NoteMentionSearchFocusStage) => {
        if (!entry || searchAisleItems.length <= 0) return
        const nextIndex = clamp(index, 0, searchAisleItems.length - 1)
        const aisleId = searchAisleItems[nextIndex]?.id
        if (!aisleId) return
        setFocusedAisle(nextIndex)
        setMenu((current) => {
          if (!current) return current
          return { ...current, searchAisleId: aisleId }
        })
        if (nextStage) setSearchStage(nextStage)
      }

      if (event.key === 'Enter') {
        if (searchFocusStageRef.current === 'copy-confirm') {
          if (focusedConfirmIndexRef.current === 0) confirmPendingCopyActionRef.current()
          else cancelPendingCopyActionRef.current()
          return
        }
        if (searchFocusStageRef.current === 'actions') {
          chooseFocusedSearchActionRef.current(NOTE_MENTION_ACTIONS[focusedActionIndexRef.current] ?? 'link')
          return
        }
        if (searchFocusStageRef.current === 'aisles') {
          selectAisleIndex(focusedAisleIndexRef.current, 'actions')
          return
        }
        lockSearchResult(normalizedActiveIndex)
        return
      }

      if (event.key === 'Tab') {
        const delta = event.shiftKey ? -1 : 1
        if (searchFocusStageRef.current === 'copy-confirm') {
          if (delta < 0 && focusedConfirmIndexRef.current === 0) {
            clearPendingCopyAction()
            setSearchStage('actions')
            return
          }
          setFocusedConfirm(focusedConfirmIndexRef.current + delta)
          return
        }
        if (searchFocusStageRef.current === 'actions') {
          const nextIndex = focusedActionIndexRef.current + delta
          if (nextIndex < 0) {
            setSearchStage(searchAisleItems.length > 0 ? 'aisles' : 'results')
            return
          }
          setFocusedAction(nextIndex)
          return
        }
        if (searchFocusStageRef.current === 'aisles') {
          const nextIndex = focusedAisleIndexRef.current + delta
          if (nextIndex < 0) {
            setSearchStage('results')
            return
          }
          if (nextIndex >= searchAisleItems.length) {
            setSearchStage('actions')
            return
          }
          selectAisleIndex(nextIndex)
          return
        }
        lockSearchResult(normalizedActiveIndex)
        return
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const delta = event.key === 'ArrowRight' ? 1 : -1
        if (searchFocusStageRef.current === 'copy-confirm') {
          setFocusedConfirm(focusedConfirmIndexRef.current + delta)
          return
        }
        if (searchFocusStageRef.current === 'actions') {
          setFocusedAction(focusedActionIndexRef.current + delta)
          return
        }
        if (entry && searchAisleItems.length > 0) {
          setSearchStage('aisles')
          selectAisleIndex(focusedAisleIndexRef.current + delta)
        }
        return
      }
      if (event.key === 'ArrowDown') {
        moveSearchResultFromKeyboard((normalizedActiveIndex + 1) % itemCount)
        return
      }
      if (event.key === 'ArrowUp') {
        moveSearchResultFromKeyboard((normalizedActiveIndex - 1 + itemCount) % itemCount)
        return
      }
      if (event.key === 'Home') {
        moveSearchResultFromKeyboard(0)
        return
      }
      if (event.key === 'End') {
        moveSearchResultFromKeyboard(itemCount - 1)
        return
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.note-mention-menu')) return
      closeMenuRef.current()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [
    activeSearchIndex,
    applySearchSelectionState,
    clearPendingCopyAction,
    getCurrentSearchSelectionState,
    getNextSearchStageForEntry,
    getSearchEntries,
    menu,
    moveSearchResultFromKeyboard,
    restoreEditorFocus,
    setFocusedAction,
    setFocusedAisle,
    setFocusedAisleForEntry,
    setFocusedConfirm,
    setSearchStage,
    stateRef,
  ])

  const navigatorRows = useMemo(
    () => (menu ? buildNoteMentionNavigatorRows(state, menu.selection) : []),
    [menu, state],
  )
  const searchEntries = useMemo(
    () => menu?.query.query.trim()
      ? filterNoteMentionSearchEntries(listSearchableNoteLocations(state), menu.query.query, activeNoteLocation)
      : [],
    [activeNoteLocation, menu, state],
  )
  const normalizedActiveSearchIndex = Math.max(0, Math.min(Math.max(0, searchEntries.length - 1), activeSearchIndex))
  const normalizedSelectedSearchIndex = selectedSearchIndex === null
    ? null
    : Math.max(0, Math.min(Math.max(0, searchEntries.length - 1), selectedSearchIndex))
  const effectiveSearchIndex = normalizedSelectedSearchIndex ?? normalizedActiveSearchIndex
  const activeSearchEntry = searchEntries[effectiveSearchIndex] ?? null
  const activeSearchLocation = useMemo(() => activeSearchEntry
    ? {
        domainId: activeSearchEntry.domainId,
        spaceId: activeSearchEntry.spaceId,
        tabId: activeSearchEntry.tabId,
        subTabId: activeSearchEntry.subTabId,
      }
    : null, [activeSearchEntry])
  const searchAisleItems: NoteMentionNavigatorItem[] = useMemo(
    () => (activeSearchLocation ? getNoteMentionAisleItems(state, activeSearchLocation) : []),
    [activeSearchLocation, state],
  )
  const searchEntryDetails: NoteMentionSearchEntryDetails[] = useMemo(
    () => searchEntries.map((entry) => getNoteMentionSearchEntryDetails(state, entry)),
    [searchEntries, state],
  )
  const selectedSearchAisleId = activeSearchLocation
    ? getNoteMentionSelectedAisleId(state, activeSearchLocation, menu?.searchAisleId) ?? ''
    : ''

  const reclampMenuToViewport = useCallback(() => {
    setMenu((current) => {
      if (!current) return current
      const node = document.querySelector<HTMLElement>('.note-mention-menu')
      const rect = node?.getBoundingClientRect()
      const viewport = getViewport()
      const itemCount = current.query.query.trim().length > 0 ? Math.max(1, searchEntries.length) : 6
      const searchMode = current.query.query.trim().length > 0
      const size = rect && rect.width > 0 && rect.height > 0
        ? { width: rect.width, height: rect.height }
        : getEstimatedMenuSize(itemCount, viewport, { searchMode })
      const nextPosition = getViewportSafeNoteMentionMenuPosition(current.anchor, size, viewport)
      if (Math.abs(nextPosition.top - current.top) < 0.5 && Math.abs(nextPosition.left - current.left) < 0.5) {
        return current
      }
      return { ...current, ...nextPosition }
    })
  }, [searchEntries.length])

  const navigatorLayoutKey = navigatorRows
    .map((row) => `${row.id}:${row.selectedId}:${row.items.length}`)
    .join('|')
  const menuLayoutKey = menu
    ? `${menu.query.from}:${menu.query.to}:${menu.query.query}:${menu.activeRow}:${activeSearchIndex}:${normalizedSelectedSearchIndex ?? 'none'}:${navigatorLayoutKey}:${searchEntries.length}:${selectedSearchAisleId}:${searchAisleItems.length}:${searchFocusStage}:${focusedActionIndex}:${pendingCopyAction ?? 'none'}`
    : ''

  useLayoutEffect(() => {
    if (!menu) return
    reclampMenuToViewport()
  }, [menu, menuLayoutKey, reclampMenuToViewport])

  useEffect(() => {
    if (!menu) return
    window.addEventListener('resize', reclampMenuToViewport)
    return () => window.removeEventListener('resize', reclampMenuToViewport)
  }, [menu, reclampMenuToViewport])

  return {
    menu,
    navigatorRows,
    searchEntries,
    searchEntryDetails,
    activeSearchIndex: effectiveSearchIndex,
    selectedSearchIndex: normalizedSelectedSearchIndex,
    searchAisleItems,
    selectedSearchAisleId,
    searchFocusStage,
    focusedAisleIndex: Math.max(0, Math.min(Math.max(0, searchAisleItems.length - 1), focusedAisleIndex)),
    focusedActionIndex,
    focusedConfirmIndex,
    pendingCopyAction,
    setActiveSearchIndex: highlightSearchResult,
    selectSearchResult,
    selectSearchAisle,
    setFocusedAction,
    chooseFocusedSearchAction,
    confirmPendingCopyAction,
    cancelPendingCopyAction,
    refreshQuery,
    closeMenu,
    dismissCurrentQuery,
    setActiveRow,
    selectNavigatorItem,
    chooseSearchEntry,
    chooseTarget,
  }
}
