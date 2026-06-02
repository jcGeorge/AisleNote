import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { Editor } from '@toast-ui/editor'
import { TextSelection } from 'prosemirror-state'
import {
  dispatchEditorTransaction,
  type EditorOperationRuntime,
} from '../editor/editor-operation-runner'
import {
  getTagAutocompleteQueryAtSelection,
  getWysiwygView,
} from '../editor/prosemirror-utils'
import type { ViewMode } from '../types/app'
import type { TagFilterTagSummary } from './tag-filter'
import {
  getTagAutocompleteKeyboardAction,
  getTagAutocompleteReplacement,
  getTagAutocompleteSuggestions,
  rememberTagAutocompleteKey,
  type TagAutocompleteQuery,
  type TagAutocompleteSuggestion,
} from './tag-autocomplete'

export type TagAutocompleteMenuAnchor = {
  top: number
  bottom: number
  left: number
}

export type TagAutocompleteMenuState = {
  top: number
  left: number
  anchor: TagAutocompleteMenuAnchor
  query: TagAutocompleteQuery
  suggestions: TagAutocompleteSuggestion[]
  activeIndex: number
}

type TagAutocompleteMenuSize = {
  width: number
  height: number
}

type TagAutocompleteViewport = {
  width: number
  height: number
}

type UseTagAutocompleteControllerParams = {
  viewMode: ViewMode
  availableTags: TagFilterTagSummary[]
  recentTagKeys: string[]
  onRecentTagKeysChange: (keys: string[]) => void
  editorRef: MutableRefObject<Editor | null>
  editorEventRootRef: MutableRefObject<HTMLElement | null>
  activeAisleIdRef: MutableRefObject<string>
  commitActiveEditorMarkdownNow: (editor: Editor) => string
  syncToolbarFormatState: () => void
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.max(min, Math.min(max, value))
}

function getViewport(): TagAutocompleteViewport {
  return {
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  }
}

