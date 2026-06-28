/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Editor } from '@toast-ui/editor'
import { TextSelection } from 'prosemirror-state'
import { createCodeBlockControlsPlugin } from './code-block-controls'
import { headingCollapsePlugin } from './heading-collapse-plugin'
import { getCollapsedHeadingKeysForAisle } from './heading-collapse-state'
import {
  annotationLinePlugin,
  blockIndentPlugin,
  codeBlockBacktickShortcutPlugin,
  EDITOR_TOOLBAR_ITEMS,
  headingSpaceShortcutPlugin,
  highlightPlugin,
  installEditorSpellcheck,
  installHeadingPopupActiveState,
  installToolbarAppTooltips,
  listMarkerPlugin,
  tagAppearancePlugin,
  thematicBreakShortcutPlugin,
  uncheckedTaskEnterPlugin,
} from './editor-setup'
import { terminalBlockLandingPlugin } from './terminal-block-landing'
import { createMediaLinkPlugin } from './media-link-plugin'
import { createNotePreviewPlugin } from './note-preview-plugin'
import {
  FIND_REPLACE_ACTIVE_MATCH_META,
  findReplaceActiveMatchPlugin,
  resolveFindReplaceEditorRange,
  type FindReplaceActiveMatchInput,
  type FindReplaceActiveMatchRange,
  type FindReplaceMatchPositionInput,
} from './find-replace-active-match'
import {
  insertMarkdownNoteReferenceTokenIntoView,
  type MarkdownNoteReferenceInsertionRange,
} from './note-reference-insertion'
import { sanitizeEditorHtml } from './editor-sanitizer'
import {
  applyMarkdownHighlightDelimitersToEditorDisplay,
  getEditorMarkdownForPersistence,
  prepareMarkdownForEditorDisplay,
  restoreEditorDisplay,
  setEditorMarkdownForDisplay,
} from './editor-markdown-display'
import { importBlobAsAssetUrl, importImageBlobAsAssetUrl } from '../markdown/image-asset-registry'
import { installImageDisplayMetadataSync } from './image-dom-metadata'
import { withDefaultInsertedImageDisplayWidth } from './image-insertion'
import { buildAisleEditorKey, getAisleIdFromAisleEditorKey } from './aisle-editor'
import {
  getElementFromEventTarget,
  getExternalLinkRangeAtDocPosition,
  getNoteMentionQueryAtSelection,
  getWysiwygView,
  createLinkMark,
  placeEditorCaretAtClientPoint,
  runWysiwygHistory,
  type NoteMentionQuery,
  type WysiwygHistoryDirection,
} from './prosemirror-utils'
import {
  finishEditorOperation,
  insertEditorTextOperation,
  replaceSelectedTextWithTableOperation,
  runEditorCommandOperation,
  type EditorOperationRuntime,
} from './editor-operation-runner'
import {
  readClipboardMarkdown,
  type ClipboardMarkdownReadResult,
} from './clipboard-paste-markdown'
import { buildMediaMarkdownLink, insertAssetLinksIntoWysiwygView } from './media-file-insertion'
import {
  insertClipboardDataIntoView,
  insertVisualClipboardMarkdownIntoView,
  insertVisualClipboardTextIntoView,
  serializeProseMirrorSelectionForClipboard,
  writeEditorClipboardData,
} from './visual-clipboard'
import {
  insertTableSelectionClipboardPayloadIntoView,
  readTableSelectionClipboardPayloadFromClipboard,
} from './table-selection-clipboard'
import {
  readVaultStructureClipboardPayloadFromDataTransfer,
  type VaultStructureClipboardPayload,
} from '../notes/vault-structure-clipboard'
import {
  readFrontmatterClipboardPayloadFromDataTransfer,
  readFrontmatterClipboardPayloadFromNavigator,
  type FrontmatterClipboardPayload,
} from '../frontmatter/frontmatter-clipboard'
import { applyEditorNewlineOperation } from './newline-operations'
import { applyListToolbarCommand, type ToolbarListCommand } from './list-marker-commands'
import { getNewlineShortcutIdForEvent, normalizeHotkeySettings } from '../hotkeys/shortcuts'
import { openExternalWebUrl } from '../notes/external-links'
import { getEditorKeyboardHistoryDirection } from './editor-input-intents'
import {
  buildSelectionBlockIndentOperationPlan,
  buildSelectionRemoveBlockIndentOperationPlan,
} from './multiline-format-operations'
import {
  getHeadingOutlineFromDoc,
  getHeadingOutlineFromMarkdown,
  type HeadingOutlineItem,
} from './heading-outline'
import {
  getTableOfContentsLinksFromDoc,
  getTableOfContentsLinksFromMarkdown,
} from './table-of-contents-links'
import { getUrlLinkPromptDraftFromSelection } from './url-link-prompt'
import { recordDiagnosticEvent } from '../diagnostics/diagnostic-logger'
import { installCompletedTaskCheckboxBehavior } from './task-behavior'
import {
  resolveMarkdownNoteReferenceDestination,
  resolveMarkdownNoteReferenceToken,
} from '../notes/note-references'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import {
  collapseVaultEditorMarkdownSnapshots,
  type VaultEditorMarkdownSnapshot,
} from '../app/vault-editor-persistence'
import type { AisleActivationSource } from './aisle-activation'
import type {
  AppState,
  HeadingCollapseState,
  LinkPromptState,
  NewlineOperationId,
  NoteLocation,
  ResolvedNoteAisle,
  ToastTone,
  ViewMode,
} from '../types/app'

export type VaultEditorClipboardAction = 'cut' | 'copy' | 'paste' | 'pastePlainText'
export type VaultEditorClipboardPasteAction = Extract<VaultEditorClipboardAction, 'paste' | 'pastePlainText'>
export type VaultEditorClipboardReadResult = Extract<ClipboardMarkdownReadResult, { ok: true }>

type VaultAisleEditorMeta = {
  editor: Editor
  root: HTMLElement
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
  markdown: string
  revision: number
  displayRestoreReady: boolean
  programmaticMarkdownUpdatePending: boolean
  userEditedSinceProgrammaticUpdate: boolean
  cleanup: () => void
}

type VaultEditorMarkdownCommitSource = 'user' | 'programmatic' | 'lifecycle'

type VaultEditorLocalStateEcho = {
  markdown: string
  canonicalMarkdown: string
  revision: number
  externalStateLoadVersion: number
}

type VaultAisleEditorMountFailure = {
  aisleId: string
  aisleBodyId: string
  markdown: string
}

export type VaultAisleEditorActivationOptions = {
  focus?: boolean
  flushPrevious?: boolean
  focusAtClientPoint?: { clientX: number; clientY: number; mode: 'coordinate' | 'focus-only' }
  allowDuringPendingRename?: boolean
  source?: AisleActivationSource
}

export type VaultFindReplaceActiveMatchHighlight = FindReplaceActiveMatchInput & {
  noteBodyId: string
  aisleId: string
}

type UseVaultAisleEditorsOptions = {
  viewMode: ViewMode
  noteId: string
  noteBodyId: string
  aisles: ResolvedNoteAisle[]
  activeAisleId: string
  setActiveAisleId: (aisleId: string) => void
  aisleScrollRef: MutableRefObject<HTMLDivElement | null>
  editorRef: MutableRefObject<Editor | null>
  commitAisleMarkdown: (aisleBodyId: string, markdown: string) => void
  scheduleToolbarFormatStateSync: () => void
  headingCollapseState: HeadingCollapseState
  onToggleHeadingCollapse: (noteBodyId: string, aisleId: string, headingKey: string) => void
  onExpandHeadingCollapse: (noteBodyId: string, aisleId: string, headingKey: string) => void
  onNoteMentionQueryChange?: (query: NoteMentionQuery | null, anchor: { top: number; left: number } | null) => void
  onTagAutocompleteQueryChange?: () => void
  getAppState?: () => AppState
  onOpenNoteReference?: (target: NoteLocation) => void
  onVaultStructurePaste?: (payload: VaultStructureClipboardPayload, aisleId: string) => boolean
  onFrontmatterPaste?: (payload: FrontmatterClipboardPayload, aisleId: string) => boolean
  hotkeys: AppState['hotkeys']
  isMacPlatform: boolean
  onOpenShortcutMenu?: (request: { aisleId: string; anchor: { top: number; left: number } }) => void
  onOpenTableOfContents?: (aisleId: string) => void
  onOpenUrlLinkPrompt?: (prompt: LinkPromptState) => void
  onInsertAisleFromNewline?: (side: 'left' | 'right', aisleId: string, markdown: string) => void
  pushToast?: (message: string, tone?: ToastTone, durationMs?: number) => void
  externalStateLoadVersion: number
}

const TOAST_AISLE_EDITOR_RECENT_RETAIN_LIMIT = 3
const AISLE_EDITOR_SMALL_NOTE_LIVE_LIMIT = 4
const AISLE_EDITOR_INTERSECTION_ROOT_MARGIN = '240px'
const DISPLAY_RESTORE_MAX_FRAME_ATTEMPTS = 8
const EDITOR_APP_STATE_COMMIT_DEBOUNCE_MS = 300
const EDITOR_APP_STATE_COMMIT_MAX_WAIT_MS = 1200
const VAULT_EDITOR_TIMING_DIAGNOSTIC_THRESHOLD_MS = 50
const VAULT_EDITOR_TIMING_WARNING_THRESHOLD_MS = 100

function countMarkdownLinks(markdown: string): number {
  return String(markdown ?? '').match(/\[[^\]\n]+\]\((?:https?:\/\/|#aislenote-note\/)[^)]+\)/gi)?.length ?? 0
}

function getVaultEditorPerfNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function roundDiagnosticMs(durationMs: number): number {
  return Math.round(durationMs * 10) / 10
}

function recordVaultEditorTiming(
  event: string,
  durationMs: number,
  details: Record<string, unknown>,
  thresholdMs = VAULT_EDITOR_TIMING_DIAGNOSTIC_THRESHOLD_MS,
): void {
  if (durationMs < thresholdMs) return
  recordDiagnosticEvent('editor', event, {
    level: durationMs >= VAULT_EDITOR_TIMING_WARNING_THRESHOLD_MS ? 'warning' : 'info',
    durationMs: roundDiagnosticMs(durationMs),
    details,
  })
}

function buildMountedAisleIds({
  aisleIds,
  activeAisleId,
  backgroundAisleIds,
  nearVisibleAisleIds,
  recentAisleIds,
}: {
  aisleIds: string[]
  activeAisleId: string
  backgroundAisleIds: Set<string>
  nearVisibleAisleIds: Set<string>
  recentAisleIds: string[]
}) {
  const activeSet = new Set(aisleIds)
  const mounted = new Set<string>()
  if (activeAisleId && activeSet.has(activeAisleId)) mounted.add(activeAisleId)
  nearVisibleAisleIds.forEach((aisleId) => {
    if (activeSet.has(aisleId)) mounted.add(aisleId)
  })
  backgroundAisleIds.forEach((aisleId) => {
    if (activeSet.has(aisleId)) mounted.add(aisleId)
  })
  recentAisleIds.slice(0, TOAST_AISLE_EDITOR_RECENT_RETAIN_LIMIT).forEach((aisleId) => {
    if (activeSet.has(aisleId)) mounted.add(aisleId)
  })
  if (mounted.size === 0 && aisleIds[0]) mounted.add(aisleIds[0])
  return mounted
}

function areStringSetsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}

function runSelectionBlockIndent(editor: Editor, remove: boolean, runtime: EditorOperationRuntime): boolean {
  const view = getWysiwygView(editor)
  if (!view) return false
  const plan = remove ? buildSelectionRemoveBlockIndentOperationPlan(view) : buildSelectionBlockIndentOperationPlan(view)
  if (!plan) return false
  view.dispatch(plan.transaction.scrollIntoView())
  finishEditorOperation(runtime, editor, { syncToolbar: true })
  return true
}

function scrollToHeading(editor: Editor, heading: HeadingOutlineItem): boolean {
  const view = getWysiwygView(editor)
  if (!view || typeof heading.start !== 'number') return false
  try {
    const from = Math.max(0, Math.min(view.state.doc.content.size, heading.start))
    const to = Math.max(from, Math.min(view.state.doc.content.size, heading.end ?? from))
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)).scrollIntoView())
    editor.focus()
    return true
  } catch {
    return false
  }
}

