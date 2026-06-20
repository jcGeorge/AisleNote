/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Editor } from '@toast-ui/editor'
import { TextSelection } from 'prosemirror-state'
import { createCodeBlockControlsPlugin } from './code-block-controls'
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
import { sanitizeEditorHtml } from './editor-sanitizer'
import {
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
  getNoteMentionQueryAtSelection,
  getWysiwygView,
  createLinkMark,
  placeEditorCaretAtClientPoint,
  type NoteMentionQuery,
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
import { insertVisualClipboardMarkdownIntoView, insertVisualClipboardTextIntoView } from './visual-clipboard'
import {
  insertTableSelectionClipboardPayloadIntoView,
  readTableSelectionClipboardPayloadFromClipboard,
} from './table-selection-clipboard'
import {
  readNotebookStructureClipboardPayloadFromDataTransfer,
  type NotebookStructureClipboardPayload,
} from '../notes/notebook-structure-clipboard'
import { applyEditorNewlineOperation } from './newline-operations'
import { applyListToolbarCommand, type ToolbarListCommand } from './list-marker-commands'
import { getNewlineShortcutIdForEvent, normalizeHotkeySettings } from '../hotkeys/shortcuts'
import { openExternalWebUrl } from '../notes/external-links'
import {
  buildSelectionBlockIndentOperationPlan,
  buildSelectionRemoveBlockIndentOperationPlan,
} from './multiline-format-operations'
import {
  getHeadingOutlineFromDoc,
  getHeadingOutlineFromMarkdown,
  type HeadingOutlineItem,
} from './heading-outline'
import { getUrlLinkPromptDraftFromSelection } from './url-link-prompt'
import { recordDiagnosticEvent } from '../diagnostics/diagnostic-logger'
import { installCompletedTaskCheckboxBehavior } from './task-behavior'
import type { NotebookEditorMarkdownSnapshot } from '../app/notebook-editor-persistence'
import type { AisleActivationSource } from './aisle-activation'
import type { AppState, LinkPromptState, NewlineOperationId, NoteLocation, ResolvedNoteAisle, ToastTone, ViewMode } from '../types/app'

export type NotebookEditorClipboardAction = 'cut' | 'copy' | 'paste' | 'pastePlainText'
export type NotebookEditorClipboardPasteAction = Extract<NotebookEditorClipboardAction, 'paste' | 'pastePlainText'>
export type NotebookEditorClipboardReadResult = Extract<ClipboardMarkdownReadResult, { ok: true }>

type NotebookAisleEditorMeta = {
  editor: Editor
  root: HTMLElement
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
  markdown: string
  displayRestoreReady: boolean
  cleanup: () => void
}

export type NotebookAisleEditorActivationOptions = {
  focus?: boolean
  flushPrevious?: boolean
  focusAtClientPoint?: { clientX: number; clientY: number }
  allowDuringPendingRename?: boolean
  source?: AisleActivationSource
}

type UseNotebookAisleEditorsOptions = {
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
  onNoteMentionQueryChange?: (query: NoteMentionQuery | null, anchor: { top: number; left: number } | null) => void
  getAppState?: () => AppState
  onOpenNoteReference?: (target: NoteLocation) => void
  onNotebookStructurePaste?: (payload: NotebookStructureClipboardPayload, aisleId: string) => boolean
  hotkeys: AppState['hotkeys']
  isMacPlatform: boolean
  onOpenShortcutMenu?: (request: { aisleId: string; anchor: { top: number; left: number } }) => void
  onOpenUrlLinkPrompt?: (prompt: LinkPromptState) => void
  onInsertAisleFromNewline?: (side: 'left' | 'right', aisleId: string, markdown: string) => void
  pushToast?: (message: string, tone?: ToastTone, durationMs?: number) => void
}

const TOAST_AISLE_EDITOR_RECENT_RETAIN_LIMIT = 3
const AISLE_EDITOR_SMALL_NOTE_LIVE_LIMIT = 4
const AISLE_EDITOR_INTERSECTION_ROOT_MARGIN = '240px'
const DISPLAY_RESTORE_MAX_FRAME_ATTEMPTS = 8

function countMarkdownLinks(markdown: string): number {
  return String(markdown ?? '').match(/\[[^\]\n]+\]\((?:https?:\/\/|#tabs-note\/)[^)]+\)/gi)?.length ?? 0
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

function getEditorSelectionAnchor(editor: Editor, root: HTMLElement): { top: number; left: number } {
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

function isUrlLinkShortcutEvent(event: KeyboardEvent, isMac: boolean): boolean {
  if (event.key.toLowerCase() !== 'k') return false
  if (event.shiftKey || event.altKey) return false
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

export function useNotebookAisleEditors({
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
  onNoteMentionQueryChange,
  getAppState,
  onOpenNoteReference,
  onNotebookStructurePaste,
  hotkeys,
  isMacPlatform,
  onOpenShortcutMenu,
  onOpenUrlLinkPrompt,
  onInsertAisleFromNewline,
  pushToast = () => undefined,
}: UseNotebookAisleEditorsOptions) {
  const editorRootsRef = useRef<Map<string, HTMLElement>>(new Map())
  const aislePaneRootsRef = useRef<Map<string, HTMLElement>>(new Map())
  const editorMetaRef = useRef<Map<string, NotebookAisleEditorMeta>>(new Map())
  const lastMarkdownByAisleBodyRef = useRef<Map<string, string>>(new Map())
  const activeEditorAisleIdRef = useRef('')
  const [nearVisibleAisleIds, setNearVisibleAisleIds] = useState<Set<string>>(() => new Set())
  const [backgroundMountedAisleIds, setBackgroundMountedAisleIds] = useState<Set<string>>(() => new Set())
  const [recentRetainedAisleIds, setRecentRetainedAisleIds] = useState<string[]>([])
  const activeAisleIdRef = useRef(activeAisleId)
  const noteBodyIdRef = useRef(noteBodyId)
  const aislesRef = useRef(aisles)
  const hotkeysRef = useRef(hotkeys)
  const isMacPlatformRef = useRef(isMacPlatform)
  const onOpenShortcutMenuRef = useRef(onOpenShortcutMenu)
  const onOpenUrlLinkPromptRef = useRef(onOpenUrlLinkPrompt)
  const onInsertAisleFromNewlineRef = useRef(onInsertAisleFromNewline)
  const runNewlineOperationForEditorRef = useRef<
    ((editor: Editor, aisleId: string, operation: NewlineOperationId) => boolean) | null
  >(null)
  activeAisleIdRef.current = activeAisleId
  noteBodyIdRef.current = noteBodyId
  aislesRef.current = aisles
  hotkeysRef.current = hotkeys
  isMacPlatformRef.current = isMacPlatform
  onOpenShortcutMenuRef.current = onOpenShortcutMenu
  onOpenUrlLinkPromptRef.current = onOpenUrlLinkPrompt
  onInsertAisleFromNewlineRef.current = onInsertAisleFromNewline

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

  const restoreEditorDisplayWhenReady = useCallback(
    (
      editorKey: string,
      meta: NotebookAisleEditorMeta,
      markdown = meta.markdown,
      remainingFrameAttempts = DISPLAY_RESTORE_MAX_FRAME_ATTEMPTS,
    ): boolean => {
      const result = restoreEditorDisplay(meta.editor, markdown)
      if (result.displayReady) {
        meta.displayRestoreReady = true
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

  const commitEditorMarkdown = useCallback(
    (meta: NotebookAisleEditorMeta, editor: Editor = meta.editor) => {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const nextMarkdown = meta.displayRestoreReady ? getEditorMarkdownForPersistence(editor) : meta.markdown
      if (nextMarkdown === meta.markdown) return nextMarkdown
      meta.markdown = nextMarkdown
      lastMarkdownByAisleBodyRef.current.set(meta.aisleBodyId, nextMarkdown)
      commitAisleMarkdown(meta.aisleBodyId, nextMarkdown)
      const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      const linkCount = countMarkdownLinks(nextMarkdown)
      if (import.meta.env?.DEV && (durationMs >= 16 || linkCount >= 8)) {
        recordDiagnosticEvent('editor', 'notebook-change-hot-path', {
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
    [commitAisleMarkdown, noteId],
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

  const getMountedEditorMarkdownSnapshots = useCallback((): NotebookEditorMarkdownSnapshot[] => {
    return Array.from(editorMetaRef.current.values()).map((meta) => {
      const markdown = meta.displayRestoreReady ? getEditorMarkdownForPersistence(meta.editor) : meta.markdown
      meta.markdown = markdown
      lastMarkdownByAisleBodyRef.current.set(meta.aisleBodyId, markdown)
      return {
        noteId,
        noteBodyId: meta.noteBodyId,
        aisleId: meta.aisleId,
        aisleBodyId: meta.aisleBodyId,
        markdown,
      }
    })
  }, [noteId])

  const commitMountedEditorMarkdownNow = useCallback(() => {
    getMountedEditorMarkdownSnapshots().forEach((snapshot) => {
      commitAisleMarkdown(snapshot.aisleBodyId, snapshot.markdown)
    })
  }, [commitAisleMarkdown, getMountedEditorMarkdownSnapshots])

  const replaceActiveEditorMarkdown = useCallback(
    (markdown: string) => {
      const editor = editorRef.current
      if (!editor) return
      const meta = Array.from(editorMetaRef.current.values()).find((candidate) => candidate.editor === editor)
      if (meta) meta.displayRestoreReady = false
      setEditorMarkdownForDisplay(editor, markdown, false)
      if (meta) {
        restoreEditorDisplayWhenReady(buildAisleEditorKey(meta.noteBodyId, meta.aisleId), meta, markdown)
        meta.markdown = meta.displayRestoreReady ? getEditorMarkdownForPersistence(editor) : markdown
        lastMarkdownByAisleBodyRef.current.set(meta.aisleBodyId, meta.markdown)
        commitAisleMarkdown(meta.aisleBodyId, meta.markdown)
      }
    },
    [commitAisleMarkdown, editorRef, restoreEditorDisplayWhenReady],
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

  const destroyEditor = useCallback((editorKey: string, captureContent = false) => {
    const meta = editorMetaRef.current.get(editorKey)
    if (!meta) return
    if (captureContent) {
      try {
        commitEditorMarkdown(meta)
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
  }, [commitEditorMarkdown, editorRef])

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
      const root = editorRootsRef.current.get(editorKey)
      if (!root) return

      const existing = editorMetaRef.current.get(editorKey)
      if (existing && existing.root === root && existing.aisleBodyId === aisle.aisleBodyId) {
        const cachedMarkdown = lastMarkdownByAisleBodyRef.current.get(aisle.aisleBodyId) ?? aisle.markdown
        if (cachedMarkdown !== aisle.markdown && existing.markdown !== aisle.markdown) {
          existing.markdown = aisle.markdown
          existing.displayRestoreReady = false
          lastMarkdownByAisleBodyRef.current.set(aisle.aisleBodyId, aisle.markdown)
          setEditorMarkdownForDisplay(existing.editor, aisle.markdown, false)
          restoreEditorDisplayWhenReady(editorKey, existing, aisle.markdown)
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
        highlightPlugin,
        codeBlockBacktickShortcutPlugin,
        terminalBlockLandingPlugin,
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
      const handleMentionProbe = () => {
        if (editor) notifyNoteMentionQueryChange(editor)
      }
      const handlePointerDown = () => {
        setRecentRetainedAisleIds((current) => [
          activeAisleIdRef.current,
          ...current.filter((candidate) => candidate !== activeAisleIdRef.current && candidate !== aisle.id),
        ].filter(Boolean).slice(0, TOAST_AISLE_EDITOR_RECENT_RETAIN_LIMIT))
        setActiveEditor(aisle.id)
      }
      const handlePaste = (event: ClipboardEvent) => {
        const payload = readNotebookStructureClipboardPayloadFromDataTransfer(event.clipboardData)
        if (!payload || !onNotebookStructurePaste?.(payload, aisle.id)) return
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
      }
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
        if (!getElementFromEventTarget(event.target)?.closest('.ProseMirror[contenteditable="true"]')) return

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

        if (editor) runNewlineOperationForEditorRef.current?.(editor, aisle.id, operation)
      }
      const handleLinkClick = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0) return
        const target = getElementFromEventTarget(event.target)
        const anchor = target?.closest<HTMLAnchorElement>('a[href]')
        if (!anchor || !root.contains(anchor) || !anchor.closest('.ProseMirror[contenteditable="true"]')) return
        const href = anchor.getAttribute('href')?.trim() ?? ''
        if (!href || !openExternalWebUrl(href)) return
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
      }
      root.addEventListener('focusin', handleFocus)
      root.addEventListener('pointerdown', handlePointerDown, true)
      root.addEventListener('paste', handlePaste, true)
      root.addEventListener('keydown', handleKeyDown, true)
      root.addEventListener('click', handleLinkClick, true)
      root.addEventListener('keyup', handleMentionProbe)
      root.addEventListener('mouseup', handleMentionProbe)

      const cleanupFns: Array<() => void> = [
        () => root.removeEventListener('focusin', handleFocus),
        () => root.removeEventListener('pointerdown', handlePointerDown, true),
        () => root.removeEventListener('paste', handlePaste, true),
        () => root.removeEventListener('keydown', handleKeyDown, true),
        () => root.removeEventListener('click', handleLinkClick, true),
        () => root.removeEventListener('keyup', handleMentionProbe),
        () => root.removeEventListener('mouseup', handleMentionProbe),
      ]

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
              commitEditorMarkdown(meta, editor)
              scheduleToolbarFormatStateSync()
              notifyNoteMentionQueryChange(editor)
            },
            focus: handleFocus,
          },
        } as any)

        const mountedEditor = editor
        cleanupFns.push(installEditorSpellcheck(root))
        cleanupFns.push(installToolbarAppTooltips(root))
        cleanupFns.push(installImageDisplayMetadataSync(root))
        cleanupFns.push(installHeadingPopupActiveState(root, () => mountedEditor))
        cleanupFns.push(installCompletedTaskCheckboxBehavior(root, () => mountedEditor, undefined, commitActiveEditorMarkdownNow))

        const meta: NotebookAisleEditorMeta = {
          editor: mountedEditor,
          root,
          noteBodyId,
          aisleId: aisle.id,
          aisleBodyId: aisle.aisleBodyId,
          markdown: aisle.markdown,
          displayRestoreReady: false,
          cleanup: () => cleanupFns.forEach((cleanup) => cleanup()),
        }
        editorMetaRef.current.set(editorKey, meta)
        lastMarkdownByAisleBodyRef.current.set(aisle.aisleBodyId, aisle.markdown)
        restoreEditorDisplayWhenReady(editorKey, meta, aisle.markdown)
        if (aisle.id === resolvedActiveAisleId) {
          editorRef.current = mountedEditor
          activeEditorAisleIdRef.current = aisle.id
          scheduleToolbarFormatStateSync()
        }
      } catch (error) {
        cleanupFns.forEach((cleanup) => cleanup())
        try {
          editor?.destroy()
        } catch {
          // Toast UI can throw during partial mount cleanup.
        }
        recordDiagnosticEvent('aisle-editor', 'notebook-mount-error', {
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
    destroyEditor,
    mountedAisleIds,
    noteBodyId,
    onNotebookStructurePaste,
    restoreEditorDisplayWhenReady,
    setActiveEditor,
    viewMode,
  ])

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
    (editorKey: string, options: NotebookAisleEditorActivationOptions = {}) => {
      const aisleId = getAisleIdFromAisleEditorKey(editorKey)
      if (!setActiveEditor(aisleId)) return false
      const editor = getEditorMetaForAisle(aisleId)?.editor
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
        return runEditorCommandOperation(editorOperationRuntime, command, undefined, {
          commitMode: 'deferred',
          syncToolbar: true,
        }).handled
      }

      if (command === 'bold' || command === 'italic' || command === 'strike' || command === 'highlight') {
        return runEditorCommandOperation(editorOperationRuntime, command, undefined, {
          commitMode: 'deferred',
          syncToolbar: true,
        }).handled
      }

      if (command === 'bulletList' || command === 'orderedList' || command === 'taskList' || command === 'dashList') {
        applyListToolbarCommand(editor, command as ToolbarListCommand)
        finishEditorOperation(editorOperationRuntime, editor, { commitMode: 'deferred', syncToolbar: true })
        return true
      }

      if (command === 'blockIndent' || command === 'removeBlockIndent') {
        if (runSelectionBlockIndent(editor, command === 'removeBlockIndent', editorOperationRuntime)) return true
        pushToast(command === 'blockIndent' ? 'Nothing to indent.' : 'No block indent to remove.', 'warning')
        return true
      }

      if (command === 'blockQuote') {
        const result = applyEditorNewlineOperation(editor, 'blockQuote')
        if (result.handled) finishEditorOperation(editorOperationRuntime, editor, { syncToolbar: true })
        return result.handled
      }

      if (command === 'hr') {
        const result = applyEditorNewlineOperation(editor, 'horizontalLine')
        if (result.handled) finishEditorOperation(editorOperationRuntime, editor, { syncToolbar: true })
        return result.handled
      }

      if (command === 'code') {
        return runEditorCommandOperation(editorOperationRuntime, 'code', undefined, {
          commitMode: 'deferred',
          syncToolbar: true,
        }).handled
      }

      if (command === 'codeBlock') {
        const result = applyEditorNewlineOperation(editor, 'codeBlock')
        if (result.handled) finishEditorOperation(editorOperationRuntime, editor, { syncToolbar: true })
        return result.handled
      }

      if (command === 'addTable' || command === 'table') {
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
      return runEditorCommandOperation(editorOperationRuntime, mappedCommand, payload, {
        commitMode: 'deferred',
        syncToolbar: true,
      }).handled
    },
    [editorOperationRuntime, editorRef, pushToast, replaceActiveEditorMarkdown, scheduleToolbarFormatStateSync],
  )

  const runNewlineOperationForEditor = useCallback(
    (editor: Editor, aisleId: string, operation: NewlineOperationId) => {
      if (operation === 'operationsMenu') return false

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
    [editorOperationRuntime, pushToast],
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
    async (action: NotebookEditorClipboardPasteAction): Promise<NotebookEditorClipboardReadResult | null> => {
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
        commitActiveEditorMarkdownNow(editor)
        scheduleToolbarFormatStateSync()
        return true
      }
      return insertEditorTextOperation(editorOperationRuntime, text, {
        commitMode: 'deferred',
        syncToolbar: true,
      }).handled
    },
    [commitActiveEditorMarkdownNow, editorOperationRuntime, editorRef, pushToast, scheduleToolbarFormatStateSync],
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
        view.dispatch(view.state.tr.insertText(text, safeFrom, safeTo).scrollIntoView())
        editor.focus()
        finishEditorOperation(editorOperationRuntime, editor, { commitMode: 'deferred', syncToolbar: true })
        notifyNoteMentionQueryChange(editor)
        return true
      } catch {
        return insertTextFromContextMenu(text)
      }
    },
    [editorOperationRuntime, editorRef, insertTextFromContextMenu, notifyNoteMentionQueryChange, pushToast],
  )

  const insertClipboardMarkdownResult = useCallback(
    (result: NotebookEditorClipboardReadResult) => {
      const editor = editorRef.current
      if (!editor) {
        pushToast('Open a note before using the editor menu.', 'warning')
        return false
      }
      if (result.source === 'plain-text') return insertTextFromContextMenu(result.markdown)

      editor.focus()
      const view = getWysiwygView(editor)
      if (insertVisualClipboardMarkdownIntoView(view, result.markdown)) {
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
      pushToast,
      scheduleToolbarFormatStateSync,
    ],
  )

  const runClipboardAction = useCallback(
    (action: NotebookEditorClipboardAction) => {
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
          const payload = await readTableSelectionClipboardPayloadFromClipboard()
          const view = getWysiwygView(editor)
          if (payload && insertTableSelectionClipboardPayloadIntoView(view, payload)) {
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
        runEditorCommandOperation(editorOperationRuntime, 'addImage', { imageUrl: displayUrl, altText: file.name }, {
          commitMode: 'deferred',
          syncToolbar: true,
        })
      })
    }
    input.click()
  }, [editorOperationRuntime, editorRef, pushToast])

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
          commitActiveEditorMarkdownNow(editor)
          scheduleToolbarFormatStateSync()
          return
        }
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
    pushToast,
    scheduleToolbarFormatStateSync,
  ])

  const getUrlLinkPromptState = useCallback((): LinkPromptState | null => {
    const editor = editorRef.current
    if (!editor) {
      pushToast('Open a note before inserting a link.', 'warning')
      return null
    }
    const meta = Array.from(editorMetaRef.current.values()).find((candidate) => candidate.editor === editor)
    const view = getWysiwygView(editor)
    const selection = view?.state?.selection
    const doc = view?.state?.doc
    const from = typeof selection?.from === 'number' ? selection.from : 0
    const to = typeof selection?.to === 'number' ? selection.to : from
    const selectedText = doc && to > from ? String(doc.textBetween(from, to, '', '') ?? '') : ''
    const promptDraft = getUrlLinkPromptDraftFromSelection(selectedText)
    const anchor = meta ? getEditorSelectionAnchor(editor, meta.root) : { top: 96, left: 96 }
    return {
      open: true,
      top: anchor.top,
      left: anchor.left,
      url: promptDraft.url,
      text: promptDraft.text,
      urlEditable: true,
      editRange: { from, to, href: '' },
    }
  }, [editorRef, pushToast])

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
      view.dispatch(transaction)
      editor.focus()
      finishEditorOperation(editorOperationRuntime, editor, { commitMode: 'deferred', syncToolbar: true })
      return true
    } catch {
      return runEditorCommandOperation(editorOperationRuntime, 'addLink', { linkUrl }, {
        commitMode: 'deferred',
        syncToolbar: true,
      }).handled
    }
  }, [editorOperationRuntime, editorRef, pushToast])

  const insertUrlLink = useCallback((url: string) => {
    const editor = editorRef.current
    if (!editor) {
      pushToast('Open a note before inserting a link.', 'warning')
      return false
    }
    const linkUrl = url.trim()
    if (!linkUrl) return false
    return runEditorCommandOperation(editorOperationRuntime, 'addLink', { linkUrl }, {
      commitMode: 'deferred',
      syncToolbar: true,
    }).handled
  }, [editorOperationRuntime, editorRef, pushToast])

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

  const scrollToAisleHeading = useCallback((aisleId: string, headingKey: string) => {
    const aisle = getAisleById(aisleId)
    const meta = getEditorMetaForAisle(aisleId)
    if (!aisle || !meta) return false
    const heading = getHeadingOutlineForAisle(aisle).find((candidate) => candidate.key === headingKey)
    return heading ? scrollToHeading(meta.editor, heading) : false
  }, [getAisleById, getEditorMetaForAisle, getHeadingOutlineForAisle])

  return {
    activeEditorAisleIdRef,
    mountedAisleIds,
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
    insertNamedUrlLink,
    insertUrlLink,
    insertTextAtSelection: insertTextFromContextMenu,
    replaceActiveEditorRangeWithText,
    commitActiveEditorMarkdownNow,
    commitMountedEditorMarkdownNow,
    getMountedEditorMarkdownSnapshots,
    getPreviewMarkdownForAisle,
    getHeadingOutlineForAisle,
    scrollToAisleHeading,
  }
}
