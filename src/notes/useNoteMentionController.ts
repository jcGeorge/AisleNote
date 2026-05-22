import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { Editor } from '@toast-ui/editor'
import {
  getNoteMentionQueryAtSelection,
  getWysiwygView,
  type NoteMentionQuery,
} from '../editor/prosemirror-utils'
import type { AppState, NoteLocation, ViewMode } from '../types/app'
import {
  buildNoteMentionNavigatorRows,
  createDefaultNoteMentionSelection,
  filterNoteMentionSearchEntries,
  getNoteMentionTarget,
  moveNoteMentionActiveRow,
  moveNoteMentionSelectionInRow,
  resolveNoteMentionSelection,
  updateNoteMentionSelectionForRow,
  type NoteMentionNavigatorRowId,
  type NoteMentionSelection,
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
}

type NoteMentionUiAction = 'link' | 'context'

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
    target: NoteLocation
    action: NoteReferenceAction
    from: number
    to: number
  }) => NoteReferenceCommandResult
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

function getEstimatedMenuSize(itemCount: number, viewport: NoteMentionViewport): NoteMentionMenuSize {
  return {
    width: Math.min(620, Math.max(0, viewport.width - 16)),
    height: Math.min(380, Math.max(48, itemCount * 36 + 18)),
  }
}

