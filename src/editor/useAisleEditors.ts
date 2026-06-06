/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Editor } from '@toast-ui/editor'
import { TextSelection } from 'prosemirror-state'
import { buildAisleEditorKey, getAisleIdFromAisleEditorKey, type AisleEditorMeta } from './aisle-editor'
import {
  resolveProgrammaticAisleRewriteMarkdown,
  shouldClearPendingCursorRestoreForAisleActivation,
  shouldUseFastSameAisleActivation,
  type AisleActivationSource,
} from './aisle-activation'
import { createCodeBlockControlsPlugin } from './code-block-controls'
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
import { getElementFromEventTarget, getWysiwygView, markWysiwygLoadedUndoBoundary } from './prosemirror-utils'
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
  restoreEditorBlankParagraphs,
  setEditorMarkdownForDisplay,
} from './editor-markdown-display'
import {
  AISLE_EDITOR_IDLE_UNMOUNT_MS,
  AISLE_EDITOR_INTERSECTION_ROOT_MARGIN,
  buildRetainedAisleEditorIds,
  getAislePreviewMarkdown,
  updateRecentAisleIds,
} from './aisle-editor-retention'
import type { HeadingCollapseState, NoteNavigationTarget, ResolvedNoteAisle, ToastTone, ViewMode } from '../types/app'
import type { NotePreviewReferencePayload, ResolvedWikiNoteReference } from '../notes/note-references'
import { getAisleBodyId } from '../notes/aisle-body-state'
import type { PendingCursorRestore } from './useNoteCursorPersistence'
import {
  getSnapshotEditorMarkdown,
  type EditorContentSnapshot,
  type MountedEditorSnapshotProvider,
  type PendingContentMap,
} from './useEditorPersistence'

