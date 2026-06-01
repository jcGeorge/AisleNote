/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { Editor } from '@toast-ui/editor'
import {
  DEFAULT_TOOLBAR_FORMAT_STATE,
  type ToolbarFormatKey,
  type ToolbarHeadingLevel,
  type ToolbarFormatState,
} from '../components/editor/toolbar-state'
import { eventMatchesShortcut, normalizeHotkeySettings } from '../hotkeys/shortcuts'
import type { AppState, ViewMode } from '../types/app'
import { getActiveHeadingLevel } from './editor-setup'
import { getWysiwygView } from './prosemirror-utils'

type ToolbarPopoverKind = 'heading' | 'copy'

type ToolbarPopoverPosition = {
  top: number
  left: number
}

const TOOLBAR_POPOVER_WIDTH_PX = 168
const TOOLBAR_POPOVER_VIEWPORT_MARGIN_PX = 8

type UseEditorToolbarStateOptions = {
  viewMode: ViewMode
  isMacPlatform: boolean
  editorRef: MutableRefObject<Editor | null>
  stateRef: MutableRefObject<AppState>
}

const areToolbarFormatStatesEqual = (first: ToolbarFormatState, second: ToolbarFormatState) =>
  first.bold === second.bold &&
  first.italic === second.italic &&
  first.strike === second.strike &&
  first.highlight === second.highlight

const normalizeToolbarHeadingLevel = (level: number | null): ToolbarHeadingLevel => {
  if (level === 0 || level === 1 || level === 2 || level === 3 || level === 4 || level === 5 || level === 6) {
    return level
  }
  return null
}

const hasActiveEditorMark = (view: any, markName: string) => {
  const markType = view?.state?.schema?.marks?.[markName]
  if (!markType) return false

  const { state } = view
  const { selection } = state
  if (selection.empty) {
    const marks = state.storedMarks ?? selection.$from?.marks?.() ?? []
    return marks.some((mark: any) => mark?.type === markType)
  }

  return state.doc.rangeHasMark(selection.from, selection.to, markType)
}