function scrollToRange(editor: Editor, from: number, to: number): boolean {
  const view = getWysiwygView(editor)
  if (!view?.state?.doc || typeof view.dispatch !== 'function') return false
  try {
    const docSize = view.state.doc.content.size
    const selectionFrom = Math.max(0, Math.min(docSize, from))
    const selectionTo = Math.max(selectionFrom, Math.min(docSize, to))
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selectionFrom, selectionTo)).scrollIntoView())
    editor.focus()
    return true
  } catch {
    return false
  }
}

function scrollToFindReplaceRange(editor: Editor, match: FindReplaceMatchPositionInput): boolean {
  const view = getWysiwygView(editor)
  if (!view?.state?.doc || typeof view.dispatch !== 'function') return false
  try {
    const range = resolveFindReplaceEditorRange(view.state.doc, match)
    if (!range) return false
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)).scrollIntoView())
    editor.focus()
    return true
  } catch {
    return false
  }
}

function getShortcutMenuAnchor(editor: Editor, root: HTMLElement): { top: number; left: number } {
  const view = getWysiwygView(editor)
  const position = view?.state?.selection?.to
  if (typeof position === 'number' && typeof view?.coordsAtPos === 'function') {
    try {
      const rect = view.coordsAtPos(position)
      return {
        top: rect.bottom + 6,
        left: rect.left,
      }
    } catch {
      // Fall through to the editor root anchor.
    }
  }

  const rootRect = root.getBoundingClientRect()
  return {
    top: rootRect.top + 48,
    left: rootRect.left + 24,
  }
}

function getCenteredLinkPromptAnchor(): { top: number; left: number } {
  if (typeof window === 'undefined') return { top: 96, left: 96 }
  return {
    top: Math.max(72, Math.min(160, window.innerHeight * 0.16)),
    left: window.innerWidth / 2,
  }
}