export function getViewportSafeTagAutocompleteMenuPosition(
  anchor: TagAutocompleteMenuAnchor,
  menuSize: TagAutocompleteMenuSize,
  viewport: TagAutocompleteViewport,
  gap = 8,
) {
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
): TagAutocompleteMenuAnchor {
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

function getEstimatedMenuSize(itemCount: number, viewport: TagAutocompleteViewport): TagAutocompleteMenuSize {
  return {
    width: Math.min(288, Math.max(0, viewport.width - 16)),
    height: Math.min(292, Math.max(48, itemCount * 34 + 18)),
  }
}

function tagAutocompleteQueryMatches(left: TagAutocompleteQuery | null, right: TagAutocompleteQuery | null): boolean {
  return Boolean(left && right && left.from === right.from && left.to === right.to && left.query === right.query)
}

export function useTagAutocompleteController({
  viewMode,
  availableTags,
  recentTagKeys,
  onRecentTagKeysChange,
  editorRef,
  editorEventRootRef,
  activeAisleIdRef,
  commitActiveEditorMarkdownNow,
  syncToolbarFormatState,
}: UseTagAutocompleteControllerParams) {
  const [menu, setMenu] = useState<TagAutocompleteMenuState | null>(null)
  const menuRef = useRef<TagAutocompleteMenuState | null>(null)
  const dismissedQueryRef = useRef<TagAutocompleteQuery | null>(null)
  const closeMenuRef = useRef<(options?: { restoreEditorFocus?: boolean }) => void>(() => {})
  const availableTagsRef = useRef(availableTags)
  const recentTagKeysRef = useRef(recentTagKeys)

  menuRef.current = menu
  availableTagsRef.current = availableTags
  recentTagKeysRef.current = recentTagKeys

  const operationRuntime = useMemo<EditorOperationRuntime>(() => ({
    editorRef,
    commitActiveEditorMarkdownNow,
    syncToolbarFormatState,
  }), [commitActiveEditorMarkdownNow, editorRef, syncToolbarFormatState])

  const closeMenu = useCallback((options: { restoreEditorFocus?: boolean } = {}) => {
    const editorToRestore = options.restoreEditorFocus ? editorRef.current : null
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
    const currentQuery = currentMenu?.query ?? getTagAutocompleteQueryAtSelection(getWysiwygView(editorRef.current))
    if (currentQuery) dismissedQueryRef.current = currentQuery
    closeMenuRef.current()
  }, [editorRef])

  const refreshQuery = useCallback(() => {
    if (viewMode !== 'main' || !editorRef.current) return
    const query = getTagAutocompleteQueryAtSelection(getWysiwygView(editorRef.current))
    if (!query) {
      dismissedQueryRef.current = null
      if (menuRef.current) closeMenuRef.current()
      return
    }
    if (tagAutocompleteQueryMatches(dismissedQueryRef.current, query)) {
      if (menuRef.current) closeMenuRef.current()
      return
    }

    const suggestions = getTagAutocompleteSuggestions(availableTagsRef.current, query.query, recentTagKeysRef.current)
    if (suggestions.length === 0) {
      if (menuRef.current) closeMenuRef.current()
      return
    }

    dismissedQueryRef.current = null
    const currentMenu = menuRef.current
    const queryChanged = !tagAutocompleteQueryMatches(currentMenu?.query ?? null, query)
    const viewport = getViewport()
    const anchor = getMenuAnchor(editorRef, editorEventRootRef, activeAisleIdRef, query.to)
    const activeIndex = queryChanged
      ? 0
      : clamp(currentMenu?.activeIndex ?? 0, 0, Math.max(0, suggestions.length - 1))
    setMenu({
      ...getViewportSafeTagAutocompleteMenuPosition(
        anchor,
        getEstimatedMenuSize(suggestions.length, viewport),
        viewport,
      ),
      anchor,
      query,
      suggestions,
      activeIndex,
    })
  }, [activeAisleIdRef, editorEventRootRef, editorRef, viewMode])

  useEffect(() => {
    if (viewMode !== 'main') closeMenu()
  }, [closeMenu, viewMode])

  const acceptSuggestion = useCallback((index: number) => {
    const currentMenu = menuRef.current
    if (!currentMenu) return
    const suggestion = currentMenu.suggestions[clamp(index, 0, Math.max(0, currentMenu.suggestions.length - 1))]
    if (!suggestion) return
    const latestQuery = getTagAutocompleteQueryAtSelection(getWysiwygView(editorRef.current))
    if (!tagAutocompleteQueryMatches(latestQuery, currentMenu.query)) return
    const replacement = getTagAutocompleteReplacement(suggestion.label)
    if (!replacement) return

    const result = dispatchEditorTransaction(operationRuntime, ({ view }) => {
      let transaction = view.state.tr.insertText(replacement, currentMenu.query.from, currentMenu.query.to)
      const nextPosition = currentMenu.query.from + replacement.length
      transaction = transaction.setSelection(TextSelection.create(transaction.doc, nextPosition, nextPosition))
      return transaction
    }, { syncToolbar: true })
    if (!result.handled) return

    onRecentTagKeysChange(rememberTagAutocompleteKey(recentTagKeysRef.current, suggestion.key))
    closeMenuRef.current()
  }, [editorRef, onRecentTagKeysChange, operationRuntime])

  const setActiveIndex = useCallback((index: number) => {
    setMenu((current) =>
      current
        ? {
            ...current,
            activeIndex: clamp(index, 0, Math.max(0, current.suggestions.length - 1)),
          }
        : current,
    )
  }, [])

  useEffect(() => {
    if (!menu) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const action = getTagAutocompleteKeyboardAction(event, menu.activeIndex, menu.suggestions.length)
      if (action.type === 'none') return
      event.preventDefault()
      event.stopPropagation()

      if (action.type === 'close') {
        dismissedQueryRef.current = menu.query
        closeMenuRef.current({ restoreEditorFocus: true })
        return
      }
      if (action.type === 'highlight') {
        setActiveIndex(action.index)
        return
      }
      acceptSuggestion(action.index)
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.tag-autocomplete-menu')) return
      closeMenuRef.current()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [acceptSuggestion, menu, setActiveIndex])

  const reclampMenuToViewport = useCallback(() => {
    setMenu((current) => {
      if (!current) return current
      const node = document.querySelector<HTMLElement>('.tag-autocomplete-menu')
      const rect = node?.getBoundingClientRect()
      const viewport = getViewport()
      const size = rect && rect.width > 0 && rect.height > 0
        ? { width: rect.width, height: rect.height }
        : getEstimatedMenuSize(current.suggestions.length, viewport)
      const nextPosition = getViewportSafeTagAutocompleteMenuPosition(current.anchor, size, viewport)
      if (Math.abs(nextPosition.top - current.top) < 0.5 && Math.abs(nextPosition.left - current.left) < 0.5) {
        return current
      }
      return { ...current, ...nextPosition }
    })
  }, [])

  const menuLayoutKey = menu
    ? `${menu.query.from}:${menu.query.to}:${menu.query.query}:${menu.activeIndex}:${menu.suggestions.map((suggestion) => suggestion.key).join('|')}`
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
    refreshQuery,
    closeMenu,
    dismissCurrentQuery,
    setActiveIndex,
    acceptSuggestion,
  }
}
