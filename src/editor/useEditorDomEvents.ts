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
  NoteNavigationTarget,
  ViewMode,
} from '../types/app'
import { getNewlineShortcutIdForEvent } from '../hotkeys/shortcuts'
import { runEditorHistoryCommand } from './editor-command'
import {
  getMultiLineBeforeInputEdit,
  resolveEditorBeforeInputIntent,
  resolveEditorKeyDownIntent,
} from './editor-input-intents'
import { applyParagraphSpaceShortcut, getMultilineSelectionShortcutDirection } from './editor-setup'
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
  getExternalLinkRangeAtDocPosition,
  getInternalNoteLinkHitAtDocPosition,
  getWysiwygView,
  type ExternalLinkRange,
  type WysiwygHistoryDirection,
  type WysiwygHistoryResult,
} from './prosemirror-utils'
import { parseInternalNoteReferenceUrl, type InternalNoteLinkHit } from '../notes/note-references'
import { insertPastedListIntoView } from './list-paste'
import {
  getActiveTableRange,
  isBlankTableSideSelectionTarget,
  moveSelectedTableBoundaryCaret,
  placeCaretOutsideTableAtCoords,
  selectTableFromSideClick,
  type TableBoundaryDirection,
  type TableRange,
} from './table-editing'

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
  navigateToNoteLocation: (location: NoteNavigationTarget) => void
  openExternalLink: (url: string) => boolean
  insertPastedUrlAsLink: (label: string, url: string) => boolean
  getToolbarFormatShortcut: (event: KeyboardEvent) => ToolbarFormatKey | null
  queueToolbarShortcutFeedback: (format: ToolbarFormatKey) => void
  syncToolbarFormatState: () => void
  onRunFormatCommand: (format: MultiLineInlineFormat) => boolean
  getEditorHistoryDirection: (event: KeyboardEvent) => 'undo' | 'redo' | null
  onEditorSelectionChange: () => void
  onEditorMentionQueryChange: () => void
  onRunStructuralHistory: (direction: 'undo' | 'redo') => boolean
  onRunEditorHistory: (direction: WysiwygHistoryDirection) => WysiwygHistoryResult
  onRunNewlineOperation: (operation: NewlineOperationId) => boolean
  onOpenShortcutMenu: () => void
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

const WWW_ADDRESS_RE = /^www\.[^\s.]+\.[^\s]+$/i
const BARE_COM_ORG_ADDRESS_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org)(?::\d{2,5})?(?:[/?#][^\s]*)?$/i

export function getPastedHttpUrl(value: string): string | null {
  try {
    const normalized = value.trim()
    if (!normalized || /\s/.test(normalized)) return null
    const absoluteUrl = /^https?:\/\//i.test(normalized)
      ? normalized
      : WWW_ADDRESS_RE.test(normalized) || BARE_COM_ORG_ADDRESS_RE.test(normalized)
        ? `https://${normalized}`
        : null
    if (!absoluteUrl) return null
    const url = new URL(absoluteUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? absoluteUrl : null
  } catch {
    return null
  }
}

export function getPastedUrlLink(value: string): { label: string; url: string } | null {
  const label = value.trim()
  const url = getPastedHttpUrl(value)
  if (!url) return null
  return {
    label,
    url,
  }
}

function isLikelyUrl(value: string) {
  return getPastedUrlLink(value) !== null
}

export function isEditorToolbarInteractionTarget(target: Element | null): boolean {
  return Boolean(
    target?.closest(
      [
        '.note-shared-toolbar',
        '.note-toolbar-heading-popover',
        '.toastui-editor-defaultUI-toolbar',
        '.toastui-editor-toolbar',
        '.toastui-editor-toolbar-icons',
        '.toastui-editor-tooltip',
        '.aisle-toc-panel',
        '.aisle-toc-panel-layer',
      ].join(', '),
    ),
  )
}

export function getMultiLineDeleteInputForBeforeInputType(inputType: string): MultiLineEditInput | null {
  return getMultiLineBeforeInputEdit(inputType)
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

export function getTableBoundaryCaretDirectionForEvent(event: KeyboardEvent): TableBoundaryDirection | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  if (event.key === 'ArrowLeft' || event.code === 'ArrowLeft') return 'before'
  if (event.key === 'ArrowRight' || event.code === 'ArrowRight') return 'after'
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
        '.table-tools',
        '.table-reorder-marker',
        '.link-prompt',
        '.aisle-toc-panel',
        '.aisle-toc-panel-layer',
      ].join(', '),
    ),
  )
}

