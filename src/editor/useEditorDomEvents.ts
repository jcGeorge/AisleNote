/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { Editor } from '@toast-ui/editor'
import { Selection, TextSelection } from 'prosemirror-state'
import type { ToolbarFormatKey } from '../components/editor/toolbar-state'
import type {
  AppState,
  ContextMenuState,
  EditorDictionaryContext,
  MultiLineEditState,
  MultiLineInlineFormat,
  NewlineOperationId,
  NoteNavigationTarget,
  ViewMode,
} from '../types/app'
import { getNewlineShortcutIdForEvent, normalizeHotkeySettings } from '../hotkeys/shortcuts'
import { runEditorHistoryCommand } from './editor-command'
import {
  getMultiLineBeforeInputEdit,
  resolveEditorBeforeInputIntent,
  resolveEditorKeyDownIntent,
} from './editor-input-intents'
import {
  applyParagraphSpaceShortcut,
  getMultilineSelectionShortcutDirection,
} from './editor-setup'
import { findImageElementForSameLineBlankClick } from './image-node-selection'
import {
  applySingleCursorPageMovement,
  type EditorPageMovement,
  type MultiLineCursorMovement,
  type MultiLineEditInput,
} from './multiline-edit'
import { getEditorTextLineRanges } from './multiline-ranges'
import { isInsideReadonlyNotePreview } from './note-preview-dom'
import {
  deleteTerminalBlockBeforeCaret,
  handleTerminalBlankAreaClick,
  isInsideTerminalBlockLandingZone,
  moveTerminalBlockBoundaryCaretByArrow,
  type TerminalBlockDeleteDirection,
  type TerminalBlockArrowDirection,
} from './terminal-block-landing'
import {
  getElementFromEventTarget,
  getExternalLinkRangeAtDocPosition,
  getWysiwygView,
  insertParagraphAfterInternalNoteLink,
  type ExternalLinkRange,
  type WysiwygHistoryDirection,
  type WysiwygHistoryResult,
} from './prosemirror-utils'
import {
  buildMarkdownNoteReferenceToken,
  type InternalNoteLinkHit,
  type ResolvedMarkdownNoteReference,
} from '../notes/note-references'
import {
  isCopyAsClipboardTextMarker,
  readCopyAsPayloadFromDataTransfer,
  type CopyAsClipboardPayload,
} from '../notes/copy-as-clipboard'
import { importBlobAsAssetUrl } from '../markdown/image-asset-registry'
import { getSteppedMediaVolumePercent } from '../media/media-playback-settings'
import { getMediaKeyboardAction, MEDIA_PLAYER_SELECTOR } from '../media/media-utils'
import { getMediaRevealContextMenuDetailFromTarget } from '../media/media-context-menu'
import {
  dataTransferHasMediaFiles,
  getMediaFilesFromDataTransfer,
  importMediaFilesAsLinks,
  insertAssetLinksIntoWysiwygView,
} from './media-file-insertion'
import {
  deleteAdjacentMediaLinkRange,
  getMediaLinkRangeForPlayer,
  type MediaLinkDeleteDirection,
} from './media-link-plugin'
import { insertPastedListIntoView } from './list-paste'
import {
  insertClipboardDataIntoView,
  serializeProseMirrorSelectionForClipboard,
  writeEditorClipboardData,
} from './visual-clipboard'
import {
  getActiveTableContext,
  getActiveTableRange,
  isBlankTableSideSelectionTarget,
  moveTableCellSelectionByTab,
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
  activeMediaRef: MutableRefObject<HTMLElement | null>
  multiLineEditRef: MutableRefObject<MultiLineEditState | null>
  activateEditorFromEventTarget: (target: EventTarget | null) => boolean | void
  clearMultiLineEdit: (collapseToHead?: boolean, options?: { deferWidgetClear?: boolean }) => void
  closeImageTools: () => void
  closeMediaTools: () => void
  closeLinkPrompt: () => void
  isImageCropActive: () => boolean
  isLinkPromptOpen: () => boolean
  selectImageForTools: (image: HTMLImageElement) => void
  selectMediaForTools: (media: HTMLElement) => void
  refreshImageToolsPosition: () => void
  refreshMediaToolsPosition: () => void
  copySelectedImageToClipboard: () => void | Promise<unknown>
  deleteActiveEditorImageNode: () => boolean
  commitActiveEditorMarkdownNow: (editor: Editor) => void
  setMenuOpen: Dispatch<SetStateAction<boolean>>
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>
  onDismissEditorEphemeraBeforeContextMenu?: () => void
  resolveInternalNoteReferenceToken: (token: string) => ResolvedMarkdownNoteReference | null
  navigateToNoteLocation: (location: NoteNavigationTarget) => void
  openExternalLink: (url: string) => boolean
  insertPastedUrlAsLink: (label: string, url: string) => boolean
  onPasteCopyAsPayload: (payload: CopyAsClipboardPayload) => boolean
  onPasteInvalidCopyAsPayload: () => boolean
  getToolbarFormatShortcut: (event: KeyboardEvent) => ToolbarFormatKey | null
  queueToolbarShortcutFeedback: (format: ToolbarFormatKey) => void
  syncToolbarFormatState: () => void
  onRunFormatCommand: (format: MultiLineInlineFormat) => boolean
  getEditorHistoryDirection: (event: KeyboardEvent) => 'undo' | 'redo' | null
  onEditorSelectionChange: () => void
  onEditorSelectionSettled?: () => void
  onEditorMentionQueryChange: () => void
  onRunStructuralHistory: (direction: 'undo' | 'redo') => boolean
  onRunEditorHistory: (direction: WysiwygHistoryDirection) => WysiwygHistoryResult
  shouldRunStructuralHistoryBeforeEditorHistory: (direction: WysiwygHistoryDirection) => boolean
  onRunNewlineOperation: (operation: NewlineOperationId) => boolean
  onOpenShortcutMenu: () => void
  onOpenUrlLinkShortcut: () => void
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
const EDITOR_SPELLCHECK_CONTEXT_RETRY_WINDOW_MS = 300
const EDITOR_SPELLCHECK_CONTEXT_POLL_MS = 25

function hasEditorSpellingContext(context: EditorDictionaryContext | null | undefined): context is EditorDictionaryContext {
  return Boolean(context && (context.suggestions.length > 0 || context.misspelledWord))
}

export async function getEditorDictionaryContextForMenu(
  x: number,
  y: number,
): Promise<EditorDictionaryContext | undefined> {
  if (typeof window === 'undefined') return undefined
  const getSpellcheckContext = window.electronAPI?.getEditorSpellcheckContext
  if (typeof getSpellcheckContext !== 'function') return undefined
  const maxAttempts = Math.max(1, Math.ceil(EDITOR_SPELLCHECK_CONTEXT_RETRY_WINDOW_MS / EDITOR_SPELLCHECK_CONTEXT_POLL_MS))
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { context, timedOut } = await getEditorSpellcheckContextAttempt(getSpellcheckContext, x, y)
    if (hasEditorSpellingContext(context)) return context
    if (attempt < maxAttempts - 1 && !timedOut) {
      await waitForEditorSpellcheckPoll()
    }
  }
  return undefined
}

