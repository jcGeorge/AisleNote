/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { Editor } from '@toast-ui/editor'
import type { ToolbarFormatKey } from '../components/editor/toolbar-state'
import type { AppState, ContextMenuState, MultiLineEditState, NewlineOperationId, NoteLocation, ViewMode } from '../types/app'
import { getNewlineShortcutIdForEvent } from '../hotkeys/shortcuts'
import { getMultilineSelectionShortcutDirection } from './editor-setup'
import type { MultiLineCursorMovement, MultiLineEditInput } from './multiline-edit'
import { isInsideReadonlyNotePreview } from './note-preview-dom'
import { isInsideTerminalBlockLandingZone } from './terminal-block-landing'
import {
  getElementFromEventTarget,
  getInternalNoteLinkHitAtDocPosition,
  getWysiwygView,
} from './prosemirror-utils'
import { parseInternalNoteUrl, type InternalNoteLinkHit } from '../notes/note-references'

type UseEditorDomEventsOptions = {
  viewMode: ViewMode
  displayContent: string
  activeNoteAisleCount: number
  hotkeys: AppState['hotkeys']
  isMacPlatform: boolean
  editorEventRootRef: MutableRefObject<HTMLElement | null>
  editorRef: MutableRefObject<Editor | null>
  activeImageRef: MutableRefObject<HTMLImageElement | null>
  multiLineEditRef: MutableRefObject<MultiLineEditState | null>
  activateEditorFromEventTarget: (target: EventTarget | null) => boolean | void
  clearMultiLineEdit: (collapseToHead?: boolean) => void
  closeImageTools: () => void
  closeLinkPrompt: () => void
  isImageCropActive: () => boolean
  selectImageForTools: (image: HTMLImageElement) => void
  refreshImageToolsPosition: () => void
  copySelectedImageToClipboard: () => void | Promise<unknown>
  deleteActiveEditorImageNode: () => boolean
  setMenuOpen: Dispatch<SetStateAction<boolean>>
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>
  navigateToNoteLocation: (location: NoteLocation) => void
  openLinkPrompt: (url: string, top: number, left: number, text?: string) => void
  getToolbarFormatShortcut: (event: KeyboardEvent) => ToolbarFormatKey | null
  queueToolbarShortcutFeedback: (format: ToolbarFormatKey) => void
  syncToolbarFormatState: () => void
  getEditorHistoryDirection: (event: KeyboardEvent) => 'undo' | 'redo' | null
  onEditorSelectionChange: () => void
  onEditorHistoryFallback: (direction: 'undo' | 'redo') => void
  onRunNewlineOperation: (operation: NewlineOperationId) => boolean
  onOpenNewlineOperationsMenu: () => void
  scheduleMultiLineHistoryRestore: (direction: 'undo' | 'redo') => void
  tryExpandMultilineSelection: (direction: 'up' | 'down') => boolean
  tryApplyMultiLineEditInput: (input: MultiLineEditInput) => boolean
  tryApplyMultiLineTabInput: (shiftKey: boolean) => boolean
  tryMoveMultiLineCursors: (movement: MultiLineCursorMovement, extendSelection?: boolean) => boolean
  tryApplyMultilineIndent: (outdent: boolean) => boolean
  copyMultiLineSelectionToClipboard: (clipboardData: DataTransfer | null) => boolean
  cutMultiLineSelectionToClipboard: (clipboardData: DataTransfer | null) => boolean
}

