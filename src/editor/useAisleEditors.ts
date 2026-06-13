/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Editor } from '@toast-ui/editor'
import { TextSelection } from 'prosemirror-state'
import { buildAisleEditorKey, getAisleIdFromAisleEditorKey, type AisleEditorMeta } from './aisle-editor'
import {
  createCodeMirrorMarkdownEditor,
  isCodeMirrorMarkdownEditor,
} from './codemirror-markdown-editor'
import {
  createLexicalMarkdownEditor,
  isLexicalMarkdownEditor,
} from './lexical-markdown-editor'
import {
  AISLE_ACTIVATION_WARNING_THRESHOLD_MS,
  createAisleActivationDiagnosticSummary,
  mergeAisleActivationDiagnosticSummary,
  shouldClearPendingCursorRestoreForAisleActivation,
  shouldUseFastSameAisleActivation,
  type AisleActivationDiagnosticInput,
  type AisleActivationDiagnosticSummary,
  type AisleActivationSource,
} from './aisle-activation'
import { createCodeBlockControlsPlugin } from './code-block-controls'
import {
  chooseLazyContentCommitFallbackMarkdown,
  getEditorDisplayRewriteDiagnosticDetails,
  getEditorMarkdownSyncSnapshot,
  hasMountedLinkedAisleEditor,
  shouldApplyEditorDisplayRewrite,
  shouldScheduleContentCommitForEditorChange,
} from './editor-markdown-sync'
import { headingCollapsePlugin } from './heading-collapse-plugin'
import { getCollapsedHeadingKeysForAisle } from './heading-collapse-state'
import { getHeadingOutlineFromDoc, getHeadingOutlineFromMarkdown, type HeadingOutlineItem } from './heading-outline'
import { installImageDisplayMetadataSync } from './image-dom-metadata'
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
  multiLineSelectionShortcutPlugin,
  tagAppearancePlugin,
  thematicBreakShortcutPlugin,
  uncheckedTaskEnterPlugin,
} from './editor-setup'
import { terminalBlockLandingPlugin } from './terminal-block-landing'
import { createMediaLinkPlugin } from './media-link-plugin'
import { createNotePreviewPlugin, type NotePreviewData } from './note-preview-plugin'
import {
  getTableOfContentsLinksFromDoc,
  getTableOfContentsLinksFromMarkdown,
  type TableOfContentsLinkItem,
} from './table-of-contents-links'
import { sanitizeEditorHtml } from './editor-sanitizer'
import { getElementFromEventTarget, getWysiwygView } from './prosemirror-utils'
import {
  installCompletedTaskCheckboxBehavior,
  installTaskTextReorderBehavior,
} from './task-behavior'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { measureSlowOperation } from '../performance/performance-logging'
import { recordDiagnosticEvent } from '../diagnostics/diagnostic-logger'
import {
  importImageBlobAsAssetUrl,
} from '../markdown/image-asset-registry'
import { withDefaultInsertedImageDisplayWidth } from './image-insertion'
import {
  prepareMarkdownForEditorDisplay,
  restoreEditorDisplay,
  setEditorMarkdownForDisplay,
} from './editor-markdown-display'
import {
  getAisleEditorPerfNow,
  withAisleEditorPerfState,
} from '../perf/aisle-editor-perf-state'
import {
  AISLE_EDITOR_INTERSECTION_ROOT_MARGIN,
  buildRetainedAisleEditorIdsForCore,
  getAislePreviewMarkdown,
} from './aisle-editor-retention'
import {
  createEditorAblationPolicy,
  isEditorAblationActive,
  measureEditorAblationOperation,
  readEditorAblationMode,
  type EditorAblationPolicy,
} from './editor-ablation'
import { readEditorCoreMode, resolveActiveEditorCore } from './editor-core'
import type { HeadingCollapseState, NoteNavigationTarget, ResolvedNoteAisle, ToastTone, ViewMode } from '../types/app'
import type { NotePreviewDeleteRequest, NotePreviewReferencePayload, ResolvedMarkdownNoteReference } from '../notes/note-references'
import { getAisleBodyId } from '../notes/aisle-body-state'
import type { PendingCursorRestore } from './useNoteCursorPersistence'
import {
  getSnapshotEditorMarkdown,
  shouldUseCachedReadonlyLexicalSnapshot,
  type EditorContentSnapshot,
  type FlushPendingContentOptions,
  type KnownMarkdownDraftCommitOptions,
  type LazyContentCommitOptions,
  type MountedEditorSnapshotProvider,
  type PendingContentMap,
} from './useEditorPersistence'

type AisleActivationClientPoint = {
  clientX: number
  clientY: number
}