function toReferenceAction(action: NoteMentionUiAction): NoteReferenceAction {
  return action === 'context' ? 'preview' : 'link'
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
  syncToolbarFormatState,
}: UseNoteMentionControllerParams) {
  const [menu, setMenu] = useState<NoteMentionMenuState | null>(null)
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const menuRef = useRef<NoteMentionMenuState | null>(null)
  const dismissedQueryRef = useRef<NoteMentionQuery | null>(null)
  const closeMenuRef = useRef<(options?: { restoreEditorFocus?: boolean }) => void>(() => {})
  const chooseSearchEntryRef = useRef<(entry: NoteSearchEntry, action: NoteMentionUiAction) => void>(() => {})
  const chooseTargetRef = useRef<(target: NoteLocation, action: NoteMentionUiAction) => void>(() => {})

  menuRef.current = menu

  const closeMenu = useCallback((options: { restoreEditorFocus?: boolean } = {}) => {
    const editorToRestore = options.restoreEditorFocus ? editorRef.current : null
    setActiveSearchIndex(0)
    setMenu(null)
    if (!editorToRestore) return
    window.requestAnimationFrame(() => {
      if (editorRef.current !== editorToRestore) return
      editorToRestore.focus()
      syncToolbarFormatState()
    })
  }, [editorRef, syncToolbarFormatState])
  closeMenuRef.current = closeMenu

  const getSearchEntries = useCallback(
    (query: string) => filterNoteMentionSearchEntries(listSearchableNoteLocations(stateRef.current), query, activeNoteLocation),
    [activeNoteLocation, stateRef],
  )

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
    setActiveSearchIndex((previous) => Math.max(0, Math.min(Math.max(0, entries.length - 1), previous)))
    setMenu({
      ...getViewportSafeNoteMentionMenuPosition(anchor, getEstimatedMenuSize(itemCount, viewport), viewport),
      anchor,
      query,
      selection,
      activeRow: currentMenu?.activeRow ?? 'space',
    })
  }, [
    activeAisleIdRef,
    editorEventRootRef,
    editorRef,
    getCurrentNoteLocation,
    getSearchEntries,
    stateRef,
    viewMode,
  ])

  const chooseTarget = useCallback((target: NoteLocation, action: NoteMentionUiAction) => {
    const currentMenu = menuRef.current
    if (!currentMenu) return
    insertNoteReferenceFromMention({
      target,
      action: toReferenceAction(action),
      from: currentMenu.query.from,
      to: currentMenu.query.to,
    })
    closeMenu()
  }, [closeMenu, insertNoteReferenceFromMention])
  chooseTargetRef.current = chooseTarget

  const chooseSearchEntry = useCallback((entry: NoteSearchEntry, action: NoteMentionUiAction) => {
    chooseTargetRef.current(
      {
        domainId: entry.domainId,
        spaceId: entry.spaceId,
        tabId: entry.tabId,
        subTabId: entry.subTabId,
      },
      action,
    )
  }, [])
  chooseSearchEntryRef.current = chooseSearchEntry

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

  useEffect(() => {
    if (!menu) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldDismissEmptyNoteMentionOnSpace(event, menu.query.query)) {
        dismissedQueryRef.current = menu.query
        closeMenuRef.current()
        return
      }

      const searchMode = menu.query.query.trim().length > 0
      const itemCount = searchMode ? getSearchEntries(menu.query.query).length : 0
      const isPreviewShortcut = event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
      const isNavigatorHorizontalKey = !searchMode && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      const isHandledKey =
        event.key === 'Escape' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === 'Enter' ||
        event.key === 'Tab' ||
        isNavigatorHorizontalKey
      if (!isHandledKey || event.altKey || ((event.metaKey || event.ctrlKey) && !isPreviewShortcut) || (event.shiftKey && event.key !== 'Tab')) return
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        dismissedQueryRef.current = menu.query
        closeMenuRef.current({ restoreEditorFocus: true })
        return
      }

      if (!searchMode) {
        if (event.key === 'ArrowDown') {
          setMenu((current) => (current ? { ...current, activeRow: moveNoteMentionActiveRow(current.activeRow, 1) } : current))
          return
        }
        if (event.key === 'ArrowUp') {
          setMenu((current) => (current ? { ...current, activeRow: moveNoteMentionActiveRow(current.activeRow, -1) } : current))
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
          setMenu((current) => (current ? { ...current, activeRow: event.key === 'Home' ? 'domain' : 'note' } : current))
          return
        }
        chooseTargetRef.current(getNoteMentionTarget(menu.selection), isPreviewShortcut ? 'context' : 'link')
        return
      }

      if (itemCount <= 0) return
      const normalizedActiveIndex = Math.max(0, Math.min(itemCount - 1, activeSearchIndex))
      if (event.key === 'ArrowDown') {
        setActiveSearchIndex((normalizedActiveIndex + 1) % itemCount)
        return
      }
      if (event.key === 'ArrowUp') {
        setActiveSearchIndex((normalizedActiveIndex - 1 + itemCount) % itemCount)
        return
      }
      if (event.key === 'Home') {
        setActiveSearchIndex(0)
        return
      }
      if (event.key === 'End') {
        setActiveSearchIndex(itemCount - 1)
        return
      }

      const entries = getSearchEntries(menu.query.query)
      const entry = entries[normalizedActiveIndex]
      if (entry) chooseSearchEntryRef.current(entry, isPreviewShortcut ? 'context' : 'link')
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
  }, [activeSearchIndex, getSearchEntries, menu, stateRef])

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

  const reclampMenuToViewport = useCallback(() => {
    setMenu((current) => {
      if (!current) return current
      const node = document.querySelector<HTMLElement>('.note-mention-menu')
      const rect = node?.getBoundingClientRect()
      const viewport = getViewport()
      const itemCount = current.query.query.trim().length > 0 ? Math.max(1, searchEntries.length) : 6
      const size = rect && rect.width > 0 && rect.height > 0
        ? { width: rect.width, height: rect.height }
        : getEstimatedMenuSize(itemCount, viewport)
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
    ? `${menu.query.from}:${menu.query.to}:${menu.query.query}:${menu.activeRow}:${activeSearchIndex}:${navigatorLayoutKey}:${searchEntries.length}`
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
    activeSearchIndex: normalizedActiveSearchIndex,
    setActiveSearchIndex,
    refreshQuery,
    closeMenu,
    setActiveRow,
    selectNavigatorItem,
    chooseSearchEntry,
    chooseTarget,
  }
}
