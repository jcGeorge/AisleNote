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
import { sanitizeEditorHtml } from './editor-sanitizer'
import {
  getEditorMarkdownForPersistence,
  prepareMarkdownForEditorDisplay,
  restoreEditorDisplay,
  setEditorMarkdownForDisplay,
} from './editor-markdown-display'
import { importBlobAsAssetUrl, importImageBlobAsAssetUrl } from '../markdown/image-asset-registry'
import { withDefaultInsertedImageDisplayWidth } from './image-insertion'
import { buildAisleEditorKey, getAisleIdFromAisleEditorKey } from './aisle-editor'
import { getWysiwygView } from './prosemirror-utils'
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
import { applyEditorNewlineOperation } from './newline-operations'
import { applyListToolbarCommand, type ToolbarListCommand } from './list-marker-commands'
import {
  buildSelectionBlockIndentOperationPlan,
  buildSelectionRemoveBlockIndentOperationPlan,
} from './multiline-format-operations'
import {
  getHeadingOutlineFromDoc,
  getHeadingOutlineFromMarkdown,
  type HeadingOutlineItem,
} from './heading-outline'
import { recordDiagnosticEvent } from '../diagnostics/diagnostic-logger'
import type { NotebookEditorMarkdownSnapshot } from '../app/notebook-editor-persistence'
import type { ResolvedNoteAisle, ToastTone, ViewMode } from '../types/app'

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
  cleanup: () => void
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
  pushToast?: (message: string, tone?: ToastTone, durationMs?: number) => void
}

const TOAST_AISLE_EDITOR_RECENT_RETAIN_LIMIT = 3
const AISLE_EDITOR_SMALL_NOTE_LIVE_LIMIT = 4
const AISLE_EDITOR_INTERSECTION_ROOT_MARGIN = '240px'

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
  activeAisleIdRef.current = activeAisleId
  noteBodyIdRef.current = noteBodyId
  aislesRef.current = aisles

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
      const nextMarkdown = getEditorMarkdownForPersistence(editor)
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

  const getMountedEditorMarkdownSnapshots = useCallback((): NotebookEditorMarkdownSnapshot[] => {
    return Array.from(editorMetaRef.current.values()).map((meta) => {
      const markdown = getEditorMarkdownForPersistence(meta.editor)
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
      setEditorMarkdownForDisplay(editor, markdown, false)
      if (meta) {
        meta.markdown = getEditorMarkdownForPersistence(editor)
        lastMarkdownByAisleBodyRef.current.set(meta.aisleBodyId, meta.markdown)
        commitAisleMarkdown(meta.aisleBodyId, meta.markdown)
      }
    },
    [commitAisleMarkdown, editorRef],
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
          lastMarkdownByAisleBodyRef.current.set(aisle.aisleBodyId, aisle.markdown)
          setEditorMarkdownForDisplay(existing.editor, aisle.markdown, false)
          restoreEditorDisplay(existing.editor, aisle.markdown)
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
        createCodeBlockControlsPlugin({ pushToast }),
        uncheckedTaskEnterPlugin,
        headingSpaceShortcutPlugin,
        thematicBreakShortcutPlugin,
      ]

      const handleFocus = () => setActiveEditor(aisle.id)
      const handlePointerDown = () => {
        setRecentRetainedAisleIds((current) => [
          activeAisleIdRef.current,
          ...current.filter((candidate) => candidate !== activeAisleIdRef.current && candidate !== aisle.id),
        ].filter(Boolean).slice(0, TOAST_AISLE_EDITOR_RECENT_RETAIN_LIMIT))
        setActiveEditor(aisle.id)
      }
      root.addEventListener('focusin', handleFocus)
      root.addEventListener('pointerdown', handlePointerDown, true)

      const cleanupFns: Array<() => void> = [
        () => root.removeEventListener('focusin', handleFocus),
        () => root.removeEventListener('pointerdown', handlePointerDown, true),
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
            },
            focus: handleFocus,
          },
        } as any)

        const mountedEditor = editor
        cleanupFns.push(installEditorSpellcheck(root))
        cleanupFns.push(installToolbarAppTooltips(root))
        cleanupFns.push(installHeadingPopupActiveState(root, () => mountedEditor))

        const meta: NotebookAisleEditorMeta = {
          editor: mountedEditor,
          root,
          noteBodyId,
          aisleId: aisle.id,
          aisleBodyId: aisle.aisleBodyId,
          markdown: aisle.markdown,
          cleanup: () => cleanupFns.forEach((cleanup) => cleanup()),
        }
        editorMetaRef.current.set(editorKey, meta)
        lastMarkdownByAisleBodyRef.current.set(aisle.aisleBodyId, aisle.markdown)
        restoreEditorDisplay(mountedEditor, aisle.markdown)
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
  }, [aisles, commitEditorMarkdown, destroyEditor, mountedAisleIds, noteBodyId, setActiveEditor, viewMode])

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
    (editorKey: string, options: { focus?: boolean } = {}) => {
      const aisleId = getAisleIdFromAisleEditorKey(editorKey)
      if (!setActiveEditor(aisleId)) return false
      if (options.focus) getEditorMetaForAisle(aisleId)?.editor.focus()
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
      void readClipboardMarkdownForPaste(action)
        .then((result) => {
          if (result) insertClipboardMarkdownResult(result)
        })
        .catch(() => pushToast('Clipboard paste is unavailable here.', 'warning'))
      return true
    },
    [editorRef, insertClipboardMarkdownResult, pushToast, readClipboardMarkdownForPaste],
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

  const insertPromptedLink = useCallback(() => {
    const editor = editorRef.current
    if (!editor) {
      pushToast('Open a note before inserting a link.', 'warning')
      return
    }
    const url = window.prompt('Link URL')
    if (!url?.trim()) return
    runEditorCommandOperation(editorOperationRuntime, 'addLink', { linkUrl: url.trim() }, {
      commitMode: 'deferred',
      syncToolbar: true,
    })
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
    runClipboardAction,
    readClipboardMarkdownForPaste,
    insertImageFile,
    insertAttachmentFile,
    insertPromptedLink,
    commitActiveEditorMarkdownNow,
    commitMountedEditorMarkdownNow,
    getMountedEditorMarkdownSnapshots,
    getPreviewMarkdownForAisle,
    getHeadingOutlineForAisle,
    scrollToAisleHeading,
  }
}