function countMarkdownLinks(markdown: string): number {
  return String(markdown ?? '').match(/\[[^\]\n]+\]\((?:https?:\/\/|#tabs-note\/)[^)]+\)/gi)?.length ?? 0
}

type ActivateAisleEditorOptions = {
  flushPrevious?: boolean
  focus?: boolean
  focusAtClientPoint?: AisleActivationClientPoint
  allowDuringPendingRename?: boolean
  source?: AisleActivationSource
}

type UseAisleEditorsOptions = {
  viewMode: ViewMode
  activeNoteBodyId: string
  activeNoteAisles: ResolvedNoteAisle[]
  resolvedActiveAisleId: string
  activeAisleId: string
  setActiveAisleId: (aisleId: string) => void
  aisleScrollRef: MutableRefObject<HTMLDivElement | null>
  editorRef: MutableRefObject<Editor | null>
  multiLineCursorPluginKeyRef: MutableRefObject<any>
  lastEditorMarkdownRef: MutableRefObject<string>
  lastEditorMarkdownByAisleRef: MutableRefObject<Map<string, string>>
  normalizingContentRef: MutableRefObject<boolean>
  normalizingAisleIdsRef: MutableRefObject<Set<string>>
  pendingContentRef: MutableRefObject<PendingContentMap>
  pendingCursorRestoreRef: MutableRefObject<PendingCursorRestore | null>
  pendingFocusToAisleIdRef: MutableRefObject<string | null>
  activeSpaceIdRef: MutableRefObject<string>
  activeTabIdRef: MutableRefObject<string>
  activeSubTabIdRef: MutableRefObject<string | null>
  activeAisleIdRef: MutableRefObject<string>
  activeEditorAisleIdRef: MutableRefObject<string>
  isMainViewRef: MutableRefObject<boolean>
  closeImageToolsRef: MutableRefObject<() => void>
  closeImageToolsIfSelectedImageMissingRef: MutableRefObject<() => void>
  isPendingCreatedRenameActive: () => boolean
  saveActiveCursorLocation: () => void
  flushPendingContent: (options?: FlushPendingContentOptions) => void
  clearMultiLineEdit: (collapseToHead?: boolean) => void
  getNormalizedEditorMarkdown: (editor: Editor) => string
  normalizeEditorMarkdownForPersistence: (markdown: string) => string
  normalizeEditorMarkdownForDisplay: (markdown: string) => string
  scheduleContentCommit: (
    markdown: string,
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
    options?: { aisleBodyId?: string | null; noteBodyId?: string | null },
  ) => void
  scheduleKnownMarkdownDraftCommit: (
    markdown: string,
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
    options?: KnownMarkdownDraftCommitOptions,
  ) => void
  scheduleLazyContentCommit: (
    editor: Editor,
    fallbackMarkdown: string,
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
    options?: LazyContentCommitOptions,
  ) => void
  registerMountedEditorSnapshotProvider: (provider: MountedEditorSnapshotProvider) => () => void
  commitCurrentEditorContent: () => void
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
  maybeShowCompletedTaskUndoHint: (markdown: string) => void
  trackCompletedTaskQuickDelete: (beforeMarkdown: string) => void
  tryExpandMultilineSelection: (direction: 'up' | 'down') => boolean
  scheduleToolbarFormatStateSync: () => void
  headingCollapseState: HeadingCollapseState
  onToggleHeadingCollapse: (aisleId: string, headingKey: string) => void
  onExpandHeadingCollapse: (aisleId: string, headingKey: string) => void
  getNotePreviewData: (payload: NotePreviewReferencePayload, sourceNoteBodyId: string) => NotePreviewData
  resolvePreviewToken: (token: string) => NotePreviewReferencePayload | null
  resolveInternalNoteReferenceToken: (token: string) => ResolvedMarkdownNoteReference | null
  navigateToNoteLocation: (location: NoteNavigationTarget) => void
  deleteNotePreview: (request: NotePreviewDeleteRequest) => void
  openNotePreviewContextMenu?: (request: {
    x: number
    y: number
    payload: NotePreviewReferencePayload
    label: string
    sourceRange?: { from: number; to: number }
  }) => void
}

type PendingHeadingScroll = {
  aisleId: string
  headingKey: string
}

type PendingLinkScroll = {
  aisleId: string
  linkKey: string
}

const TOAST_AISLE_EDITOR_RECENT_RETAIN_LIMIT = 3
const AISLE_EDITOR_RECENT_HISTORY_LIMIT = TOAST_AISLE_EDITOR_RECENT_RETAIN_LIMIT
const AISLE_EDITOR_SMALL_NOTE_LIVE_LIMIT = 4

type DevAisleEditorMountState = {
  noteBodyId: string
  mountedEditorCount: number
  mountedEditorCountByAisleBodyId: Record<string, number>
  mountedAisleIds: string[]
  visibleAisleIds: string[]
}

export function useAisleEditors({
  viewMode,
  activeNoteBodyId,
  activeNoteAisles,
  resolvedActiveAisleId,
  activeAisleId,
  setActiveAisleId,
  aisleScrollRef,
  editorRef,
  multiLineCursorPluginKeyRef,
  lastEditorMarkdownRef,
  lastEditorMarkdownByAisleRef,
  normalizingContentRef,
  normalizingAisleIdsRef,
  pendingContentRef,
  pendingCursorRestoreRef,
  pendingFocusToAisleIdRef,
  activeSpaceIdRef,
  activeTabIdRef,
  activeSubTabIdRef,
  activeAisleIdRef,
  activeEditorAisleIdRef,
  isMainViewRef,
  closeImageToolsRef,
  closeImageToolsIfSelectedImageMissingRef,
  isPendingCreatedRenameActive,
  saveActiveCursorLocation,
  flushPendingContent,
  clearMultiLineEdit,
  getNormalizedEditorMarkdown,
  normalizeEditorMarkdownForPersistence,
  normalizeEditorMarkdownForDisplay,
  scheduleContentCommit,
  scheduleKnownMarkdownDraftCommit,
  scheduleLazyContentCommit,
  registerMountedEditorSnapshotProvider,
  commitCurrentEditorContent,
  pushToast,
  maybeShowCompletedTaskUndoHint,
  trackCompletedTaskQuickDelete,
  tryExpandMultilineSelection,
  scheduleToolbarFormatStateSync,
  headingCollapseState,
  onToggleHeadingCollapse,
  onExpandHeadingCollapse,
  getNotePreviewData,
  resolvePreviewToken,
  resolveInternalNoteReferenceToken,
  navigateToNoteLocation,
  deleteNotePreview,
  openNotePreviewContextMenu,
}: UseAisleEditorsOptions) {
  const aisleEditorRootsRef = useRef<Map<string, HTMLElement>>(new Map())
  const aislePaneRootsRef = useRef<Map<string, HTMLElement>>(new Map())
  const aisleEditorMetaRef = useRef<Map<string, AisleEditorMeta>>(new Map())
  const [nearVisibleAisleIds, setNearVisibleAisleIds] = useState<Set<string>>(() => new Set())
  const [recentRetainedAisleIds, setRecentRetainedAisleIds] = useState<string[]>([])
  const [backgroundMountedAisleIds, setBackgroundMountedAisleIds] = useState<Set<string>>(() => new Set())
  const editorAblationMode = readEditorAblationMode()
  const editorCoreMode = readEditorCoreMode()
  const editorAblationPolicy = useMemo(
    () => createEditorAblationPolicy(editorAblationMode),
    [editorAblationMode],
  )
  const editorAblationActive = isEditorAblationActive(editorAblationMode)
  const mountedEditorAblationModeRef = useRef(editorAblationMode)
  const mountedEditorCoreModeRef = useRef(editorCoreMode)
  const activationDiagnosticFrameRef = useRef<number | null>(null)
  const activationDiagnosticSummariesRef = useRef<Map<string, AisleActivationDiagnosticSummary>>(new Map())
  const recentPointerActivationRef = useRef<{ editorKey: string; at: number } | null>(null)
  const pendingFocusAfterMountAisleIdRef = useRef<string | null>(null)
  const pendingFocusPointAfterMountRef = useRef<{ aisleId: string; point: AisleActivationClientPoint } | null>(null)
  const programmaticAisleMarkdownRef = useRef<Map<string, string>>(new Map())
  const pendingBlankRestoreFrameRef = useRef<Map<string, number>>(new Map())
  const pendingHeadingScrollRef = useRef<PendingHeadingScroll | null>(null)
  const pendingLinkScrollRef = useRef<PendingLinkScroll | null>(null)
  const headingCollapseStateRef = useRef(headingCollapseState)
  headingCollapseStateRef.current = headingCollapseState
  const activeNoteBodyIdRef = useRef(activeNoteBodyId)
  activeNoteBodyIdRef.current = activeNoteBodyId
  const activeNoteAislesRef = useRef(activeNoteAisles)
  activeNoteAislesRef.current = activeNoteAisles
  const emitDevAisleEditorMountState = () => {
    if (!import.meta.env?.DEV) return

    const activeAisleSet = new Set(activeAisleIds)
    const visibleAisleIds = [...nearVisibleAisleIds].filter((aisleId) => activeAisleSet.has(aisleId))
    const mountedAisleIds: string[] = []
    const mountedEditorCountByAisleBodyId: Record<string, number> = {}

    for (const meta of aisleEditorMetaRef.current.values()) {
      if (!activeAisleSet.has(meta.aisleId)) continue
      mountedAisleIds.push(meta.aisleId)
      const aisleBodyId = getAisleBodyIdForAisleId(meta.aisleId)
      mountedEditorCountByAisleBodyId[aisleBodyId] = (mountedEditorCountByAisleBodyId[aisleBodyId] ?? 0) + 1
    }

    const mountedAisleSet = new Set(mountedAisleIds)
    const visibleMountedAisleIds = visibleAisleIds.filter((aisleId) => mountedAisleSet.has(aisleId))

    ;(window as unknown as { __tabsAisleEditorMountState?: DevAisleEditorMountState }).__tabsAisleEditorMountState = {
      noteBodyId: activeNoteBodyIdRef.current,
      mountedEditorCount: mountedAisleIds.length,
      mountedEditorCountByAisleBodyId,
      mountedAisleIds,
      visibleAisleIds: visibleMountedAisleIds,
    }

    withAisleEditorPerfState((state) => {
      state.mountedEditorCount = mountedAisleIds.length
      state.mountedEditorCountByAisleBodyId = { ...mountedEditorCountByAisleBodyId }
      state.visibleAisleIds = [...visibleMountedAisleIds]
      state.recentAisleIds = [...recentRetainedAisleIds]
    })
  }
  const clearDevAisleEditorMountState = () => {
    if (!import.meta.env?.DEV) return
    ;(window as unknown as { __tabsAisleEditorMountState?: DevAisleEditorMountState }).__tabsAisleEditorMountState = {
      noteBodyId: activeNoteBodyIdRef.current,
      mountedEditorCount: 0,
      mountedEditorCountByAisleBodyId: {},
      mountedAisleIds: [],
      visibleAisleIds: [],
    }
    withAisleEditorPerfState((state) => {
      state.mountedEditorCount = 0
      state.mountedEditorCountByAisleBodyId = {}
      state.visibleAisleIds = []
      state.recentAisleIds = []
    })
  }
  const getAisleActivationNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const activeAisleIds = useMemo(() => activeNoteAisles.map((aisle) => aisle.id), [activeNoteAisles])
  const activeAisleIdsKey = useMemo(() => activeAisleIds.join('\n'), [activeAisleIds])
  const backgroundMountedAisleIdsKey = useMemo(
    () => activeAisleIds.filter((aisleId) => backgroundMountedAisleIds.has(aisleId)).join('\n'),
    [activeAisleIds, backgroundMountedAisleIds],
  )
  const activeEditorCoreForMountPolicy = resolveActiveEditorCore(editorCoreMode, '')
  const useBackgroundAisleEditorMounts = activeEditorCoreForMountPolicy === 'toast'
  const mountedAisleIds = useMemo(
    () =>
      buildRetainedAisleEditorIdsForCore({
        editorCore: activeEditorCoreForMountPolicy,
        aisleIds: activeAisleIds,
        activeAisleId: activeAisleId || resolvedActiveAisleId,
        backgroundAisleIds: backgroundMountedAisleIds,
        nearVisibleAisleIds,
        recentAisleIds: recentRetainedAisleIds,
        toastRecentRetainLimit: TOAST_AISLE_EDITOR_RECENT_RETAIN_LIMIT,
        smallNoteLiveLimit: AISLE_EDITOR_SMALL_NOTE_LIVE_LIMIT,
      }),
    [
      activeAisleId,
      activeAisleIds,
      activeEditorCoreForMountPolicy,
      backgroundMountedAisleIds,
      nearVisibleAisleIds,
      recentRetainedAisleIds,
      resolvedActiveAisleId,
    ],
  )
  const mountedAisleIdsKey = useMemo(() => activeAisleIds.filter((aisleId) => mountedAisleIds.has(aisleId)).join('\n'), [
    activeAisleIds,
    mountedAisleIds,
  ])

  const getAisleById = (aisleId: string) => activeNoteAislesRef.current.find((aisle) => aisle.id === aisleId) ?? null

  useEffect(() => {
    setBackgroundMountedAisleIds(new Set())
    if (
      viewMode !== 'main' ||
      !activeNoteBodyId ||
      !useBackgroundAisleEditorMounts ||
      activeAisleIds.length <= 1 ||
      activeAisleIds.length > AISLE_EDITOR_SMALL_NOTE_LIVE_LIMIT
    ) {
      return
    }

    let cancelled = false
    let timeoutId: number | null = null
    const frameId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => {
        if (!cancelled) setBackgroundMountedAisleIds(new Set(activeAisleIds))
      }, 0)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [viewMode, activeNoteBodyId, activeAisleIdsKey, useBackgroundAisleEditorMounts])

  const getAisleBodyIdForAisleId = (aisleId: string) => {
    const aisle = getAisleById(aisleId)
    return aisle ? getAisleBodyId(aisle) : aisleId
  }

  const getEditorAblationDiagnosticDetails = (policy: EditorAblationPolicy = editorAblationPolicy) => ({
    ablationMode: policy.mode,
    pluginGroups: {
      corePlugins: policy.includeCorePlugins,
      specialLinkPlugins: policy.includeSpecialLinkPlugins,
      structuralPlugins: policy.includeStructuralPlugins,
      domInstallers: policy.includeDomInstallers,
      imageHook: policy.includeImageHook,
      toolbarItems: policy.includeToolbarItems,
      displayPreparation: policy.useDisplayPreparation,
      mountBlankRestore: policy.runMountBlankRestore,
      retainPreviousAisle: policy.retainPreviousAisle,
    },
  })

  const recordEditorAblationDiagnostic = (
    event: 'mount' | 'change' | 'switch',
    input: {
      durationMs?: number
      aisleId?: string
      details?: Record<string, unknown>
    },
  ) => {
    if (!editorAblationActive) return
    recordDiagnosticEvent('aisle-editor', `ablation-${event}`, {
      level: input.durationMs && input.durationMs >= 50 ? 'warning' : 'info',
      durationMs: input.durationMs,
      details: {
        ...getEditorAblationDiagnosticDetails(),
        aisleId: input.aisleId,
        aisleBodyId: input.aisleId ? getAisleBodyIdForAisleId(input.aisleId) : undefined,
        mountedEditorCount: aisleEditorMetaRef.current.size,
        ...(input.details ?? {}),
      },
    })
  }

  const rememberRecentRetainedAisle = (previousAisleId: string, nextAisleId: string) => {
    if (!previousAisleId || previousAisleId === nextAisleId || !activeAisleIds.includes(previousAisleId)) return
    setRecentRetainedAisleIds((currentAisleIds) => [
      previousAisleId,
      ...currentAisleIds.filter((aisleId) => aisleId !== previousAisleId && aisleId !== nextAisleId),
    ].slice(0, AISLE_EDITOR_RECENT_HISTORY_LIMIT))
  }

  const getCachedMarkdownForAisle = (aisleId: string) => {
    const aisleBodyId = getAisleBodyIdForAisleId(aisleId)
    return lastEditorMarkdownByAisleRef.current.get(aisleBodyId)
  }

  const getCachedMarkdownForAisleBodyId = (aisleBodyId: string) =>
    lastEditorMarkdownByAisleRef.current.get(aisleBodyId)

  const cacheMarkdownForAisleBodyId = (aisleBodyId: string, markdown: string) => {
    lastEditorMarkdownByAisleRef.current.set(aisleBodyId, markdown)
  }

  const isMountedMetaCurrentActiveAisle = (meta: AisleEditorMeta) =>
    activeNoteBodyIdRef.current === meta.noteBodyId && activeAisleIdRef.current === meta.aisleId

  const getEditorCoreForMeta = (meta: AisleEditorMeta | undefined, editor: Editor) => {
    if (meta?.editorCore) return meta.editorCore
    if (isLexicalMarkdownEditor(editor)) return 'lexical'
    if (isCodeMirrorMarkdownEditor(editor)) return 'codemirror'
    return 'toast'
  }

  const getSnapshotMarkdownForMeta = (meta: AisleEditorMeta): string => {
    const cachedMarkdown = getCachedMarkdownForAisleBodyId(meta.aisleBodyId)
    if (typeof cachedMarkdown === 'string' && shouldUseCachedReadonlyLexicalSnapshot(meta.editor, cachedMarkdown)) {
      return cachedMarkdown
    }
    return getSnapshotEditorMarkdown(meta.editor, cachedMarkdown ?? '', getNormalizedEditorMarkdown)
  }

  const recordHotPathDiagnostic = (
    event: string,
    {
      aisleId,
      editorCore,
      markdown,
      durationMs,
      details = {},
    }: {
      aisleId?: string
      editorCore?: string
      markdown?: string
      durationMs: number
      details?: Record<string, unknown>
    },
  ) => {
    if (!import.meta.env?.DEV) return
    const linkCount = typeof markdown === 'string' ? countMarkdownLinks(markdown) : 0
    if (durationMs < 16 && linkCount < 8) return
    recordDiagnosticEvent('editor', event, {
      level: durationMs >= 50 ? 'warning' : 'info',
      durationMs,
      details: {
        aisleId,
        editorCore,
        linkCount,
        mountedEditorCount: aisleEditorMetaRef.current.size,
        ...details,
      },
    })
  }

  const syncLexicalEditableStates = (activeEditorKey: string) => {
    aisleEditorMetaRef.current.forEach((meta, editorKey) => {
      if (!isLexicalMarkdownEditor(meta.editor)) return
      meta.editor.setEditable(editorKey === activeEditorKey)
    })
  }

  const markProgrammaticAisleMarkdown = (aisleId: string, markdown: string) => {
    programmaticAisleMarkdownRef.current.set(aisleId, markdown)
    normalizingAisleIdsRef.current.add(aisleId)
  }

  const consumeProgrammaticAisleMarkdown = (aisleId: string) => {
    const markdown = programmaticAisleMarkdownRef.current.get(aisleId)
    if (typeof markdown !== 'string') return null
    programmaticAisleMarkdownRef.current.delete(aisleId)
    normalizingAisleIdsRef.current.delete(aisleId)
    return markdown
  }

  const clearProgrammaticAisleMarkdown = (aisleId: string, markdown: string) => {
    if (programmaticAisleMarkdownRef.current.get(aisleId) !== markdown) return
    programmaticAisleMarkdownRef.current.delete(aisleId)
    normalizingAisleIdsRef.current.delete(aisleId)
  }

  const cancelPendingBlankRestore = (aisleId: string) => {
    const frameId = pendingBlankRestoreFrameRef.current.get(aisleId)
    if (typeof frameId === 'number') {
      window.cancelAnimationFrame(frameId)
    }
    pendingBlankRestoreFrameRef.current.delete(aisleId)
  }

  const cancelAllPendingBlankRestores = () => {
    pendingBlankRestoreFrameRef.current.forEach((frameId) => window.cancelAnimationFrame(frameId))
    pendingBlankRestoreFrameRef.current.clear()
    programmaticAisleMarkdownRef.current.clear()
  }

  const flushActivationDiagnostics = () => {
    activationDiagnosticFrameRef.current = null
    const summaries = Array.from(activationDiagnosticSummariesRef.current.values())
    activationDiagnosticSummariesRef.current.clear()
    summaries.forEach((summary) => {
      recordDiagnosticEvent('aisle-editor', 'activation-summary', {
        level: summary.maxDurationMs >= AISLE_ACTIVATION_WARNING_THRESHOLD_MS ? 'warning' : 'info',
        durationMs: summary.maxDurationMs,
        details: summary,
      })
    })
  }

  const queueActivationDiagnostic = (input: AisleActivationDiagnosticInput) => {
    const key = `${input.requestedAisleId}:${input.previousAisleId}`
    const current = activationDiagnosticSummariesRef.current.get(key)
    activationDiagnosticSummariesRef.current.set(
      key,
      current
        ? mergeAisleActivationDiagnosticSummary(current, input)
        : createAisleActivationDiagnosticSummary(input),
    )
    if (activationDiagnosticFrameRef.current !== null) return
    activationDiagnosticFrameRef.current = window.requestAnimationFrame(flushActivationDiagnostics)
  }

  const shouldSkipFocusActivationAfterPointer = (editorKey: string, at: number) => {
    const recent = recentPointerActivationRef.current
    if (!recent || recent.editorKey !== editorKey) return false
    return at - recent.at <= 250
  }

  const activateEditorFromFocus = (editorKey: string, at = getAisleActivationNow()) => {
    if (shouldSkipFocusActivationAfterPointer(editorKey, at)) return false
    return activateAisleEditor(editorKey, { flushPrevious: true, source: 'focus' })
  }

  const activateEditorFromPointer = (editorKey: string, at: number) => {
    recentPointerActivationRef.current = {
      editorKey,
      at,
    }
    return activateAisleEditor(editorKey, { flushPrevious: true, source: 'pointer' })
  }

  const getPendingContentForAisle = (aisle: ResolvedNoteAisle) => {
    const aisleBodyId = getAisleBodyId(aisle)
    const pending = pendingContentRef.current.get(aisleBodyId)
    if (!pending) return null
    if (
      pending.noteBodyId !== activeNoteBodyIdRef.current ||
      pending.spaceId !== activeSpaceIdRef.current ||
      pending.tabId !== activeTabIdRef.current ||
      pending.subTabId !== activeSubTabIdRef.current
    ) {
      return null
    }
    return pending.aisleBodyId === aisleBodyId || pending.aisleId === aisle.id ? pending : null
  }

  const getMarkdownSyncSnapshot = (markdown: string) =>
    getEditorMarkdownSyncSnapshot(markdown, {
      normalizeForPersistence: normalizeEditorMarkdownForPersistence,
      normalizeForDisplay: normalizeEditorMarkdownForDisplay,
    })

  const applyEditorDisplayRewrite = ({
    meta,
    reason,
    currentCanonicalMarkdown,
    expectedCanonicalMarkdown,
    expectedDisplayMarkdown,
  }: {
    meta: AisleEditorMeta
    reason: string
    currentCanonicalMarkdown: string
    expectedCanonicalMarkdown: string
    expectedDisplayMarkdown: string
  }) => {
    recordDiagnosticEvent('editor', 'display-rewrite', {
      details: getEditorDisplayRewriteDiagnosticDetails({
        aisleId: meta.aisleId,
        reason,
        currentCanonicalMarkdown,
        expectedCanonicalMarkdown,
        expectedDisplayMarkdown,
      }),
    })
    cacheMarkdownForAisleBodyId(meta.aisleBodyId, expectedCanonicalMarkdown)
    if (isMountedMetaCurrentActiveAisle(meta)) {
      lastEditorMarkdownRef.current = expectedCanonicalMarkdown
    }
    markProgrammaticAisleMarkdown(meta.aisleId, expectedCanonicalMarkdown)
    if (isCodeMirrorMarkdownEditor(meta.editor) || isLexicalMarkdownEditor(meta.editor)) {
      meta.editor.setMarkdown(expectedCanonicalMarkdown, false)
    } else {
      setEditorMarkdownForDisplay(meta.editor, expectedDisplayMarkdown)
    }
    window.setTimeout(() => clearProgrammaticAisleMarkdown(meta.aisleId, expectedCanonicalMarkdown), 0)
  }

  const getLatestMarkdownForAisle = (aisle: ResolvedNoteAisle) => {
    const pending = getPendingContentForAisle(aisle)
    return getMarkdownSyncSnapshot(pending?.markdown ?? getCachedMarkdownForAisle(aisle.id) ?? aisle.markdown)
  }

  const getLatestRawMarkdownForAisle = (aisle: ResolvedNoteAisle) =>
    getPendingContentForAisle(aisle)?.markdown ?? getCachedMarkdownForAisle(aisle.id) ?? aisle.markdown

  const getCurrentCanonicalMarkdownForAisle = (aisleId: string) => {
    const aisle = getAisleById(aisleId)
    if (!aisle) return getCachedMarkdownForAisle(aisleId) ?? ''
    return getLatestMarkdownForAisle(aisle).canonicalMarkdown
  }

  const getLazyContentCommitFallbackMarkdownForAisle = (aisleId: string) => {
    const aisle = getAisleById(aisleId)
    if (!aisle) return getCachedMarkdownForAisle(aisleId) ?? ''
    return chooseLazyContentCommitFallbackMarkdown({
      pendingMarkdown: getPendingContentForAisle(aisle)?.markdown,
      cachedMarkdown: getCachedMarkdownForAisle(aisleId),
      committedMarkdown: aisle.markdown,
    })
  }

  const shouldScheduleProgrammaticContentCommit = (aisleId: string, nextCanonicalMarkdown: string) =>
    shouldScheduleContentCommitForEditorChange({
      isProgrammaticDisplayChange: true,
      currentCanonicalMarkdown: getCurrentCanonicalMarkdownForAisle(aisleId),
      nextCanonicalMarkdown,
    })

  const syncMountedLinkedAisleEditors = (sourceAisleId: string, markdown: string, sourceAisleBodyId?: string) => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    let linkedRewriteCount = 0
    if (!hasMountedLinkedAisleEditor({
      sourceAisleId,
      mountedAisleIds: Array.from(aisleEditorMetaRef.current.values(), (meta) => meta.aisleId),
      getAisleBodyIdForAisleId,
    })) {
      recordHotPathDiagnostic('linked-aisle-sync', {
        aisleId: sourceAisleId,
        markdown,
        durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
        details: {
          linkedRewriteCount,
          skipped: true,
        },
      })
      return
    }
    const linkedSourceAisleBodyId = sourceAisleBodyId ?? getAisleBodyIdForAisleId(sourceAisleId)
    const expected = getMarkdownSyncSnapshot(markdown)
    aisleEditorMetaRef.current.forEach((meta) => {
      if (meta.aisleId === sourceAisleId) return
      if (meta.aisleBodyId !== linkedSourceAisleBodyId) return
      const currentMarkdown = getSnapshotMarkdownForMeta(meta)
      if (!shouldApplyEditorDisplayRewrite({
        currentCanonicalMarkdown: currentMarkdown,
        expectedCanonicalMarkdown: expected.canonicalMarkdown,
      })) return
      linkedRewriteCount += 1
      applyEditorDisplayRewrite({
        meta,
        reason: 'linked-aisle-sync',
        currentCanonicalMarkdown: currentMarkdown,
        expectedCanonicalMarkdown: expected.canonicalMarkdown,
        expectedDisplayMarkdown: expected.displayMarkdown,
      })
    })
    recordHotPathDiagnostic('linked-aisle-sync', {
      aisleId: sourceAisleId,
      markdown,
      durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
      details: {
        linkedRewriteCount,
      },
    })
  }

  const activateAisleEditor = (
    editorKey: string,
    options: ActivateAisleEditorOptions = {},
  ) => measureSlowOperation('activateAisleEditor', () => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const previousAisleId = activeAisleIdRef.current
    const requestedAisleId = getAisleIdFromAisleEditorKey(editorKey)
    const source = options.source ?? 'programmatic'
    let switchAwayDurationMs: number | undefined
    let switchAwayHadPendingContent: boolean | undefined
    const runSwitchAwayPreparation = (fromAisleId: string) => {
      const sourceAisle = getAisleById(fromAisleId)
      switchAwayHadPendingContent = sourceAisle ? Boolean(getPendingContentForAisle(sourceAisle)) : false
      const switchAwayStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      saveActiveCursorLocation()
      flushPendingContent({ captureActiveTableEditorSnapshot: true })
      clearMultiLineEdit(false)
      closeImageToolsRef.current()
      switchAwayDurationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - switchAwayStartedAt
    }
    const shouldLogActivation = Boolean(
      options.source ||
      options.focus ||
      options.focusAtClientPoint ||
      options.flushPrevious ||
      (requestedAisleId && requestedAisleId !== previousAisleId),
    )
    const queueActivationResult = (result: string, aisleId = requestedAisleId) => {
      if (!shouldLogActivation) return
      queueActivationDiagnostic({
        requestedAisleId: aisleId,
        previousAisleId,
        source,
        result,
        durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
        focus: options.focus === true || Boolean(options.focusAtClientPoint),
        flushPrevious: options.flushPrevious === true,
        mountedEditorCount: aisleEditorMetaRef.current.size,
      })
      recordEditorAblationDiagnostic('switch', {
        aisleId,
        durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
        details: {
          previousAisleId,
          requestedAisleId: aisleId,
          source,
          result,
          focusRequested: options.focus === true || Boolean(options.focusAtClientPoint),
          flushPreviousRequested: options.flushPrevious === true,
          reusedMountedEditor: result !== 'deferred-mount',
          switchAwayDurationMs,
          switchAwayHadPendingContent,
        },
      })
    }
    if (isPendingCreatedRenameActive() && !options.allowDuringPendingRename) {
      if (shouldLogActivation) {
        recordDiagnosticEvent('aisle-editor', 'activation-blocked', {
          level: 'warning',
          durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
          details: {
            editorKey,
            requestedAisleId,
            source,
            reason: 'pending-created-rename',
          },
        })
      }
      return false
    }
    const meta = aisleEditorMetaRef.current.get(editorKey)
    if (!meta) {
      const aisleId = getAisleIdFromAisleEditorKey(editorKey)
      if (!activeAisleIds.includes(aisleId)) {
        if (shouldLogActivation) {
          recordDiagnosticEvent('aisle-editor', 'activation-blocked', {
            level: 'warning',
            durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
            details: {
              editorKey,
              requestedAisleId: aisleId,
              source,
              reason: 'unknown-aisle',
            },
          })
        }
        return false
      }
      if (shouldClearPendingCursorRestoreForAisleActivation(options.source)) {
        pendingCursorRestoreRef.current = null
        pendingFocusToAisleIdRef.current = null
      }
      if (activeAisleIdRef.current !== aisleId && options.flushPrevious) {
        runSwitchAwayPreparation(activeAisleIdRef.current)
      }
      rememberRecentRetainedAisle(activeAisleIdRef.current, aisleId)
      activeAisleIdRef.current = aisleId
      activeEditorAisleIdRef.current = ''
      setActiveAisleId(aisleId)
      rememberPendingFocusAfterMount(aisleId, options)
      queueActivationResult('deferred-mount', aisleId)
      return false
    }

    if (shouldClearPendingCursorRestoreForAisleActivation(options.source)) {
      pendingCursorRestoreRef.current = null
      pendingFocusToAisleIdRef.current = null
    }

    const switchingAisle = !isMountedMetaCurrentActiveAisle(meta)
    if (
      shouldUseFastSameAisleActivation({
        switchingAisle,
        editorRefMatches: editorRef.current === meta.editor,
        pluginKeyMatches: multiLineCursorPluginKeyRef.current === meta.pluginKey,
        activeAisleStateMatches: isMountedMetaCurrentActiveAisle(meta),
      })
    ) {
      activeEditorAisleIdRef.current = meta.aisleId
      syncLexicalEditableStates(editorKey)
      focusEditorForActivation(meta, options)
      queueActivationResult('fast-same-aisle', meta.aisleId)
      return true
    }

    if (switchingAisle && options.flushPrevious) {
      runSwitchAwayPreparation(activeAisleIdRef.current)
    }

    editorRef.current = meta.editor
    rememberRecentRetainedAisle(activeAisleIdRef.current, meta.aisleId)
    activeAisleIdRef.current = meta.aisleId
    activeEditorAisleIdRef.current = meta.aisleId
    multiLineCursorPluginKeyRef.current = meta.pluginKey
    syncLexicalEditableStates(editorKey)
    const sourceAisle = getAisleById(meta.aisleId)
    const pendingMarkdown = meta.noteBodyId === activeNoteBodyIdRef.current && sourceAisle
      ? getPendingContentForAisle(sourceAisle)?.markdown
      : undefined
    const currentMarkdown = pendingMarkdown ?? getCachedMarkdownForAisleBodyId(meta.aisleBodyId) ?? getNormalizedEditorMarkdown(meta.editor)
    if (isMountedMetaCurrentActiveAisle(meta)) {
      lastEditorMarkdownRef.current = currentMarkdown
    }
    cacheMarkdownForAisleBodyId(meta.aisleBodyId, currentMarkdown)
    if (activeAisleId !== meta.aisleId) {
      setActiveAisleId(meta.aisleId)
    }
    focusEditorForActivation(meta, options)
    scheduleToolbarFormatStateSync()
    queueActivationResult(switchingAisle ? 'switched-aisle' : 'activated-mounted', meta.aisleId)
    return true
  })

  const activateEditorFromEventTarget = (target: EventTarget | null) => {
    const element = getElementFromEventTarget(target)
    if (!element) return false
    const host = element.closest('[data-aisle-editor-key]')
    if (!(host instanceof HTMLElement)) return false
    const editorKey = host.dataset.aisleEditorKey
    return editorKey ? activateAisleEditor(editorKey, { flushPrevious: true }) : false
  }

  const registerAisleEditorRoot = (editorKey: string, node: HTMLElement | null) => {
    if (node) {
      aisleEditorRootsRef.current.set(editorKey, node)
    } else {
      aisleEditorRootsRef.current.delete(editorKey)
    }
  }

  const rememberPendingFocusAfterMount = (aisleId: string, options: ActivateAisleEditorOptions) => {
    if (options.focus || options.focusAtClientPoint) {
      pendingFocusAfterMountAisleIdRef.current = aisleId
    }
    if (options.focusAtClientPoint) {
      pendingFocusPointAfterMountRef.current = { aisleId, point: options.focusAtClientPoint }
    } else if (pendingFocusPointAfterMountRef.current?.aisleId === aisleId) {
      pendingFocusPointAfterMountRef.current = null
    }
  }

  const focusEditorForActivation = (meta: AisleEditorMeta, options: ActivateAisleEditorOptions) => {
    if (options.focusAtClientPoint && (isCodeMirrorMarkdownEditor(meta.editor) || isLexicalMarkdownEditor(meta.editor))) {
      meta.editor.focusAtClientPoint(options.focusAtClientPoint)
      return
    }
    if (options.focus) {
      meta.editor.focus()
    }
  }

  const registerAislePaneRoot = (aisleId: string, node: HTMLElement | null) => {
    if (node) {
      aislePaneRootsRef.current.set(aisleId, node)
    } else {
      aislePaneRootsRef.current.delete(aisleId)
    }
  }

  const getAisleMarkdownForOutline = (aisle: ResolvedNoteAisle) => {
    return getLatestMarkdownForAisle(aisle).canonicalMarkdown
  }

  const getHeadingOutlineForAisle = (aisle: ResolvedNoteAisle): HeadingOutlineItem[] => {
    const editorKey = buildAisleEditorKey(activeNoteBodyId, aisle.id)
    const meta = aisleEditorMetaRef.current.get(editorKey)
    const view = getWysiwygView(meta?.editor ?? null)
    if (view?.state?.doc) {
      return getHeadingOutlineFromDoc(aisle.id, view.state.doc)
    }
    return getHeadingOutlineFromMarkdown(aisle.id, getAisleMarkdownForOutline(aisle))
  }

  const getTableOfContentsLinksForAisle = (aisle: ResolvedNoteAisle): TableOfContentsLinkItem[] => {
    const editorKey = buildAisleEditorKey(activeNoteBodyId, aisle.id)
    const meta = aisleEditorMetaRef.current.get(editorKey)
    const view = getWysiwygView(meta?.editor ?? null)
    if (view?.state?.doc) {
      return getTableOfContentsLinksFromDoc(aisle.id, view.state.doc, resolveInternalNoteReferenceToken)
    }
    return getTableOfContentsLinksFromMarkdown(
      aisle.id,
      getAisleMarkdownForOutline(aisle),
      resolveInternalNoteReferenceToken,
    )
  }

  const scrollAislePaneIntoView = (aisleId: string) => {
    const pane = aislePaneRootsRef.current.get(aisleId)
    pane?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  const scrollToMountedHeading = (aisleId: string, headingKey: string) => {
    const editorKey = buildAisleEditorKey(activeNoteBodyId, aisleId)
    const meta = aisleEditorMetaRef.current.get(editorKey)
    if (!meta) return false
    const view = getWysiwygView(meta.editor)
    if (!view?.state?.doc) return false
    const heading = getHeadingOutlineFromDoc(aisleId, view.state.doc).find((candidate) => candidate.key === headingKey)
    if (typeof heading?.start !== 'number') return false

    activateAisleEditor(editorKey, { flushPrevious: true, focus: true })
    try {
      const selectionPosition = Math.min(heading.start + 1, view.state.doc.content.size)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selectionPosition, selectionPosition)).scrollIntoView())
    } catch {
      // Fall back to DOM scrolling below if the document changed between collection and navigation.
    }

    const headingElement = Array.from(
      meta.root.querySelectorAll<HTMLElement>('[data-heading-collapse-key]'),
    ).find((element) => element.getAttribute('data-heading-collapse-key') === headingKey)
    headingElement?.scrollIntoView({ block: 'start', inline: 'nearest' })
    meta.editor.focus()
    return true
  }

  const runPendingHeadingScroll = () => {
    const pending = pendingHeadingScrollRef.current
    if (!pending) return
    scrollAislePaneIntoView(pending.aisleId)
    if (scrollToMountedHeading(pending.aisleId, pending.headingKey)) {
      pendingHeadingScrollRef.current = null
    }
  }

  const scrollToAisleHeading = (aisleId: string, headingKey: string) => {
    scrollAislePaneIntoView(aisleId)
    if (scrollToMountedHeading(aisleId, headingKey)) return true
    pendingHeadingScrollRef.current = { aisleId, headingKey }
    activateAisleEditor(buildAisleEditorKey(activeNoteBodyId, aisleId), { flushPrevious: true, focus: true })
    window.requestAnimationFrame(runPendingHeadingScroll)
    return false
  }

  const scrollToMountedLink = (aisleId: string, linkKey: string) => {
    const editorKey = buildAisleEditorKey(activeNoteBodyId, aisleId)
    const meta = aisleEditorMetaRef.current.get(editorKey)
    const view = getWysiwygView(meta?.editor ?? null)
    if (!view?.state?.doc) return false
    const link = getTableOfContentsLinksFromDoc(aisleId, view.state.doc, resolveInternalNoteReferenceToken).find(
      (candidate) => candidate.key === linkKey,
    )
    if (typeof link?.from !== 'number') return false

    activateAisleEditor(editorKey, { flushPrevious: true, focus: true })
    try {
      const to = typeof link.to === 'number' && link.to >= link.from ? link.to : link.from
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, link.from, to)).scrollIntoView())
      meta?.editor.focus()
      return true
    } catch {
      return false
    }
  }

  const runPendingLinkScroll = () => {
    const pending = pendingLinkScrollRef.current
    if (!pending) return
    scrollAislePaneIntoView(pending.aisleId)
    if (scrollToMountedLink(pending.aisleId, pending.linkKey)) {
      pendingLinkScrollRef.current = null
    }
  }

  const scrollToAisleLink = (aisleId: string, linkKey: string) => {
    scrollAislePaneIntoView(aisleId)
    if (scrollToMountedLink(aisleId, linkKey)) return true
    pendingLinkScrollRef.current = { aisleId, linkKey }
    activateAisleEditor(buildAisleEditorKey(activeNoteBodyId, aisleId), { flushPrevious: true, focus: true })
    window.requestAnimationFrame(runPendingLinkScroll)
    return false
  }

  const commitKnownProgrammaticMarkdown = (
    aisleId: string,
    markdown: string,
    target?: Pick<AisleEditorMeta, 'noteBodyId' | 'spaceId' | 'tabId' | 'subTabId' | 'aisleBodyId'>,
  ) => {
    const shouldScheduleCommit = shouldScheduleProgrammaticContentCommit(aisleId, markdown)
    const aisleBodyId = target?.aisleBodyId ?? getAisleBodyIdForAisleId(aisleId)
    if (!target || (target.noteBodyId === activeNoteBodyIdRef.current && activeAisleIdRef.current === aisleId)) {
      lastEditorMarkdownRef.current = markdown
    }
    cacheMarkdownForAisleBodyId(aisleBodyId, markdown)
    if (!shouldScheduleCommit) return
    scheduleContentCommit(
      markdown,
      target?.spaceId ?? activeSpaceIdRef.current,
      target?.tabId ?? activeTabIdRef.current,
      target?.subTabId ?? activeSubTabIdRef.current,
      aisleId,
      { aisleBodyId, noteBodyId: target?.noteBodyId ?? activeNoteBodyIdRef.current },
    )
  }

  const handleAisleEditorChange = (
    editorKey: string,
    aisleId: string,
    editor: Editor,
    knownMarkdown?: string,
  ) => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    return measureSlowOperation(`aisle editor change:${aisleId}`, () => {
      try {
        if (!isMainViewRef.current) return
        const meta = aisleEditorMetaRef.current.get(editorKey)
        const targetNoteBodyId = meta?.noteBodyId ?? activeNoteBodyIdRef.current
        const targetSpaceId = meta?.spaceId ?? activeSpaceIdRef.current
        const targetTabId = meta?.tabId ?? activeTabIdRef.current
        const targetSubTabId = meta?.subTabId ?? activeSubTabIdRef.current
        const targetAisleBodyId = meta?.aisleBodyId ?? getAisleBodyIdForAisleId(aisleId)
        if (import.meta.env?.DEV) {
          const now = getAisleEditorPerfNow()
          withAisleEditorPerfState((state) => {
            state.editorChangeCount += 1
            state.lastEditorChangeAt = now
            state.activeAisleId = aisleId
            state.activeAisleBodyId = targetAisleBodyId
            state.lastPendingUpdateAt = now
          })
        }

        const expectedProgrammaticMarkdown = consumeProgrammaticAisleMarkdown(aisleId)
        if (expectedProgrammaticMarkdown !== null) {
          recordDiagnosticEvent('editor', 'programmatic-change-suppressed', {
            details: {
              aisleId,
              aisleBodyId: targetAisleBodyId,
            },
          })
          commitKnownProgrammaticMarkdown(aisleId, expectedProgrammaticMarkdown, meta)
          return
        }

        cancelPendingBlankRestore(aisleId)
        if (normalizingAisleIdsRef.current.has(aisleId)) {
          normalizingAisleIdsRef.current.delete(aisleId)
          const expectedMarkdown = getCachedMarkdownForAisleBodyId(targetAisleBodyId) ?? lastEditorMarkdownRef.current
          if (expectedMarkdown) {
            commitKnownProgrammaticMarkdown(aisleId, expectedMarkdown, meta)
            return
          }
        }

        if (normalizingContentRef.current && activeAisleIdRef.current === aisleId) {
          normalizingContentRef.current = false
          commitKnownProgrammaticMarkdown(aisleId, lastEditorMarkdownRef.current, meta)
          return
        }

        activateAisleEditor(editorKey)
        closeImageToolsIfSelectedImageMissingRef.current()

        if ((isCodeMirrorMarkdownEditor(editor) || isLexicalMarkdownEditor(editor)) && typeof knownMarkdown === 'string') {
          if (meta ? isMountedMetaCurrentActiveAisle(meta) : activeAisleIdRef.current === aisleId) {
            lastEditorMarkdownRef.current = knownMarkdown
          }
          cacheMarkdownForAisleBodyId(targetAisleBodyId, knownMarkdown)
          syncMountedLinkedAisleEditors(aisleId, knownMarkdown, targetAisleBodyId)
          scheduleKnownMarkdownDraftCommit(
            knownMarkdown,
            targetSpaceId,
            targetTabId,
            targetSubTabId,
            aisleId,
            { aisleBodyId: targetAisleBodyId, noteBodyId: targetNoteBodyId },
          )
        } else {
          const fallbackMarkdown = getCachedMarkdownForAisleBodyId(targetAisleBodyId) ?? getLazyContentCommitFallbackMarkdownForAisle(aisleId)
          scheduleLazyContentCommit(
            editor,
            fallbackMarkdown,
            targetSpaceId,
            targetTabId,
            targetSubTabId,
            aisleId,
            {
              aisleBodyId: targetAisleBodyId,
              noteBodyId: targetNoteBodyId,
              fallbackAlreadyNormalized: true,
              onMaterialized: (markdown) => {
                if (meta ? isMountedMetaCurrentActiveAisle(meta) : activeAisleIdRef.current === aisleId) {
                  lastEditorMarkdownRef.current = markdown
                }
                cacheMarkdownForAisleBodyId(targetAisleBodyId, markdown)
                syncMountedLinkedAisleEditors(aisleId, markdown, targetAisleBodyId)
              },
            },
          )
        }
      } finally {
        const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
        recordHotPathDiagnostic('change-hot-path', {
          aisleId,
          editorCore: getEditorCoreForMeta(aisleEditorMetaRef.current.get(editorKey), editor),
          markdown: knownMarkdown,
          durationMs,
          details: {
            editorKey,
            pendingContentCount: pendingContentRef.current.size,
            knownMarkdown: typeof knownMarkdown === 'string',
          },
        })
        recordEditorAblationDiagnostic('change', {
          aisleId,
          durationMs,
          details: {
            editorKey,
            pendingContentCount: pendingContentRef.current.size,
          },
        })
      }
    })
  }

  const commitAisleEditorMarkdown = (aisleId: string, committedEditor: Editor) => {
    const markdown = getNormalizedEditorMarkdown(committedEditor)
    const meta = Array.from(aisleEditorMetaRef.current.values()).find((candidate) => candidate.editor === committedEditor)
    const targetAisleBodyId = meta?.aisleBodyId ?? getAisleBodyIdForAisleId(aisleId)
    maybeShowCompletedTaskUndoHint(markdown)
    if (meta ? isMountedMetaCurrentActiveAisle(meta) : activeAisleIdRef.current === aisleId) {
      lastEditorMarkdownRef.current = markdown
    }
    cacheMarkdownForAisleBodyId(targetAisleBodyId, markdown)
    syncMountedLinkedAisleEditors(aisleId, markdown, targetAisleBodyId)
    scheduleContentCommit(
      markdown,
      meta?.spaceId ?? activeSpaceIdRef.current,
      meta?.tabId ?? activeTabIdRef.current,
      meta?.subTabId ?? activeSubTabIdRef.current,
      aisleId,
      { aisleBodyId: targetAisleBodyId, noteBodyId: meta?.noteBodyId ?? activeNoteBodyIdRef.current },
    )
  }

  const captureAisleEditorContent = (meta: AisleEditorMeta) => measureSlowOperation(`aisle editor content capture:${meta.aisleId}`, () => {
    const markdown = getSnapshotMarkdownForMeta(meta)
    cacheMarkdownForAisleBodyId(meta.aisleBodyId, markdown)
    if (isMountedMetaCurrentActiveAisle(meta)) {
      lastEditorMarkdownRef.current = markdown
    }
    scheduleContentCommit(
      markdown,
      meta.spaceId,
      meta.tabId,
      meta.subTabId,
      meta.aisleId,
      { aisleBodyId: meta.aisleBodyId, noteBodyId: meta.noteBodyId },
    )
  })

  const collectMountedEditorSnapshots = (): EditorContentSnapshot[] => measureSlowOperation('mounted aisle editor snapshot collection', () => {
    if (viewMode !== 'main' || !activeNoteBodyIdRef.current) return []
    const snapshots: EditorContentSnapshot[] = []
    aisleEditorMetaRef.current.forEach((meta) => {
      const markdown = getSnapshotMarkdownForMeta(meta)
      cacheMarkdownForAisleBodyId(meta.aisleBodyId, markdown)
      if (isMountedMetaCurrentActiveAisle(meta)) {
        lastEditorMarkdownRef.current = markdown
      }
      snapshots.push({
        noteBodyId: meta.noteBodyId,
        spaceId: meta.spaceId,
        tabId: meta.tabId,
        subTabId: meta.subTabId,
        aisleId: meta.aisleId,
        aisleBodyId: meta.aisleBodyId,
        markdown,
      })
    })
    return snapshots
  })

  const destroyAisleEditor = (editorKey: string, options: { captureContent?: boolean } = {}) => {
    const meta = aisleEditorMetaRef.current.get(editorKey)
    if (!meta) return
    recordDiagnosticEvent('aisle-editor', 'unmount', {
      details: {
        editorKey,
        aisleId: meta.aisleId,
        editorCore: meta.editorCore,
        captureContent: options.captureContent === true,
        activeEditorAisleId: activeEditorAisleIdRef.current,
        mountedEditorCount: aisleEditorMetaRef.current.size,
      },
    })
    if (options.captureContent) {
      captureAisleEditorContent(meta)
    }
    cancelPendingBlankRestore(meta.aisleId)
    programmaticAisleMarkdownRef.current.delete(meta.aisleId)
    measureSlowOperation(`aisle editor destroy:${meta.aisleId}`, () => {
      meta.cleanup()
    })
    aisleEditorMetaRef.current.delete(editorKey)
    normalizingAisleIdsRef.current.delete(meta.aisleId)
    if (editorRef.current === meta.editor) {
      editorRef.current = null
      activeEditorAisleIdRef.current = ''
      multiLineCursorPluginKeyRef.current = null
    }
    if (import.meta.env?.DEV) {
      emitDevAisleEditorMountState()
    }
  }

  const destroyAllAisleEditors = () => {
    Array.from(aisleEditorMetaRef.current.keys()).forEach((editorKey) => destroyAisleEditor(editorKey))
  }

  useEffect(
    () => registerMountedEditorSnapshotProvider(collectMountedEditorSnapshots),
    [registerMountedEditorSnapshotProvider],
  )

  useEffect(() => () => {
    if (activationDiagnosticFrameRef.current !== null) {
      window.cancelAnimationFrame(activationDiagnosticFrameRef.current)
      activationDiagnosticFrameRef.current = null
    }
    activationDiagnosticSummariesRef.current.clear()
  }, [])

  useEffect(() => {
    if (viewMode !== 'main' || !activeNoteBodyId) {
      setNearVisibleAisleIds(new Set())
      return
    }

    const scrollRoot = aisleScrollRef.current
    if (!scrollRoot || typeof IntersectionObserver === 'undefined') {
      setNearVisibleAisleIds(resolvedActiveAisleId ? new Set([resolvedActiveAisleId]) : new Set())
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setNearVisibleAisleIds((currentIds) => {
          const nextIds = new Set(currentIds)
          for (const entry of entries) {
            const aisleId = (entry.target as HTMLElement).dataset.aisleId
            if (!aisleId) continue
            if (entry.isIntersecting) {
              nextIds.add(aisleId)
            } else {
              nextIds.delete(aisleId)
            }
          }
          return nextIds.size === currentIds.size && Array.from(nextIds).every((aisleId) => currentIds.has(aisleId))
            ? currentIds
            : nextIds
        })
      },
      {
        root: scrollRoot,
        rootMargin: AISLE_EDITOR_INTERSECTION_ROOT_MARGIN,
        threshold: 0,
      },
    )

    for (const aisleId of activeAisleIds) {
      const pane = aislePaneRootsRef.current.get(aisleId)
      if (pane) observer.observe(pane)
    }

    return () => observer.disconnect()
  }, [viewMode, activeNoteBodyId, activeAisleIds, aisleScrollRef, resolvedActiveAisleId])

  useEffect(() => {
    if (
      mountedEditorAblationModeRef.current !== editorAblationMode ||
      mountedEditorCoreModeRef.current !== editorCoreMode
    ) {
      Array.from(aisleEditorMetaRef.current.keys()).forEach((editorKey) =>
        destroyAisleEditor(editorKey, { captureContent: true }),
      )
      mountedEditorAblationModeRef.current = editorAblationMode
      mountedEditorCoreModeRef.current = editorCoreMode
      setRecentRetainedAisleIds([])
    }

    if (viewMode !== 'main' || !activeNoteBodyId) {
      destroyAllAisleEditors()
      return
    }

    const expectedKeys = new Set(activeNoteAisles.map((aisle) => buildAisleEditorKey(activeNoteBodyId, aisle.id)))

    for (const editorKey of Array.from(aisleEditorMetaRef.current.keys())) {
      const meta = aisleEditorMetaRef.current.get(editorKey)
      if (!expectedKeys.has(editorKey)) {
        destroyAisleEditor(editorKey)
      } else if (meta && !mountedAisleIds.has(meta.aisleId)) {
        destroyAisleEditor(editorKey, { captureContent: true })
      }
    }

    for (const aisle of activeNoteAisles) {
      if (!mountedAisleIds.has(aisle.id)) continue
      const editorKey = buildAisleEditorKey(activeNoteBodyId, aisle.id)
      const root = aisleEditorRootsRef.current.get(editorKey)
      if (!root || aisleEditorMetaRef.current.has(editorKey)) continue

      const initialMarkdown = editorAblationPolicy.useDisplayPreparation
        ? getLatestMarkdownForAisle(aisle)
        : {
            canonicalMarkdown: getLatestRawMarkdownForAisle(aisle),
            displayMarkdown: getLatestRawMarkdownForAisle(aisle),
          }
      const activeEditorCore = resolveActiveEditorCore(editorCoreMode, initialMarkdown.canonicalMarkdown)
      let pluginKey: unknown = null
      const editorPlugins: any[] = []
      if (activeEditorCore === 'toast' && editorAblationPolicy.includeCorePlugins) {
        editorPlugins.push(
          listMarkerPlugin,
          blockIndentPlugin,
          annotationLinePlugin,
          tagAppearancePlugin,
          highlightPlugin,
          codeBlockBacktickShortcutPlugin,
          terminalBlockLandingPlugin,
        )
      }
      if (activeEditorCore === 'toast' && editorAblationPolicy.includeSpecialLinkPlugins) {
        editorPlugins.push(createMediaLinkPlugin)
      }
      if (activeEditorCore === 'toast' && editorAblationPolicy.includeCorePlugins) {
        editorPlugins.push(createCodeBlockControlsPlugin({ pushToast }))
      }
      if (activeEditorCore === 'toast' && editorAblationPolicy.includeStructuralPlugins) {
        editorPlugins.push((context: any) =>
          headingCollapsePlugin(context, {
            aisleId: aisle.id,
            getCollapsedHeadingKeys: (targetAisleId) =>
              getCollapsedHeadingKeysForAisle(headingCollapseStateRef.current, activeNoteBodyId, targetAisleId),
            getMarkdown: (targetAisleId) =>
              normalizeEditorMarkdownForDisplay(
                getCachedMarkdownForAisle(targetAisleId) ??
                normalizeMarkdownForPersistence(getAisleById(targetAisleId)?.markdown ?? aisle.markdown),
              ),
            onToggleHeading: onToggleHeadingCollapse,
            onExpandHeading: onExpandHeadingCollapse,
          }))
      }
      if (activeEditorCore === 'toast' && editorAblationPolicy.includeCorePlugins) {
        editorPlugins.push(
          uncheckedTaskEnterPlugin,
          headingSpaceShortcutPlugin,
          thematicBreakShortcutPlugin,
        )
      }
      if (activeEditorCore === 'toast' && editorAblationPolicy.includeSpecialLinkPlugins) {
        editorPlugins.push((context: any) =>
          createNotePreviewPlugin(context, {
            sourceNoteBodyId: activeNoteBodyId,
            getNotePreviewData,
            resolvePreviewToken,
            navigateToNoteLocation,
            deleteNotePreview,
            openNotePreviewContextMenu,
          }))
      }
      if (activeEditorCore === 'toast' && editorAblationPolicy.includeStructuralPlugins) {
        editorPlugins.push((context: any) =>
          multiLineSelectionShortcutPlugin({
            ...context,
            onExpand: tryExpandMultilineSelection,
            onPluginKeyReady: (nextPluginKey) => {
              pluginKey = nextPluginKey
            },
          }))
      }
      const editorOptions: any = {
        el: root,
        initialValue: editorAblationPolicy.useDisplayPreparation
          ? prepareMarkdownForEditorDisplay(initialMarkdown.displayMarkdown)
          : initialMarkdown.canonicalMarkdown,
        initialEditType: 'wysiwyg',
        previewStyle: 'tab',
        hideModeSwitch: true,
        customHTMLSanitizer: sanitizeEditorHtml,
        toolbarItems: editorAblationPolicy.includeToolbarItems ? EDITOR_TOOLBAR_ITEMS : [],
        height: '100%',
        autofocus: false,
        usageStatistics: false,
        plugins: editorPlugins,
        events: {
          change: () => handleAisleEditorChange(editorKey, aisle.id, editor),
          focus: () => activateEditorFromFocus(editorKey),
        },
      }
      if (activeEditorCore === 'toast' && editorAblationPolicy.includeImageHook) {
        editorOptions.hooks = {
          addImageBlobHook: (blob: Blob | File, callback: (url: string, text?: string) => void) => {
            void importImageBlobAsAssetUrl(blob, blob instanceof File ? blob.name : 'image').then((assetUrl) => {
              if (!assetUrl) {
                pushToast('Could not import image.', 'warning')
                return
              }
              void withDefaultInsertedImageDisplayWidth(assetUrl, blob, root).then((displayUrl) => {
                callback(displayUrl, blob instanceof File ? blob.name : 'image')
                window.setTimeout(() => commitCurrentEditorContent(), 30)
              })
            })
          },
        }
      }
      let mountedEditor: Editor | null = null
      const constructorMeasurement = measureEditorAblationOperation(() => {
        if (activeEditorCore === 'codemirror') {
          return measureSlowOperation(`aisle editor CodeMirror constructor:${aisle.id}`, () =>
            createCodeMirrorMarkdownEditor({
              root,
              markdown: initialMarkdown.canonicalMarkdown,
              diagnosticAisleId: aisle.id,
              onChange: (markdown) => {
                if (mountedEditor) handleAisleEditorChange(editorKey, aisle.id, mountedEditor, markdown)
              },
              onFocus: () => activateEditorFromFocus(editorKey),
            }))
        }
        if (activeEditorCore === 'lexical') {
          return measureSlowOperation(`aisle editor Lexical constructor:${aisle.id}`, () =>
            createLexicalMarkdownEditor({
              root,
              markdown: initialMarkdown.canonicalMarkdown,
              editable: aisle.id === (activeAisleIdRef.current || resolvedActiveAisleId),
              notePreviewOptions: {
                sourceNoteBodyId: activeNoteBodyId,
                getNotePreviewData,
                resolvePreviewToken,
                navigateToNoteLocation,
                deleteNotePreview,
                openNotePreviewContextMenu,
              },
              pushToast,
              onChange: (markdown) => {
                if (mountedEditor) handleAisleEditorChange(editorKey, aisle.id, mountedEditor, markdown)
              },
              onFocus: () => activateEditorFromFocus(editorKey),
            }))
        }
        return measureSlowOperation(`aisle editor Toast UI constructor:${aisle.id}`, () => new Editor(editorOptions))
      })
      const editor = constructorMeasurement.result
      mountedEditor = editor
      const activateFromFocus = () => activateEditorFromFocus(editorKey, getAisleActivationNow())
      const activateFromPointer = () => activateEditorFromPointer(editorKey, getAisleActivationNow())
      root.addEventListener('focusin', activateFromFocus)
      root.addEventListener('pointerdown', activateFromPointer, true)
      const noopCleanup = () => {}
      const cleanupImageDisplayMetadataSync = activeEditorCore === 'toast' && editorAblationPolicy.includeDomInstallers
        ? installImageDisplayMetadataSync(root)
        : noopCleanup
      const cleanupEditorSpellcheck = activeEditorCore === 'toast' && editorAblationPolicy.includeDomInstallers
        ? installEditorSpellcheck(root)
        : noopCleanup
      const cleanupToolbarAppTooltips = activeEditorCore === 'toast' && editorAblationPolicy.includeDomInstallers
        ? installToolbarAppTooltips(root)
        : noopCleanup
      const cleanupHeadingPopupActiveState = activeEditorCore === 'toast' && editorAblationPolicy.includeDomInstallers
        ? installHeadingPopupActiveState(root, () => editor)
        : noopCleanup
      const cleanupCompletedTaskCheckboxBehavior = activeEditorCore === 'toast' && editorAblationPolicy.includeDomInstallers
        ? installCompletedTaskCheckboxBehavior(
            root,
            () => editor,
            trackCompletedTaskQuickDelete,
            (committedEditor) => commitAisleEditorMarkdown(aisle.id, committedEditor),
          )
        : noopCleanup
      const cleanupTaskTextReorderBehavior = activeEditorCore === 'toast' && editorAblationPolicy.includeDomInstallers
        ? installTaskTextReorderBehavior(root, () => editor, {
            onReorderCommitted: (committedEditor) => {
              pendingCursorRestoreRef.current = null
              commitAisleEditorMarkdown(aisle.id, committedEditor)
            },
          })
        : noopCleanup

      const mountedAisleBodyId = getAisleBodyId(aisle)
      const mountedNoteBodyId = activeNoteBodyId
      const mountedSpaceId = activeSpaceIdRef.current
      const mountedTabId = activeTabIdRef.current
      const mountedSubTabId = activeSubTabIdRef.current

      aisleEditorMetaRef.current.set(editorKey, {
        editor,
        root,
        noteBodyId: mountedNoteBodyId,
        spaceId: mountedSpaceId,
        tabId: mountedTabId,
        subTabId: mountedSubTabId,
        aisleId: aisle.id,
        aisleBodyId: mountedAisleBodyId,
        editorCore: activeEditorCore,
        pluginKey,
        cleanup: () => {
          cleanupImageDisplayMetadataSync()
          cleanupEditorSpellcheck()
          cleanupToolbarAppTooltips()
          cleanupTaskTextReorderBehavior()
          cleanupCompletedTaskCheckboxBehavior()
          cleanupHeadingPopupActiveState()
          root.removeEventListener('focusin', activateFromFocus)
          root.removeEventListener('pointerdown', activateFromPointer, true)
          try {
            editor.destroy()
          } catch {
            // Toast UI can throw during teardown if the toolbar DOM was customized.
          }
          if (activeEditorAisleIdRef.current === aisle.id) {
            activeEditorAisleIdRef.current = ''
          }
          if (root.dataset.aisleHostMode === 'editor') {
            root.innerHTML = ''
          }
        },
      })
      syncLexicalEditableStates(buildAisleEditorKey(activeNoteBodyId, activeAisleIdRef.current || resolvedActiveAisleId))
      recordDiagnosticEvent('aisle-editor', 'mount', {
        details: {
          editorKey,
          aisleId: aisle.id,
          noteBodyId: activeNoteBodyId,
          editorCore: activeEditorCore,
          editorCoreMode,
          mountedEditorCount: aisleEditorMetaRef.current.size,
          pendingFocusAfterMount: pendingFocusAfterMountAisleIdRef.current === aisle.id,
        },
      })
      cacheMarkdownForAisleBodyId(mountedAisleBodyId, initialMarkdown.canonicalMarkdown)

      const focusAfterRestore = pendingFocusAfterMountAisleIdRef.current === aisle.id
      let mountBlankRestoreDurationMs = 0
      let mountBlankRestoreSkipped = activeEditorCore !== 'toast' || !editorAblationPolicy.runMountBlankRestore
      const runMountBlankRestore = (label: string) => {
        if (activeEditorCore !== 'toast' || !editorAblationPolicy.runMountBlankRestore) {
          return { restored: false, viewReady: true }
        }
        const measurement = measureEditorAblationOperation(() => measureSlowOperation(label, () => {
          markProgrammaticAisleMarkdown(aisle.id, initialMarkdown.canonicalMarkdown)
          return restoreEditorDisplay(editor, initialMarkdown.displayMarkdown)
        }))
        mountBlankRestoreDurationMs += measurement.durationMs
        const result = measurement.result
        if (result.restored) {
          window.setTimeout(() => clearProgrammaticAisleMarkdown(aisle.id, initialMarkdown.canonicalMarkdown), 0)
        } else {
          clearProgrammaticAisleMarkdown(aisle.id, initialMarkdown.canonicalMarkdown)
        }
        return result
      }
      const immediateRestoreResult = runMountBlankRestore(`aisle editor mount blank restore:${aisle.id}:immediate`)
      const retryBlankRestoreAfterPaint = !immediateRestoreResult.viewReady
      recordEditorAblationDiagnostic('mount', {
        aisleId: aisle.id,
        durationMs: constructorMeasurement.durationMs + mountBlankRestoreDurationMs,
        details: {
          editorKey,
          newlyConstructed: true,
          constructorDurationMs: constructorMeasurement.durationMs,
          mountBlankRestoreDurationMs,
          mountBlankRestoreSkipped,
          mountBlankRestoreRetryScheduled: retryBlankRestoreAfterPaint,
          pluginCount: editorPlugins.length,
          editorCore: activeEditorCore,
        },
      })
      const restoreFrameId = window.requestAnimationFrame(() => {
        pendingBlankRestoreFrameRef.current.delete(aisle.id)
        const mountedMeta = aisleEditorMetaRef.current.get(editorKey)
        if (!mountedMeta || mountedMeta.editor !== editor) return
        if (retryBlankRestoreAfterPaint) {
          mountBlankRestoreSkipped = false
          runMountBlankRestore(`aisle editor mount blank restore:${aisle.id}`)
        }
        if (focusAfterRestore && pendingFocusAfterMountAisleIdRef.current === aisle.id) {
          pendingFocusAfterMountAisleIdRef.current = null
          const pendingFocusPoint = pendingFocusPointAfterMountRef.current
          if (pendingFocusPoint?.aisleId === aisle.id) {
            pendingFocusPointAfterMountRef.current = null
            activateAisleEditor(editorKey, { focus: true, focusAtClientPoint: pendingFocusPoint.point })
          } else {
            activateAisleEditor(editorKey, { focus: true })
          }
        }
        runPendingHeadingScroll()
        runPendingLinkScroll()
      })
      pendingBlankRestoreFrameRef.current.set(aisle.id, restoreFrameId)
      if (import.meta.env?.DEV) {
        emitDevAisleEditorMountState()
      }
    }

    const activeEditorKey = buildAisleEditorKey(activeNoteBodyId, resolvedActiveAisleId)
    if (aisleEditorMetaRef.current.has(activeEditorKey)) {
      activateAisleEditor(activeEditorKey)
    }
  }, [viewMode, activeNoteBodyId, activeNoteAisles, resolvedActiveAisleId, mountedAisleIdsKey, editorAblationMode, editorCoreMode])

  useEffect(() => {
    if (!editorAblationPolicy.includeStructuralPlugins) return
    if (viewMode !== 'main' || !activeNoteBodyId) return
    aisleEditorMetaRef.current.forEach((meta) => {
      const view = getWysiwygView(meta.editor)
      if (!view?.state?.tr) return
      view.dispatch(view.state.tr.setMeta('headingCollapseRefresh', true).setMeta('addToHistory', false))
    })
  }, [viewMode, activeNoteBodyId, editorAblationPolicy.includeStructuralPlugins, headingCollapseState])

  useEffect(() => {
    if (!import.meta.env?.DEV) return
    if (viewMode !== 'main' || !activeNoteBodyId) {
      clearDevAisleEditorMountState()
      return
    }
    emitDevAisleEditorMountState()
  }, [
    viewMode,
    activeNoteBodyId,
    mountedAisleIds,
    nearVisibleAisleIds,
    activeAisleIds,
    recentRetainedAisleIds,
    backgroundMountedAisleIdsKey,
  ])

  useEffect(() => {
    return () => {
      destroyAllAisleEditors()
      cancelAllPendingBlankRestores()
      if (import.meta.env?.DEV) {
        clearDevAisleEditorMountState()
      }
    }
  }, [])

  useEffect(() => {
    if (viewMode !== 'main' || !activeNoteBodyId) return
    for (const aisle of activeNoteAisles) {
      const editorKey = buildAisleEditorKey(activeNoteBodyId, aisle.id)
      const meta = aisleEditorMetaRef.current.get(editorKey)
      if (!meta) continue
      const pending = getPendingContentForAisle(aisle)
      const cachedMarkdown = getCachedMarkdownForAisle(aisle.id)
      const expectedMarkdown = pending?.markdown ?? cachedMarkdown ?? aisle.markdown
      const expected = getMarkdownSyncSnapshot(expectedMarkdown)
      const currentMarkdown = cachedMarkdown ?? getNormalizedEditorMarkdown(meta.editor)
      if (shouldApplyEditorDisplayRewrite({
        currentCanonicalMarkdown: currentMarkdown,
        expectedCanonicalMarkdown: expected.canonicalMarkdown,
      })) {
        applyEditorDisplayRewrite({
          meta,
          reason: 'mounted-aisle-sync',
          currentCanonicalMarkdown: currentMarkdown,
          expectedCanonicalMarkdown: expected.canonicalMarkdown,
          expectedDisplayMarkdown: expected.displayMarkdown,
        })
      }
    }
  }, [viewMode, activeNoteBodyId, activeNoteAisles])

  return {
    activateAisleEditor,
    activateEditorFromEventTarget,
    registerAisleEditorRoot,
    registerAislePaneRoot,
    mountedAisleIds,
    getHeadingOutlineForAisle,
    getTableOfContentsLinksForAisle,
    scrollToAisleHeading,
    scrollToAisleLink,
    getPreviewMarkdownForAisle: (aisle: ResolvedNoteAisle) =>
      getAislePreviewMarkdown({
        aisle,
        pendingContent: pendingContentRef.current,
        lastEditorMarkdownByAisle: lastEditorMarkdownByAisleRef.current,
      }),
  }
}