function isUrlLinkShortcutEvent(event: KeyboardEvent, isMac: boolean): boolean {
  if (event.key.toLowerCase() !== 'k') return false
  if (event.shiftKey || event.altKey) return false
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

function getEditorBeforeInputHistoryDirection(event: InputEvent): WysiwygHistoryDirection | null {
  if (event.inputType === 'historyUndo') return 'undo'
  if (event.inputType === 'historyRedo') return 'redo'
  return null
}

function consumeEditorHistoryEvent(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

function focusEditorWithoutScrolling(editor: Editor | null): boolean {
  const dom = getWysiwygView(editor)?.dom as { focus?: (options?: FocusOptions) => void } | undefined
  if (typeof dom?.focus !== 'function') return false
  try {
    dom.focus({ preventScroll: true })
    return true
  } catch {
    return false
  }
}

function isPlainPrimaryEditorClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

export function resolveEditorInternalNoteLinkTarget(
  appState: AppState | null | undefined,
  href: string,
  label: string,
): NoteLocation | null {
  if (!appState) return null
  return resolveMarkdownNoteReferenceDestination(appState, href, label, false)?.target ?? null
}

export function useVaultAisleEditors({
  viewMode,
  noteId,
  noteBodyId,
  aisles,
  activeAisleId,
  setActiveAisleId,
  aisleScrollRef,
  editorRef,
  commitAisleMarkdown,
  scheduleToolbarFormatStateSync,
  headingCollapseState,
  onToggleHeadingCollapse,
  onExpandHeadingCollapse,
  onNoteMentionQueryChange,
  onTagAutocompleteQueryChange,
  getAppState,
  onOpenNoteReference,
  onVaultStructurePaste,
  onFrontmatterPaste,
  hotkeys,
  isMacPlatform,
  onOpenShortcutMenu,
  onOpenTableOfContents,
  onOpenUrlLinkPrompt,
  onInsertAisleFromNewline,
  pushToast = () => undefined,
  externalStateLoadVersion,
}: UseVaultAisleEditorsOptions) {
  const editorRootsRef = useRef<Map<string, HTMLElement>>(new Map())
  const aislePaneRootsRef = useRef<Map<string, HTMLElement>>(new Map())
  const editorMetaRef = useRef<Map<string, VaultAisleEditorMeta>>(new Map())
  const lastMarkdownByAisleBodyRef = useRef<Map<string, string>>(new Map())
  const renderedMarkdownByAisleBodyRef = useRef<Map<string, string>>(new Map())
  const revisionByAisleBodyRef = useRef<Map<string, number>>(new Map())
  const localStateEchoByAisleBodyRef = useRef<Map<string, VaultEditorLocalStateEcho>>(new Map())
  const failedEditorMountsRef = useRef<Map<string, VaultAisleEditorMountFailure>>(new Map())
  const findReplaceActiveMatchRef = useRef<VaultFindReplaceActiveMatchHighlight | null>(null)
  const findReplaceHighlightKeysRef = useRef<Map<string, string>>(new Map())
  const pendingAppStateCommitRevisionsByAisleBodyRef = useRef<Map<string, number>>(new Map())
  const pendingAppStateCommitTimerRef = useRef<number | null>(null)
  const pendingAppStateCommitMaxWaitTimerRef = useRef<number | null>(null)
  const externalStateLoadVersionRef = useRef(externalStateLoadVersion)
  const headingCollapseStateRef = useRef(headingCollapseState)
  const externalReconciledVersionByAisleBodyRef = useRef<Map<string, number>>(new Map())
  const userEditedExternalVersionByAisleBodyRef = useRef<Map<string, number>>(new Map())
  const editorMarkdownRevisionRef = useRef(0)
  const activeEditorAisleIdRef = useRef('')
  const [nearVisibleAisleIds, setNearVisibleAisleIds] = useState<Set<string>>(() => new Set())
  const [backgroundMountedAisleIds, setBackgroundMountedAisleIds] = useState<Set<string>>(() => new Set())
  const [recentRetainedAisleIds, setRecentRetainedAisleIds] = useState<string[]>([])
  const [failedEditorMountAisleIds, setFailedEditorMountAisleIds] = useState<Set<string>>(() => new Set())
  const activeAisleIdRef = useRef(activeAisleId)
  const noteBodyIdRef = useRef(noteBodyId)
  const aislesRef = useRef(aisles)
  const hotkeysRef = useRef(hotkeys)
  const isMacPlatformRef = useRef(isMacPlatform)
  const getAppStateRef = useRef(getAppState)
  const onOpenNoteReferenceRef = useRef(onOpenNoteReference)
  const onFrontmatterPasteRef = useRef(onFrontmatterPaste)
  const onOpenShortcutMenuRef = useRef(onOpenShortcutMenu)
  const onOpenTableOfContentsRef = useRef(onOpenTableOfContents)
  const onOpenUrlLinkPromptRef = useRef(onOpenUrlLinkPrompt)
  const onInsertAisleFromNewlineRef = useRef(onInsertAisleFromNewline)
  const onTagAutocompleteQueryChangeRef = useRef(onTagAutocompleteQueryChange)
  const runNewlineOperationForEditorRef = useRef<
    ((editor: Editor, aisleId: string, operation: NewlineOperationId) => boolean) | null
  >(null)
  activeAisleIdRef.current = activeAisleId
  noteBodyIdRef.current = noteBodyId
  aislesRef.current = aisles
  hotkeysRef.current = hotkeys
  isMacPlatformRef.current = isMacPlatform
  getAppStateRef.current = getAppState
  onOpenNoteReferenceRef.current = onOpenNoteReference
  onFrontmatterPasteRef.current = onFrontmatterPaste
  onOpenShortcutMenuRef.current = onOpenShortcutMenu
  onOpenTableOfContentsRef.current = onOpenTableOfContents
  onOpenUrlLinkPromptRef.current = onOpenUrlLinkPrompt
  onInsertAisleFromNewlineRef.current = onInsertAisleFromNewline
  onTagAutocompleteQueryChangeRef.current = onTagAutocompleteQueryChange
  externalStateLoadVersionRef.current = externalStateLoadVersion
  headingCollapseStateRef.current = headingCollapseState

  const aisleIds = useMemo(() => aisles.map((aisle) => aisle.id), [aisles])
  const aisleIdsKey = aisleIds.join('\n')
  const resolvedActiveAisleId = activeAisleId && aisleIds.includes(activeAisleId) ? activeAisleId : aisleIds[0] ?? ''

  const mountedAisleIds = useMemo(
    () =>
      viewMode === 'main'
        ? buildMountedAisleIds({
            aisleIds,
            activeAisleId: resolvedActiveAisleId,
            backgroundAisleIds: backgroundMountedAisleIds,
            nearVisibleAisleIds,
            recentAisleIds: recentRetainedAisleIds,
          })
        : new Set<string>(),
    [aisleIdsKey, backgroundMountedAisleIds, nearVisibleAisleIds, recentRetainedAisleIds, resolvedActiveAisleId, viewMode],
  )

  const getAisleById = useCallback(
    (aisleId: string) => aislesRef.current.find((aisle) => aisle.id === aisleId) ?? null,
    [],
  )

  const getEditorMetaForAisle = useCallback((aisleId: string) => {
    const editorKey = buildAisleEditorKey(noteBodyIdRef.current, aisleId)
    return editorMetaRef.current.get(editorKey) ?? null
  }, [])

  const syncFailedEditorMountAisleIds = useCallback(() => {
    const nextAisleIds = new Set(Array.from(failedEditorMountsRef.current.values()).map((failure) => failure.aisleId))
    setFailedEditorMountAisleIds((current) => (areStringSetsEqual(current, nextAisleIds) ? current : nextAisleIds))
  }, [])

  const hasMatchingEditorMountFailure = useCallback(
    (editorKey: string, aisle: ResolvedNoteAisle) => {
      const failure = failedEditorMountsRef.current.get(editorKey)
      return Boolean(
        failure &&
          failure.aisleId === aisle.id &&
          failure.aisleBodyId === aisle.aisleBodyId &&
          failure.markdown === aisle.markdown,
      )
    },
    [],
  )

  const recordEditorMountFailure = useCallback(
    (editorKey: string, aisle: ResolvedNoteAisle) => {
      failedEditorMountsRef.current.set(editorKey, {
        aisleId: aisle.id,
        aisleBodyId: aisle.aisleBodyId,
        markdown: aisle.markdown,
      })
      syncFailedEditorMountAisleIds()
    },
    [syncFailedEditorMountAisleIds],
  )

  const clearEditorMountFailure = useCallback(
    (editorKey: string) => {
      if (!failedEditorMountsRef.current.delete(editorKey)) return
      syncFailedEditorMountAisleIds()
    },
    [syncFailedEditorMountAisleIds],
  )

  const getMarkdownForAisle = useCallback((aisleId: string) => {
    const aisle = getAisleById(aisleId)
    if (!aisle) return ''
    return lastMarkdownByAisleBodyRef.current.get(aisle.aisleBodyId) ?? aisle.markdown
  }, [getAisleById])

  const nextEditorMarkdownRevision = useCallback(() => {
    editorMarkdownRevisionRef.current += 1
    return editorMarkdownRevisionRef.current
  }, [])

  const markLocalStateEchoForAisleBody = useCallback((aisleBodyId: string, markdown: string, revision: number) => {
    const safeRevision = typeof revision === 'number' && Number.isFinite(revision) ? revision : 0
    localStateEchoByAisleBodyRef.current.set(aisleBodyId, {
      markdown,
      canonicalMarkdown: normalizeMarkdownForPersistence(markdown),
      revision: safeRevision,
      externalStateLoadVersion: externalStateLoadVersionRef.current,
    })
  }, [])

  const takeMatchingLocalStateEcho = useCallback((aisleBodyId: string, markdown: string) => {
    const echo = localStateEchoByAisleBodyRef.current.get(aisleBodyId) ?? null
    if (!echo) return null
    if (
      echo.externalStateLoadVersion !== externalStateLoadVersionRef.current ||
      (echo.markdown !== markdown && echo.canonicalMarkdown !== markdown)
    ) {
      localStateEchoByAisleBodyRef.current.delete(aisleBodyId)
      return null
    }
    localStateEchoByAisleBodyRef.current.delete(aisleBodyId)
    return echo
  }, [])

  const restoreEditorDisplayWhenReady = useCallback(
    (
      editorKey: string,
      meta: VaultAisleEditorMeta,
      markdown = meta.markdown,
      remainingFrameAttempts = DISPLAY_RESTORE_MAX_FRAME_ATTEMPTS,
    ): boolean => {
      const result = restoreEditorDisplay(meta.editor, markdown)
      if (result.displayReady) {
        meta.displayRestoreReady = true
        meta.programmaticMarkdownUpdatePending = false
        meta.userEditedSinceProgrammaticUpdate = false
        return true
      }

      meta.displayRestoreReady = false
      if (
        remainingFrameAttempts > 0 &&
        typeof window !== 'undefined' &&
        typeof window.requestAnimationFrame === 'function'
      ) {
        window.requestAnimationFrame(() => {
          const current = editorMetaRef.current.get(editorKey)
          if (current !== meta) return
          restoreEditorDisplayWhenReady(editorKey, meta, meta.markdown, remainingFrameAttempts - 1)
        })
      }
      return false
    },
    [],
  )

  const setActiveEditor = useCallback(
    (aisleId: string) => {
      const meta = getEditorMetaForAisle(aisleId)
      if (!meta) return false
      editorRef.current = meta.editor
      activeEditorAisleIdRef.current = aisleId
      setActiveAisleId(aisleId)
      scheduleToolbarFormatStateSync()
      return true
    },
    [editorRef, getEditorMetaForAisle, scheduleToolbarFormatStateSync, setActiveAisleId],
  )

  const applyFindReplaceActiveMatchToMeta = useCallback((meta: VaultAisleEditorMeta) => {
    const view = getWysiwygView(meta.editor)
    if (!view?.state?.doc || typeof view.dispatch !== 'function') return false

    const activeMatch = findReplaceActiveMatchRef.current
    const resolvedRange =
      activeMatch &&
      activeMatch.noteBodyId === meta.noteBodyId &&
      activeMatch.aisleId === meta.aisleId
        ? resolveFindReplaceEditorRange(view.state.doc, activeMatch)
        : null
    const range: FindReplaceActiveMatchRange | null = resolvedRange
      ? { ...resolvedRange, requestId: activeMatch?.requestId ?? 0 }
      : null
    const normalizedRange = range && range.to > range.from ? range : null
    const editorKey = buildAisleEditorKey(meta.noteBodyId, meta.aisleId)
    const nextKey = normalizedRange
      ? `${normalizedRange.from}:${normalizedRange.to}:${normalizedRange.requestId}`
      : ''
    if (findReplaceHighlightKeysRef.current.get(editorKey) === nextKey) return Boolean(normalizedRange)

    findReplaceHighlightKeysRef.current.set(editorKey, nextKey)
    view.dispatch(
      view.state.tr
        .setMeta(FIND_REPLACE_ACTIVE_MATCH_META, normalizedRange)
        .setMeta('addToHistory', false),
    )
    return Boolean(normalizedRange)
  }, [])

  const setActiveFindReplaceMatchHighlight = useCallback((match: VaultFindReplaceActiveMatchHighlight | null) => {
    findReplaceActiveMatchRef.current = match
    editorMetaRef.current.forEach((meta) => {
      applyFindReplaceActiveMatchToMeta(meta)
    })
  }, [applyFindReplaceActiveMatchToMeta])

  const replaceMountedEditorMarkdown = useCallback(
    (
      editorKey: string,
      meta: VaultAisleEditorMeta,
      markdown: string,
      revision: number,
    ) => {
      meta.revision = Math.max(meta.revision, revision)
      lastMarkdownByAisleBodyRef.current.set(meta.aisleBodyId, markdown)
      revisionByAisleBodyRef.current.set(meta.aisleBodyId, meta.revision)
      if (meta.markdown === markdown) return
      meta.markdown = markdown
      meta.displayRestoreReady = false
      meta.programmaticMarkdownUpdatePending = true
      meta.userEditedSinceProgrammaticUpdate = false
      setEditorMarkdownForDisplay(meta.editor, markdown, false)
      restoreEditorDisplayWhenReady(editorKey, meta, markdown)
    },
    [restoreEditorDisplayWhenReady],
  )

  const syncMountedEditorsForAisleBody = useCallback(
    (sourceMeta: VaultAisleEditorMeta, markdown: string, revision: number) => {
      editorMetaRef.current.forEach((meta, editorKey) => {
        if (meta === sourceMeta || meta.aisleBodyId !== sourceMeta.aisleBodyId) return
        replaceMountedEditorMarkdown(editorKey, meta, markdown, revision)
      })
    },
    [replaceMountedEditorMarkdown],
  )

  const markUserEditedAisleBodyAtCurrentExternalVersion = useCallback((aisleBodyId: string) => {
    const externalVersion = externalStateLoadVersionRef.current
    userEditedExternalVersionByAisleBodyRef.current.set(aisleBodyId, externalVersion)
    externalReconciledVersionByAisleBodyRef.current.set(aisleBodyId, externalVersion)
  }, [])

  const commitEditorOriginatedAisleMarkdown = useCallback(
    (aisleBodyId: string, markdown: string, revision: number) => {
      markLocalStateEchoForAisleBody(aisleBodyId, markdown, revision)
      commitAisleMarkdown(aisleBodyId, markdown)
    },
    [commitAisleMarkdown, markLocalStateEchoForAisleBody],
  )

  const getMarkdownSnapshotForMeta = useCallback((meta: VaultAisleEditorMeta) => {
    const useCachedProgrammaticMarkdown =
      meta.programmaticMarkdownUpdatePending &&
      !meta.userEditedSinceProgrammaticUpdate &&
      !meta.displayRestoreReady
    const shouldReadLiveMarkdown =
      !useCachedProgrammaticMarkdown &&
      (meta.aisleId === activeEditorAisleIdRef.current || meta.userEditedSinceProgrammaticUpdate)
    const previousMarkdown = meta.markdown
    const markdown = shouldReadLiveMarkdown ? getEditorMarkdownForPersistence(meta.editor) : meta.markdown
    let revision = meta.revision
    if (shouldReadLiveMarkdown) {
      meta.programmaticMarkdownUpdatePending = false
      meta.userEditedSinceProgrammaticUpdate = false
    }
    if (markdown !== previousMarkdown) {
      revision = nextEditorMarkdownRevision()
      meta.markdown = markdown
      meta.revision = revision
      markUserEditedAisleBodyAtCurrentExternalVersion(meta.aisleBodyId)
      lastMarkdownByAisleBodyRef.current.set(meta.aisleBodyId, markdown)
      revisionByAisleBodyRef.current.set(meta.aisleBodyId, revision)
      syncMountedEditorsForAisleBody(meta, markdown, revision)
    }
    return {
      markdown,
      revision,
      source: shouldReadLiveMarkdown ? 'live' : 'cached',
      changed: markdown !== previousMarkdown,
    }
  }, [markUserEditedAisleBodyAtCurrentExternalVersion, nextEditorMarkdownRevision, syncMountedEditorsForAisleBody])

  const clearScheduledEditorAppStateCommit = useCallback(() => {
    if (typeof window === 'undefined') return
    if (pendingAppStateCommitTimerRef.current !== null) {
      window.clearTimeout(pendingAppStateCommitTimerRef.current)
      pendingAppStateCommitTimerRef.current = null
    }
    if (pendingAppStateCommitMaxWaitTimerRef.current !== null) {
      window.clearTimeout(pendingAppStateCommitMaxWaitTimerRef.current)
      pendingAppStateCommitMaxWaitTimerRef.current = null
    }
  }, [])

  const flushPendingEditorAppStateCommit = useCallback(() => {
    const startedAt = getVaultEditorPerfNow()
    clearScheduledEditorAppStateCommit()
    const pendingRevisions = pendingAppStateCommitRevisionsByAisleBodyRef.current
    if (pendingRevisions.size <= 0) return
    const pendingAisleBodyCount = pendingRevisions.size
    pendingAppStateCommitRevisionsByAisleBodyRef.current = new Map()

    const snapshotsByAisleBodyId = new Map<string, {
      aisleBodyId: string
      markdown: string
      revision: number
    }>()
    let liveReadCount = 0
    let cachedReadCount = 0
    let changedCount = 0

    editorMetaRef.current.forEach((meta) => {
      const pendingRevision = pendingRevisions.get(meta.aisleBodyId)
      if (pendingRevision === undefined) return
      const snapshotMarkdown = getMarkdownSnapshotForMeta(meta)
      if (snapshotMarkdown.source === 'live') liveReadCount += 1
      else cachedReadCount += 1
      if (snapshotMarkdown.changed) changedCount += 1

      const snapshot = {
        aisleBodyId: meta.aisleBodyId,
        markdown: snapshotMarkdown.markdown,
        revision: Math.max(snapshotMarkdown.revision, pendingRevision),
      }
      const current = snapshotsByAisleBodyId.get(meta.aisleBodyId)
      if (!current || snapshot.revision >= current.revision) {
        snapshotsByAisleBodyId.set(meta.aisleBodyId, snapshot)
      }
    })

    snapshotsByAisleBodyId.forEach((snapshot) => {
      commitEditorOriginatedAisleMarkdown(snapshot.aisleBodyId, snapshot.markdown, snapshot.revision)
    })
    recordVaultEditorTiming('vault-pending-commit-flush', getVaultEditorPerfNow() - startedAt, {
      noteId,
      pendingAisleBodyCount,
      committedAisleBodyCount: snapshotsByAisleBodyId.size,
      mountedEditorCount: editorMetaRef.current.size,
      liveReadCount,
      cachedReadCount,
      changedCount,
    })
  }, [
    clearScheduledEditorAppStateCommit,
    commitEditorOriginatedAisleMarkdown,
    getMarkdownSnapshotForMeta,
    noteId,
  ])

  const schedulePendingEditorAppStateCommit = useCallback(() => {
    if (typeof window === 'undefined') {
      flushPendingEditorAppStateCommit()
      return
    }
    if (pendingAppStateCommitTimerRef.current !== null) {
      window.clearTimeout(pendingAppStateCommitTimerRef.current)
    }
    pendingAppStateCommitTimerRef.current = window.setTimeout(() => {
      pendingAppStateCommitTimerRef.current = null
      flushPendingEditorAppStateCommit()
    }, EDITOR_APP_STATE_COMMIT_DEBOUNCE_MS)

    if (pendingAppStateCommitMaxWaitTimerRef.current === null) {
      pendingAppStateCommitMaxWaitTimerRef.current = window.setTimeout(() => {
        pendingAppStateCommitMaxWaitTimerRef.current = null
        flushPendingEditorAppStateCommit()
      }, EDITOR_APP_STATE_COMMIT_MAX_WAIT_MS)
    }
  }, [flushPendingEditorAppStateCommit])

  const scheduleEditorOriginatedAisleMarkdownCommit = useCallback(
    (aisleBodyId: string, revision: number) => {
      pendingAppStateCommitRevisionsByAisleBodyRef.current.set(aisleBodyId, revision)
      schedulePendingEditorAppStateCommit()
    },
    [schedulePendingEditorAppStateCommit],
  )

  const markEditorUserEditIntent = useCallback((editorKey: string) => {
    const meta = editorMetaRef.current.get(editorKey)
    if (meta) meta.userEditedSinceProgrammaticUpdate = true
  }, [])

  const markEditorUserEditIntentForEditor = useCallback((editor: Editor | null) => {
    if (!editor) return
    const meta = Array.from(editorMetaRef.current.values()).find((candidate) => candidate.editor === editor)
    if (meta) meta.userEditedSinceProgrammaticUpdate = true
  }, [])

  const reconcileMountedEditorsFromExternalState = useCallback(() => {
    const appState = getAppState?.()
    if (!appState?.noteAisleBodies?.length) return
    const externalVersion = externalStateLoadVersionRef.current
    const markdownByAisleBodyId = new Map(
      appState.noteAisleBodies.map((body) => [body.id, body.markdown ?? '']),
    )
    const revisionByAisleBodyId = new Map<string, number>()

    editorMetaRef.current.forEach((meta, editorKey) => {
      if (pendingAppStateCommitRevisionsByAisleBodyRef.current.has(meta.aisleBodyId)) return
      const authoritativeMarkdown = markdownByAisleBodyId.get(meta.aisleBodyId)
      if (authoritativeMarkdown === undefined) return
      if (meta.markdown === authoritativeMarkdown) {
        if (externalVersion > 0) {
          externalReconciledVersionByAisleBodyRef.current.set(meta.aisleBodyId, externalVersion)
        }
        return
      }

      const userEditVersion = userEditedExternalVersionByAisleBodyRef.current.get(meta.aisleBodyId) ?? -1
      const reconciledVersion = externalReconciledVersionByAisleBodyRef.current.get(meta.aisleBodyId) ?? -1
      if (externalVersion > 0 && userEditVersion >= externalVersion && reconciledVersion < externalVersion) {
        return
      }

      const revision = revisionByAisleBodyId.get(meta.aisleBodyId) ?? nextEditorMarkdownRevision()
      revisionByAisleBodyId.set(meta.aisleBodyId, revision)
      replaceMountedEditorMarkdown(editorKey, meta, authoritativeMarkdown, revision)
      syncMountedEditorsForAisleBody(meta, authoritativeMarkdown, revision)
      if (externalVersion > 0) {
        externalReconciledVersionByAisleBodyRef.current.set(meta.aisleBodyId, externalVersion)
      }
    })
  }, [getAppState, nextEditorMarkdownRevision, replaceMountedEditorMarkdown, syncMountedEditorsForAisleBody])

  const commitEditorMarkdown = useCallback(
    (
      meta: VaultAisleEditorMeta,
      editor: Editor = meta.editor,
      source: VaultEditorMarkdownCommitSource = 'user',
    ) => {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const useCachedMarkdown =
        (source === 'lifecycle' && !meta.displayRestoreReady) ||
        (
          source === 'programmatic' &&
          meta.programmaticMarkdownUpdatePending &&
          !meta.userEditedSinceProgrammaticUpdate &&
          !meta.displayRestoreReady
        )
      const nextMarkdown =
        useCachedMarkdown
          ? meta.markdown
          : getEditorMarkdownForPersistence(editor)
      if (!useCachedMarkdown) {
        meta.programmaticMarkdownUpdatePending = false
        meta.userEditedSinceProgrammaticUpdate = false
      }
      if (nextMarkdown === meta.markdown) return nextMarkdown
      const revision = nextEditorMarkdownRevision()
      meta.markdown = nextMarkdown
      meta.revision = revision
      meta.programmaticMarkdownUpdatePending = false
      meta.userEditedSinceProgrammaticUpdate = false
      if (source === 'user') markUserEditedAisleBodyAtCurrentExternalVersion(meta.aisleBodyId)
      lastMarkdownByAisleBodyRef.current.set(meta.aisleBodyId, nextMarkdown)
      revisionByAisleBodyRef.current.set(meta.aisleBodyId, revision)
      if (source === 'user') {
        scheduleEditorOriginatedAisleMarkdownCommit(meta.aisleBodyId, revision)
      } else {
        commitAisleMarkdown(meta.aisleBodyId, nextMarkdown)
      }
      syncMountedEditorsForAisleBody(meta, nextMarkdown, revision)
      const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      const linkCount = countMarkdownLinks(nextMarkdown)
      if (import.meta.env?.DEV && (durationMs >= 16 || linkCount >= 8)) {
        recordDiagnosticEvent('editor', 'vault-change-hot-path', {
          level: durationMs >= 50 ? 'warning' : 'info',
          durationMs,
          details: {
            noteId,
            aisleId: meta.aisleId,
            aisleBodyId: meta.aisleBodyId,
            linkCount,
            mountedEditorCount: editorMetaRef.current.size,
          },
        })
      }
      return nextMarkdown
    },
    [
      commitAisleMarkdown,
      markUserEditedAisleBodyAtCurrentExternalVersion,
      nextEditorMarkdownRevision,
      noteId,
      scheduleEditorOriginatedAisleMarkdownCommit,
      syncMountedEditorsForAisleBody,
    ],
  )

  const commitActiveEditorMarkdownNow = useCallback(
    (editor: Editor) => {
      const meta = Array.from(editorMetaRef.current.values()).find((candidate) => candidate.editor === editor)
      return meta ? commitEditorMarkdown(meta, editor) : getEditorMarkdownForPersistence(editor)
    },
    [commitEditorMarkdown],
  )

  const notifyNoteMentionQueryChange = useCallback(
    (editor: Editor | null) => {
      if (!onNoteMentionQueryChange || !editor) return
      const view = getWysiwygView(editor)
      const query = getNoteMentionQueryAtSelection(view)
      let anchor: { top: number; left: number } | null = null
      if (query && typeof view?.coordsAtPos === 'function') {
        try {
          const rect = view.coordsAtPos(query.to)
          anchor = {
            top: rect.bottom,
            left: rect.left,
          }
        } catch {
          anchor = null
        }
      }
      onNoteMentionQueryChange(query, anchor)
    },
    [onNoteMentionQueryChange],
  )

  const getMountedEditorMarkdownSnapshots = useCallback((): VaultEditorMarkdownSnapshot[] => {
    const startedAt = getVaultEditorPerfNow()
    reconcileMountedEditorsFromExternalState()
    let liveReadCount = 0
    let cachedReadCount = 0
    let changedCount = 0
    const snapshots = Array.from(editorMetaRef.current.values()).map((meta) => {
      const snapshotMarkdown = getMarkdownSnapshotForMeta(meta)
      if (snapshotMarkdown.source === 'live') liveReadCount += 1
      else cachedReadCount += 1
      if (snapshotMarkdown.changed) changedCount += 1
      return {
        noteId,
        noteBodyId: meta.noteBodyId,
        aisleId: meta.aisleId,
        aisleBodyId: meta.aisleBodyId,
        markdown: snapshotMarkdown.markdown,
        revision: snapshotMarkdown.revision,
        active: meta.aisleId === activeEditorAisleIdRef.current,
      }
    })
    const collapsedSnapshots = collapseVaultEditorMarkdownSnapshots(snapshots)
    collapsedSnapshots.forEach((snapshot) => {
      markLocalStateEchoForAisleBody(snapshot.aisleBodyId, snapshot.markdown, snapshot.revision ?? 0)
    })
    recordVaultEditorTiming('vault-mounted-snapshot-collection', getVaultEditorPerfNow() - startedAt, {
      noteId,
      mountedEditorCount: editorMetaRef.current.size,
      snapshotCount: snapshots.length,
      collapsedSnapshotCount: collapsedSnapshots.length,
      liveReadCount,
      cachedReadCount,
      changedCount,
    })
    return snapshots
  }, [
    getMarkdownSnapshotForMeta,
    markLocalStateEchoForAisleBody,
    noteId,
    reconcileMountedEditorsFromExternalState,
  ])

  const commitMountedEditorMarkdownNow = useCallback(() => {
    clearScheduledEditorAppStateCommit()
    const committedAisleBodyIds = new Set<string>()
    collapseVaultEditorMarkdownSnapshots(getMountedEditorMarkdownSnapshots()).forEach((snapshot) => {
      commitEditorOriginatedAisleMarkdown(snapshot.aisleBodyId, snapshot.markdown, snapshot.revision ?? 0)
      committedAisleBodyIds.add(snapshot.aisleBodyId)
    })
    committedAisleBodyIds.forEach((aisleBodyId) => {
      pendingAppStateCommitRevisionsByAisleBodyRef.current.delete(aisleBodyId)
    })
  }, [clearScheduledEditorAppStateCommit, commitEditorOriginatedAisleMarkdown, getMountedEditorMarkdownSnapshots])

  const replaceActiveEditorMarkdown = useCallback(
    (markdown: string) => {
      const editor = editorRef.current
      if (!editor) return
      const meta = Array.from(editorMetaRef.current.values()).find((candidate) => candidate.editor === editor)
      if (meta) meta.displayRestoreReady = false
      setEditorMarkdownForDisplay(editor, markdown, false)
      if (meta) {
        restoreEditorDisplayWhenReady(buildAisleEditorKey(meta.noteBodyId, meta.aisleId), meta, markdown)
        const revision = nextEditorMarkdownRevision()
        meta.markdown = markdown
        meta.revision = revision
        meta.programmaticMarkdownUpdatePending = false
        markUserEditedAisleBodyAtCurrentExternalVersion(meta.aisleBodyId)
        lastMarkdownByAisleBodyRef.current.set(meta.aisleBodyId, meta.markdown)
        revisionByAisleBodyRef.current.set(meta.aisleBodyId, revision)
        commitEditorOriginatedAisleMarkdown(meta.aisleBodyId, meta.markdown, revision)
        syncMountedEditorsForAisleBody(meta, meta.markdown, revision)
      }
    },
    [
      commitEditorOriginatedAisleMarkdown,
      editorRef,
      markUserEditedAisleBodyAtCurrentExternalVersion,
      nextEditorMarkdownRevision,
      restoreEditorDisplayWhenReady,
      syncMountedEditorsForAisleBody,
    ],
  )

  const editorOperationRuntime = useMemo<EditorOperationRuntime>(
    () => ({
      editorRef,
      commitActiveEditorMarkdownNow,
      replaceActiveEditorMarkdown,
      syncToolbarFormatState: scheduleToolbarFormatStateSync,
      pushToast,
    }),
    [commitActiveEditorMarkdownNow, editorRef, pushToast, replaceActiveEditorMarkdown, scheduleToolbarFormatStateSync],
  )

  const runGuardedEditorHistory = useCallback(
    (editor: Editor | null, direction: WysiwygHistoryDirection) => {
      if (!editor) return false
      const result = runWysiwygHistory(editor, direction)
      if (result === 'applied') {
        markEditorUserEditIntentForEditor(editor)
        finishEditorOperation(editorOperationRuntime, editor, {
          commitMode: 'deferred',
          focus: 'none',
          syncToolbar: true,
        })
      } else {
        scheduleToolbarFormatStateSync()
      }
      return true
    },
    [editorOperationRuntime, markEditorUserEditIntentForEditor, scheduleToolbarFormatStateSync],
  )

  const destroyEditor = useCallback((editorKey: string, captureContent = false) => {
    const meta = editorMetaRef.current.get(editorKey)
    if (!meta) return
    const startedAt = getVaultEditorPerfNow()
    const mountedEditorCountBefore = editorMetaRef.current.size
    const wasActiveEditor = editorRef.current === meta.editor
    if (captureContent) {
      try {
        flushPendingEditorAppStateCommit()
        commitEditorMarkdown(meta, meta.editor, 'lifecycle')
      } catch {
        // Snapshot before destroy is best-effort.
      }
    }
    try {
      meta.cleanup()
    } catch {
      // Cleanup is best-effort during hot reloads and route changes.
    }
    try {
      meta.editor.destroy()
    } catch {
      // Toast UI can throw while tearing down toolbar DOM during hot reloads.
    }
    if (editorRef.current === meta.editor) {
      editorRef.current = null
      activeEditorAisleIdRef.current = ''
    }
    editorMetaRef.current.delete(editorKey)
    findReplaceHighlightKeysRef.current.delete(editorKey)
    recordVaultEditorTiming('vault-editor-destroy', getVaultEditorPerfNow() - startedAt, {
      noteId,
      noteBodyId: meta.noteBodyId,
      aisleId: meta.aisleId,
      aisleBodyId: meta.aisleBodyId,
      captureContent,
      wasActiveEditor,
      mountedEditorCountBefore,
      mountedEditorCountAfter: editorMetaRef.current.size,
    })
  }, [commitEditorMarkdown, editorRef, flushPendingEditorAppStateCommit, noteId])

  useEffect(() => () => {
    Array.from(editorMetaRef.current.keys()).forEach((editorKey) => destroyEditor(editorKey, true))
  }, [destroyEditor])

  useEffect(() => {
    setBackgroundMountedAisleIds(new Set())
    if (viewMode !== 'main' || !noteBodyId || aisleIds.length <= 1 || aisleIds.length > AISLE_EDITOR_SMALL_NOTE_LIVE_LIMIT) {
      return undefined
    }
    let cancelled = false
    const frameId = window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (!cancelled) setBackgroundMountedAisleIds(new Set(aisleIds))
      }, 0)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
    }
  }, [aisleIdsKey, noteBodyId, viewMode])

  useEffect(() => {
    if (viewMode !== 'main' || aisleIds.length <= 0 || typeof IntersectionObserver === 'undefined') {
      setNearVisibleAisleIds(new Set())
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setNearVisibleAisleIds((current) => {
          const next = new Set(current)
          entries.forEach((entry) => {
            const node = entry.target as HTMLElement
            const aisleId = node.dataset.aisleId ?? ''
            if (!aisleId) return
            if (entry.isIntersecting) next.add(aisleId)
            else next.delete(aisleId)
          })
          return next
        })
      },
      {
        root: aisleScrollRef.current,
        rootMargin: AISLE_EDITOR_INTERSECTION_ROOT_MARGIN,
        threshold: 0.01,
      },
    )

    aisleIds.forEach((aisleId) => {
      const node = aislePaneRootsRef.current.get(aisleId)
      if (node) observer.observe(node)
    })

    return () => observer.disconnect()
  }, [aisleIdsKey, viewMode])

  useEffect(() => {
    const aislesByEditorKey = new Map(aisles.map((aisle) => [buildAisleEditorKey(noteBodyId, aisle.id), aisle]))
    let changed = false
    failedEditorMountsRef.current.forEach((failure, editorKey) => {
      const aisle = aislesByEditorKey.get(editorKey)
      if (!aisle || failure.aisleBodyId !== aisle.aisleBodyId || failure.markdown !== aisle.markdown) {
        failedEditorMountsRef.current.delete(editorKey)
        changed = true
      }
    })
    if (changed) syncFailedEditorMountAisleIds()
  }, [aisles, noteBodyId, syncFailedEditorMountAisleIds])

  useEffect(() => {
    const expectedKeys = new Set(aisles.map((aisle) => buildAisleEditorKey(noteBodyId, aisle.id)))
    Array.from(editorMetaRef.current.keys()).forEach((editorKey) => {
      const meta = editorMetaRef.current.get(editorKey)
      if (!expectedKeys.has(editorKey)) {
        destroyEditor(editorKey, true)
      } else if (meta && !mountedAisleIds.has(meta.aisleId)) {
        destroyEditor(editorKey, true)
      }
    })

    if (viewMode !== 'main' || !noteBodyId) return

    aisles.forEach((aisle) => {
      if (!mountedAisleIds.has(aisle.id)) return
      const editorKey = buildAisleEditorKey(noteBodyId, aisle.id)
      if (hasMatchingEditorMountFailure(editorKey, aisle)) return
      const root = editorRootsRef.current.get(editorKey)
      if (!root) return
      if (!root.isConnected) return

      const existing = editorMetaRef.current.get(editorKey)
      if (existing && existing.root === root && existing.aisleBodyId === aisle.aisleBodyId) {
        const previouslyRenderedMarkdown = renderedMarkdownByAisleBodyRef.current.get(aisle.aisleBodyId)
        const stateMarkdownChanged = previouslyRenderedMarkdown !== undefined && previouslyRenderedMarkdown !== aisle.markdown
        renderedMarkdownByAisleBodyRef.current.set(aisle.aisleBodyId, aisle.markdown)
        const cachedMarkdown = lastMarkdownByAisleBodyRef.current.get(aisle.aisleBodyId) ?? aisle.markdown
        if (stateMarkdownChanged) {
          const localStateEcho = takeMatchingLocalStateEcho(aisle.aisleBodyId, aisle.markdown)
          const revision = localStateEcho?.revision ?? nextEditorMarkdownRevision()
          lastMarkdownByAisleBodyRef.current.set(aisle.aisleBodyId, aisle.markdown)
          revisionByAisleBodyRef.current.set(aisle.aisleBodyId, revision)
          const existingMarkdownMatchesLocalState =
            existing.markdown === aisle.markdown ||
            normalizeMarkdownForPersistence(existing.markdown) === aisle.markdown
          if (localStateEcho && existingMarkdownMatchesLocalState) {
            existing.revision = Math.max(existing.revision, revision)
            return
          }
          replaceMountedEditorMarkdown(editorKey, existing, aisle.markdown, revision)
        } else if (cachedMarkdown !== aisle.markdown && existing.markdown !== cachedMarkdown) {
          const revision = revisionByAisleBodyRef.current.get(aisle.aisleBodyId) ?? nextEditorMarkdownRevision()
          replaceMountedEditorMarkdown(editorKey, existing, cachedMarkdown, revision)
        } else if (cachedMarkdown === aisle.markdown && existing.markdown !== aisle.markdown) {
          const revision = revisionByAisleBodyRef.current.get(aisle.aisleBodyId) ?? nextEditorMarkdownRevision()
          replaceMountedEditorMarkdown(editorKey, existing, aisle.markdown, revision)
        }
        return
      }

      if (existing) destroyEditor(editorKey, true)

      let editor: Editor | null = null
      const editorPlugins: any[] = [
        listMarkerPlugin,
        blockIndentPlugin,
        annotationLinePlugin,
        tagAppearancePlugin,
        findReplaceActiveMatchPlugin,
        highlightPlugin,
        codeBlockBacktickShortcutPlugin,
        terminalBlockLandingPlugin,
        (context: any) =>
          headingCollapsePlugin(context, {
            aisleId: aisle.id,
            getCollapsedHeadingKeys: (targetAisleId) =>
              getCollapsedHeadingKeysForAisle(headingCollapseStateRef.current, noteBodyIdRef.current, targetAisleId),
            getMarkdown: getMarkdownForAisle,
            onToggleHeading: (targetAisleId, headingKey) =>
              onToggleHeadingCollapse(noteBodyIdRef.current, targetAisleId, headingKey),
            onExpandHeading: (targetAisleId, headingKey) =>
              onExpandHeadingCollapse(noteBodyIdRef.current, targetAisleId, headingKey),
          }),
        createMediaLinkPlugin,
        createNotePreviewPlugin({
          getAppState,
          getCurrentNoteBodyId: () => noteBodyIdRef.current,
          onOpenNote: onOpenNoteReference,
        }),
        createCodeBlockControlsPlugin({ pushToast }),
        uncheckedTaskEnterPlugin,
        headingSpaceShortcutPlugin,
        thematicBreakShortcutPlugin,
      ]

      const handleFocus = () => setActiveEditor(aisle.id)
      const handleEditorQueryProbe = () => {
        if (editor) notifyNoteMentionQueryChange(editor)
        onTagAutocompleteQueryChangeRef.current?.()
      }
      const handlePointerDown = () => {
        setRecentRetainedAisleIds((current) => [
          activeAisleIdRef.current,
          ...current.filter((candidate) => candidate !== activeAisleIdRef.current && candidate !== aisle.id),
        ].filter(Boolean).slice(0, TOAST_AISLE_EDITOR_RECENT_RETAIN_LIMIT))
        setActiveEditor(aisle.id)
      }
      const handleCopyCut = (event: ClipboardEvent) => {
        if (event.defaultPrevented) return
        if (!getElementFromEventTarget(event.target)?.closest('.ProseMirror[contenteditable="true"]')) return
        const view = getWysiwygView(editor)
        const serialization = serializeProseMirrorSelectionForClipboard(view)
        if (!serialization || !writeEditorClipboardData(event.clipboardData, serialization)) return
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        if (event.type === 'cut' && editor) {
          markEditorUserEditIntent(editorKey)
          view.dispatch(view.state.tr.deleteSelection().scrollIntoView())
          editor.focus()
          commitActiveEditorMarkdownNow(editor)
          scheduleToolbarFormatStateSync()
        }
      }
      const handlePaste = (event: ClipboardEvent) => {
        if (event.defaultPrevented) return
        if (!getElementFromEventTarget(event.target)?.closest('.ProseMirror[contenteditable="true"]')) return

        const frontmatterPayload = readFrontmatterClipboardPayloadFromDataTransfer(event.clipboardData, {
          allowYamlFallback: false,
        })
        if (frontmatterPayload && onFrontmatterPasteRef.current?.(frontmatterPayload, aisle.id)) {
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          return
        }

        const payload = readVaultStructureClipboardPayloadFromDataTransfer(event.clipboardData)
        if (payload && onVaultStructurePaste?.(payload, aisle.id)) {
          markEditorUserEditIntent(editorKey)
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          return
        }

        const view = getWysiwygView(editor)
        if (!editor || !insertClipboardDataIntoView(view, event.clipboardData)) return
        markEditorUserEditIntent(editorKey)
        commitActiveEditorMarkdownNow(editor)
        scheduleToolbarFormatStateSync()
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
      }
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
        if (!getElementFromEventTarget(event.target)?.closest('.ProseMirror[contenteditable="true"]')) return

        const historyDirection = getEditorKeyboardHistoryDirection(event, isMacPlatformRef.current)
        if (historyDirection) {
          consumeEditorHistoryEvent(event)
          markEditorUserEditIntent(editorKey)
          setActiveEditor(aisle.id)
          runGuardedEditorHistory(editor, historyDirection)
          return
        }

        if (isUrlLinkShortcutEvent(event, isMacPlatformRef.current)) {
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          setActiveEditor(aisle.id)
          if (editor) {
            const prompt = getUrlLinkPromptState()
            if (prompt) onOpenUrlLinkPromptRef.current?.(prompt)
          }
          return
        }

        if (event.key !== 'Enter') return
        const shortcutId = getNewlineShortcutIdForEvent(event, isMacPlatformRef.current)
        if (!shortcutId) return

        const operation = normalizeHotkeySettings(hotkeysRef.current).newlineShortcuts.shortcuts[shortcutId]
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        markEditorUserEditIntent(editorKey)
        setActiveEditor(aisle.id)

        if (operation === 'operationsMenu') {
          if (editor) {
            onOpenShortcutMenuRef.current?.({
              aisleId: aisle.id,
              anchor: getShortcutMenuAnchor(editor, root),
            })
          }
          return
        }

        if (operation === 'tableOfContents') {
          onOpenTableOfContentsRef.current?.(aisle.id)
          return
        }

        if (editor) runNewlineOperationForEditorRef.current?.(editor, aisle.id, operation)
      }
      const handleBeforeInput = (event: InputEvent) => {
        if (event.defaultPrevented || event.isComposing) return
        if (!getElementFromEventTarget(event.target)?.closest('.ProseMirror[contenteditable="true"]')) return

        markEditorUserEditIntent(editorKey)

        const historyDirection = getEditorBeforeInputHistoryDirection(event)
        if (!historyDirection) return

        consumeEditorHistoryEvent(event)
        setActiveEditor(aisle.id)
        runGuardedEditorHistory(editor, historyDirection)
      }
      const handleLinkClick = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0) return
        const target = getElementFromEventTarget(event.target)
        const anchor = target?.closest<HTMLAnchorElement>('a[href]')
        if (!anchor || !root.contains(anchor) || !anchor.closest('.ProseMirror[contenteditable="true"]')) return
        const href = anchor.getAttribute('href')?.trim() ?? ''
        if (!href) return

        const noteTarget = isPlainPrimaryEditorClick(event)
          ? resolveEditorInternalNoteLinkTarget(getAppStateRef.current?.() ?? null, href, anchor.textContent ?? '')
          : null
        if (noteTarget && onOpenNoteReferenceRef.current) {
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          onOpenNoteReferenceRef.current(noteTarget)
          return
        }

        if (!openExternalWebUrl(href)) return
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
      }
      root.addEventListener('focusin', handleFocus)
      root.addEventListener('pointerdown', handlePointerDown, true)
      root.addEventListener('copy', handleCopyCut, true)
      root.addEventListener('cut', handleCopyCut, true)
      root.addEventListener('paste', handlePaste, true)
      root.addEventListener('keydown', handleKeyDown, true)
      root.addEventListener('beforeinput', handleBeforeInput, true)
      root.addEventListener('click', handleLinkClick, true)
      root.addEventListener('keyup', handleEditorQueryProbe)
      root.addEventListener('mouseup', handleEditorQueryProbe)

      const cleanupFns: Array<() => void> = [
        () => root.removeEventListener('focusin', handleFocus),
        () => root.removeEventListener('pointerdown', handlePointerDown, true),
        () => root.removeEventListener('copy', handleCopyCut, true),
        () => root.removeEventListener('cut', handleCopyCut, true),
        () => root.removeEventListener('paste', handlePaste, true),
        () => root.removeEventListener('keydown', handleKeyDown, true),
        () => root.removeEventListener('beforeinput', handleBeforeInput, true),
        () => root.removeEventListener('click', handleLinkClick, true),
        () => root.removeEventListener('keyup', handleEditorQueryProbe),
        () => root.removeEventListener('mouseup', handleEditorQueryProbe),
      ]

      const mountStartedAt = getVaultEditorPerfNow()
      try {
        editor = new Editor({
          el: root,
          initialValue: prepareMarkdownForEditorDisplay(aisle.markdown),
          initialEditType: 'wysiwyg',
          previewStyle: 'tab',
          hideModeSwitch: true,
          customHTMLSanitizer: sanitizeEditorHtml,
          toolbarItems: EDITOR_TOOLBAR_ITEMS,
          height: '100%',
          autofocus: false,
          usageStatistics: false,
          plugins: editorPlugins,
          hooks: {
            addImageBlobHook: (blob: Blob | File, callback: (url: string, text?: string) => void) => {
              void importImageBlobAsAssetUrl(blob, blob instanceof File ? blob.name : 'image').then((assetUrl) => {
                if (!assetUrl) {
                  pushToast('Could not import image.', 'warning')
                  return
                }
                void withDefaultInsertedImageDisplayWidth(assetUrl, blob, root).then((displayUrl) => {
                  callback(displayUrl, blob instanceof File ? blob.name : 'image')
                  window.setTimeout(() => {
                    const meta = editorMetaRef.current.get(editorKey)
                    if (meta) commitEditorMarkdown(meta)
                  }, 30)
                })
              })
            },
          },
          events: {
            change: () => {
              const meta = editorMetaRef.current.get(editorKey)
              if (!meta || !editor) return
              const source =
                meta.programmaticMarkdownUpdatePending && !meta.userEditedSinceProgrammaticUpdate
                  ? 'programmatic'
                  : 'user'
              commitEditorMarkdown(meta, editor, source)
              scheduleToolbarFormatStateSync()
              notifyNoteMentionQueryChange(editor)
              onTagAutocompleteQueryChangeRef.current?.()
            },
            focus: handleFocus,
          },
        } as any)

        const mountedEditor = editor
        clearEditorMountFailure(editorKey)
        cleanupFns.push(installEditorSpellcheck(root))
        cleanupFns.push(installToolbarAppTooltips(root))
        cleanupFns.push(installImageDisplayMetadataSync(root))
        cleanupFns.push(installHeadingPopupActiveState(root, () => mountedEditor))
        cleanupFns.push(installCompletedTaskCheckboxBehavior(root, () => mountedEditor, undefined, commitActiveEditorMarkdownNow))

        const meta: VaultAisleEditorMeta = {
          editor: mountedEditor,
          root,
          noteBodyId,
          aisleId: aisle.id,
          aisleBodyId: aisle.aisleBodyId,
          markdown: aisle.markdown,
          revision: revisionByAisleBodyRef.current.get(aisle.aisleBodyId) ?? 0,
          displayRestoreReady: false,
          programmaticMarkdownUpdatePending: true,
          userEditedSinceProgrammaticUpdate: false,
          cleanup: () => cleanupFns.forEach((cleanup) => cleanup()),
        }
        editorMetaRef.current.set(editorKey, meta)
        lastMarkdownByAisleBodyRef.current.set(aisle.aisleBodyId, aisle.markdown)
        renderedMarkdownByAisleBodyRef.current.set(aisle.aisleBodyId, aisle.markdown)
        applyMarkdownHighlightDelimitersToEditorDisplay(mountedEditor)
        restoreEditorDisplayWhenReady(editorKey, meta, aisle.markdown)
        applyFindReplaceActiveMatchToMeta(meta)
        if (aisle.id === resolvedActiveAisleId) {
          editorRef.current = mountedEditor
          activeEditorAisleIdRef.current = aisle.id
          scheduleToolbarFormatStateSync()
        }
        recordVaultEditorTiming('vault-editor-mount', getVaultEditorPerfNow() - mountStartedAt, {
          noteId,
          noteBodyId,
          aisleId: aisle.id,
          aisleBodyId: aisle.aisleBodyId,
          markdownLength: aisle.markdown.length,
          pluginCount: editorPlugins.length,
          mountedEditorCount: editorMetaRef.current.size,
          active: aisle.id === resolvedActiveAisleId,
        })
      } catch (error) {
        cleanupFns.forEach((cleanup) => cleanup())
        try {
          editor?.destroy()
        } catch {
          // Toast UI can throw during partial mount cleanup.
        }
        recordEditorMountFailure(editorKey, aisle)
        recordDiagnosticEvent('aisle-editor', 'vault-mount-error', {
          level: 'error',
          message: error instanceof Error ? error.message : 'Toast UI editor mount failed.',
          details: {
            noteId,
            noteBodyId,
            aisleId: aisle.id,
            aisleBodyId: aisle.aisleBodyId,
            pluginCount: editorPlugins.length,
          },
        })
        pushToast('Editor failed to mount for this aisle.', 'error')
      }
    })
  }, [
    aisles,
    commitActiveEditorMarkdownNow,
    commitEditorMarkdown,
    clearEditorMountFailure,
    destroyEditor,
    getMarkdownForAisle,
    hasMatchingEditorMountFailure,
    mountedAisleIds,
    nextEditorMarkdownRevision,
    noteBodyId,
    onVaultStructurePaste,
    onExpandHeadingCollapse,
    onToggleHeadingCollapse,
    applyFindReplaceActiveMatchToMeta,
    replaceMountedEditorMarkdown,
    recordEditorMountFailure,
    restoreEditorDisplayWhenReady,
    runGuardedEditorHistory,
    setActiveEditor,
    takeMatchingLocalStateEcho,
    viewMode,
  ])

  useEffect(() => {
    if (viewMode !== 'main' || !noteBodyId) return
    editorMetaRef.current.forEach((meta) => {
      const view = getWysiwygView(meta.editor)
      if (!view?.state?.tr || typeof view.dispatch !== 'function') return
      view.dispatch(view.state.tr.setMeta('headingCollapseRefresh', true).setMeta('addToHistory', false))
    })
  }, [viewMode, noteBodyId, headingCollapseState])

  const registerAislePaneRoot = useCallback((aisleId: string, node: HTMLElement | null) => {
    if (!node) {
      return
    }
    if (aislePaneRootsRef.current.get(aisleId) === node) return
    aislePaneRootsRef.current.set(aisleId, node)
  }, [])

  const registerAisleEditorRoot = useCallback((editorKey: string, node: HTMLElement | null) => {
    if (!node) {
      return
    }
    if (editorRootsRef.current.get(editorKey) === node) return
    editorRootsRef.current.set(editorKey, node)
  }, [])

  const activateAisleEditor = useCallback(
    (editorKey: string, options: VaultAisleEditorActivationOptions = {}) => {
      const aisleId = getAisleIdFromAisleEditorKey(editorKey)
      if (!setActiveEditor(aisleId)) return false
      const editor = getEditorMetaForAisle(aisleId)?.editor
      if (options.focusAtClientPoint?.mode === 'focus-only') {
        focusEditorWithoutScrolling(editor ?? null)
        return true
      }
      if (options.focusAtClientPoint && placeEditorCaretAtClientPoint(editor ?? null, options.focusAtClientPoint)) {
        return true
      }
      if (options.focus) editor?.focus()
      return true
    },
    [getEditorMetaForAisle, setActiveEditor],
  )

  const runCommand = useCallback(
    (command: string, payload?: Record<string, unknown>) => {
      const editor = editorRef.current
      if (!editor) {
        pushToast('Open a note before using the toolbar.', 'warning')
        return false
      }

      if (command === 'undo' || command === 'redo') {
        return runGuardedEditorHistory(editor, command)
      }

      if (command === 'bold' || command === 'italic' || command === 'strike' || command === 'highlight') {
        markEditorUserEditIntentForEditor(editor)
        return runEditorCommandOperation(editorOperationRuntime, command, undefined, {
          commitMode: 'deferred',
          syncToolbar: true,
        }).handled
      }

      if (command === 'bulletList' || command === 'orderedList' || command === 'taskList' || command === 'dashList') {
        markEditorUserEditIntentForEditor(editor)
        applyListToolbarCommand(editor, command as ToolbarListCommand)
        finishEditorOperation(editorOperationRuntime, editor, { commitMode: 'deferred', syncToolbar: true })
        return true
      }

      if (command === 'blockIndent' || command === 'removeBlockIndent') {
        markEditorUserEditIntentForEditor(editor)
        if (runSelectionBlockIndent(editor, command === 'removeBlockIndent', editorOperationRuntime)) return true
        pushToast(command === 'blockIndent' ? 'Nothing to indent.' : 'No block indent to remove.', 'warning')
        return true
      }

      if (command === 'blockQuote') {
        markEditorUserEditIntentForEditor(editor)
        const result = applyEditorNewlineOperation(editor, 'blockQuote')
        if (result.handled) finishEditorOperation(editorOperationRuntime, editor, { syncToolbar: true })
        return result.handled
      }

      if (command === 'hr') {
        markEditorUserEditIntentForEditor(editor)
        const result = applyEditorNewlineOperation(editor, 'horizontalLine')
        if (result.handled) finishEditorOperation(editorOperationRuntime, editor, { syncToolbar: true })
        return result.handled
      }

      if (command === 'code') {
        markEditorUserEditIntentForEditor(editor)
        return runEditorCommandOperation(editorOperationRuntime, 'code', undefined, {
          commitMode: 'deferred',
          syncToolbar: true,
        }).handled
      }

      if (command === 'codeBlock') {
        markEditorUserEditIntentForEditor(editor)
        const result = applyEditorNewlineOperation(editor, 'codeBlock')
        if (result.handled) finishEditorOperation(editorOperationRuntime, editor, { syncToolbar: true })
        return result.handled
      }

      if (command === 'addTable' || command === 'table') {
        markEditorUserEditIntentForEditor(editor)
        const tableSelectionResult = replaceSelectedTextWithTableOperation(editorOperationRuntime, {
          commitMode: 'none',
          syncToolbar: false,
        })
        if (!tableSelectionResult.handled) {
          runEditorCommandOperation(editorOperationRuntime, 'addTable', payload ?? { rowCount: 2, columnCount: 2 }, {
            commitMode: 'none',
            syncToolbar: false,
          })
        }
        finishEditorOperation(editorOperationRuntime, editor, { commitMode: 'deferred', syncToolbar: true })
        return true
      }

      if (command === 'clear') {
        replaceActiveEditorMarkdown('')
        scheduleToolbarFormatStateSync()
        return true
      }

      const mappedCommand = command === 'heading'
        ? 'heading'
        : command === 'link'
          ? 'addLink'
          : command === 'image'
            ? 'addImage'
            : command
      markEditorUserEditIntentForEditor(editor)
      return runEditorCommandOperation(editorOperationRuntime, mappedCommand, payload, {
        commitMode: 'deferred',
        syncToolbar: true,
      }).handled
    },
    [
      editorOperationRuntime,
      editorRef,
      markEditorUserEditIntentForEditor,
      pushToast,
      replaceActiveEditorMarkdown,
      scheduleToolbarFormatStateSync,
    ],
  )

  const runNewlineOperationForEditor = useCallback(
    (editor: Editor, aisleId: string, operation: NewlineOperationId) => {
      if (operation === 'operationsMenu' || operation === 'tableOfContents') return false

      markEditorUserEditIntentForEditor(editor)

      if (operation === 'blockIndent') {
        if (runSelectionBlockIndent(editor, false, editorOperationRuntime)) return true
        pushToast('Nothing to indent.', 'warning')
        return true
      }

      const result = applyEditorNewlineOperation(editor, operation)
      if (!result.handled) return false

      finishEditorOperation(editorOperationRuntime, editor, { syncToolbar: true })

      if (operation === 'aisleLeft' || operation === 'aisleRight') {
        onInsertAisleFromNewlineRef.current?.(
          operation === 'aisleLeft' ? 'left' : 'right',
          aisleId,
          result.aisleMarkdown ?? '',
        )
      }

      return true
    },
    [editorOperationRuntime, markEditorUserEditIntentForEditor, pushToast],
  )
  runNewlineOperationForEditorRef.current = runNewlineOperationForEditor

  const runNewlineOperation = useCallback(
    (operation: NewlineOperationId, aisleId = activeEditorAisleIdRef.current) => {
      const meta = getEditorMetaForAisle(aisleId)
      if (!meta) return false
      setActiveEditor(aisleId)
      return runNewlineOperationForEditor(meta.editor, aisleId, operation)
    },
    [getEditorMetaForAisle, runNewlineOperationForEditor, setActiveEditor],
  )

  const readClipboardMarkdownForPaste = useCallback(
    async (action: VaultEditorClipboardPasteAction): Promise<VaultEditorClipboardReadResult | null> => {
      const result = await readClipboardMarkdown({
        mode: action === 'paste' ? 'rich' : 'plainText',
        importImageBlobAsAssetUrl,
        importBlobAsAssetUrl,
      })
      if (!result.ok) {
        if (result.reason === 'unavailable') {
          pushToast('Clipboard paste is unavailable here.', 'warning')
        }
        return null
      }
      return result
    },
    [pushToast],
  )

  const insertTextFromContextMenu = useCallback(
    (text: string) => {
      const editor = editorRef.current
      if (!editor) {
        pushToast('Open a note before using the editor menu.', 'warning')
        return false
      }
      if (!text) return true
      editor.focus()
      const view = getWysiwygView(editor)
      if (insertVisualClipboardTextIntoView(view, text)) {
        markEditorUserEditIntentForEditor(editor)
        commitActiveEditorMarkdownNow(editor)
        scheduleToolbarFormatStateSync()
        return true
      }
      markEditorUserEditIntentForEditor(editor)
      return insertEditorTextOperation(editorOperationRuntime, text, {
        commitMode: 'deferred',
        syncToolbar: true,
      }).handled
    },
    [
      commitActiveEditorMarkdownNow,
      editorOperationRuntime,
      editorRef,
      markEditorUserEditIntentForEditor,
      pushToast,
      scheduleToolbarFormatStateSync,
    ],
  )

  const replaceActiveEditorRangeWithText = useCallback(
    (from: number, to: number, text: string) => {
      const editor = editorRef.current
      if (!editor) {
        pushToast('Open a note before inserting note content.', 'warning')
        return false
      }
      const view = getWysiwygView(editor)
      if (!view?.state?.tr || typeof view.dispatch !== 'function') return insertTextFromContextMenu(text)
      try {
        const docSize = view.state.doc?.content?.size ?? to
        const safeFrom = Math.max(0, Math.min(docSize, Math.floor(from)))
        const safeTo = Math.max(safeFrom, Math.min(docSize, Math.floor(to)))
        markEditorUserEditIntentForEditor(editor)
        view.dispatch(view.state.tr.insertText(text, safeFrom, safeTo).scrollIntoView())
        editor.focus()
        finishEditorOperation(editorOperationRuntime, editor, { commitMode: 'deferred', syncToolbar: true })
        notifyNoteMentionQueryChange(editor)
        return true
      } catch {
        return insertTextFromContextMenu(text)
      }
    },
    [
      editorOperationRuntime,
      editorRef,
      insertTextFromContextMenu,
      markEditorUserEditIntentForEditor,
      notifyNoteMentionQueryChange,
      pushToast,
    ],
  )

  const insertNoteReferenceAtSelection = useCallback(
    (token: string, range?: MarkdownNoteReferenceInsertionRange | null) => {
      const editor = editorRef.current
      if (!editor) {
        pushToast('Open a note before inserting note content.', 'warning')
        return false
      }
      if (!token) return true

      const view = getWysiwygView(editor)
      markEditorUserEditIntentForEditor(editor)
      if (insertMarkdownNoteReferenceTokenIntoView(view, token, range)) {
        finishEditorOperation(editorOperationRuntime, editor, { commitMode: 'deferred', syncToolbar: true })
        notifyNoteMentionQueryChange(editor)
        return true
      }

      return range
        ? replaceActiveEditorRangeWithText(range.from, range.to, token)
        : insertTextFromContextMenu(token)
    },
    [
      editorOperationRuntime,
      editorRef,
      insertTextFromContextMenu,
      markEditorUserEditIntentForEditor,
      notifyNoteMentionQueryChange,
      pushToast,
      replaceActiveEditorRangeWithText,
    ],
  )

  const insertClipboardMarkdownResult = useCallback(
    (result: VaultEditorClipboardReadResult) => {
      const editor = editorRef.current
      if (!editor) {
        pushToast('Open a note before using the editor menu.', 'warning')
        return false
      }
      if (result.source === 'plain-text') return insertTextFromContextMenu(result.markdown)

      editor.focus()
      const view = getWysiwygView(editor)
      if (insertVisualClipboardMarkdownIntoView(view, result.markdown)) {
        markEditorUserEditIntentForEditor(editor)
        commitActiveEditorMarkdownNow(editor)
        scheduleToolbarFormatStateSync()
        return true
      }
      return insertTextFromContextMenu(result.markdown)
    },
    [
      commitActiveEditorMarkdownNow,
      editorRef,
      insertTextFromContextMenu,
      markEditorUserEditIntentForEditor,
      pushToast,
      scheduleToolbarFormatStateSync,
    ],
  )

  const runClipboardAction = useCallback(
    (action: VaultEditorClipboardAction) => {
      const editor = editorRef.current
      if (!editor) {
        pushToast('Open a note before using the editor menu.', 'warning')
        return false
      }
      editor.focus()
      if (action === 'cut' || action === 'copy') {
        document.execCommand(action)
        return true
      }
      void (async () => {
        if (action === 'paste') {
          const frontmatterPayload = await readFrontmatterClipboardPayloadFromNavigator(undefined, {
            allowYamlFallback: false,
          })
          const targetAisleId = activeEditorAisleIdRef.current
          if (frontmatterPayload && targetAisleId && onFrontmatterPasteRef.current?.(frontmatterPayload, targetAisleId)) {
            return
          }

          const payload = await readTableSelectionClipboardPayloadFromClipboard()
          const view = getWysiwygView(editor)
          if (payload && insertTableSelectionClipboardPayloadIntoView(view, payload)) {
            markEditorUserEditIntentForEditor(editor)
            commitActiveEditorMarkdownNow(editor)
            scheduleToolbarFormatStateSync()
            return
          }
        }

        const result = await readClipboardMarkdownForPaste(action)
        if (result) insertClipboardMarkdownResult(result)
      })()
        .catch(() => {
          pushToast('Clipboard paste is unavailable here.', 'warning')
        })
      return true
    },
    [
      commitActiveEditorMarkdownNow,
      editorRef,
      insertClipboardMarkdownResult,
      markEditorUserEditIntentForEditor,
      pushToast,
      readClipboardMarkdownForPaste,
      scheduleToolbarFormatStateSync,
    ],
  )

  const insertImageFile = useCallback(() => {
    const editor = editorRef.current
    if (!editor) {
      pushToast('Open a note before inserting an image.', 'warning')
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      void importImageBlobAsAssetUrl(file, file.name).then(async (assetUrl) => {
        if (!assetUrl) {
          pushToast('Could not import image.', 'warning')
          return
        }
        const view = getWysiwygView(editor)
        const displayUrl = await withDefaultInsertedImageDisplayWidth(
          assetUrl,
          file,
          view?.dom instanceof HTMLElement ? view.dom : null,
        )
        markEditorUserEditIntentForEditor(editor)
        runEditorCommandOperation(editorOperationRuntime, 'addImage', { imageUrl: displayUrl, altText: file.name }, {
          commitMode: 'deferred',
          syncToolbar: true,
        })
      })
    }
    input.click()
  }, [editorOperationRuntime, editorRef, markEditorUserEditIntentForEditor, pushToast])

  const insertAttachmentFile = useCallback(() => {
    const editor = editorRef.current
    if (!editor) {
      pushToast('Open a note before inserting an attachment.', 'warning')
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = [
      'image/*',
      'application/pdf',
      'audio/*',
      'video/*',
      '.pdf',
      '.mp3',
      '.wav',
      '.m4a',
      '.ogg',
      '.webm',
      '.mp4',
      '.mov',
    ].join(',')
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return

      const insertImageAttachment = async () => {
        const assetUrl = await importImageBlobAsAssetUrl(file, file.name)
        if (!assetUrl) {
          pushToast('Could not import attachment.', 'warning')
          return
        }
        const view = getWysiwygView(editor)
        const displayUrl = await withDefaultInsertedImageDisplayWidth(
          assetUrl,
          file,
          view?.dom instanceof HTMLElement ? view.dom : null,
        )
        editor.focus()
        markEditorUserEditIntentForEditor(editor)
        runEditorCommandOperation(editorOperationRuntime, 'addImage', { imageUrl: displayUrl, altText: file.name }, {
          commitMode: 'deferred',
          syncToolbar: true,
        })
      }

      const insertLinkedAttachment = async () => {
        const assetUrl = await importBlobAsAssetUrl(file, file.name)
        if (!assetUrl) {
          pushToast('Could not import attachment.', 'warning')
          return
        }
        const label = file.name.trim() || 'attachment'
        editor.focus()
        if (insertAssetLinksIntoWysiwygView(getWysiwygView(editor), [{ label, url: assetUrl }])) {
          markEditorUserEditIntentForEditor(editor)
          commitActiveEditorMarkdownNow(editor)
          scheduleToolbarFormatStateSync()
          return
        }
        markEditorUserEditIntentForEditor(editor)
        insertEditorTextOperation(editorOperationRuntime, buildMediaMarkdownLink(label, assetUrl), {
          commitMode: 'deferred',
          syncToolbar: true,
        })
      }

      void (file.type.startsWith('image/') ? insertImageAttachment() : insertLinkedAttachment())
        .catch(() => pushToast('Could not import attachment.', 'warning'))
    }
    input.click()
  }, [
    commitActiveEditorMarkdownNow,
    editorOperationRuntime,
    editorRef,
    markEditorUserEditIntentForEditor,
    pushToast,
    scheduleToolbarFormatStateSync,
  ])

  const getUrlLinkPromptState = useCallback((): LinkPromptState | null => {
    const editor = editorRef.current
    if (!editor) {
      pushToast('Open a note before inserting a link.', 'warning')
      return null
    }
    const view = getWysiwygView(editor)
    const selection = view?.state?.selection
    const doc = view?.state?.doc
    const from = typeof selection?.from === 'number' ? selection.from : 0
    const to = typeof selection?.to === 'number' ? selection.to : from
    const selectedText = doc && to > from ? String(doc.textBetween(from, to, '', '') ?? '') : ''
    const promptDraft = getUrlLinkPromptDraftFromSelection(selectedText)
    const anchor = getCenteredLinkPromptAnchor()
    return {
      open: true,
      top: anchor.top,
      left: anchor.left,
      url: promptDraft.url,
      text: promptDraft.text,
      urlEditable: true,
      centered: true,
      editRange: { from, to, href: '' },
    }
  }, [editorRef, pushToast])

  const getLinkPromptAtClientPoint = useCallback(
    (aisleId: string, point: { clientX: number; clientY: number }): LinkPromptState | null => {
      const meta = getEditorMetaForAisle(aisleId)
      const view = getWysiwygView(meta?.editor ?? null)
      if (!view?.state?.doc || typeof view.posAtCoords !== 'function') return null

      const position = (() => {
        try {
          const result = view.posAtCoords({ left: point.clientX, top: point.clientY })
          return typeof result?.pos === 'number' && Number.isFinite(result.pos) ? result.pos : null
        } catch {
          return null
        }
      })()
      if (position === null) return null

      const range =
        getExternalLinkRangeAtDocPosition(view.state.doc, position) ??
        getExternalLinkRangeAtDocPosition(view.state.doc, position - 1)
      if (!range) return null

      const anchor = getCenteredLinkPromptAnchor()
      return {
        open: true,
        top: anchor.top,
        left: anchor.left,
        url: range.href,
        text: String(view.state.doc.textBetween(range.from, range.to, '', '') ?? ''),
        urlEditable: true,
        centered: true,
        editRange: range,
      }
    },
    [getEditorMetaForAisle],
  )

  const openUrlLinkPrompt = useCallback(() => {
    const prompt = getUrlLinkPromptState()
    if (prompt) onOpenUrlLinkPromptRef.current?.(prompt)
  }, [getUrlLinkPromptState])

  const insertNamedUrlLink = useCallback((url: string, text: string, range?: LinkPromptState['editRange']) => {
    const editor = editorRef.current
    if (!editor) {
      pushToast('Open a note before inserting a link.', 'warning')
      return false
    }
    const linkUrl = url.trim()
    if (!linkUrl) return false
    const view = getWysiwygView(editor)
    const linkType = view?.state?.schema?.marks?.link
    if (!view?.state?.doc || !view?.state?.tr || typeof view.dispatch !== 'function' || !linkType) {
      markEditorUserEditIntentForEditor(editor)
      return runEditorCommandOperation(editorOperationRuntime, 'addLink', { linkUrl }, {
        commitMode: 'deferred',
        syncToolbar: true,
      }).handled
    }

    try {
      const docSize = view.state.doc.content?.size ?? 0
      const selection = view.state.selection
      const rawFrom = typeof range?.from === 'number' ? range.from : selection.from
      const rawTo = typeof range?.to === 'number' ? range.to : selection.to
      const from = Math.max(0, Math.min(docSize, Math.floor(Math.min(rawFrom, rawTo))))
      const to = Math.max(from, Math.min(docSize, Math.floor(Math.max(rawFrom, rawTo))))
      const currentText = to > from ? String(view.state.doc.textBetween(from, to, '', '') ?? '') : ''
      const label = text.trim() || currentText || linkUrl
      const linkMark = createLinkMark(linkType, linkUrl)
      let transaction = view.state.tr
      if (to > from && label === currentText) {
        transaction = transaction.addMark(from, to, linkMark)
      } else {
        transaction = transaction.replaceWith(from, to, view.state.schema.text(label, [linkMark]))
      }
      const nextCursor = Math.max(0, Math.min(transaction.doc.content.size, from + label.length))
      transaction = transaction.setSelection(TextSelection.create(transaction.doc, nextCursor, nextCursor)).scrollIntoView()
      markEditorUserEditIntentForEditor(editor)
      view.dispatch(transaction)
      editor.focus()
      finishEditorOperation(editorOperationRuntime, editor, { commitMode: 'deferred', syncToolbar: true })
      return true
    } catch {
      markEditorUserEditIntentForEditor(editor)
      return runEditorCommandOperation(editorOperationRuntime, 'addLink', { linkUrl }, {
        commitMode: 'deferred',
        syncToolbar: true,
      }).handled
    }
  }, [editorOperationRuntime, editorRef, markEditorUserEditIntentForEditor, pushToast])

  const insertUrlLink = useCallback((url: string) => {
    const editor = editorRef.current
    if (!editor) {
      pushToast('Open a note before inserting a link.', 'warning')
      return false
    }
    const linkUrl = url.trim()
    if (!linkUrl) return false
    markEditorUserEditIntentForEditor(editor)
    return runEditorCommandOperation(editorOperationRuntime, 'addLink', { linkUrl }, {
      commitMode: 'deferred',
      syncToolbar: true,
    }).handled
  }, [editorOperationRuntime, editorRef, markEditorUserEditIntentForEditor, pushToast])

  const getPreviewMarkdownForAisle = useCallback((aisle: ResolvedNoteAisle) => {
    return lastMarkdownByAisleBodyRef.current.get(aisle.aisleBodyId) ?? aisle.markdown
  }, [])

  const getHeadingOutlineForAisle = useCallback((aisle: ResolvedNoteAisle) => {
    const meta = getEditorMetaForAisle(aisle.id)
    const view = meta ? getWysiwygView(meta.editor) : null
    return view?.state?.doc
      ? getHeadingOutlineFromDoc(aisle.id, view.state.doc)
      : getHeadingOutlineFromMarkdown(aisle.id, getPreviewMarkdownForAisle(aisle))
  }, [getEditorMetaForAisle, getPreviewMarkdownForAisle])

  const getTableOfContentsLinksForAisle = useCallback((aisle: ResolvedNoteAisle) => {
    const appState = getAppState?.()
    const resolveMarkdownNoteReference = (token: string) =>
      appState ? resolveMarkdownNoteReferenceToken(appState, token) : null
    const meta = getEditorMetaForAisle(aisle.id)
    const view = meta ? getWysiwygView(meta.editor) : null
    return view?.state?.doc
      ? getTableOfContentsLinksFromDoc(aisle.id, view.state.doc, resolveMarkdownNoteReference)
      : getTableOfContentsLinksFromMarkdown(aisle.id, getPreviewMarkdownForAisle(aisle), resolveMarkdownNoteReference)
  }, [getAppState, getEditorMetaForAisle, getPreviewMarkdownForAisle])

  const scrollToAisleHeading = useCallback((aisleId: string, headingKey: string) => {
    const aisle = getAisleById(aisleId)
    const meta = getEditorMetaForAisle(aisleId)
    if (!aisle || !meta) return false
    const heading = getHeadingOutlineForAisle(aisle).find((candidate) => candidate.key === headingKey)
    return heading ? scrollToHeading(meta.editor, heading) : false
  }, [getAisleById, getEditorMetaForAisle, getHeadingOutlineForAisle])

  const scrollToAisleTableOfContentsLink = useCallback((aisleId: string, linkKey: string) => {
    const aisle = getAisleById(aisleId)
    const meta = getEditorMetaForAisle(aisleId)
    if (!aisle || !meta) return false
    const link = getTableOfContentsLinksForAisle(aisle).find((candidate) => candidate.key === linkKey)
    if (typeof link?.from !== 'number' || typeof link.to !== 'number') return false
    return scrollToRange(meta.editor, link.from, link.to)
  }, [getAisleById, getEditorMetaForAisle, getTableOfContentsLinksForAisle])

  const scrollToAisleRange = useCallback((aisleId: string, from: number, to: number) => {
    const meta = getEditorMetaForAisle(aisleId)
    return meta ? scrollToRange(meta.editor, from, to) : false
  }, [getEditorMetaForAisle])

  const scrollToAisleFindReplaceMatch = useCallback((aisleId: string, match: FindReplaceMatchPositionInput) => {
    const meta = getEditorMetaForAisle(aisleId)
    return meta ? scrollToFindReplaceRange(meta.editor, match) : false
  }, [getEditorMetaForAisle])

  return {
    activeEditorAisleIdRef,
    mountedAisleIds,
    failedEditorMountAisleIds,
    registerAislePaneRoot,
    registerAisleEditorRoot,
    activateAisleEditor,
    runCommand,
    runNewlineOperation,
    runClipboardAction,
    readClipboardMarkdownForPaste,
    insertImageFile,
    insertAttachmentFile,
    openUrlLinkPrompt,
    getLinkPromptAtClientPoint,
    insertNamedUrlLink,
    insertUrlLink,
    insertTextAtSelection: insertTextFromContextMenu,
    insertNoteReferenceAtSelection,
    replaceActiveEditorRangeWithText,
    commitActiveEditorMarkdownNow,
    commitMountedEditorMarkdownNow,
    flushPendingEditorAppStateCommit,
    getMountedEditorMarkdownSnapshots,
    getPreviewMarkdownForAisle,
    getHeadingOutlineForAisle,
    getTableOfContentsLinksForAisle,
    scrollToAisleHeading,
    scrollToAisleTableOfContentsLink,
    scrollToAisleRange,
    scrollToAisleFindReplaceMatch,
    setActiveFindReplaceMatchHighlight,
  }
}