async function getEditorSpellcheckContextAttempt(
  getSpellcheckContext: NonNullable<NonNullable<typeof window.electronAPI>['getEditorSpellcheckContext']>,
  x: number,
  y: number,
): Promise<{ context: EditorDictionaryContext | null; timedOut: boolean }> {
  let timedOut = false
  let timeoutId: number | undefined
  const timeout = new Promise<null>((resolve) => {
    timeoutId = window.setTimeout(() => {
      timedOut = true
      resolve(null)
    }, EDITOR_SPELLCHECK_CONTEXT_POLL_MS)
  })
  try {
    const context = await Promise.race([getSpellcheckContext({ x, y }), timeout])
    return { context, timedOut }
  } catch {
    return { context: null, timedOut: false }
  } finally {
    if (timeoutId !== undefined && typeof window.clearTimeout === 'function') window.clearTimeout(timeoutId)
  }
}

function waitForEditorSpellcheckPoll(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, EDITOR_SPELLCHECK_CONTEXT_POLL_MS)
  })
}

export function shouldPreventDefaultEditorContextMenu(): boolean {
  if (typeof window === 'undefined') return true
  return typeof window.electronAPI?.getEditorSpellcheckContext !== 'function'
}

function prepareEditorContextMenuEvent(event: globalThis.MouseEvent) {
  if (shouldPreventDefaultEditorContextMenu()) event.preventDefault()
  event.stopPropagation()
}

export function mergeEditorDictionaryContextMenu(
  current: ContextMenuState | null,
  sourceMenu: Extract<ContextMenuState, { type: 'editor' }>,
  dictionary: EditorDictionaryContext,
): ContextMenuState | null {
  if (!current || current.type !== 'editor') return current
  if (current.x !== sourceMenu.x || current.y !== sourceMenu.y) return current
  return { ...current, dictionary }
}

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

function isBareEnterKeyEvent(event: KeyboardEvent): boolean {
  return (
    (event.key === 'Enter' || event.code === 'Enter') &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.isComposing
  )
}

export function isUrlLinkShortcut(event: KeyboardEvent, isMacPlatform: boolean): boolean {
  const isK = event.code === 'KeyK' || event.key?.toLowerCase?.() === 'k'
  if (!isK || event.altKey || event.shiftKey) return false
  return isMacPlatform
    ? Boolean(event.metaKey && !event.ctrlKey)
    : Boolean(event.ctrlKey && !event.metaKey)
}

export function isEditorToolbarInteractionTarget(target: Element | null): boolean {
  return Boolean(
    target?.closest(
      [
        '.note-shared-toolbar',
        '.note-toolbar-heading-popover',
        '.toastui-editor-defaultUI-toolbar',
        '.toastui-editor-toolbar',
        '.toolbar-tool-icon',
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

export function getDocumentBoundarySelectionDirectionForEvent(
  event: KeyboardEvent,
  isMacPlatform: boolean,
): 'start' | 'end' | null {
  if (!isMacPlatform) return null
  if (!event.metaKey || !event.shiftKey || event.altKey || event.ctrlKey) return null
  if (event.key === 'ArrowUp' || event.code === 'ArrowUp') return 'start'
  if (event.key === 'ArrowDown' || event.code === 'ArrowDown') return 'end'
  return null
}

export function moveSelectionHeadToDocumentBoundary(
  view: any,
  direction: 'start' | 'end',
): boolean {
  const state = view?.state
  const doc = state?.doc
  const selection = state?.selection
  if (!state?.tr || !doc || !selection || typeof view?.dispatch !== 'function') return false

  const docSize = Math.max(0, doc.content?.size ?? 0)
  const ranges = getEditorTextLineRanges(view)
  const boundary =
    direction === 'start'
      ? (ranges[0]?.start ?? 0)
      : (ranges[ranges.length - 1]?.end ?? docSize)
  const anchorSource =
    typeof selection.anchor === 'number'
      ? selection.anchor
      : typeof selection.from === 'number'
        ? selection.from
        : boundary
  const anchor = Math.max(0, Math.min(docSize, anchorSource))
  const head = Math.max(0, Math.min(docSize, boundary))

  try {
    view.dispatch(state.tr.setSelection(TextSelection.create(doc, anchor, head)).scrollIntoView())
    return true
  } catch {
    try {
      const fallbackSelection = Selection.near(doc.resolve(head), direction === 'start' ? -1 : 1)
      view.dispatch(state.tr.setSelection(fallbackSelection).scrollIntoView())
      return true
    } catch {
      return false
    }
  }
}

export function getTableBoundaryCaretDirectionForEvent(event: KeyboardEvent): TableBoundaryDirection | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  if (event.key === 'ArrowLeft' || event.code === 'ArrowLeft') return 'before'
  if (event.key === 'ArrowRight' || event.code === 'ArrowRight') return 'after'
  return null
}

export function getTerminalBlockArrowDirectionForEvent(event: KeyboardEvent): TerminalBlockArrowDirection | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  if (event.key === 'ArrowUp' || event.code === 'ArrowUp') return 'up'
  if (event.key === 'ArrowDown' || event.code === 'ArrowDown') return 'down'
  return null
}

export function getMediaLinkDeleteDirectionForKeyEvent(event: KeyboardEvent): MediaLinkDeleteDirection | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  if (event.key === 'Backspace' || event.code === 'Backspace') return 'backward'
  if (event.key === 'Delete' || event.code === 'Delete') return 'forward'
  return null
}

export function getMediaLinkDeleteDirectionForBeforeInput(event: InputEvent): MediaLinkDeleteDirection | null {
  if (event.inputType === 'deleteContentBackward') return 'backward'
  if (event.inputType === 'deleteContentForward') return 'forward'
  return null
}

export function getTerminalBlockDeleteDirectionForBeforeInput(inputType: string): TerminalBlockDeleteDirection | null {
  if (inputType === 'deleteContentBackward') return 'backward'
  if (inputType === 'deleteContentForward') return 'forward'
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
        '.media-tools',
        '.image-resize-handle',
        '.media-resize-handle',
        '.inline-crop-box',
        '.inline-crop-edge-handle',
        '.inline-crop-resize-handle',
        '.table-tools',
        '.table-reorder-marker',
        '.link-prompt',
        MEDIA_PLAYER_SELECTOR,
        '.aisle-toc-panel',
        '.aisle-toc-panel-layer',
      ].join(', '),
    ),
  )
}

