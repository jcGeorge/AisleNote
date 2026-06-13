import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { Editor } from '@toast-ui/editor'
import {
  getNoteMentionQueryAtSelection,
  getWysiwygView,
  type NoteMentionQuery,
} from '../editor/prosemirror-utils'
import type { AppState, NoteCopyMode, NoteLocation, ViewMode } from '../types/app'
import {
  buildNoteMentionNavigatorRows,
  createDefaultNoteMentionSelection,
  filterNoteMentionSearchEntries,
  getNoteMentionAisleItems,
  getNoteMentionPreviewData,
  getNoteMentionSearchEntryDetails,
  getNoteMentionSelectedAisleId,
  getNoteMentionTarget,
  isNoteMentionCopyAction,
  moveNoteMentionActiveRow,
  moveNoteMentionSelectionInRow,
  resolveNoteMentionSelection,
  updateNoteMentionSelectionForRow,
  type NoteMentionAction,
  type NoteMentionNavigatorItem,
  type NoteMentionPreviewData,
  type NoteMentionNavigatorRowId,
  type NoteMentionSearchEntryDetails,
  type NoteMentionSelection,
  type NoteMentionTarget,
} from './note-mention-picker'
import {
  createNoteMentionSearchMachineState,
  getNoteMentionSearchEffectiveIndex,
  getNoteMentionSearchResolvedTarget,
  reduceNoteMentionSearchMachine,
  type NoteMentionSearchMachineContext,
  type NoteMentionSearchMachineEvent,
  type NoteMentionSearchMachineIntent,
  type NoteMentionSearchMachineState,
} from './note-mention-state-machine'
import { shouldDismissEmptyNoteMentionOnSpace } from './note-mention-keyboard'
import { listSearchableNoteLocations, type NoteSearchEntry } from './note-locations'
import type { NoteReferenceAction, NoteReferenceEditorCommandResult } from './note-reference-model'

type NoteMentionMenuState = {
  top: number
  left: number
  selectorHeight: number
  anchor: NoteMentionMenuAnchor
  query: NoteMentionQuery
  selection: NoteMentionSelection
  activeRow: NoteMentionNavigatorRowId
  searchAisleId?: string | null
  previewLayout: NoteMentionPreviewLayout
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
  previewLayout: NoteMentionPreviewLayout
}

export type NoteMentionViewport = {
  width: number
  height: number
}