type ActivateAisleEditorOptions = {
  flushPrevious?: boolean
  focus?: boolean
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
  flushPendingContent: () => void
  clearMultiLineEdit: (collapseToHead?: boolean) => void
  getNormalizedEditorMarkdown: (editor: Editor) => string
  scheduleContentCommit: (
    markdown: string,
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
    options?: { aisleBodyId?: string | null; noteBodyId?: string | null },
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
  resolveInternalNoteReferenceToken: (token: string) => ResolvedWikiNoteReference | null
  navigateToNoteLocation: (location: NoteNavigationTarget) => void
  deleteNotePreview: (tokenId: string) => void
}

type PendingHeadingScroll = {
  aisleId: string
  headingKey: string
}

type PendingLinkScroll = {
  aisleId: string
  linkKey: string
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
  scheduleContentCommit,
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
}: UseAisleEditorsOptions) {
  const aisleEditorRootsRef = useRef<Map<string, HTMLElement>>(new Map())
  const aislePaneRootsRef = useRef<Map<string, HTMLElement>>(new Map())
  const aisleEditorMetaRef = useRef<Map<string, AisleEditorMeta>>(new Map())
  const [nearVisibleAisleIds, setNearVisibleAisleIds] = useState<Set<string>>(() => new Set())
  const [recentAisleIds, setRecentAisleIds] = useState<string[]>([])
  const [retainedAisleIds, setRetainedAisleIds] = useState<Set<string>>(() => new Set())
  const idleUnmountTimerRef = useRef<number | null>(null)
  const pendingFocusAfterMountAisleIdRef = useRef<string | null>(null)
  const pendingHeadingScrollRef = useRef<PendingHeadingScroll | null>(null)
  const pendingLinkScrollRef = useRef<PendingLinkScroll | null>(null)
  const headingCollapseStateRef = useRef(headingCollapseState)
  headingCollapseStateRef.current = headingCollapseState
  const activeNoteBodyIdRef = useRef(activeNoteBodyId)
  activeNoteBodyIdRef.current = activeNoteBodyId
  const activeNoteAislesRef = useRef(activeNoteAisles)
  activeNoteAislesRef.current = activeNoteAisles
  const activeAisleIds = useMemo(() => activeNoteAisles.map((aisle) => aisle.id), [activeNoteAisles])
  const desiredMountedAisleIds = useMemo(
    () =>
      buildRetainedAisleEditorIds({
        aisleIds: activeAisleIds,
        activeAisleId: resolvedActiveAisleId,
        nearVisibleAisleIds,
        recentAisleIds,
      }),
    [activeAisleIds, nearVisibleAisleIds, recentAisleIds, resolvedActiveAisleId],
  )
  const mountedAisleIds = useMemo(
    () => new Set([...retainedAisleIds, ...desiredMountedAisleIds]),
    [desiredMountedAisleIds, retainedAisleIds],
  )
  const mountedAisleIdsKey = useMemo(() => activeAisleIds.filter((aisleId) => mountedAisleIds.has(aisleId)).join('\n'), [
    activeAisleIds,
    mountedAisleIds,
  ])
  const retainRecentAisleId = (aisleId: string) => {
    setRecentAisleIds((currentIds) => {
      const nextIds = updateRecentAisleIds(currentIds, aisleId)
      return nextIds.length === currentIds.length && nextIds.every((candidate, index) => candidate === currentIds[index])
        ? currentIds
        : nextIds
    })
  }

  const getAisleById = (aisleId: string) => activeNoteAislesRef.current.find((aisle) => aisle.id === aisleId) ?? null

  const getAisleBodyIdForAisleId = (aisleId: string) => {
    const aisle = getAisleById(aisleId)
    return aisle ? getAisleBodyId(aisle) : aisleId
  }

  const getCachedMarkdownForAisle = (aisleId: string) => {
    const aisleBodyId = getAisleBodyIdForAisleId(aisleId)
    return lastEditorMarkdownByAisleRef.current.get(aisleBodyId)
  }

  const cacheMarkdownForAisleBody = (aisleId: string, markdown: string) => {
    lastEditorMarkdownByAisleRef.current.set(getAisleBodyIdForAisleId(aisleId), markdown)
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

  const getLatestMarkdownForAisle = (aisle: ResolvedNoteAisle) => {
    const pending = getPendingContentForAisle(aisle)
    if (pending) return pending.markdown
    return getCachedMarkdownForAisle(aisle.id) ?? normalizeMarkdownForPersistence(aisle.markdown)
  }

  const syncMountedLinkedAisleEditors = (sourceAisleId: string, markdown: string) => {
    const sourceAisleBodyId = getAisleBodyIdForAisleId(sourceAisleId)
    aisleEditorMetaRef.current.forEach((meta) => {
      if (meta.aisleId === sourceAisleId) return
      if (getAisleBodyIdForAisleId(meta.aisleId) !== sourceAisleBodyId) return
      const currentMarkdown = getNormalizedEditorMarkdown(meta.editor)
      if (currentMarkdown === markdown) return
      normalizingAisleIdsRef.current.add(meta.aisleId)
      setEditorMarkdownForDisplay(meta.editor, markdown)
    })
  }

  const activateAisleEditor = (
    editorKey: string,
    options: ActivateAisleEditorOptions = {},
  ) => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const previousAisleId = activeAisleIdRef.current
    const requestedAisleId = getAisleIdFromAisleEditorKey(editorKey)
    const shouldLogActivation = Boolean(
      options.source ||
      options.focus ||
      options.flushPrevious ||
      (requestedAisleId && requestedAisleId !== previousAisleId),
    )
    if (shouldLogActivation) {
      recordDiagnosticEvent('aisle-editor', 'activation-start', {
        details: {
          editorKey,
          requestedAisleId,
          previousAisleId,
          source: options.source ?? 'programmatic',
          focus: options.focus === true,
          flushPrevious: options.flushPrevious === true,
          pendingFocusToAisleId: pendingFocusToAisleIdRef.current,
          hasPendingCursorRestore: Boolean(pendingCursorRestoreRef.current),
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
        saveActiveCursorLocation()
        flushPendingContent()
        clearMultiLineEdit(false)
        closeImageToolsRef.current()
      }
      activeAisleIdRef.current = aisleId
      activeEditorAisleIdRef.current = ''
      setActiveAisleId(aisleId)
      retainRecentAisleId(aisleId)
      setRetainedAisleIds((currentIds) => new Set([...currentIds, aisleId]))
      if (options.focus) pendingFocusAfterMountAisleIdRef.current = aisleId
      if (shouldLogActivation) {
        recordDiagnosticEvent('aisle-editor', 'activation-deferred-mount', {
          durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
          details: {
            editorKey,
            aisleId,
            requestedFocusAfterMount: options.focus === true,
            mountedEditorCount: aisleEditorMetaRef.current.size,
          },
        })
      }
      return false
    }

    if (shouldClearPendingCursorRestoreForAisleActivation(options.source)) {
      pendingCursorRestoreRef.current = null
      pendingFocusToAisleIdRef.current = null
    }

    const switchingAisle = activeAisleIdRef.current !== meta.aisleId
    if (
      shouldUseFastSameAisleActivation({
        switchingAisle,
        editorRefMatches: editorRef.current === meta.editor,
        pluginKeyMatches: multiLineCursorPluginKeyRef.current === meta.pluginKey,
        activeAisleStateMatches: activeAisleIdRef.current === meta.aisleId,
      })
    ) {
      activeEditorAisleIdRef.current = meta.aisleId
      if (options.focus) {
        meta.editor.focus()
      }
      if (shouldLogActivation) {
        recordDiagnosticEvent('aisle-editor', 'activation-end', {
          durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
          details: {
            editorKey,
            aisleId: meta.aisleId,
            result: 'fast-same-aisle',
            previousAisleId,
            mountedEditorCount: aisleEditorMetaRef.current.size,
          },
        })
      }
      return true
    }

    if (switchingAisle && options.flushPrevious) {
      saveActiveCursorLocation()
      flushPendingContent()
      clearMultiLineEdit(false)
      closeImageToolsRef.current()
    }

    editorRef.current = meta.editor
    activeAisleIdRef.current = meta.aisleId
    activeEditorAisleIdRef.current = meta.aisleId
    multiLineCursorPluginKeyRef.current = meta.pluginKey
    const currentMarkdown = getNormalizedEditorMarkdown(meta.editor)
    lastEditorMarkdownRef.current = currentMarkdown
    cacheMarkdownForAisleBody(meta.aisleId, currentMarkdown)
    if (activeAisleId !== meta.aisleId) {
      setActiveAisleId(meta.aisleId)
    }
    retainRecentAisleId(meta.aisleId)
    if (options.focus) {
      meta.editor.focus()
    }
    scheduleToolbarFormatStateSync()
    if (shouldLogActivation) {
      recordDiagnosticEvent('aisle-editor', 'activation-end', {
        durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
        details: {
          editorKey,
          aisleId: meta.aisleId,
          result: switchingAisle ? 'switched-aisle' : 'activated-mounted',
          previousAisleId,
          mountedEditorCount: aisleEditorMetaRef.current.size,
        },
      })
    }
    return true
  }

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

  const registerAislePaneRoot = (aisleId: string, node: HTMLElement | null) => {
    if (node) {
      aislePaneRootsRef.current.set(aisleId, node)
    } else {
      aislePaneRootsRef.current.delete(aisleId)
    }
  }

  const getAisleMarkdownForOutline = (aisle: ResolvedNoteAisle) => {
    return getLatestMarkdownForAisle(aisle)
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

  const handleAisleEditorChange = (editorKey: string, aisleId: string, editor: Editor) => measureSlowOperation(`aisle editor change:${aisleId}`, () => {
    if (!isMainViewRef.current) return
    const markdown = getNormalizedEditorMarkdown(editor)

    const programmaticRewriteMarkdown = resolveProgrammaticAisleRewriteMarkdown({
      isProgrammaticRewrite: normalizingAisleIdsRef.current.has(aisleId),
      expectedMarkdown: getCachedMarkdownForAisle(aisleId),
      currentMarkdown: markdown,
    })
    if (programmaticRewriteMarkdown !== null) {
      normalizingAisleIdsRef.current.delete(aisleId)
      lastEditorMarkdownRef.current = programmaticRewriteMarkdown
      cacheMarkdownForAisleBody(aisleId, programmaticRewriteMarkdown)
      scheduleContentCommit(
        programmaticRewriteMarkdown,
        activeSpaceIdRef.current,
        activeTabIdRef.current,
        activeSubTabIdRef.current,
        aisleId,
        { aisleBodyId: getAisleBodyIdForAisleId(aisleId), noteBodyId: activeNoteBodyIdRef.current },
      )
      return
    }

    activateAisleEditor(editorKey)
    closeImageToolsIfSelectedImageMissingRef.current()

    if (normalizingContentRef.current && activeAisleIdRef.current === aisleId) {
      normalizingContentRef.current = false
      const normalizedMarkdown = lastEditorMarkdownRef.current
      if (markdown === normalizedMarkdown) {
        cacheMarkdownForAisleBody(aisleId, normalizedMarkdown)
        syncMountedLinkedAisleEditors(aisleId, normalizedMarkdown)
        scheduleContentCommit(
          normalizedMarkdown,
          activeSpaceIdRef.current,
          activeTabIdRef.current,
          activeSubTabIdRef.current,
          aisleId,
          { aisleBodyId: getAisleBodyIdForAisleId(aisleId), noteBodyId: activeNoteBodyIdRef.current },
        )
        return
      }
    }

    maybeShowCompletedTaskUndoHint(markdown)
    lastEditorMarkdownRef.current = markdown
    cacheMarkdownForAisleBody(aisleId, markdown)
    syncMountedLinkedAisleEditors(aisleId, markdown)
    scheduleContentCommit(
      markdown,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      aisleId,
      { aisleBodyId: getAisleBodyIdForAisleId(aisleId), noteBodyId: activeNoteBodyIdRef.current },
    )
  })

  const commitAisleEditorMarkdown = (aisleId: string, committedEditor: Editor) => {
    const markdown = getNormalizedEditorMarkdown(committedEditor)
    lastEditorMarkdownRef.current = markdown
    cacheMarkdownForAisleBody(aisleId, markdown)
    syncMountedLinkedAisleEditors(aisleId, markdown)
    scheduleContentCommit(
      markdown,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      aisleId,
      { aisleBodyId: getAisleBodyIdForAisleId(aisleId), noteBodyId: activeNoteBodyIdRef.current },
    )
  }

  const captureAisleEditorContent = (meta: AisleEditorMeta) => measureSlowOperation(`aisle editor content capture:${meta.aisleId}`, () => {
    const cachedMarkdown = getCachedMarkdownForAisle(meta.aisleId)
    const fallbackMarkdown = cachedMarkdown ?? normalizeMarkdownForPersistence(getAisleById(meta.aisleId)?.markdown ?? '')
    const markdown = getSnapshotEditorMarkdown(meta.editor, fallbackMarkdown, getNormalizedEditorMarkdown)
    cacheMarkdownForAisleBody(meta.aisleId, markdown)
    if (activeAisleIdRef.current === meta.aisleId) {
      lastEditorMarkdownRef.current = markdown
    }
    scheduleContentCommit(
      markdown,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      meta.aisleId,
      { aisleBodyId: getAisleBodyIdForAisleId(meta.aisleId), noteBodyId: activeNoteBodyIdRef.current },
    )
  })

  const collectMountedEditorSnapshots = (): EditorContentSnapshot[] => measureSlowOperation('mounted aisle editor snapshot collection', () => {
    if (viewMode !== 'main' || !activeNoteBodyIdRef.current) return []
    const snapshots: EditorContentSnapshot[] = []
    aisleEditorMetaRef.current.forEach((meta) => {
      const aisleBodyId = getAisleBodyIdForAisleId(meta.aisleId)
      const cachedMarkdown = getCachedMarkdownForAisle(meta.aisleId)
      const fallbackMarkdown = cachedMarkdown ?? normalizeMarkdownForPersistence(getAisleById(meta.aisleId)?.markdown ?? '')
      const markdown = getSnapshotEditorMarkdown(meta.editor, fallbackMarkdown, getNormalizedEditorMarkdown)
      cacheMarkdownForAisleBody(meta.aisleId, markdown)
      if (activeAisleIdRef.current === meta.aisleId) {
        lastEditorMarkdownRef.current = markdown
      }
      snapshots.push({
        noteBodyId: activeNoteBodyIdRef.current,
        spaceId: activeSpaceIdRef.current,
        tabId: activeTabIdRef.current,
        subTabId: activeSubTabIdRef.current,
        aisleId: meta.aisleId,
        aisleBodyId,
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
        captureContent: options.captureContent === true,
        activeEditorAisleId: activeEditorAisleIdRef.current,
        mountedEditorCount: aisleEditorMetaRef.current.size,
      },
    })
    if (options.captureContent) {
      captureAisleEditorContent(meta)
    }
    meta.cleanup()
    aisleEditorMetaRef.current.delete(editorKey)
    normalizingAisleIdsRef.current.delete(meta.aisleId)
    if (editorRef.current === meta.editor) {
      editorRef.current = null
      activeEditorAisleIdRef.current = ''
      multiLineCursorPluginKeyRef.current = null
    }
  }

  const destroyAllAisleEditors = () => {
    Array.from(aisleEditorMetaRef.current.keys()).forEach((editorKey) => destroyAisleEditor(editorKey))
  }

  useEffect(
    () => registerMountedEditorSnapshotProvider(collectMountedEditorSnapshots),
    [registerMountedEditorSnapshotProvider],
  )

  useEffect(() => {
    if (idleUnmountTimerRef.current !== null) {
      window.clearTimeout(idleUnmountTimerRef.current)
      idleUnmountTimerRef.current = null
    }

    setRetainedAisleIds((currentIds) => {
      const nextIds = new Set([...currentIds, ...desiredMountedAisleIds])
      return nextIds.size === currentIds.size && Array.from(nextIds).every((aisleId) => currentIds.has(aisleId))
        ? currentIds
        : nextIds
    })

    idleUnmountTimerRef.current = window.setTimeout(() => {
      idleUnmountTimerRef.current = null
      setRetainedAisleIds(new Set(desiredMountedAisleIds))
    }, AISLE_EDITOR_IDLE_UNMOUNT_MS)

    return () => {
      if (idleUnmountTimerRef.current !== null) {
        window.clearTimeout(idleUnmountTimerRef.current)
        idleUnmountTimerRef.current = null
      }
    }
  }, [desiredMountedAisleIds])

  useEffect(() => {
    if (viewMode !== 'main' || !activeNoteBodyId) {
      setNearVisibleAisleIds(new Set())
      setRetainedAisleIds(new Set())
      setRecentAisleIds([])
      return
    }

    const scrollRoot = aisleScrollRef.current
    if (!scrollRoot || typeof IntersectionObserver === 'undefined') {
      setNearVisibleAisleIds(new Set(activeAisleIds))
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
  }, [viewMode, activeNoteBodyId, activeAisleIds, aisleScrollRef])

  useEffect(() => {
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

      const initialMarkdown = getLatestMarkdownForAisle(aisle)
      let pluginKey: unknown = null
      const editor = new Editor({
        el: root,
        initialValue: prepareMarkdownForEditorDisplay(initialMarkdown),
        initialEditType: 'wysiwyg',
        previewStyle: 'tab',
        hideModeSwitch: true,
        customHTMLSanitizer: sanitizeEditorHtml,
        toolbarItems: EDITOR_TOOLBAR_ITEMS,
        height: '100%',
        autofocus: false,
        usageStatistics: false,
        plugins: [
          listMarkerPlugin,
          blockIndentPlugin,
          annotationLinePlugin,
          tagAppearancePlugin,
          highlightPlugin,
          codeBlockBacktickShortcutPlugin,
          terminalBlockLandingPlugin,
          createMediaLinkPlugin,
          createCodeBlockControlsPlugin({ pushToast }),
          (context: any) =>
            headingCollapsePlugin(context, {
              aisleId: aisle.id,
              getCollapsedHeadingKeys: (targetAisleId) =>
                getCollapsedHeadingKeysForAisle(headingCollapseStateRef.current, activeNoteBodyId, targetAisleId),
              getMarkdown: (targetAisleId) =>
                getCachedMarkdownForAisle(targetAisleId) ??
                normalizeMarkdownForPersistence(getAisleById(targetAisleId)?.markdown ?? aisle.markdown),
              onToggleHeading: onToggleHeadingCollapse,
              onExpandHeading: onExpandHeadingCollapse,
            }),
          uncheckedTaskEnterPlugin,
          headingSpaceShortcutPlugin,
          thematicBreakShortcutPlugin,
          (context: any) =>
            createNotePreviewPlugin(context, {
              sourceNoteBodyId: activeNoteBodyId,
              getNotePreviewData,
              resolvePreviewToken,
              resolveInternalNoteReferenceToken,
              navigateToNoteLocation,
              deleteNotePreview,
            }),
          (context: any) =>
            multiLineSelectionShortcutPlugin({
              ...context,
              onExpand: tryExpandMultilineSelection,
              onPluginKeyReady: (nextPluginKey) => {
                pluginKey = nextPluginKey
              },
            }),
        ],
        hooks: {
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
        },
        events: {
          change: () => handleAisleEditorChange(editorKey, aisle.id, editor),
          focus: () => activateAisleEditor(editorKey, { flushPrevious: true, source: 'focus' }),
        },
      })
      const activateFromFocus = () => activateAisleEditor(editorKey, { flushPrevious: true, source: 'focus' })
      const activateFromPointer = () => activateAisleEditor(editorKey, { flushPrevious: true, source: 'pointer' })
      root.addEventListener('focusin', activateFromFocus)
      root.addEventListener('pointerdown', activateFromPointer, true)
      const cleanupImageDisplayMetadataSync = installImageDisplayMetadataSync(root)
      const cleanupToolbarAppTooltips = installToolbarAppTooltips(root)
      const cleanupHeadingPopupActiveState = installHeadingPopupActiveState(root, () => editor)
      const cleanupCompletedTaskCheckboxBehavior = installCompletedTaskCheckboxBehavior(
        root,
        () => editor,
        trackCompletedTaskQuickDelete,
        (committedEditor) => commitAisleEditorMarkdown(aisle.id, committedEditor),
      )
      const cleanupTaskTextReorderBehavior = installTaskTextReorderBehavior(root, () => editor, {
        onReorderCommitted: (committedEditor) => {
          pendingCursorRestoreRef.current = null
          commitAisleEditorMarkdown(aisle.id, committedEditor)
        },
      })

      aisleEditorMetaRef.current.set(editorKey, {
        editor,
        root,
        aisleId: aisle.id,
        pluginKey,
        cleanup: () => {
          cleanupImageDisplayMetadataSync()
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
      recordDiagnosticEvent('aisle-editor', 'mount', {
        details: {
          editorKey,
          aisleId: aisle.id,
          noteBodyId: activeNoteBodyId,
          mountedEditorCount: aisleEditorMetaRef.current.size,
          pendingFocusAfterMount: pendingFocusAfterMountAisleIdRef.current === aisle.id,
        },
      })
      restoreEditorBlankParagraphs(editor, initialMarkdown)
      markWysiwygLoadedUndoBoundary(editor)
      cacheMarkdownForAisleBody(aisle.id, normalizeMarkdownForPersistence(initialMarkdown))

      if (pendingFocusAfterMountAisleIdRef.current === aisle.id) {
        pendingFocusAfterMountAisleIdRef.current = null
        activateAisleEditor(editorKey, { focus: true })
      }

      window.requestAnimationFrame(() => {
        runPendingHeadingScroll()
        runPendingLinkScroll()
      })
    }

    const activeEditorKey = buildAisleEditorKey(activeNoteBodyId, resolvedActiveAisleId)
    if (aisleEditorMetaRef.current.has(activeEditorKey)) {
      activateAisleEditor(activeEditorKey)
    }
  }, [viewMode, activeNoteBodyId, activeNoteAisles, resolvedActiveAisleId, mountedAisleIdsKey])

  useEffect(() => {
    if (viewMode !== 'main' || !activeNoteBodyId) return
    aisleEditorMetaRef.current.forEach((meta) => {
      const view = getWysiwygView(meta.editor)
      if (!view?.state?.tr) return
      view.dispatch(view.state.tr.setMeta('headingCollapseRefresh', true).setMeta('addToHistory', false))
    })
  }, [viewMode, activeNoteBodyId, headingCollapseState])

  useEffect(() => () => destroyAllAisleEditors(), [])

  useEffect(() => {
    if (viewMode !== 'main' || !activeNoteBodyId) return
    for (const aisle of activeNoteAisles) {
      const editorKey = buildAisleEditorKey(activeNoteBodyId, aisle.id)
      const meta = aisleEditorMetaRef.current.get(editorKey)
      if (!meta) continue
      const pending = getPendingContentForAisle(aisle)
      const cachedMarkdown = getCachedMarkdownForAisle(aisle.id)
      const expectedMarkdown = pending?.markdown ?? cachedMarkdown ?? aisle.markdown
      const currentMarkdown = getNormalizedEditorMarkdown(meta.editor)
      if (currentMarkdown !== expectedMarkdown) {
        const normalizedExpectedMarkdown = normalizeMarkdownForPersistence(expectedMarkdown)
        cacheMarkdownForAisleBody(aisle.id, normalizedExpectedMarkdown)
        if (activeAisleIdRef.current === aisle.id) {
          lastEditorMarkdownRef.current = normalizedExpectedMarkdown
        }
        normalizingAisleIdsRef.current.add(aisle.id)
        setEditorMarkdownForDisplay(meta.editor, expectedMarkdown)
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