export function useEditorToolbarState({
  viewMode,
  isMacPlatform,
  editorRef,
  stateRef,
}: UseEditorToolbarStateOptions) {
  const [toolbarFormatState, setToolbarFormatState] = useState<ToolbarFormatState>(DEFAULT_TOOLBAR_FORMAT_STATE)
  const [activeHeadingLevel, setActiveHeadingLevel] = useState<ToolbarHeadingLevel>(null)
  const [toolbarShortcutFeedback, setToolbarShortcutFeedback] = useState<ToolbarFormatKey | null>(null)
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false)
  const [copyMenuOpen, setCopyMenuOpen] = useState(false)
  const [toolbarPopoverPosition, setToolbarPopoverPosition] = useState<Record<ToolbarPopoverKind, ToolbarPopoverPosition | null>>({
    heading: null,
    copy: null,
  })
  const copyToolbarButtonRef = useRef<HTMLButtonElement | null>(null)
  const headingToolbarButtonRef = useRef<HTMLButtonElement | null>(null)
  const aisleToolbarButtonRef = useRef<HTMLButtonElement | null>(null)
  const shortcutFeedbackTimerRef = useRef<number | null>(null)

  const getToolbarPopoverButton = (kind: ToolbarPopoverKind) =>
    kind === 'copy' ? copyToolbarButtonRef.current : headingToolbarButtonRef.current

  const getToolbarPopoverPosition = (kind: ToolbarPopoverKind): ToolbarPopoverPosition | null => {
    const button = getToolbarPopoverButton(kind)
    if (!button || !button.isConnected) return null
    const rect = button.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const maxLeft = Math.max(
      TOOLBAR_POPOVER_VIEWPORT_MARGIN_PX,
      viewportWidth - TOOLBAR_POPOVER_WIDTH_PX - TOOLBAR_POPOVER_VIEWPORT_MARGIN_PX,
    )
    return {
      top: rect.bottom + 6,
      left: Math.min(Math.max(TOOLBAR_POPOVER_VIEWPORT_MARGIN_PX, rect.left), maxLeft),
    }
  }

  const refreshToolbarPopoverPosition = (kind: ToolbarPopoverKind) => {
    const position = getToolbarPopoverPosition(kind)
    setToolbarPopoverPosition((previous) => ({
      ...previous,
      [kind]: position,
    }))
    return position
  }

  const closeToolbarPopovers = () => {
    setCopyMenuOpen(false)
    setHeadingMenuOpen(false)
    setToolbarPopoverPosition({ heading: null, copy: null })
  }

  useEffect(() => {
    const openPopoverKind: ToolbarPopoverKind | null = copyMenuOpen
      ? 'copy'
      : headingMenuOpen
        ? 'heading'
        : null
    if (!openPopoverKind || viewMode !== 'main') return

    const refreshPosition = () => refreshToolbarPopoverPosition(openPopoverKind)
    refreshPosition()
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const button = getToolbarPopoverButton(openPopoverKind)
      const targetNode = event.target instanceof Node ? event.target : null
      const targetElement = event.target instanceof Element ? event.target : null
      if (
        targetElement?.closest(
          '.note-toolbar-heading-popover, .note-toolbar-copy-popover',
        )
      ) {
        return
      }
      if (button && targetNode && button.contains(targetNode)) return
      closeToolbarPopovers()
    }
    window.addEventListener('resize', refreshPosition)
    window.addEventListener('scroll', refreshPosition, true)
    document.addEventListener('pointerdown', handleDocumentPointerDown, true)
    return () => {
      window.removeEventListener('resize', refreshPosition)
      window.removeEventListener('scroll', refreshPosition, true)
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
    }
  }, [copyMenuOpen, headingMenuOpen, viewMode])

  useEffect(() => {
    return () => {
      if (shortcutFeedbackTimerRef.current !== null) {
        window.clearTimeout(shortcutFeedbackTimerRef.current)
      }
    }
  }, [])

  const getCurrentToolbarFormatState = (): ToolbarFormatState => {
    const view = getWysiwygView(editorRef.current)
    if (!view) return DEFAULT_TOOLBAR_FORMAT_STATE
    return {
      bold: hasActiveEditorMark(view, 'strong'),
      italic: hasActiveEditorMark(view, 'emph'),
      strike: hasActiveEditorMark(view, 'strike'),
      highlight: hasActiveEditorMark(view, 'mark'),
    }
  }

  const syncToolbarFormatState = () => {
    const nextState = getCurrentToolbarFormatState()
    const nextHeadingLevel = normalizeToolbarHeadingLevel(getActiveHeadingLevel(editorRef.current))
    setToolbarFormatState((previous) => (areToolbarFormatStatesEqual(previous, nextState) ? previous : nextState))
    setActiveHeadingLevel((previous) => (previous === nextHeadingLevel ? previous : nextHeadingLevel))
  }

  const scheduleToolbarFormatStateSync = () => {
    window.requestAnimationFrame(syncToolbarFormatState)
  }

  const getToolbarFormatShortcut = (event: KeyboardEvent): ToolbarFormatKey | null => {
    const hotkeys = normalizeHotkeySettings(stateRef.current.hotkeys)
    if (eventMatchesShortcut(event, hotkeys.shortcuts.formatStrikethrough, isMacPlatform)) return 'strike'
    const key = event.key.toLowerCase()
    const isMod = isMacPlatform ? event.metaKey : event.ctrlKey
    if (!isMod || event.altKey) return null
    if (key === 'b') return 'bold'
    if (key === 'i') return 'italic'
    if (key === 's' && !eventMatchesShortcut(event, hotkeys.shortcuts.openSpaces, isMacPlatform)) return 'strike'
    return null
  }

  const queueToolbarShortcutFeedback = (format: ToolbarFormatKey) => {
    if (shortcutFeedbackTimerRef.current !== null) {
      window.clearTimeout(shortcutFeedbackTimerRef.current)
    }
    setToolbarShortcutFeedback(format)
    shortcutFeedbackTimerRef.current = window.setTimeout(() => {
      shortcutFeedbackTimerRef.current = null
      setToolbarShortcutFeedback((current) => (current === format ? null : current))
    }, 650)
  }

  return {
    copyToolbarButtonRef,
    headingToolbarButtonRef,
    aisleToolbarButtonRef,
    toolbarFormatState,
    activeHeadingLevel,
    toolbarShortcutFeedback,
    headingMenuOpen,
    copyMenuOpen,
    toolbarPopoverPosition,
    setHeadingMenuOpen,
    setCopyMenuOpen,
    setToolbarPopoverPosition,
    refreshToolbarPopoverPosition,
    closeToolbarPopovers,
    getToolbarFormatShortcut,
    queueToolbarShortcutFeedback,
    syncToolbarFormatState,
    scheduleToolbarFormatStateSync,
  }
}