export type NoteMentionPreviewLayout = 'left'

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
  }) => NoteReferenceEditorCommandResult
  replaceCurrentNoteFromMention: (params: {
    target: NoteMentionTarget
    mode: NoteCopyMode
  }) => NoteReferenceEditorCommandResult
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
  options: {
    previewSize?: NoteMentionMenuSize | null
  } = {},
): NoteMentionMenuPosition {
  const previewSize = options.previewSize ?? null
  const previewLayout: NoteMentionPreviewLayout = 'left'
  const combinedWidth = previewSize ? previewSize.width + gap + menuSize.width : menuSize.width
  const combinedHeight = menuSize.height
  const maxLeft = Math.max(gap, viewport.width - combinedWidth - gap)
  const preferredLeft = previewSize ? anchor.left - previewSize.width - gap : anchor.left
  const belowTop = anchor.bottom + gap
  const aboveTop = anchor.top - combinedHeight - gap
  const belowSpace = Math.max(0, viewport.height - gap - belowTop)
  const aboveSpace = Math.max(0, anchor.top - gap)
  const preferredTop = belowSpace >= aboveSpace ? belowTop : aboveTop

  return {
    top: clamp(preferredTop, gap, Math.max(gap, viewport.height - combinedHeight - gap)),
    left: clamp(preferredLeft, gap, maxLeft),
    previewLayout,
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

function getEstimatedPreviewSize(viewport: NoteMentionViewport): NoteMentionMenuSize {
  return {
    width: Math.min(281.6, Math.max(0, viewport.width - 16)),
    height: Math.min(260, Math.max(140, viewport.height - 16)),
  }
}

function toReferenceAction(action: NoteMentionAction): NoteReferenceAction {
  return action === 'preview' ? 'preview' : 'link'
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
  const [searchMachine, setSearchMachine] = useState<NoteMentionSearchMachineState>(() =>
    createNoteMentionSearchMachineState(),
  )
  const [keyboardFocusVisible, setKeyboardFocusVisible] = useState(false)
  const searchMachineRef = useRef<NoteMentionSearchMachineState>(searchMachine)
  const menuRef = useRef<NoteMentionMenuState | null>(null)
  const dismissedQueryRef = useRef<NoteMentionQuery | null>(null)
  const closeMenuRef = useRef<(options?: { restoreEditorFocus?: boolean }) => void>(() => {})
  const chooseTargetRef = useRef<(target: NoteMentionTarget, action: NoteMentionAction) => void>(() => {})
  const pendingNavigatorCopyTargetRef = useRef<NoteMentionTarget | null>(null)

  menuRef.current = menu
  searchMachineRef.current = searchMachine

  const applySearchMachineState = useCallback((nextState: NoteMentionSearchMachineState) => {
    searchMachineRef.current = nextState
    setSearchMachine(nextState)
    setMenu((current) => {
      if (!current) return current
      const nextAisleId = nextState.searchAisleId
      return current.searchAisleId === nextAisleId ? current : { ...current, searchAisleId: nextAisleId }
    })
  }, [])

  const resetSearchMachine = useCallback(() => {
    pendingNavigatorCopyTargetRef.current = null
    setKeyboardFocusVisible(false)
    applySearchMachineState(createNoteMentionSearchMachineState())
  }, [applySearchMachineState])

  const closeMenu = useCallback((options: { restoreEditorFocus?: boolean } = {}) => {
    const editorToRestore = options.restoreEditorFocus ? editorRef.current : null
    resetSearchMachine()
    setMenu(null)
    if (!editorToRestore) return
    window.requestAnimationFrame(() => {
      if (editorRef.current !== editorToRestore) return
      editorToRestore.focus()
      syncToolbarFormatState()
    })
  }, [editorRef, resetSearchMachine, syncToolbarFormatState])
  closeMenuRef.current = closeMenu

  const dismissCurrentQuery = useCallback(() => {
    const currentMenu = menuRef.current
    const activeEditor = editorRef.current
    const currentQuery = currentMenu?.query ?? getNoteMentionQueryAtSelection(getWysiwygView(activeEditor))
    if (currentQuery) dismissedQueryRef.current = currentQuery
    closeMenuRef.current()
  }, [editorRef])

  const getSearchEntries = useCallback(
    (query: string) => filterNoteMentionSearchEntries(listSearchableNoteLocations(stateRef.current), query, activeNoteLocation),
    [activeNoteLocation, stateRef],
  )

  useEffect(() => {
    if (viewMode !== 'main' && menuRef.current) closeMenu()
  }, [closeMenu, viewMode])

  const getEntryLocation = useCallback((entry: NoteSearchEntry): NoteLocation => ({
    domainId: entry.domainId,
    spaceId: entry.spaceId,
    tabId: entry.tabId,
    subTabId: entry.subTabId,
  }), [])

  const getAisleItemsForEntry = useCallback((entry: NoteSearchEntry) =>
    getNoteMentionAisleItems(stateRef.current, getEntryLocation(entry)), [getEntryLocation, stateRef])

  const restoreEditorFocus = useCallback(() => {
    const editorToRestore = editorRef.current
    if (!editorToRestore) return
    window.requestAnimationFrame(() => {
      if (editorRef.current !== editorToRestore) return
      editorToRestore.focus()
      syncToolbarFormatState()
    })
  }, [editorRef, syncToolbarFormatState])

  const getSearchMachineContext = useCallback((
    entries: NoteSearchEntry[],
    options: { index?: number } = {},
  ): NoteMentionSearchMachineContext => {
    const index = typeof options.index === 'number'
      ? clamp(options.index, 0, Math.max(0, entries.length - 1))
      : getNoteMentionSearchEffectiveIndex(searchMachineRef.current, entries.length)
    const entry = entries[index]
    const aisleItems = entry ? getAisleItemsForEntry(entry) : []
    const target = entry ? getEntryLocation(entry) : null
    const selectedAisleId = target
      ? getNoteMentionSelectedAisleId(stateRef.current, target, menuRef.current?.searchAisleId)
      : null
    const selectedAisleIndex = Math.max(0, aisleItems.findIndex((item) => item.id === selectedAisleId))
    return {
      resultCount: entries.length,
      aisleCount: aisleItems.length,
      aisleIds: aisleItems.map((item) => item.id),
      selectedAisleId,
      selectedAisleIndex,
      copyRequiresConfirmation: requireCopyConfirmation,
    }
  }, [getAisleItemsForEntry, getEntryLocation, requireCopyConfirmation, stateRef])

  const dispatchSearchMachineEvent = useCallback((
    event: NoteMentionSearchMachineEvent,
    context: NoteMentionSearchMachineContext,
  ): NoteMentionSearchMachineIntent => {
    const result = reduceNoteMentionSearchMachine(searchMachineRef.current, event, context)
    applySearchMachineState(result.state)
    return result.intent
  }, [applySearchMachineState])

  const highlightSearchResult = useCallback((index: number) => {
    const currentMenu = menuRef.current
    if (!currentMenu) return
    const entries = getSearchEntries(currentMenu.query.query)
    dispatchSearchMachineEvent(
      { type: 'hover-result', index },
      getSearchMachineContext(entries, { index }),
    )
  }, [dispatchSearchMachineEvent, getSearchEntries, getSearchMachineContext])

  const selectSearchResult = useCallback((index: number) => {
    const currentMenu = menuRef.current
    if (!currentMenu) return
    const entries = getSearchEntries(currentMenu.query.query)
    dispatchSearchMachineEvent(
      { type: 'click-result', index },
      getSearchMachineContext(entries, { index }),
    )
  }, [dispatchSearchMachineEvent, getSearchEntries, getSearchMachineContext])

  const clampSearchSelection = useCallback((entriesLength: number, options: { clearSelection?: boolean } = {}) => {
    dispatchSearchMachineEvent(
      { type: 'clamp-results', clearSelection: options.clearSelection },
      { resultCount: entriesLength, copyRequiresConfirmation: requireCopyConfirmation },
    )
  }, [dispatchSearchMachineEvent, requireCopyConfirmation])

  const setFocusedAction = useCallback((index: number) => {
    dispatchSearchMachineEvent(
      { type: 'focus-action', index },
      { resultCount: 0, copyRequiresConfirmation: requireCopyConfirmation },
    )
  }, [dispatchSearchMachineEvent, requireCopyConfirmation])

  const refreshQuery = useCallback(() => {
    if (viewMode !== 'main' || !editorRef.current) return
    const activeEditor = editorRef.current
    const query = getNoteMentionQueryAtSelection(getWysiwygView(activeEditor))
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
    const searchMode = query.query.trim().length > 0
    const itemCount = searchMode ? Math.max(1, entries.length) : 6
    const viewport = getViewport()
    const anchor = getMenuAnchor(
      editorRef,
      editorEventRootRef,
      activeAisleIdRef,
      query.to,
    )
    const menuSize = getEstimatedMenuSize(itemCount, viewport, { searchMode })
    const queryChanged = currentMenu?.query.query !== query.query
    clampSearchSelection(entries.length, { clearSelection: queryChanged })
    if (queryChanged || !currentMenu) {
      resetSearchMachine()
    }
    setMenu({
      ...getViewportSafeNoteMentionMenuPosition(
        anchor,
        menuSize,
        viewport,
        8,
        {
          previewSize: !searchMode || entries.length > 0 ? getEstimatedPreviewSize(viewport) : null,
        },
      ),
      selectorHeight: menuSize.height,
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
    resetSearchMachine,
    stateRef,
    viewMode,
  ])

  const executeTargetAction = useCallback((target: NoteMentionTarget, action: NoteMentionAction) => {
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

  const chooseTarget = useCallback((target: NoteMentionTarget, action: NoteMentionAction) => {
    if (isNoteMentionCopyAction(action) && requireCopyConfirmation) {
      pendingNavigatorCopyTargetRef.current = target
      dispatchSearchMachineEvent(
        { type: 'choose-action', action },
        { resultCount: 0, copyRequiresConfirmation: requireCopyConfirmation },
      )
      return
    }
    executeTargetAction(target, action)
  }, [dispatchSearchMachineEvent, executeTargetAction, requireCopyConfirmation])
  chooseTargetRef.current = chooseTarget

  const getSearchEntryTarget = useCallback((entry: NoteSearchEntry, aisleIdOverride?: string | null): NoteMentionTarget => {
    const target = getEntryLocation(entry)
    const aisleId = getNoteMentionSelectedAisleId(
      stateRef.current,
      target,
      aisleIdOverride ?? menuRef.current?.searchAisleId,
    )
    return aisleId ? { ...target, aisleIds: [aisleId] } : target
  }, [getEntryLocation, stateRef])

  const chooseSearchEntry = useCallback((entry: NoteSearchEntry, action: NoteMentionAction) => {
    chooseTargetRef.current(getSearchEntryTarget(entry), action)
  }, [getSearchEntryTarget])

  const executeSearchAction = useCallback((action: NoteMentionAction) => {
    const currentMenu = menuRef.current
    if (!currentMenu) return
    const entries = getSearchEntries(currentMenu.query.query)
    const resolved = getNoteMentionSearchResolvedTarget(searchMachineRef.current, entries)
    if (!resolved) return
    chooseTargetRef.current(getSearchEntryTarget(resolved.entry, resolved.aisleId), action)
  }, [getSearchEntries, getSearchEntryTarget])

  const handleSearchMachineIntent = useCallback((intent: NoteMentionSearchMachineIntent) => {
    if (intent.type === 'none' || intent.type === 'request-copy-confirm' || intent.type === 'cancel-copy') return
    if (intent.type === 'return-to-typing') {
      restoreEditorFocus()
      return
    }
    if (intent.type === 'dismiss-menu') {
      const currentMenu = menuRef.current
      if (currentMenu) dismissedQueryRef.current = currentMenu.query
      closeMenuRef.current({ restoreEditorFocus: true })
      return
    }
    executeSearchAction(intent.action)
  }, [executeSearchAction, restoreEditorFocus])

  const chooseFocusedSearchAction = useCallback((action: NoteMentionAction) => {
    const currentMenu = menuRef.current
    if (!currentMenu) return
    const entries = getSearchEntries(currentMenu.query.query)
    const intent = dispatchSearchMachineEvent(
      { type: 'choose-action', action },
      getSearchMachineContext(entries),
    )
    handleSearchMachineIntent(intent)
  }, [dispatchSearchMachineEvent, getSearchEntries, getSearchMachineContext, handleSearchMachineIntent])

  const confirmPendingCopyAction = useCallback(() => {
    const currentMenu = menuRef.current
    if (!currentMenu) return
    if (!currentMenu.query.query.trim()) {
      const action = searchMachineRef.current.pendingCopyAction
      const target = pendingNavigatorCopyTargetRef.current ?? getNoteMentionTarget(currentMenu.selection)
      if (!action || !isNoteMentionCopyAction(action)) return
      pendingNavigatorCopyTargetRef.current = null
      executeTargetAction(target, action)
      return
    }
    const entries = getSearchEntries(currentMenu.query.query)
    const intent = dispatchSearchMachineEvent(
      { type: 'confirm-copy' },
      getSearchMachineContext(entries),
    )
    handleSearchMachineIntent(intent)
  }, [dispatchSearchMachineEvent, executeTargetAction, getSearchEntries, getSearchMachineContext, handleSearchMachineIntent])

  const cancelPendingCopyAction = useCallback(() => {
    pendingNavigatorCopyTargetRef.current = null
    const currentMenu = menuRef.current
    const entries = currentMenu ? getSearchEntries(currentMenu.query.query) : []
    const intent = dispatchSearchMachineEvent(
      { type: 'cancel-copy' },
      getSearchMachineContext(entries),
    )
    handleSearchMachineIntent(intent)
  }, [dispatchSearchMachineEvent, getSearchEntries, getSearchMachineContext, handleSearchMachineIntent])

  const clearNavigatorCopyConfirmation = useCallback(() => {
    if (!pendingNavigatorCopyTargetRef.current && !searchMachineRef.current.pendingCopyAction) return
    pendingNavigatorCopyTargetRef.current = null
    dispatchSearchMachineEvent(
      { type: 'cancel-copy' },
      { resultCount: 0, copyRequiresConfirmation: requireCopyConfirmation },
    )
  }, [dispatchSearchMachineEvent, requireCopyConfirmation])

  const setActiveRow = useCallback((rowId: NoteMentionNavigatorRowId) => {
    clearNavigatorCopyConfirmation()
    setMenu((current) => (current ? { ...current, activeRow: rowId } : current))
  }, [clearNavigatorCopyConfirmation])

  const selectNavigatorItem = useCallback((rowId: NoteMentionNavigatorRowId, itemId: string) => {
    clearNavigatorCopyConfirmation()
    setMenu((current) =>
      current
        ? {
            ...current,
            activeRow: rowId,
            selection: updateNoteMentionSelectionForRow(stateRef.current, current.selection, rowId, itemId),
          }
        : current,
    )
  }, [clearNavigatorCopyConfirmation, stateRef])

  const selectSearchAisle = useCallback((aisleId: string) => {
    const currentMenu = menuRef.current
    if (currentMenu?.query.query.trim()) {
      const entries = getSearchEntries(currentMenu.query.query)
      const effectiveIndex = getNoteMentionSearchEffectiveIndex(searchMachineRef.current, entries.length)
      const entry = entries[effectiveIndex]
      const aisleItems = entry ? getAisleItemsForEntry(entry) : []
      const nextIndex = aisleItems.findIndex((item) => item.id === aisleId)
      dispatchSearchMachineEvent(
        {
          type: 'select-aisle',
          aisleId,
          index: Math.max(0, nextIndex),
          advanceToActions: true,
        },
        getSearchMachineContext(entries, { index: effectiveIndex }),
      )
      return
    }
    setMenu((current) => (current ? { ...current, searchAisleId: aisleId } : current))
  }, [dispatchSearchMachineEvent, getAisleItemsForEntry, getSearchEntries, getSearchMachineContext])

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
      const isPreviewShortcut = !searchMode && event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
      const isNavigatorHorizontalKey = !searchMode && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      const isSearchHorizontalKey = searchMode && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      const isArrowKey =
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight'
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
      if (isArrowKey) setKeyboardFocusVisible(true)

      if (event.key === 'Escape') {
        if (searchMode) {
          const intent = dispatchSearchMachineEvent(
            { type: 'escape' },
            getSearchMachineContext(entries),
          )
          handleSearchMachineIntent(intent)
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
        chooseTargetRef.current(getNoteMentionTarget(menu.selection), isPreviewShortcut ? 'preview' : 'link')
        return
      }

      if (itemCount <= 0) return

      const dispatchSearchKeyEvent = (
        machineEvent: NoteMentionSearchMachineEvent,
        options: { index?: number } = {},
      ) => {
        const intent = dispatchSearchMachineEvent(machineEvent, getSearchMachineContext(entries, options))
        handleSearchMachineIntent(intent)
      }

      if (event.key === 'Enter') {
        dispatchSearchKeyEvent({ type: 'enter' })
        return
      }

      if (event.key === 'Tab') {
        dispatchSearchKeyEvent({ type: 'tab', shiftKey: event.shiftKey })
        return
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        dispatchSearchKeyEvent({ type: 'horizontal', delta: event.key === 'ArrowRight' ? 1 : -1 })
        return
      }
      if (event.key === 'ArrowDown') {
        const index = (getNoteMentionSearchEffectiveIndex(searchMachineRef.current, itemCount) + 1) % itemCount
        dispatchSearchKeyEvent({ type: 'keyboard-result-move', index }, { index })
        return
      }
      if (event.key === 'ArrowUp') {
        const index = (getNoteMentionSearchEffectiveIndex(searchMachineRef.current, itemCount) - 1 + itemCount) % itemCount
        dispatchSearchKeyEvent({ type: 'keyboard-result-move', index }, { index })
        return
      }
      if (event.key === 'Home') {
        dispatchSearchKeyEvent({ type: 'keyboard-result-move', index: 0 }, { index: 0 })
        return
      }
      if (event.key === 'End') {
        dispatchSearchKeyEvent({ type: 'keyboard-result-move', index: itemCount - 1 }, { index: itemCount - 1 })
        return
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.note-mention-popover')) return
      closeMenuRef.current()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [
    dispatchSearchMachineEvent,
    getSearchMachineContext,
    getSearchEntries,
    handleSearchMachineIntent,
    menu,
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
  const normalizedActiveSearchIndex = Math.max(0, Math.min(Math.max(0, searchEntries.length - 1), searchMachine.activeIndex))
  const normalizedSelectedSearchIndex = searchMachine.selectedIndex === null
    ? null
    : Math.max(0, Math.min(Math.max(0, searchEntries.length - 1), searchMachine.selectedIndex))
  const effectiveSearchIndex = getNoteMentionSearchEffectiveIndex(searchMachine, searchEntries.length)
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
  const previewTarget = useMemo((): NoteMentionTarget | null => {
    if (!menu) return null
    if (menu.query.query.trim()) {
      if (!activeSearchLocation) return null
      const aisleId = getNoteMentionSelectedAisleId(state, activeSearchLocation, selectedSearchAisleId)
      return aisleId ? { ...activeSearchLocation, aisleIds: [aisleId] } : activeSearchLocation
    }
    return getNoteMentionTarget(resolveNoteMentionSelection(state, menu.selection))
  }, [activeSearchLocation, menu, selectedSearchAisleId, state])
  const preview: NoteMentionPreviewData | null = useMemo(
    () => getNoteMentionPreviewData(state, previewTarget),
    [previewTarget, state],
  )

  const reclampMenuToViewport = useCallback(() => {
    setMenu((current) => {
      if (!current) return current
      const menuNode = document.querySelector<HTMLElement>('.note-mention-menu')
      const previewNode = document.querySelector<HTMLElement>('.note-mention-preview')
      const menuRect = menuNode?.getBoundingClientRect()
      const previewRect = previewNode?.getBoundingClientRect()
      const viewport = getViewport()
      const itemCount = current.query.query.trim().length > 0 ? Math.max(1, searchEntries.length) : 6
      const searchMode = current.query.query.trim().length > 0
      const size = menuRect && menuRect.width > 0 && menuRect.height > 0
        ? { width: menuRect.width, height: menuRect.height }
        : getEstimatedMenuSize(itemCount, viewport, { searchMode })
      const previewSize = preview
        ? previewRect && previewRect.width > 0 && previewRect.height > 0
          ? { width: previewRect.width, height: previewRect.height }
          : getEstimatedPreviewSize(viewport)
        : null
      const nextPosition = getViewportSafeNoteMentionMenuPosition(current.anchor, size, viewport, 8, {
        previewSize,
      })
      if (
        Math.abs(nextPosition.top - current.top) < 0.5 &&
        Math.abs(nextPosition.left - current.left) < 0.5 &&
        Math.abs(size.height - current.selectorHeight) < 0.5 &&
        nextPosition.previewLayout === current.previewLayout
      ) {
        return current
      }
      return { ...current, ...nextPosition, selectorHeight: size.height }
    })
  }, [preview, searchEntries.length])

  const navigatorLayoutKey = navigatorRows
    .map((row) => `${row.id}:${row.selectedId}:${row.items.length}`)
    .join('|')
  const menuLayoutKey = menu
    ? `${menu.query.from}:${menu.query.to}:${menu.query.query}:${menu.activeRow}:${menu.previewLayout}:${normalizedActiveSearchIndex}:${normalizedSelectedSearchIndex ?? 'none'}:${navigatorLayoutKey}:${searchEntries.length}:${selectedSearchAisleId}:${searchAisleItems.length}:${preview?.aisleId ?? 'none'}:${searchMachine.stage}:${searchMachine.focusedActionIndex}:${searchMachine.pendingCopyAction ?? 'none'}`
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
    preview,
    previewLayout: menu?.previewLayout ?? 'left',
    selectorHeight: menu?.selectorHeight ?? null,
    searchFocusStage: searchMachine.stage,
    keyboardFocusVisible,
    focusedAisleIndex: Math.max(0, Math.min(Math.max(0, searchAisleItems.length - 1), searchMachine.focusedAisleIndex)),
    focusedActionIndex: searchMachine.focusedActionIndex,
    focusedConfirmIndex: searchMachine.focusedConfirmIndex,
    pendingCopyAction: searchMachine.pendingCopyAction,
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
