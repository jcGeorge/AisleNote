/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { Editor } from '@toast-ui/editor'
import type { ToolbarFormatKey } from '../components/editor/toolbar-state'
import type {
  AppState,
  ContextMenuState,
  MultiLineEditState,
  MultiLineInlineFormat,
  NewlineOperationId,
  NoteLocation,
  ViewMode,
} from '../types/app'
import { getNewlineShortcutIdForEvent } from '../hotkeys/shortcuts'
import { getMultilineSelectionShortcutDirection } from './editor-setup'
import {
  applySingleCursorPageMovement,
  type EditorPageMovement,
  type MultiLineCursorMovement,
  type MultiLineEditInput,
} from './multiline-edit'
import { isInsideReadonlyNotePreview } from './note-preview-dom'
import { isInsideTerminalBlockLandingZone } from './terminal-block-landing'
import {
  getElementFromEventTarget,
  getInternalNoteLinkHitAtDocPosition,
  getWysiwygView,
} from './prosemirror-utils'
import { parseInternalNoteUrl, type InternalNoteLinkHit } from '../notes/note-references'
import { insertPastedListIntoView } from './list-paste'

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
  clearMultiLineEdit: (collapseToHead?: boolean, options?: { deferWidgetClear?: boolean }) => void
  closeImageTools: () => void
  closeLinkPrompt: () => void
  isImageCropActive: () => boolean
  isLinkPromptOpen: () => boolean
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
  onRunFormatCommand: (format: MultiLineInlineFormat) => boolean
  getEditorHistoryDirection: (event: KeyboardEvent) => 'undo' | 'redo' | null
  onEditorSelectionChange: () => void
  onRunStructuralHistory: (direction: 'undo' | 'redo') => boolean
  onEditorHistoryFallback: (direction: 'undo' | 'redo') => void
  onRunNewlineOperation: (operation: NewlineOperationId) => boolean
  onOpenShortcutMenu: () => void
  scheduleMultiLineHistoryRestore: (direction: 'undo' | 'redo') => void
  tryExpandMultilineSelection: (direction: 'up' | 'down') => boolean
  tryApplyMultiLineEditInput: (input: MultiLineEditInput) => boolean
  tryApplyMultiLineListMarkerShortcut: () => boolean
  tryApplyMultiLineBlockMarkerShortcut: () => boolean
  tryApplyMultiLineInlineMarkerShortcut: (inputText: string) => boolean
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

export function isEditorToolbarInteractionTarget(target: Element | null): boolean {
  return Boolean(
    target?.closest(
      [
        '.note-shared-toolbar',
        '.note-toolbar-heading-popover',
        '.note-toolbar-aisle-popover',
        '.toastui-editor-defaultUI-toolbar',
        '.toastui-editor-toolbar',
        '.toastui-editor-toolbar-icons',
        '.toastui-editor-tooltip',
      ].join(', '),
    ),
  )
}

export function getMultiLineDeleteInputForBeforeInputType(inputType: string): MultiLineEditInput | null {
  if (inputType === 'deleteContentForward') return { type: 'delete' }
  if (inputType === 'deleteContentBackward') return { type: 'backspace' }
  return null
}

export function getEditorPageMovementForEvent(event: KeyboardEvent): EditorPageMovement | null {
  if (event.key === 'PageUp' || event.code === 'PageUp') return 'page-up'
  if (event.key === 'PageDown' || event.code === 'PageDown') return 'page-down'

  const hasFnModifier = typeof event.getModifierState === 'function' && event.getModifierState('Fn')
  if (!hasFnModifier) return null
  if (event.key === 'ArrowUp' || event.code === 'ArrowUp') return 'page-up'
  if (event.key === 'ArrowDown' || event.code === 'ArrowDown') return 'page-down'
  return null
}

export function isActiveWysiwygEditorContentTarget(target: Element | null, view: any): boolean {
  if (!target || !view?.dom || isEditorToolbarInteractionTarget(target)) return false
  return target === view.dom || Boolean(view.dom.contains?.(target))
}

export function isEditorPointerChromeTarget(target: Element | null): boolean {
  return Boolean(
    target?.closest(
      [
        '.image-tools',
        '.image-resize-handle',
        '.inline-crop-box',
        '.inline-crop-edge-handle',
        '.inline-crop-resize-handle',
        '.link-prompt',
      ].join(', '),
    ),
  )
}