export function isNotePreviewTitleContextMenuTarget(target: Element | null): boolean {
  return Boolean(target?.closest('.note-context-widget .context-bar-title'))
}

export type MediaPlayerPointerAction =
  | { type: 'none' }
  | { type: 'ignore-controls' }
  | { type: 'select-video'; mediaPlayer: Element }
  | { type: 'toggle-video'; mediaPlayer: Element }
  | { type: 'hide-video-tools'; mediaPlayer: Element }
  | { type: 'close-non-video'; mediaPlayer: Element }

export function getMediaPlayerPointerAction(
  target: Element | null,
  isPrimaryActivation: boolean,
): MediaPlayerPointerAction {
  const mediaPlayer = target?.closest(MEDIA_PLAYER_SELECTOR) ?? null
  if (!mediaPlayer) return { type: 'none' }
  if (target?.closest('.tabs-media-title')) return { type: 'ignore-controls' }
  const isControlTarget = Boolean(target?.closest('button, input, select, textarea'))
  if (!isPrimaryActivation || isControlTarget) return { type: 'ignore-controls' }
  if (mediaPlayer.getAttribute('data-media-kind') !== 'video') return { type: 'close-non-video', mediaPlayer }
  if (target?.closest('.tabs-media-viewport')) return { type: 'toggle-video', mediaPlayer }
  if (target?.closest('.tabs-media-controls')) return { type: 'hide-video-tools', mediaPlayer }
  return { type: 'select-video', mediaPlayer }
}

export function placeCaretAfterMediaPlayer(view: any | null, mediaPlayer: Element | null): boolean {
  if (!view?.state?.doc || typeof view.dispatch !== 'function' || !mediaPlayer) return false
  const currentRange = getMediaLinkRangeForPlayer(view, mediaPlayer)
  const sourceToRaw = currentRange ? null : mediaPlayer.getAttribute('data-media-source-to')
  const sourceTo = currentRange?.to ?? (sourceToRaw === null || sourceToRaw.trim() === '' ? NaN : Number(sourceToRaw))
  if (!Number.isFinite(sourceTo)) return false

  const doc = view.state.doc
  const docSize = Number(doc.content?.size ?? sourceTo)
  const position = Math.max(0, Math.min(Math.floor(sourceTo), docSize))
  try {
    const transaction = view.state.tr
      .setSelection(TextSelection.create(doc, position, position))
      .setMeta('addToHistory', false)
      .scrollIntoView()
    view.dispatch(transaction)
    view.focus?.()
    return true
  } catch {
    try {
      const transaction = view.state.tr
        .setSelection(Selection.near(doc.resolve(position), 1))
        .setMeta('addToHistory', false)
        .scrollIntoView()
      view.dispatch(transaction)
      view.focus?.()
      return true
    } catch {
      return false
    }
  }
}

export function runMediaPlayerKeyboardAction(mediaPlayer: Element | null, event: KeyboardEvent): boolean {
  if (!mediaPlayer) return false
  const action = getMediaKeyboardAction(event)
  if (!action) return false
  event.preventDefault()
  event.stopPropagation()
  if (action === 'volume-down' || action === 'volume-up') {
    const volumeSlider = mediaPlayer.querySelector<HTMLInputElement>('.tabs-media-volume-slider')
    if (volumeSlider) {
      volumeSlider.value = String(getSteppedMediaVolumePercent(volumeSlider.value, action === 'volume-up' ? 'up' : 'down'))
      volumeSlider.dispatchEvent(new Event('input', { bubbles: true }))
    }
    return true
  }
  const buttonSelector =
    action === 'toggle-playback'
      ? '.tabs-media-play-btn'
      : action === 'seek-backward'
        ? '.tabs-media-back-btn'
        : '.tabs-media-forward-btn'
  const button = mediaPlayer.querySelector(buttonSelector)
  if (button && typeof (button as HTMLButtonElement).click === 'function') {
    ;(button as HTMLButtonElement).click()
  }
  return true
}