function isLikelyUrl(value: string) {
  try {
    const normalized = value.trim()
    const url = new URL(normalized)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function useEditorDomEvents({
  viewMode,
  displayContent,
  activeNoteAisleCount,
  hotkeys,
  isMacPlatform,
  editorEventRootRef,
  editorRef,
  activeImageRef,
  multiLineEditRef,
  activateEditorFromEventTarget,
  clearMultiLineEdit,
  closeImageTools,
  closeLinkPrompt,
  isImageCropActive,
  selectImageForTools,
  refreshImageToolsPosition,
  copySelectedImageToClipboard,
  deleteActiveEditorImageNode,
  setMenuOpen,
  setContextMenu,
  navigateToNoteLocation,
  openLinkPrompt,
  getToolbarFormatShortcut,
  queueToolbarShortcutFeedback,
  syncToolbarFormatState,
  getEditorHistoryDirection,
  onEditorSelectionChange,
  onEditorHistoryFallback,
  onRunNewlineOperation,
  onOpenNewlineOperationsMenu,
  scheduleMultiLineHistoryRestore,
  tryExpandMultilineSelection,
  tryApplyMultiLineEditInput,
  tryApplyMultiLineTabInput,
  tryMoveMultiLineCursors,
  tryApplyMultilineIndent,
  copyMultiLineSelectionToClipboard,
  cutMultiLineSelectionToClipboard,
}: UseEditorDomEventsOptions) {
  useEffect(() => {
    if (viewMode !== 'main') {
      clearMultiLineEdit(false)
      closeImageTools()
      closeLinkPrompt()
      return
    }

    const root = editorEventRootRef.current
    if (!root) return

    let internalLinkHandledOnPointerDown = false

    const isPrimaryMouseActivation = (event: Event) => !(event instanceof MouseEvent) || event.button === 0

    const handleAnchorInteraction = (event: Event, target: Element, allowExternalPrompt: boolean) => {
      if (!isPrimaryMouseActivation(event)) return false
      const anchor = target.closest('a')
      if (!(anchor instanceof HTMLAnchorElement)) return false

      const href = anchor.getAttribute('href') || anchor.href
      const internalLocation = parseInternalNoteUrl(href) ?? parseInternalNoteUrl(anchor.href)
      if (internalLocation) {
        event.preventDefault()
        event.stopPropagation()
        internalLinkHandledOnPointerDown = event.type === 'pointerdown'
        navigateToNoteLocation(internalLocation)
        return true
      }

      if (!allowExternalPrompt) return false
      event.preventDefault()
      event.stopPropagation()
      const rect = anchor.getBoundingClientRect()
      const text = anchor.textContent ?? ''
      openLinkPrompt(href, Math.max(8, rect.bottom + 6), Math.max(8, rect.left), text)
      return true
    }

    const getInternalLinkHitAtPointerPosition = (event: Event): InternalNoteLinkHit | null => {
      if (!(event instanceof MouseEvent)) return null
      const view = getWysiwygView(editorRef.current)
      const coords = view?.posAtCoords?.({ left: event.clientX, top: event.clientY })
      if (!view || !coords) return null
      return getInternalNoteLinkHitAtDocPosition(view.state.doc, coords.pos)
    }

    const handleInternalLinkAtPointerPosition = (event: Event) => {
      if (!isPrimaryMouseActivation(event)) return false
      const internalLinkHit = getInternalLinkHitAtPointerPosition(event)
      if (!internalLinkHit) return false
      event.preventDefault()
      event.stopPropagation()
      internalLinkHandledOnPointerDown = event.type === 'pointerdown'
      navigateToNoteLocation(internalLinkHit.target)
      return true
    }

    const handlePointerDown = (event: Event) => {
      const target = getElementFromEventTarget(event.target)
      if (!target) {
        if (!isImageCropActive()) {
          closeImageTools()
        }
        closeLinkPrompt()
        return
      }
      if (isInsideReadonlyNotePreview(target)) {
        if (!isImageCropActive()) {
          closeImageTools()
        }
        closeLinkPrompt()
        return
      }
      activateEditorFromEventTarget(target)
      clearMultiLineEdit(false)
      if (
        target.closest('.image-tools') ||
        target.closest('.image-resize-handle') ||
        target.closest('.inline-crop-box') ||
        target.closest('.inline-crop-edge-handle') ||
        target.closest('.inline-crop-resize-handle') ||
        target.closest('.link-prompt')
      ) {
        return
      }
      const image = target.closest('img')
      if (image instanceof HTMLImageElement) {
        selectImageForTools(image)
        return
      }
      if (handleAnchorInteraction(event, target, true)) return
      if (handleInternalLinkAtPointerPosition(event)) return
      if (!isImageCropActive()) {
        closeImageTools()
      }
      closeLinkPrompt()
    }

    const handleClick = (event: Event) => {
      const target = getElementFromEventTarget(event.target)
      if (!target) return
      if (isInsideTerminalBlockLandingZone(target)) return
      if (internalLinkHandledOnPointerDown) {
        internalLinkHandledOnPointerDown = false
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (handleAnchorInteraction(event, target, false)) return
      handleInternalLinkAtPointerPosition(event)
    }

    const handleContextMenu = (event: Event) => {
      const mouseEvent = event as globalThis.MouseEvent
      const target = getElementFromEventTarget(mouseEvent.target)
      if (!target) return
      if (isInsideReadonlyNotePreview(target)) {
        closeImageTools()
        closeLinkPrompt()
        return
      }
      activateEditorFromEventTarget(target)
      const internalLinkHit = getInternalLinkHitAtPointerPosition(mouseEvent)
      if (internalLinkHit) {
        mouseEvent.preventDefault()
        mouseEvent.stopPropagation()
        closeImageTools()
        closeLinkPrompt()
        setMenuOpen(false)
        setContextMenu({
          type: 'internal-note-link',
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
          label: internalLinkHit.label,
          href: internalLinkHit.href,
          target: internalLinkHit.target,
          from: internalLinkHit.from,
          to: internalLinkHit.to,
          occurrence: internalLinkHit.occurrence,
        })
        return
      }
      const image = target.closest('img')
      if (!(image instanceof HTMLImageElement)) return
      mouseEvent.preventDefault()
      selectImageForTools(image)
      setContextMenu({
        type: 'image',
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
      })
    }

    const handleScrollOrResize = () => {
      if (!activeImageRef.current) return
      refreshImageToolsPosition()
    }

    const handlePaste = (event: Event) => {
      const pasteEvent = event as ClipboardEvent
      if (isInsideTerminalBlockLandingZone(getElementFromEventTarget(pasteEvent.target))) return
      activateEditorFromEventTarget(pasteEvent.target)
      if (multiLineEditRef.current) {
        const text = pasteEvent.clipboardData?.getData('text/plain') ?? ''
        if (text.length > 0 && tryApplyMultiLineEditInput({ type: 'insert-text', text })) {
          pasteEvent.preventDefault()
          return
        }
      }
      const text = pasteEvent.clipboardData?.getData('text/plain')?.trim() ?? ''
      if (!text || !isLikelyUrl(text)) return

      const selection = window.getSelection()
      if (!selection || !selection.rangeCount) return
      const rangeRect = selection.getRangeAt(0).getBoundingClientRect()
      pasteEvent.preventDefault()
      openLinkPrompt(
        text,
        Math.max(8, rangeRect.bottom + 8),
        Math.max(8, rangeRect.left),
        '',
      )
    }

    const handleCopy = (event: Event) => {
      const clipboardEvent = event as ClipboardEvent
      activateEditorFromEventTarget(clipboardEvent.target)
      if (copyMultiLineSelectionToClipboard(clipboardEvent.clipboardData)) {
        clipboardEvent.preventDefault()
        return
      }
      const selection = window.getSelection()
      const hasTextSelection = Boolean(selection && selection.toString().trim().length > 0)
      if (!activeImageRef.current || hasTextSelection) return
      clipboardEvent.preventDefault()
      void copySelectedImageToClipboard()
    }

    const handleCut = (event: Event) => {
      const clipboardEvent = event as ClipboardEvent
      activateEditorFromEventTarget(clipboardEvent.target)
      if (!cutMultiLineSelectionToClipboard(clipboardEvent.clipboardData)) return
      clipboardEvent.preventDefault()
      clipboardEvent.stopPropagation()
    }

    const handleKeyDown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent
      if (isInsideTerminalBlockLandingZone(getElementFromEventTarget(keyboardEvent.target))) return
      activateEditorFromEventTarget(keyboardEvent.target)
      const toolbarFormatShortcut = getToolbarFormatShortcut(keyboardEvent)
      if (toolbarFormatShortcut) {
        queueToolbarShortcutFeedback(toolbarFormatShortcut)
        window.setTimeout(syncToolbarFormatState, 0)
      }
      const editorHistoryDirection = getEditorHistoryDirection(keyboardEvent)
      if (editorHistoryDirection) {
        scheduleMultiLineHistoryRestore(editorHistoryDirection)
        onEditorHistoryFallback(editorHistoryDirection)
      }

      const targetElement = getElementFromEventTarget(keyboardEvent.target)
      const isTextInputTarget = Boolean(targetElement?.closest('input, textarea, select, .link-prompt'))
      if (!isTextInputTarget) {
        const newlineShortcutId = getNewlineShortcutIdForEvent(keyboardEvent, isMacPlatform)
        const newlineOperation = newlineShortcutId ? hotkeys.newlineShortcuts.shortcuts[newlineShortcutId] : null
        if (newlineOperation) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          if (newlineOperation === 'operationsMenu') {
            onOpenNewlineOperationsMenu()
            return
          }
          onRunNewlineOperation(newlineOperation)
          return
        }
      }
      if (!isTextInputTarget && (keyboardEvent.key === 'Backspace' || keyboardEvent.key === 'Delete') && activeImageRef.current) {
        if (deleteActiveEditorImageNode()) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          return
        }
      }

      const multiLineDirection = getMultilineSelectionShortcutDirection(keyboardEvent)
      if (multiLineDirection) {
        const handled = tryExpandMultilineSelection(multiLineDirection)
        if (handled) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
        }
        return
      }
      if (multiLineEditRef.current) {
        let handled = false
        if (keyboardEvent.key === 'Backspace') {
          if (keyboardEvent.metaKey) {
            handled = tryApplyMultiLineEditInput({ type: 'delete-to-line-start' }) || true
          } else if (keyboardEvent.altKey) {
            handled = tryApplyMultiLineEditInput({ type: 'delete-word-backward' }) || true
          } else {
            handled = tryApplyMultiLineEditInput({ type: 'backspace' }) || true
          }
        } else if (keyboardEvent.key === 'Delete') {
          if (keyboardEvent.metaKey) {
            handled = tryApplyMultiLineEditInput({ type: 'delete-to-line-end' }) || true
          } else if (keyboardEvent.altKey) {
            handled = tryApplyMultiLineEditInput({ type: 'delete-word-forward' }) || true
          } else {
            handled = tryApplyMultiLineEditInput({ type: 'delete' }) || true
          }
        } else if (keyboardEvent.key === 'Enter') {
          handled = tryApplyMultiLineEditInput({ type: 'split-line' })
        } else if (keyboardEvent.key === 'Escape') {
          clearMultiLineEdit(true)
          handled = true
        } else if (keyboardEvent.key === 'Tab' && !keyboardEvent.metaKey && !keyboardEvent.ctrlKey && !keyboardEvent.altKey) {
          handled = tryApplyMultiLineTabInput(keyboardEvent.shiftKey)
        } else if (keyboardEvent.key === 'ArrowLeft') {
          handled = tryMoveMultiLineCursors(
            keyboardEvent.altKey ? 'word-left' : keyboardEvent.metaKey || keyboardEvent.ctrlKey ? 'line-start' : 'left',
            keyboardEvent.shiftKey,
          )
        } else if (keyboardEvent.key === 'ArrowRight') {
          handled = tryMoveMultiLineCursors(
            keyboardEvent.altKey ? 'word-right' : keyboardEvent.metaKey || keyboardEvent.ctrlKey ? 'line-end' : 'right',
            keyboardEvent.shiftKey,
          )
        } else if (keyboardEvent.key === 'ArrowUp') {
          handled = tryMoveMultiLineCursors('up')
        } else if (keyboardEvent.key === 'ArrowDown') {
          handled = tryMoveMultiLineCursors('down')
        } else if (keyboardEvent.key === 'Home') {
          handled = tryMoveMultiLineCursors('line-start', keyboardEvent.shiftKey)
        } else if (keyboardEvent.key === 'End') {
          handled = tryMoveMultiLineCursors('line-end', keyboardEvent.shiftKey)
        } else if (
          keyboardEvent.key.length === 1 &&
          !keyboardEvent.metaKey &&
          !keyboardEvent.ctrlKey &&
          !keyboardEvent.altKey
        ) {
          handled = tryApplyMultiLineEditInput({ type: 'insert-text', text: keyboardEvent.key })
        } else if (keyboardEvent.key === 'PageUp' || keyboardEvent.key === 'PageDown') {
          handled = true
        }
        if (handled) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          return
        }
      }
      if (keyboardEvent.key !== 'Tab' || keyboardEvent.altKey || keyboardEvent.ctrlKey || keyboardEvent.metaKey) return
      const handled = tryApplyMultilineIndent(keyboardEvent.shiftKey)
      if (!handled) return
      keyboardEvent.preventDefault()
      keyboardEvent.stopPropagation()
    }

    const handleBeforeInput = (event: Event) => {
      const inputEvent = event as InputEvent
      if (isInsideTerminalBlockLandingZone(getElementFromEventTarget(inputEvent.target))) return
      activateEditorFromEventTarget(inputEvent.target)
      if (inputEvent.inputType === 'historyUndo' || inputEvent.inputType === 'historyRedo') {
        const direction = inputEvent.inputType === 'historyUndo' ? 'undo' : 'redo'
        scheduleMultiLineHistoryRestore(direction)
        onEditorHistoryFallback(direction)
        return
      }
      if (!multiLineEditRef.current) return
      if (inputEvent.isComposing) return
      if (inputEvent.inputType === 'insertText' || inputEvent.inputType === 'insertCompositionText') {
        const text = inputEvent.data ?? ''
        if (!text) return
        const handled = tryApplyMultiLineEditInput({ type: 'insert-text', text })
        if (!handled) return
        inputEvent.preventDefault()
        inputEvent.stopPropagation()
      }
    }

    let toolbarSelectionSyncFrame: number | null = null
    let toolbarSelectionSyncTimer: number | null = null

    const clearScheduledToolbarSelectionSync = () => {
      if (toolbarSelectionSyncFrame !== null) {
        window.cancelAnimationFrame(toolbarSelectionSyncFrame)
        toolbarSelectionSyncFrame = null
      }
      if (toolbarSelectionSyncTimer !== null) {
        window.clearTimeout(toolbarSelectionSyncTimer)
        toolbarSelectionSyncTimer = null
      }
    }

    const runToolbarSelectionSync = () => {
      toolbarSelectionSyncFrame = null
      if (toolbarSelectionSyncTimer !== null) {
        window.clearTimeout(toolbarSelectionSyncTimer)
        toolbarSelectionSyncTimer = null
      }
      syncToolbarFormatState()
      onEditorSelectionChange()
    }

    const handleToolbarSelectionSync = () => {
      if (toolbarSelectionSyncFrame !== null) {
        window.cancelAnimationFrame(toolbarSelectionSyncFrame)
      }
      if (toolbarSelectionSyncTimer !== null) {
        window.clearTimeout(toolbarSelectionSyncTimer)
      }

      toolbarSelectionSyncFrame = window.requestAnimationFrame(runToolbarSelectionSync)
      toolbarSelectionSyncTimer = window.setTimeout(() => {
        if (toolbarSelectionSyncFrame !== null) {
          window.cancelAnimationFrame(toolbarSelectionSyncFrame)
          toolbarSelectionSyncFrame = null
        }
        toolbarSelectionSyncTimer = null
        syncToolbarFormatState()
        onEditorSelectionChange()
      }, 50)
    }

    root.addEventListener('pointerdown', handlePointerDown, true)
    root.addEventListener('click', handleClick, true)
    root.addEventListener('contextmenu', handleContextMenu, true)
    root.addEventListener('paste', handlePaste, true)
    root.addEventListener('copy', handleCopy, true)
    root.addEventListener('cut', handleCut, true)
    root.addEventListener('keydown', handleKeyDown, true)
    root.addEventListener('beforeinput', handleBeforeInput, true)
    root.addEventListener('keyup', handleToolbarSelectionSync, true)
    root.addEventListener('mouseup', handleToolbarSelectionSync, true)
    root.addEventListener('focusin', handleToolbarSelectionSync, true)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      root.removeEventListener('pointerdown', handlePointerDown, true)
      root.removeEventListener('click', handleClick, true)
      root.removeEventListener('contextmenu', handleContextMenu, true)
      root.removeEventListener('paste', handlePaste, true)
      root.removeEventListener('copy', handleCopy, true)
      root.removeEventListener('cut', handleCut, true)
      root.removeEventListener('keydown', handleKeyDown, true)
      root.removeEventListener('beforeinput', handleBeforeInput, true)
      root.removeEventListener('keyup', handleToolbarSelectionSync, true)
      root.removeEventListener('mouseup', handleToolbarSelectionSync, true)
      root.removeEventListener('focusin', handleToolbarSelectionSync, true)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
      clearScheduledToolbarSelectionSync()
    }
  }, [viewMode, displayContent, activeNoteAisleCount, hotkeys, isMacPlatform])
}