export function getPlainTextPointerChromeClosePlan({
  hasActiveImage,
  imageCropActive,
  linkPromptOpen,
}: {
  hasActiveImage: boolean
  imageCropActive: boolean
  linkPromptOpen: boolean
}): { closeImageTools: boolean; closeLinkPrompt: boolean } {
  return {
    closeImageTools: hasActiveImage && !imageCropActive,
    closeLinkPrompt: linkPromptOpen,
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
  isLinkPromptOpen,
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
  onRunFormatCommand,
  getEditorHistoryDirection,
  onEditorSelectionChange,
  onRunStructuralHistory,
  onEditorHistoryFallback,
  onRunNewlineOperation,
  onOpenShortcutMenu,
  scheduleMultiLineHistoryRestore,
  tryExpandMultilineSelection,
  tryApplyMultiLineEditInput,
  tryApplyMultiLineListMarkerShortcut,
  tryApplyMultiLineBlockMarkerShortcut,
  tryApplyMultiLineInlineMarkerShortcut,
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
      if (isEditorToolbarInteractionTarget(target)) return
      if (isEditorPointerChromeTarget(target)) return
      const image = target.closest('img')
      if (image instanceof HTMLImageElement) {
        const isPrimaryActivation = isPrimaryMouseActivation(event)
        if (isPrimaryActivation && event.cancelable) {
          event.preventDefault()
        }
        if (isPrimaryActivation) {
          event.stopPropagation()
        }
        clearMultiLineEdit(false)
        selectImageForTools(image)
        return
      }
      const chromeClosePlan = getPlainTextPointerChromeClosePlan({
        hasActiveImage: Boolean(activeImageRef.current),
        imageCropActive: isImageCropActive(),
        linkPromptOpen: isLinkPromptOpen(),
      })
      activateEditorFromEventTarget(target)
      clearMultiLineEdit(false, { deferWidgetClear: true })
      if (handleAnchorInteraction(event, target, true)) return
      if (handleInternalLinkAtPointerPosition(event)) return
      if (chromeClosePlan.closeImageTools) {
        closeImageTools()
      }
      if (chromeClosePlan.closeLinkPrompt) {
        closeLinkPrompt()
      }
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
      const image = target.closest('img')
      if (image instanceof HTMLImageElement) {
        mouseEvent.preventDefault()
        selectImageForTools(image)
        setContextMenu({
          type: 'image',
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
        })
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
      const rawText = pasteEvent.clipboardData?.getData('text/plain') ?? ''
      const text = rawText.trim()
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
      pasteEvent.stopPropagation()
    }

    const handlePastedList = (event: Event) => {
      const pasteEvent = event as ClipboardEvent
      const text = pasteEvent.clipboardData?.getData('text/plain') ?? ''
      if (!text || multiLineEditRef.current) return
      if (isLikelyUrl(text.trim())) return
      if (!insertPastedListIntoView(getWysiwygView(editorRef.current), text)) return
      pasteEvent.preventDefault()
      pasteEvent.stopPropagation()
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
      const targetElement = getElementFromEventTarget(keyboardEvent.target)
      const isTextInputTarget = Boolean(targetElement?.closest('input, textarea, select, .link-prompt'))
      const pageMovement =
        !keyboardEvent.metaKey && !keyboardEvent.ctrlKey && !keyboardEvent.altKey
          ? getEditorPageMovementForEvent(keyboardEvent)
          : null
      const toolbarFormatShortcut = isTextInputTarget ? null : getToolbarFormatShortcut(keyboardEvent)
      if (toolbarFormatShortcut) {
        if (onRunFormatCommand(toolbarFormatShortcut)) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          queueToolbarShortcutFeedback(toolbarFormatShortcut)
          window.setTimeout(syncToolbarFormatState, 0)
          return
        }
      }
      const editorHistoryDirection = getEditorHistoryDirection(keyboardEvent)
      if (editorHistoryDirection) {
        if (onRunStructuralHistory(editorHistoryDirection)) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          return
        }
        scheduleMultiLineHistoryRestore(editorHistoryDirection)
        onEditorHistoryFallback(editorHistoryDirection)
      }

      if (!isTextInputTarget) {
        const newlineShortcutId = getNewlineShortcutIdForEvent(keyboardEvent, isMacPlatform)
        const newlineOperation = newlineShortcutId ? hotkeys.newlineShortcuts.shortcuts[newlineShortcutId] : null
        if (newlineOperation) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          if (newlineOperation === 'operationsMenu') {
            onOpenShortcutMenu()
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
        } else if (
          (keyboardEvent.key === ' ' || keyboardEvent.key === 'Spacebar') &&
          !keyboardEvent.metaKey &&
          !keyboardEvent.ctrlKey &&
          !keyboardEvent.altKey
        ) {
          handled =
            tryApplyMultiLineBlockMarkerShortcut() ||
            tryApplyMultiLineListMarkerShortcut() ||
            tryApplyMultiLineEditInput({ type: 'insert-text', text: ' ' })
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
        } else if (pageMovement) {
          handled = tryMoveMultiLineCursors(pageMovement, keyboardEvent.shiftKey)
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
          handled =
            tryApplyMultiLineInlineMarkerShortcut(keyboardEvent.key) ||
            tryApplyMultiLineEditInput({ type: 'insert-text', text: keyboardEvent.key })
        }
        if (handled) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          return
        }
      }
      if (
        !isTextInputTarget &&
        pageMovement &&
        isActiveWysiwygEditorContentTarget(targetElement, getWysiwygView(editorRef.current))
      ) {
        const view = getWysiwygView(editorRef.current)
        if (applySingleCursorPageMovement(view, pageMovement, keyboardEvent.shiftKey)) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          window.setTimeout(syncToolbarFormatState, 0)
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
        if (onRunStructuralHistory(direction)) {
          inputEvent.preventDefault()
          inputEvent.stopPropagation()
          return
        }
        scheduleMultiLineHistoryRestore(direction)
        onEditorHistoryFallback(direction)
        return
      }
      if (!multiLineEditRef.current) return
      if (inputEvent.isComposing) return
      const deleteInput = getMultiLineDeleteInputForBeforeInputType(inputEvent.inputType)
      if (deleteInput) {
        const handled = tryApplyMultiLineEditInput(deleteInput)
        if (!handled) return
        inputEvent.preventDefault()
        inputEvent.stopPropagation()
        return
      }
      if (inputEvent.inputType === 'insertText' || inputEvent.inputType === 'insertCompositionText') {
        const text = inputEvent.data ?? ''
        if (!text) return
        const handled =
          text === ' '
            ? tryApplyMultiLineBlockMarkerShortcut() ||
              tryApplyMultiLineListMarkerShortcut() ||
              tryApplyMultiLineEditInput({ type: 'insert-text', text })
            : tryApplyMultiLineInlineMarkerShortcut(text) || tryApplyMultiLineEditInput({ type: 'insert-text', text })
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
    root.addEventListener('paste', handlePastedList, true)
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
      root.removeEventListener('paste', handlePastedList, true)
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