export function consumeHandledEmbedCaretClick(event: Event, handledOnPointerDown: boolean): boolean {
  if (!handledOnPointerDown) return false
  if (event.cancelable) event.preventDefault()
  event.stopPropagation()
  return true
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
        '.media-tools',
        '.image-resize-handle',
        '.media-resize-handle',
        '.inline-crop-box',
        '.inline-crop-edge-handle',
        '.inline-crop-resize-handle',
        '.table-tools',
        '.table-reorder-marker',
        '.link-prompt',
        MEDIA_PLAYER_SELECTOR,
        '.aisle-toc-panel',
        '.aisle-toc-panel-layer',
      ].join(', '),
    ),
  )
}

function getInternalNoteLinkHitFromAnchor(
  anchor: HTMLAnchorElement,
  range: ExternalLinkRange | null,
  resolveInternalNoteReferenceToken: (token: string) => ResolvedMarkdownNoteReference | null,
): InternalNoteLinkHit | null {
  const href = anchor.getAttribute('href') || anchor.href
  const label = anchor.textContent?.trim() || href
  const token = buildMarkdownNoteReferenceToken({ target: href, label })
  const reference = token ? resolveInternalNoteReferenceToken(token) : null
  if (!reference) return null
  return {
    label: reference.label,
    href: reference.canonicalTarget,
    target: {
      domainId: reference.target.domainId,
      spaceId: reference.target.spaceId,
      tabId: reference.target.tabId,
      subTabId: reference.target.subTabId,
    },
    aisleIds: reference.payload?.aisleIds ? [...reference.payload.aisleIds] : undefined,
    heading: reference.target.heading,
    startAt: reference.target.startAt,
    from: range?.from ?? 0,
    to: range?.to ?? 0,
    occurrence: 0,
    range: range ? { ...range, href } : null,
  }
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
  shouldRunStructuralHistoryBeforeEditorHistory,
}: {
  direction: WysiwygHistoryDirection
  onRunStructuralHistory: (direction: WysiwygHistoryDirection) => boolean
  onRunEditorHistory: (direction: WysiwygHistoryDirection) => WysiwygHistoryResult
  shouldRunStructuralHistoryBeforeEditorHistory?: (direction: WysiwygHistoryDirection) => boolean
}): { handled: boolean; result: WysiwygHistoryResult | 'structural' } {
  const command = runEditorHistoryCommand({
    direction,
    onRunStructuralHistory,
    onRunEditorHistory,
    shouldRunStructuralHistoryBeforeEditorHistory,
  })
  return { handled: command.handled, result: command.historyResult ?? 'unavailable' }
}