export function shouldSkipTableExitRepairTarget(target: Element | null): boolean {
  return Boolean(
    target?.closest(
      [
        'a',
        'button',
        'input',
        'textarea',
        'select',
        'img',
        'table',
        '[contenteditable="false"]',
        '.image-tools',
        '.image-resize-handle',
        '.inline-crop-box',
        '.inline-crop-edge-handle',
        '.inline-crop-resize-handle',
        '.table-tools',
        '.table-reorder-marker',
        '.link-prompt',
        '.aisle-toc-panel',
        '.aisle-toc-panel-layer',
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

export function runEditorHistoryEvent({
  direction,
  onRunStructuralHistory,
  onRunEditorHistory,
}: {
  direction: WysiwygHistoryDirection
  onRunStructuralHistory: (direction: WysiwygHistoryDirection) => boolean
  onRunEditorHistory: (direction: WysiwygHistoryDirection) => WysiwygHistoryResult
}): { handled: boolean; result: WysiwygHistoryResult | 'structural' } {
  const command = runEditorHistoryCommand({
    direction,
    onRunStructuralHistory,
    onRunEditorHistory,
  })
  return { handled: command.handled, result: command.historyResult ?? 'unavailable' }
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
  openExternalLink,
  insertPastedUrlAsLink,
  getToolbarFormatShortcut,
  queueToolbarShortcutFeedback,
  syncToolbarFormatState,
  onRunFormatCommand,
  getEditorHistoryDirection,
  onEditorSelectionChange,
  onEditorMentionQueryChange,
  onRunStructuralHistory,
  onRunEditorHistory,
  onRunNewlineOperation,
  onOpenShortcutMenu,
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

    let linkHandledOnPointerDown = false
    let pendingTableExitRepair: {
      coords: { left: number; top: number }
      range: TableRange
      target: Element
    } | null = null

    const isPrimaryMouseActivation = (event: Event) => !(event instanceof MouseEvent) || event.button === 0

    const getExternalLinkEditRange = (event: Event, href: string): ExternalLinkRange | null => {
      if (!(event instanceof MouseEvent)) return null
      const view = getWysiwygView(editorRef.current)
      const coords = view?.posAtCoords?.({ left: event.clientX, top: event.clientY })
      if (!view || !coords) return null
      return (
        getExternalLinkRangeAtDocPosition(view.state.doc, coords.pos, href) ??
        getExternalLinkRangeAtDocPosition(view.state.doc, coords.pos - 1, href)
      )
    }

    const handleAnchorInteraction = (event: Event, target: Element) => {
      if (!isPrimaryMouseActivation(event)) return false
      const anchor = target.closest('a')
      if (!(anchor instanceof HTMLAnchorElement)) return false

      const href = anchor.getAttribute('href') || anchor.href
      const internalLocation = parseInternalNoteReferenceUrl(href) ?? parseInternalNoteReferenceUrl(anchor.href)
      if (internalLocation) {
        event.preventDefault()
        event.stopPropagation()
        linkHandledOnPointerDown = event.type === 'pointerdown'
        navigateToNoteLocation(internalLocation)
        return true
      }

      event.preventDefault()
      event.stopPropagation()
      linkHandledOnPointerDown = event.type === 'pointerdown'
      if (!openExternalLink(href)) {
        // Keep the click from editing the URL even if the shell cannot open it.
        return true
      }
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
      linkHandledOnPointerDown = event.type === 'pointerdown'
      navigateToNoteLocation({ ...internalLinkHit.target, heading: internalLinkHit.heading })
      return true
    }

    const handleTableSideSelection = (event: Event, target: Element) => {
      if (!(event instanceof MouseEvent) || event.button !== 0) return false
      const view = getWysiwygView(editorRef.current)
      if (!isActiveWysiwygEditorContentTarget(target, view)) return false
      if (!isBlankTableSideSelectionTarget(view, target)) return false
      const handled = selectTableFromSideClick(view, { left: event.clientX, top: event.clientY }, target)
      if (!handled) return false
      event.preventDefault()
      event.stopPropagation()
      linkHandledOnPointerDown = event.type === 'pointerdown'
      return true
    }

    const getPendingTableExitRepair = (event: Event, target: Element) => {
      if (!(event instanceof MouseEvent) || event.button !== 0) return null
      const view = getWysiwygView(editorRef.current)
      if (!isActiveWysiwygEditorContentTarget(target, view)) return null
      if (shouldSkipTableExitRepairTarget(target)) return null
      if (isInsideReadonlyNotePreview(target) || isInsideTerminalBlockLandingZone(target)) return null
      const range = getActiveTableRange(view)
      if (!range) return null
      return {
        coords: { left: event.clientX, top: event.clientY },
        range,
        target,
      }
    }

    const clearPendingTableExitRepair = () => {
      pendingTableExitRepair = null
    }

    const scheduleTableExitRepair = () => {
      const pending = pendingTableExitRepair
      pendingTableExitRepair = null
      if (!pending) return
      window.setTimeout(() => {
        const view = getWysiwygView(editorRef.current)
        if (!view || !pending.target.isConnected || !view.dom?.contains?.(pending.target)) return
        if (!placeCaretOutsideTableAtCoords(view, pending.coords, pending.range, pending.target)) return
        window.setTimeout(syncToolbarFormatState, 0)
        onEditorSelectionChange()
        onEditorMentionQueryChange()
      }, 0)
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
      const tableExitRepair = getPendingTableExitRepair(event, target)
      activateEditorFromEventTarget(target)
      clearMultiLineEdit(false, { deferWidgetClear: true })
      pendingTableExitRepair = tableExitRepair
      if (handleTableSideSelection(event, target)) {
        clearPendingTableExitRepair()
        if (chromeClosePlan.closeImageTools) {
          closeImageTools()
        }
        if (chromeClosePlan.closeLinkPrompt) {
          closeLinkPrompt()
        }
        return
      }
      if (handleAnchorInteraction(event, target)) {
        clearPendingTableExitRepair()
        return
      }
      if (handleInternalLinkAtPointerPosition(event)) {
        clearPendingTableExitRepair()
        return
      }
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
      if (linkHandledOnPointerDown) {
        linkHandledOnPointerDown = false
        clearPendingTableExitRepair()
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (handleAnchorInteraction(event, target)) {
        clearPendingTableExitRepair()
        return
      }
      if (handleInternalLinkAtPointerPosition(event)) {
        clearPendingTableExitRepair()
        return
      }
      scheduleTableExitRepair()
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
      const anchor = target.closest('a')
      if (anchor instanceof HTMLAnchorElement) {
        const href = anchor.getAttribute('href') || anchor.href
        const internalLocation = parseInternalNoteReferenceUrl(href) ?? parseInternalNoteReferenceUrl(anchor.href)
        const text = anchor.textContent ?? ''
        const range = getExternalLinkEditRange(mouseEvent, href)
        mouseEvent.preventDefault()
        mouseEvent.stopPropagation()
        closeImageTools()
        closeLinkPrompt()
        setMenuOpen(false)
        if (internalLocation) {
          const markdownHit = getInternalLinkHitAtPointerPosition(mouseEvent)
          const link =
            markdownHit?.href === href
              ? markdownHit
              : {
                  label: text,
                  href,
                  target: internalLocation,
                  heading: internalLocation.heading,
                  from: range?.from ?? 0,
                  to: range?.to ?? 0,
                  occurrence: 0,
                  range,
                }
          setContextMenu({
            type: 'editor',
            x: mouseEvent.clientX,
            y: mouseEvent.clientY,
            link: {
              ...link,
              type: 'internal',
              range,
            },
          })
          return
        }
        setContextMenu({
          type: 'editor',
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
          link: {
            type: 'external',
            href,
            label: text,
            range,
          },
        })
        return
      }
      const internalLinkHit = getInternalLinkHitAtPointerPosition(mouseEvent)
      if (internalLinkHit) {
        mouseEvent.preventDefault()
        mouseEvent.stopPropagation()
        closeImageTools()
        closeLinkPrompt()
        setMenuOpen(false)
        setContextMenu({
          type: 'editor',
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
          link: {
            ...internalLinkHit,
            type: 'internal',
          },
        })
        return
      }

      const view = getWysiwygView(editorRef.current)
      if (isActiveWysiwygEditorContentTarget(target, view)) {
        mouseEvent.preventDefault()
        mouseEvent.stopPropagation()
        closeImageTools()
        closeLinkPrompt()
        setMenuOpen(false)
        setContextMenu({
          type: 'editor',
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
        })
        return
      }
    }

    const handleScrollOrResize = () => {
      if (!activeImageRef.current) return
      refreshImageToolsPosition()
    }

    const tryApplySingleCursorParagraphSpaceShortcut = (target: Element | null) => {
      const view = getWysiwygView(editorRef.current)
      if (!isActiveWysiwygEditorContentTarget(target, view)) return false
      return applyParagraphSpaceShortcut(view.state, (transaction) => {
        view.dispatch(transaction)
      })
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
      const link = getPastedUrlLink(rawText)
      if (!link) return
      if (!insertPastedUrlAsLink(link.label, link.url)) return

      pasteEvent.preventDefault()
      closeLinkPrompt()
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
      const editorHistoryDirection = getEditorHistoryDirection(keyboardEvent)
      const newlineShortcutId = !isTextInputTarget ? getNewlineShortcutIdForEvent(keyboardEvent, isMacPlatform) : null
      const newlineOperation = newlineShortcutId ? hotkeys.newlineShortcuts.shortcuts[newlineShortcutId] : null
      const tableBoundaryDirection = isTextInputTarget ? null : getTableBoundaryCaretDirectionForEvent(keyboardEvent)
      const inputIntent = resolveEditorKeyDownIntent({
        key: keyboardEvent.key,
        altKey: keyboardEvent.altKey,
        ctrlKey: keyboardEvent.ctrlKey,
        metaKey: keyboardEvent.metaKey,
        shiftKey: keyboardEvent.shiftKey,
        isTextInputTarget,
        hasActiveImage: Boolean(activeImageRef.current),
        hasMultiLineEdit: Boolean(multiLineEditRef.current),
        toolbarFormatShortcut,
        editorHistoryDirection,
        newlineOperation,
        tableBoundaryDirection,
        multiLineSelectionDirection: getMultilineSelectionShortcutDirection(keyboardEvent),
        pageMovement,
      })

      if (inputIntent.type === 'toolbar-format') {
        if (onRunFormatCommand(inputIntent.format)) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          queueToolbarShortcutFeedback(inputIntent.format)
          window.setTimeout(syncToolbarFormatState, 0)
        }
        return
      }
      if (inputIntent.type === 'history') {
        const historyEvent = runEditorHistoryEvent({
          direction: inputIntent.direction,
          onRunStructuralHistory,
          onRunEditorHistory,
        })
        if (historyEvent.handled) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
        }
        return
      }
      if (inputIntent.type === 'open-operations-menu') {
        keyboardEvent.preventDefault()
        keyboardEvent.stopPropagation()
        onOpenShortcutMenu()
        return
      }
      if (inputIntent.type === 'newline-operation') {
        keyboardEvent.preventDefault()
        keyboardEvent.stopPropagation()
        onRunNewlineOperation(inputIntent.operation)
        return
      }
      if (inputIntent.type === 'delete-active-image') {
        if (deleteActiveEditorImageNode()) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
        }
        return
      }
      if (inputIntent.type === 'table-boundary-caret') {
        const view = getWysiwygView(editorRef.current)
        if (
          isActiveWysiwygEditorContentTarget(targetElement, view) &&
          moveSelectedTableBoundaryCaret(view, inputIntent.direction)
        ) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          window.setTimeout(syncToolbarFormatState, 0)
        }
        return
      }
      if (inputIntent.type === 'multiline-selection') {
        const handled = tryExpandMultilineSelection(inputIntent.direction)
        if (handled) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
        }
        return
      }
      if (inputIntent.type === 'multiline-cancel') {
        clearMultiLineEdit(true)
        keyboardEvent.preventDefault()
        keyboardEvent.stopPropagation()
        return
      }
      if (inputIntent.type === 'multiline-edit') {
        const handled = tryApplyMultiLineEditInput(inputIntent.input)
        if (handled) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
        }
        return
      }
      if (inputIntent.type === 'multiline-tab') {
        if (tryApplyMultiLineTabInput(inputIntent.shiftKey)) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
        }
        return
      }
      if (inputIntent.type === 'multiline-space') {
        const handled =
          tryApplyMultiLineBlockMarkerShortcut() ||
          tryApplyMultiLineListMarkerShortcut() ||
          tryApplyMultiLineEditInput({ type: 'insert-text', text: ' ' })
        if (handled) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
        }
        return
      }
      if (inputIntent.type === 'multiline-inline-text') {
        const handled =
          tryApplyMultiLineInlineMarkerShortcut(inputIntent.text) ||
          tryApplyMultiLineEditInput({ type: 'insert-text', text: inputIntent.text })
        if (handled) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
        }
        return
      }
      if (inputIntent.type === 'multiline-move') {
        if (tryMoveMultiLineCursors(inputIntent.movement, inputIntent.extendSelection)) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
        }
        return
      }
      if (inputIntent.type === 'paragraph-space-shortcut') {
        if (tryApplySingleCursorParagraphSpaceShortcut(targetElement)) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          window.setTimeout(syncToolbarFormatState, 0)
        }
        return
      }
      if (inputIntent.type === 'page-movement') {
        const view = getWysiwygView(editorRef.current)
        if (
          isActiveWysiwygEditorContentTarget(targetElement, view) &&
          applySingleCursorPageMovement(view, inputIntent.movement, inputIntent.extendSelection)
        ) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          window.setTimeout(syncToolbarFormatState, 0)
        }
        return
      }
      if (inputIntent.type !== 'tab-indent') return
      if (tryApplyMultilineIndent(inputIntent.outdent)) {
        keyboardEvent.preventDefault()
        keyboardEvent.stopPropagation()
      }
    }

    const handleBeforeInput = (event: Event) => {
      const inputEvent = event as InputEvent
      if (isInsideTerminalBlockLandingZone(getElementFromEventTarget(inputEvent.target))) return
      activateEditorFromEventTarget(inputEvent.target)
      const inputIntent = resolveEditorBeforeInputIntent({
        inputType: inputEvent.inputType,
        data: inputEvent.data,
        isComposing: inputEvent.isComposing,
        hasMultiLineEdit: Boolean(multiLineEditRef.current),
      })

      if (inputIntent.type === 'history') {
        const historyEvent = runEditorHistoryEvent({
          direction: inputIntent.direction,
          onRunStructuralHistory,
          onRunEditorHistory,
        })
        if (historyEvent.handled) {
          inputEvent.preventDefault()
          inputEvent.stopPropagation()
          return
        }
        return
      }
      const inputTarget = getElementFromEventTarget(inputEvent.target)
      if (inputIntent.type === 'paragraph-space-shortcut') {
        if (!multiLineEditRef.current && tryApplySingleCursorParagraphSpaceShortcut(inputTarget)) {
          inputEvent.preventDefault()
          inputEvent.stopPropagation()
          window.setTimeout(syncToolbarFormatState, 0)
        }
        return
      }
      if (inputIntent.type === 'multiline-edit') {
        const handled = tryApplyMultiLineEditInput(inputIntent.input)
        if (!handled) return
        inputEvent.preventDefault()
        inputEvent.stopPropagation()
        return
      }
      if (inputIntent.type === 'multiline-space') {
        const handled =
          tryApplyMultiLineBlockMarkerShortcut() ||
          tryApplyMultiLineListMarkerShortcut() ||
          tryApplyMultiLineEditInput({ type: 'insert-text', text: ' ' })
        if (!handled) return
        inputEvent.preventDefault()
        inputEvent.stopPropagation()
        return
      }
      if (inputIntent.type === 'multiline-inline-text') {
        const handled =
          tryApplyMultiLineInlineMarkerShortcut(inputIntent.text) ||
          tryApplyMultiLineEditInput({ type: 'insert-text', text: inputIntent.text })
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
      onEditorMentionQueryChange()
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
        onEditorMentionQueryChange()
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