export function applyTerminalBlockDeleteBeforeInput({
  inputType,
  hasMultiLineEdit,
  view,
}: {
  inputType: string
  hasMultiLineEdit: boolean
  view: any
}): boolean {
  const direction = getTerminalBlockDeleteDirectionForBeforeInput(inputType)
  if (hasMultiLineEdit || !direction) return false
  if (!view?.state || typeof view.dispatch !== 'function') return false
  return deleteTerminalBlockBeforeCaret(view.state, direction, (transaction) => view.dispatch(transaction))
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
  activeMediaRef,
  multiLineEditRef,
  activateEditorFromEventTarget,
  clearMultiLineEdit,
  closeImageTools,
  closeMediaTools,
  closeLinkPrompt,
  isImageCropActive,
  isLinkPromptOpen,
  selectImageForTools,
  selectMediaForTools,
  refreshImageToolsPosition,
  refreshMediaToolsPosition,
  copySelectedImageToClipboard,
  deleteActiveEditorImageNode,
  commitActiveEditorMarkdownNow,
  setMenuOpen,
  setContextMenu,
  onDismissEditorEphemeraBeforeContextMenu,
  resolveInternalNoteReferenceToken,
  navigateToNoteLocation,
  openExternalLink,
  insertPastedUrlAsLink,
  onPasteCopyAsPayload,
  onPasteInvalidCopyAsPayload,
  getToolbarFormatShortcut,
  queueToolbarShortcutFeedback,
  syncToolbarFormatState,
  onRunFormatCommand,
  getEditorHistoryDirection,
  onEditorSelectionChange,
  onEditorSelectionSettled = () => undefined,
  onEditorMentionQueryChange,
  onRunStructuralHistory,
  onRunEditorHistory,
  shouldRunStructuralHistoryBeforeEditorHistory,
  onRunNewlineOperation,
  onOpenShortcutMenu,
  onOpenUrlLinkShortcut,
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
  const normalizedHotkeys = useMemo(() => normalizeHotkeySettings(hotkeys), [hotkeys])

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
    let terminalBlankAreaHandledOnPointerDown = false
    let embedCaretHandledOnPointerDown = false
    let activeKeyboardMediaPlayer: Element | null = null
    let editorContextMenuRequestId = 0
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
      if (event.type !== 'click') return false
      const anchor = target.closest('a')
      if (!(anchor instanceof HTMLAnchorElement)) return false

      const href = anchor.getAttribute('href') || anchor.href
      const internalLinkHit = getInternalNoteLinkHitFromAnchor(anchor, null, resolveInternalNoteReferenceToken)

      event.preventDefault()
      event.stopPropagation()
      if (internalLinkHit) {
        navigateToNoteLocation({
          ...internalLinkHit.target,
          heading: internalLinkHit.heading,
          aisleId: internalLinkHit.heading ? undefined : internalLinkHit.aisleIds?.[0],
          startAt: internalLinkHit.startAt,
        })
        return true
      }
      if (!openExternalLink(href)) {
        // Keep the click from editing the URL even if the shell cannot open it.
        return true
      }
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

    const syncSelectionChromeAfterEmbedCaret = () => {
      window.setTimeout(syncToolbarFormatState, 0)
      onEditorSelectionChange()
      onEditorMentionQueryChange()
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

    const insertMediaLinksIntoEditor = (
      editor: Editor,
      links: Array<{ label: string; url: string }>,
      coords?: { left: number; top: number } | null,
    ) => {
      const view = getWysiwygView(editor)
      editor.focus()
      if (insertAssetLinksIntoWysiwygView(view, links, coords)) {
        commitActiveEditorMarkdownNow(editor)
      }
    }

    const importAndInsertMediaFiles = (
      files: Blob[],
      event: ClipboardEvent | DragEvent,
      coords?: { left: number; top: number } | null,
    ) => {
      if (files.length === 0) return false
      const target = getElementFromEventTarget(event.target)
      if (
        target &&
        (isEditorToolbarInteractionTarget(target) ||
          isInsideReadonlyNotePreview(target) ||
          isInsideTerminalBlockLandingZone(target))
      ) {
        return false
      }
      activateEditorFromEventTarget(event.target)
      const editor = editorRef.current
      if (!editor) return false

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
      clearMultiLineEdit(false)
      closeLinkPrompt()
      void importMediaFilesAsLinks(files, importBlobAsAssetUrl).then((links) => {
        if (links.length === 0 || editorRef.current !== editor) return
        insertMediaLinksIntoEditor(editor, links, coords)
      })
      return true
    }

    const handleMediaPaste = (event: ClipboardEvent) => {
      const files = getMediaFilesFromDataTransfer(event.clipboardData)
      return importAndInsertMediaFiles(files, event, null)
    }

    const handleMediaDragOver = (event: Event) => {
      const dragEvent = event as DragEvent
      if (!dataTransferHasMediaFiles(dragEvent.dataTransfer)) return
      const target = getElementFromEventTarget(dragEvent.target)
      if (
        !target ||
        isEditorToolbarInteractionTarget(target) ||
        isInsideReadonlyNotePreview(target) ||
        isInsideTerminalBlockLandingZone(target)
      ) {
        return
      }
      dragEvent.preventDefault()
      dragEvent.stopPropagation()
      if (dragEvent.dataTransfer) dragEvent.dataTransfer.dropEffect = 'copy'
    }

    const handleMediaDrop = (event: Event) => {
      const dragEvent = event as DragEvent
      const files = getMediaFilesFromDataTransfer(dragEvent.dataTransfer)
      const coords =
        dragEvent instanceof MouseEvent ? { left: dragEvent.clientX, top: dragEvent.clientY } : null
      importAndInsertMediaFiles(files, dragEvent, coords)
    }

    const handlePointerDown = (event: Event) => {
      const target = getElementFromEventTarget(event.target)
      activeKeyboardMediaPlayer = target?.closest(MEDIA_PLAYER_SELECTOR) ?? null
      if (!target) {
        if (!isImageCropActive()) {
          closeImageTools()
        }
        closeMediaTools()
        closeLinkPrompt()
        return
      }
      if (isInsideReadonlyNotePreview(target)) {
        if (!isImageCropActive()) {
          closeImageTools()
        }
        closeMediaTools()
        closeLinkPrompt()
        return
      }
      if (isEditorToolbarInteractionTarget(target)) return
      const mediaAction = getMediaPlayerPointerAction(target, isPrimaryMouseActivation(event))
      if (mediaAction.type !== 'none') {
        if (
          (mediaAction.type === 'select-video' ||
            mediaAction.type === 'toggle-video' ||
            mediaAction.type === 'hide-video-tools') &&
          mediaAction.mediaPlayer instanceof HTMLElement
        ) {
          if (event.cancelable) {
            event.preventDefault()
          }
          event.stopPropagation()
          clearMultiLineEdit(false)
          closeImageTools()
          placeCaretAfterMediaPlayer(getWysiwygView(editorRef.current), mediaAction.mediaPlayer)
          if (mediaAction.type === 'hide-video-tools') {
            closeMediaTools()
          } else if (mediaAction.type === 'toggle-video' && activeMediaRef.current === mediaAction.mediaPlayer) {
            closeMediaTools()
          } else {
            selectMediaForTools(mediaAction.mediaPlayer)
          }
          embedCaretHandledOnPointerDown = true
          syncSelectionChromeAfterEmbedCaret()
        } else if (mediaAction.type === 'close-non-video') {
          if (event.cancelable) {
            event.preventDefault()
          }
          event.stopPropagation()
          clearMultiLineEdit(false)
          closeImageTools()
          placeCaretAfterMediaPlayer(getWysiwygView(editorRef.current), mediaAction.mediaPlayer)
          closeMediaTools()
          embedCaretHandledOnPointerDown = true
          syncSelectionChromeAfterEmbedCaret()
        }
        return
      }
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
        closeMediaTools()
        selectImageForTools(image)
        embedCaretHandledOnPointerDown = isPrimaryActivation
        syncSelectionChromeAfterEmbedCaret()
        return
      }
      const chromeClosePlan = getPlainTextPointerChromeClosePlan({
        hasActiveImage: Boolean(activeImageRef.current),
        imageCropActive: isImageCropActive(),
        linkPromptOpen: isLinkPromptOpen(),
      })
      const closeMediaToolsIfNeeded = () => {
        if (activeMediaRef.current) {
          closeMediaTools()
        }
      }
      const tableExitRepair = getPendingTableExitRepair(event, target)
      activateEditorFromEventTarget(target)
      clearMultiLineEdit(false, { deferWidgetClear: true })
      pendingTableExitRepair = tableExitRepair
      const view = getWysiwygView(editorRef.current)
      if (event instanceof MouseEvent && event.button === 0 && isActiveWysiwygEditorContentTarget(target, view)) {
        const blankImage = findImageElementForSameLineBlankClick(view, target, {
          left: event.clientX,
          top: event.clientY,
        })
        if (blankImage) {
          if (event.cancelable) event.preventDefault()
          event.stopPropagation()
          clearPendingTableExitRepair()
          closeMediaToolsIfNeeded()
          selectImageForTools(blankImage)
          embedCaretHandledOnPointerDown = true
          syncSelectionChromeAfterEmbedCaret()
          return
        }
      }
      if (handleTableSideSelection(event, target)) {
        clearPendingTableExitRepair()
        if (chromeClosePlan.closeImageTools) {
          closeImageTools()
        }
        closeMediaToolsIfNeeded()
        if (chromeClosePlan.closeLinkPrompt) {
          closeLinkPrompt()
        }
        return
      }
      if (handleAnchorInteraction(event, target)) {
        clearPendingTableExitRepair()
        return
      }
      if (
        isActiveWysiwygEditorContentTarget(target, view) &&
        handleTerminalBlankAreaClick(event, target, view, TextSelection)
      ) {
        terminalBlankAreaHandledOnPointerDown = true
        clearPendingTableExitRepair()
        if (chromeClosePlan.closeImageTools) {
          closeImageTools()
        }
        closeMediaToolsIfNeeded()
        if (chromeClosePlan.closeLinkPrompt) {
          closeLinkPrompt()
        }
        window.setTimeout(syncToolbarFormatState, 0)
        onEditorSelectionChange()
        onEditorMentionQueryChange()
        return
      }
      if (chromeClosePlan.closeImageTools) {
        closeImageTools()
      }
      closeMediaToolsIfNeeded()
      if (chromeClosePlan.closeLinkPrompt) {
        closeLinkPrompt()
      }
    }

    const handleClick = (event: Event) => {
      if (consumeHandledEmbedCaretClick(event, embedCaretHandledOnPointerDown)) {
        embedCaretHandledOnPointerDown = false
        clearPendingTableExitRepair()
        return
      }
      const target = getElementFromEventTarget(event.target)
      if (!target) return
      if (isInsideTerminalBlockLandingZone(target)) return
      if (isEditorPointerChromeTarget(target)) return
      if (terminalBlankAreaHandledOnPointerDown) {
        terminalBlankAreaHandledOnPointerDown = false
        clearPendingTableExitRepair()
        event.preventDefault()
        event.stopPropagation()
        return
      }
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
      const view = getWysiwygView(editorRef.current)
      if (
        isActiveWysiwygEditorContentTarget(target, view) &&
        handleTerminalBlankAreaClick(event, target, view, TextSelection)
      ) {
        clearPendingTableExitRepair()
        window.setTimeout(syncToolbarFormatState, 0)
        onEditorSelectionChange()
        onEditorMentionQueryChange()
        return
      }
      scheduleTableExitRepair()
    }

    const openEditorContextMenu = (menu: Extract<ContextMenuState, { type: 'editor' }>, requestId: number) => {
      setContextMenu(menu)
      void getEditorDictionaryContextForMenu(menu.x, menu.y).then((dictionary) => {
        if (!dictionary || requestId !== editorContextMenuRequestId) return
        setContextMenu((current) => mergeEditorDictionaryContextMenu(current, menu, dictionary))
      })
    }

    const handleContextMenu = (event: Event) => {
      const mouseEvent = event as globalThis.MouseEvent
      const contextMenuRequestId = ++editorContextMenuRequestId
      const target = getElementFromEventTarget(mouseEvent.target)
      if (!target) return
      if (isNotePreviewTitleContextMenuTarget(target)) return
      const mediaContextMenu = getMediaRevealContextMenuDetailFromTarget(target, mouseEvent.clientX, mouseEvent.clientY)
      if (mediaContextMenu) {
        mouseEvent.preventDefault()
        mouseEvent.stopPropagation()
        onDismissEditorEphemeraBeforeContextMenu?.()
        closeLinkPrompt()
        setMenuOpen(false)
        setContextMenu({
          type: 'media',
          x: mediaContextMenu.x,
          y: mediaContextMenu.y,
          kind: mediaContextMenu.kind,
          source: mediaContextMenu.source,
        })
        return
      }
      if (isEditorPointerChromeTarget(target)) return
      if (isInsideReadonlyNotePreview(target)) {
        closeImageTools()
        closeLinkPrompt()
        return
      }
      const image = target.closest('img')
      if (image instanceof HTMLImageElement) {
        mouseEvent.preventDefault()
        onDismissEditorEphemeraBeforeContextMenu?.()
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
        const text = anchor.textContent ?? ''
        const range = getExternalLinkEditRange(mouseEvent, href)
        const internalLinkHit = getInternalNoteLinkHitFromAnchor(anchor, range, resolveInternalNoteReferenceToken)
        prepareEditorContextMenuEvent(mouseEvent)
        onDismissEditorEphemeraBeforeContextMenu?.()
        closeLinkPrompt()
        setMenuOpen(false)
        if (internalLinkHit) {
          openEditorContextMenu(
            {
              type: 'editor',
              x: mouseEvent.clientX,
              y: mouseEvent.clientY,
              link: {
                ...internalLinkHit,
                type: 'internal',
              },
            },
            contextMenuRequestId,
          )
          return
        }
        openEditorContextMenu(
          {
            type: 'editor',
            x: mouseEvent.clientX,
            y: mouseEvent.clientY,
            link: {
              type: 'external',
              href,
              label: text,
              range,
            },
          },
          contextMenuRequestId,
        )
        return
      }

      const view = getWysiwygView(editorRef.current)
      if (isActiveWysiwygEditorContentTarget(target, view)) {
        prepareEditorContextMenuEvent(mouseEvent)
        onDismissEditorEphemeraBeforeContextMenu?.()
        closeLinkPrompt()
        setMenuOpen(false)
        openEditorContextMenu(
          {
            type: 'editor',
            x: mouseEvent.clientX,
            y: mouseEvent.clientY,
          },
          contextMenuRequestId,
        )
        return
      }
    }

    const handleScrollOrResize = () => {
      if (activeImageRef.current) {
        refreshImageToolsPosition()
      }
      if (activeMediaRef.current) {
        refreshMediaToolsPosition()
      }
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
      const currentEditor = editorRef.current
      const view = getWysiwygView(currentEditor)
      const preventPasteDefault = () => {
        pasteEvent.preventDefault()
        pasteEvent.stopPropagation()
        pasteEvent.stopImmediatePropagation?.()
      }
      const copyAsPayload = readCopyAsPayloadFromDataTransfer(pasteEvent.clipboardData)
      if (copyAsPayload && onPasteCopyAsPayload(copyAsPayload)) {
        preventPasteDefault()
        return
      }
      const rawText = pasteEvent.clipboardData?.getData('text/plain') ?? ''
      if (isCopyAsClipboardTextMarker(rawText) && onPasteInvalidCopyAsPayload()) {
        preventPasteDefault()
        return
      }
      if (handleMediaPaste(pasteEvent)) return
      if (multiLineEditRef.current) {
        if (rawText.length > 0 && tryApplyMultiLineEditInput({ type: 'insert-text', text: rawText })) {
          preventPasteDefault()
          return
        }
      }
      const link = getPastedUrlLink(rawText)
      if (link) {
        if (!insertPastedUrlAsLink(link.label, link.url)) return

        preventPasteDefault()
        closeLinkPrompt()
        return
      }
      if (rawText && !isLikelyUrl(rawText.trim()) && insertPastedListIntoView(view, rawText)) {
        preventPasteDefault()
        if (currentEditor) commitActiveEditorMarkdownNow(currentEditor)
        closeLinkPrompt()
        window.setTimeout(syncToolbarFormatState, 0)
        onEditorSelectionChange()
        onEditorMentionQueryChange()
        return
      }
      if (currentEditor && insertClipboardDataIntoView(view, pasteEvent.clipboardData)) {
        preventPasteDefault()
        commitActiveEditorMarkdownNow(currentEditor)
        closeLinkPrompt()
        window.setTimeout(syncToolbarFormatState, 0)
        onEditorSelectionChange()
        onEditorMentionQueryChange()
      }
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
      const view = getWysiwygView(editorRef.current)
      const target = getElementFromEventTarget(clipboardEvent.target)
      if (isActiveWysiwygEditorContentTarget(target, view)) {
        const serialization = serializeProseMirrorSelectionForClipboard(view)
        if (serialization && writeEditorClipboardData(clipboardEvent.clipboardData, serialization)) {
          clipboardEvent.preventDefault()
          clipboardEvent.stopPropagation()
          return
        }
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
      if (cutMultiLineSelectionToClipboard(clipboardEvent.clipboardData)) {
        clipboardEvent.preventDefault()
        clipboardEvent.stopPropagation()
        return
      }
      const view = getWysiwygView(editorRef.current)
      const target = getElementFromEventTarget(clipboardEvent.target)
      if (!isActiveWysiwygEditorContentTarget(target, view)) return
      const serialization = serializeProseMirrorSelectionForClipboard(view)
      if (!serialization || !writeEditorClipboardData(clipboardEvent.clipboardData, serialization)) return
      try {
        view.dispatch(view.state.tr.deleteSelection().scrollIntoView())
        if (editorRef.current) commitActiveEditorMarkdownNow(editorRef.current)
      } catch {
        return
      }
      clipboardEvent.preventDefault()
      clipboardEvent.stopPropagation()
    }

    const handleKeyDown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent
      const keyboardTarget = getElementFromEventTarget(keyboardEvent.target)
      if (keyboardTarget?.closest(MEDIA_PLAYER_SELECTOR)) return
      if (activeKeyboardMediaPlayer && !activeKeyboardMediaPlayer.isConnected) {
        activeKeyboardMediaPlayer = null
      }
      if (activeKeyboardMediaPlayer && runMediaPlayerKeyboardAction(activeKeyboardMediaPlayer, keyboardEvent)) return
      if (isInsideTerminalBlockLandingZone(keyboardTarget)) return
      activateEditorFromEventTarget(keyboardEvent.target)
      const targetElement = keyboardTarget
      const isTextInputTarget = Boolean(targetElement?.closest('input, textarea, select, .link-prompt'))
      const currentEditor = editorRef.current
      const view = getWysiwygView(currentEditor)
      if (
        !isTextInputTarget &&
        currentEditor &&
        isBareEnterKeyEvent(keyboardEvent) &&
        isActiveWysiwygEditorContentTarget(targetElement, view) &&
        insertParagraphAfterInternalNoteLink(view, resolveInternalNoteReferenceToken)
      ) {
        keyboardEvent.preventDefault()
        keyboardEvent.stopPropagation()
        window.setTimeout(syncToolbarFormatState, 0)
        onEditorSelectionChange()
        onEditorMentionQueryChange()
        return
      }
      if (
        !isTextInputTarget &&
        currentEditor &&
        isUrlLinkShortcut(keyboardEvent, isMacPlatform) &&
        isActiveWysiwygEditorContentTarget(targetElement, view)
      ) {
        keyboardEvent.preventDefault()
        keyboardEvent.stopPropagation()
        onOpenUrlLinkShortcut()
        return
      }
      const pageMovement =
        !keyboardEvent.metaKey && !keyboardEvent.ctrlKey && !keyboardEvent.altKey
          ? getEditorPageMovementForEvent(keyboardEvent)
          : null
      const toolbarFormatShortcut = isTextInputTarget ? null : getToolbarFormatShortcut(keyboardEvent)
      const editorHistoryDirection = getEditorHistoryDirection(keyboardEvent)
      const newlineShortcutId = !isTextInputTarget ? getNewlineShortcutIdForEvent(keyboardEvent, isMacPlatform) : null
      const newlineOperation = newlineShortcutId ? normalizedHotkeys.newlineShortcuts.shortcuts[newlineShortcutId] : null
      const documentBoundarySelectionDirection = !isTextInputTarget
        ? getDocumentBoundarySelectionDirectionForEvent(keyboardEvent, isMacPlatform)
        : null
      const tableBoundaryDirection = isTextInputTarget ? null : getTableBoundaryCaretDirectionForEvent(keyboardEvent)
      const terminalBlockArrowDirection = isTextInputTarget
        ? null
        : getTerminalBlockArrowDirectionForEvent(keyboardEvent)
      const mediaDeleteDirection = !isTextInputTarget && !multiLineEditRef.current
        ? getMediaLinkDeleteDirectionForKeyEvent(keyboardEvent)
        : null
      const inputIntent = resolveEditorKeyDownIntent({
        key: keyboardEvent.key,
        altKey: keyboardEvent.altKey,
        ctrlKey: keyboardEvent.ctrlKey,
        metaKey: keyboardEvent.metaKey,
        shiftKey: keyboardEvent.shiftKey,
        isTextInputTarget,
        hasActiveImage: Boolean(activeImageRef.current),
        hasActiveTableCell: Boolean(!isTextInputTarget && getActiveTableContext(view)),
        hasMultiLineEdit: Boolean(multiLineEditRef.current),
        toolbarFormatShortcut,
        editorHistoryDirection,
        newlineOperation,
        documentBoundarySelectionDirection,
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
          shouldRunStructuralHistoryBeforeEditorHistory,
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
      if (inputIntent.type === 'document-boundary-selection') {
        if (
          isActiveWysiwygEditorContentTarget(targetElement, view) &&
          moveSelectionHeadToDocumentBoundary(view, inputIntent.direction)
        ) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          window.setTimeout(syncToolbarFormatState, 0)
          onEditorSelectionChange()
          onEditorMentionQueryChange()
        }
        return
      }
      if (
        mediaDeleteDirection &&
        currentEditor &&
        isActiveWysiwygEditorContentTarget(targetElement, view) &&
        deleteAdjacentMediaLinkRange(view, mediaDeleteDirection)
      ) {
        keyboardEvent.preventDefault()
        keyboardEvent.stopPropagation()
        closeMediaTools()
        commitActiveEditorMarkdownNow(currentEditor)
        window.setTimeout(syncToolbarFormatState, 0)
        onEditorSelectionChange()
        onEditorMentionQueryChange()
        return
      }
      if (inputIntent.type === 'table-boundary-caret') {
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
      if (
        terminalBlockArrowDirection &&
        !multiLineEditRef.current &&
        isActiveWysiwygEditorContentTarget(targetElement, view) &&
        moveTerminalBlockBoundaryCaretByArrow(view, terminalBlockArrowDirection, TextSelection)
      ) {
        keyboardEvent.preventDefault()
        keyboardEvent.stopPropagation()
        window.setTimeout(syncToolbarFormatState, 0)
        onEditorSelectionChange()
        onEditorMentionQueryChange()
        return
      }
      if (inputIntent.type === 'table-cell-navigation') {
        if (currentEditor && isActiveWysiwygEditorContentTarget(targetElement, view)) {
          const result = moveTableCellSelectionByTab(view, inputIntent.direction)
          if (result.handled) {
            keyboardEvent.preventDefault()
            keyboardEvent.stopPropagation()
            if (result.changed) {
              commitActiveEditorMarkdownNow(currentEditor)
            }
            window.setTimeout(syncToolbarFormatState, 0)
          }
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
      const inputTarget = getElementFromEventTarget(inputEvent.target)
      if (isInsideTerminalBlockLandingZone(inputTarget) || inputTarget?.closest(MEDIA_PLAYER_SELECTOR)) return
      activateEditorFromEventTarget(inputEvent.target)
      const view = getWysiwygView(editorRef.current)
      const currentEditor = editorRef.current
      const mediaDeleteDirection = !multiLineEditRef.current
        ? getMediaLinkDeleteDirectionForBeforeInput(inputEvent)
        : null
      if (
        mediaDeleteDirection &&
        currentEditor &&
        isActiveWysiwygEditorContentTarget(inputTarget, view) &&
        deleteAdjacentMediaLinkRange(view, mediaDeleteDirection)
      ) {
        inputEvent.preventDefault()
        inputEvent.stopPropagation()
        closeMediaTools()
        commitActiveEditorMarkdownNow(currentEditor)
        window.setTimeout(syncToolbarFormatState, 0)
        onEditorSelectionChange()
        onEditorMentionQueryChange()
        return
      }
      if (
        isActiveWysiwygEditorContentTarget(inputTarget, view) &&
        applyTerminalBlockDeleteBeforeInput({
          inputType: inputEvent.inputType,
          hasMultiLineEdit: Boolean(multiLineEditRef.current),
          view,
        })
      ) {
        inputEvent.preventDefault()
        inputEvent.stopPropagation()
        window.setTimeout(syncToolbarFormatState, 0)
        onEditorSelectionChange()
        onEditorMentionQueryChange()
        return
      }
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
          shouldRunStructuralHistoryBeforeEditorHistory,
        })
        if (historyEvent.handled) {
          inputEvent.preventDefault()
          inputEvent.stopPropagation()
          return
        }
        return
      }
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
      onEditorSelectionSettled()
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
        onEditorSelectionSettled()
        onEditorMentionQueryChange()
      }, 50)
    }

    root.addEventListener('pointerdown', handlePointerDown, true)
    root.addEventListener('click', handleClick, true)
    root.addEventListener('contextmenu', handleContextMenu, true)
    root.addEventListener('paste', handlePaste, true)
    root.addEventListener('paste', handlePastedList, true)
    root.addEventListener('dragover', handleMediaDragOver, true)
    root.addEventListener('drop', handleMediaDrop, true)
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
      root.removeEventListener('dragover', handleMediaDragOver, true)
      root.removeEventListener('drop', handleMediaDrop, true)
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
  }, [viewMode, displayContent, activeNoteAisleCount, normalizedHotkeys, isMacPlatform])
}
