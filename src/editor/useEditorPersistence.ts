import type { Editor } from '@toast-ui/editor'
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { getAisleBodyId, getNoteBodyMarkdown } from '../notes/aisle-body-state'
import { measureSlowOperation } from '../performance/performance-logging'
import { applyAutoPurgeToAppState, applyMarkdownToAppState } from '../state/app-state'
import { SCRATCHPAD_CONTENT_TARGET_ID, normalizeScratchpadState } from '../state/scratchpad'
import { appPersistenceService } from '../storage/app-persistence-service'
import type { AppStateSaveOptions } from '../storage/persistence-debounce'
import { markEditorContentStateMutation } from '../storage/persistence-scheduling'
import type { AppState, NoteBody, PendingContent } from '../types/app'
import { isCodeMirrorMarkdownEditor } from './codemirror-markdown-editor'
import { isLexicalMarkdownEditor } from './lexical-markdown-editor'
import { setEditorMarkdownForDisplay } from './editor-markdown-display'
import {
  getAisleEditorPerfNow,
  withAisleEditorPerfState,
} from '../perf/aisle-editor-perf-state'

type UseEditorPersistenceParams = {
  stateRef: MutableRefObject<AppState>
  setState: Dispatch<SetStateAction<AppState>>
  editorRef: MutableRefObject<Editor | null>
  activeSpaceIdRef: MutableRefObject<string>
  activeTabIdRef: MutableRefObject<string>
  activeSubTabIdRef: MutableRefObject<string | null>
  activeAisleIdRef: MutableRefObject<string>
  isMainViewRef: MutableRefObject<boolean>
  activeNoteBody: NoteBody | null
  resolvedActiveAisleId: string
  getNormalizedEditorMarkdown: (editor: Editor) => string
  applyActiveCursorToState: (previous: AppState) => AppState
}

export type FlushPendingContentOptions = {
  captureActiveTableEditorSnapshot?: boolean
}

export function getSnapshotEditorMarkdown(
  editor: Editor | null,
  fallbackMarkdown: string,
  getNormalizedEditorMarkdown: (editor: Editor) => string,
) {
  if (!editor) return fallbackMarkdown
  try {
    return measureSlowOperation('editor snapshot markdown normalization', () => getNormalizedEditorMarkdown(editor))
  } catch {
    return fallbackMarkdown
  }
}

export function shouldUseCachedReadonlyLexicalSnapshot(editor: Editor | null, cachedMarkdown: string | undefined): boolean {
  return (
    typeof cachedMarkdown === 'string' &&
    isLexicalMarkdownEditor(editor) &&
    !editor.isEditable() &&
    !editor.hasPendingMarkdownChanges()
  )
}

export type EditorContentTarget = {
  noteBodyId?: string | null
  spaceId: string
  tabId: string
  subTabId: string | null
  aisleId: string
  aisleBodyId?: string | null
}

export type EditorContentSnapshot = EditorContentTarget & {
  noteBodyId: string
  aisleBodyId: string
  markdown: string
}

export type MountedEditorSnapshotProvider = () => EditorContentSnapshot[]
export type PendingContentDraft = PendingContent & {
  resolveMarkdown?: () => string
  onMaterialized?: (markdown: string) => void
}
export type PendingContentMap = Map<string, PendingContentDraft>
export type LazyContentCommitOptions = {
  aisleBodyId?: string | null
  noteBodyId?: string | null
  fallbackAlreadyNormalized?: boolean
  onMaterialized?: (markdown: string) => void
}
export type KnownMarkdownDraftCommitOptions = {
  aisleBodyId?: string | null
  noteBodyId?: string | null
  onMaterialized?: (markdown: string) => void
}
export type EditorFocusBoundaryEvent = 'blur' | 'visibilitychange' | 'beforeunload' | 'pagehide'
export type EditorFocusBoundaryFlushAction = 'schedule' | 'force' | 'ignore'

export const EDITOR_FOCUS_BOUNDARY_FLUSH_DELAY_MS = 60
export const EDITOR_PENDING_CONTENT_COMMIT_DELAY_MS = 180

export function resolveEditorFocusBoundaryFlushAction(
  eventName: EditorFocusBoundaryEvent,
  scheduledTimerId: number | null,
  visibilityState = 'visible',
): EditorFocusBoundaryFlushAction {
  if (eventName === 'beforeunload' || eventName === 'pagehide') return 'force'
  if (eventName === 'visibilitychange' && visibilityState !== 'hidden') return 'ignore'
  return scheduledTimerId === null ? 'schedule' : 'ignore'
}

export function getEditorFocusBoundarySaveOptions(
  eventName: EditorFocusBoundaryEvent,
  pendingEditorCount = 0,
): AppStateSaveOptions {
  return {
    preferSync: eventName === 'beforeunload' || eventName === 'pagehide',
    trigger: `editor-focus-boundary:${eventName}`,
    pendingEditorCount,
  }
}

export function shouldCollectMountedEditorSnapshotsForFocusBoundary(
  eventName: EditorFocusBoundaryEvent,
): boolean {
  return eventName === 'beforeunload' || eventName === 'pagehide'
}

export function shouldPersistFocusBoundarySnapshot({
  eventName,
  pendingEditorCount,
  stateChanged,
}: {
  eventName: EditorFocusBoundaryEvent
  pendingEditorCount: number
  stateChanged: boolean
}): boolean {
  if (eventName === 'beforeunload' || eventName === 'pagehide') return true
  return stateChanged || pendingEditorCount > 0
}

function hasMarkdownTable(markdown: string): boolean {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = lines[index].trim()
    const delimiter = lines[index + 1].trim()
    if (!header.startsWith('|') || !header.endsWith('|')) continue
    if (!delimiter.startsWith('|') || !delimiter.endsWith('|')) continue
    const delimiterCells = delimiter.slice(1, -1).split('|')
    if (delimiterCells.length < 1) continue
    if (delimiterCells.every((cell) => /^:?-{3,}:?$/.test(cell.trim().replace(/\s+/g, '')))) {
      return true
    }
  }
  return false
}

export function shouldCaptureActiveEditorSnapshotOnCleanFlush(
  markdown: string,
  options: FlushPendingContentOptions = {},
): boolean {
  return options.captureActiveTableEditorSnapshot === true && hasMarkdownTable(markdown)
}

export function pendingContentMatchesTarget(pending: PendingContent, target: EditorContentTarget): boolean {
  if (pending.noteBodyId && target.noteBodyId && pending.noteBodyId !== target.noteBodyId) return false
  return (
    Boolean(pending.aisleBodyId && target.aisleBodyId && pending.aisleBodyId === target.aisleBodyId) ||
    (
      pending.spaceId === target.spaceId &&
      pending.tabId === target.tabId &&
      pending.subTabId === target.subTabId &&
      pending.aisleId === target.aisleId
    )
  )
}

export function materializePendingContentDraft(
  pending: PendingContentDraft,
  normalizeMarkdown: (markdown: string) => string = normalizeMarkdownForPersistence,
): PendingContent {
  const { resolveMarkdown, onMaterialized, ...snapshot } = pending
  if (typeof resolveMarkdown !== 'function') return snapshot
  try {
    const markdown = normalizeMarkdown(resolveMarkdown())
    onMaterialized?.(markdown)
    return {
      ...snapshot,
      markdown,
    }
  } catch {
    return snapshot
  }
}

export function createKnownMarkdownPendingContentDraft(
  snapshot: EditorContentSnapshot,
  onMaterialized?: (markdown: string) => void,
): PendingContentDraft {
  const markdown = snapshot.markdown
  return {
    ...snapshot,
    resolveMarkdown: () => markdown,
    onMaterialized,
  }
}

export function normalizeLazyContentFallbackMarkdown(
  markdown: string,
  options: Pick<LazyContentCommitOptions, 'fallbackAlreadyNormalized'> = {},
  normalizeMarkdown: (value: string) => string = normalizeMarkdownForPersistence,
): string {
  return options.fallbackAlreadyNormalized === true ? markdown : normalizeMarkdown(markdown)
}

function getLocationNoteBodyId(sourceState: AppState, target: EditorContentTarget): string | null {
  if (target.spaceId === SCRATCHPAD_CONTENT_TARGET_ID && target.tabId === SCRATCHPAD_CONTENT_TARGET_ID) {
    return normalizeScratchpadState(sourceState.scratchpad).noteBodyId
  }
  const space = sourceState.spaces.find((candidate) => candidate.id === target.spaceId)
  const tab = space?.data.tabs.find((candidate) => candidate.id === target.tabId)
  if (!tab) return null
  if (target.subTabId === null) return tab.noteBodyId
  return tab.subTabs.find((candidate) => candidate.id === target.subTabId)?.noteBodyId ?? null
}

export function isEditorContentTargetCurrent(sourceState: AppState, target: EditorContentTarget): boolean {
  const locationNoteBodyId = getLocationNoteBodyId(sourceState, target)
  if (!locationNoteBodyId) return false
  if (target.noteBodyId && target.noteBodyId !== locationNoteBodyId) return false
  const noteBody = sourceState.noteBodies.find((candidate) => candidate.id === locationNoteBodyId)
  if (!noteBody) return false
  if (target.aisleBodyId) {
    return noteBody.aisles.some((aisle) => getAisleBodyId(aisle) === target.aisleBodyId)
  }
  if (target.aisleId) {
    return noteBody.aisles.some((aisle) => aisle.id === target.aisleId)
  }
  return true
}

export function applyEditorContentSnapshotsToState(
  sourceState: AppState,
  snapshots: EditorContentSnapshot[],
): AppState {
  const snapshotsByAisleBodyId = new Map<string, EditorContentSnapshot>()
  for (const snapshot of snapshots) {
    if (!snapshot.aisleBodyId || !isEditorContentTargetCurrent(sourceState, snapshot)) continue
    snapshotsByAisleBodyId.set(snapshot.aisleBodyId, snapshot)
  }

  let nextState = sourceState
  let markdownApplyDurationMs = 0
  const shouldMeasurePerf = import.meta.env?.DEV
  snapshotsByAisleBodyId.forEach((snapshot) => {
    const started = shouldMeasurePerf ? getAisleEditorPerfNow() : 0
    nextState = applyMarkdownToAppState(
      nextState,
      snapshot.spaceId,
      snapshot.tabId,
      snapshot.subTabId,
      snapshot.aisleId,
      snapshot.markdown,
      { aisleBodyId: snapshot.aisleBodyId },
    )
    if (shouldMeasurePerf) {
      markdownApplyDurationMs += getAisleEditorPerfNow() - started
    }
  })
  if (shouldMeasurePerf) {
    withAisleEditorPerfState((state) => {
      state.lastApplyMarkdownToAppStateDurationMs = markdownApplyDurationMs
    })
  }
  return nextState
}

export function applyFreshEditorSnapshotToState(
  sourceState: AppState,
  target: EditorContentTarget,
  markdown: string,
  pending: PendingContent | null | undefined,
): AppState {
  if (!target.noteBodyId || !target.aisleBodyId) return sourceState
  const snapshots: EditorContentSnapshot[] = [{
    noteBodyId: target.noteBodyId,
    spaceId: target.spaceId,
    tabId: target.tabId,
    subTabId: target.subTabId,
    aisleId: target.aisleId,
    aisleBodyId: target.aisleBodyId,
    markdown,
  }]
  if (pending && !pendingContentMatchesTarget(pending, target)) {
    snapshots.unshift(pending)
  }
  return applyEditorContentSnapshotsToState(sourceState, snapshots)
}

export const useEditorPersistence = ({
  stateRef,
  setState,
  editorRef,
  activeSpaceIdRef,
  activeTabIdRef,
  activeSubTabIdRef,
  activeAisleIdRef,
  isMainViewRef,
  activeNoteBody,
  resolvedActiveAisleId,
  getNormalizedEditorMarkdown,
  applyActiveCursorToState,
}: UseEditorPersistenceParams) => {
  const pendingContentRef = useRef<PendingContentMap>(new Map())
  const mountedEditorSnapshotProviderRef = useRef<MountedEditorSnapshotProvider | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const focusBoundaryFlushTimerRef = useRef<number | null>(null)
  const lastEditorMarkdownRef = useRef('')
  const lastEditorMarkdownByAisleRef = useRef<Map<string, string>>(new Map())
  const normalizingContentRef = useRef(false)
  const normalizingAisleIdsRef = useRef<Set<string>>(new Set())

  const getAisleBodyIdForAisleId = (aisleId: string) => {
    const aisle = activeNoteBody?.aisles.find((candidate) => candidate.id === aisleId)
    return aisle ? getAisleBodyId(aisle) : aisleId
  }

  const getActiveContentTarget = () => ({
    noteBodyId: activeNoteBody?.id ?? '',
    spaceId: activeSpaceIdRef.current,
    tabId: activeTabIdRef.current,
    subTabId: activeSubTabIdRef.current,
    aisleId: activeAisleIdRef.current,
    aisleBodyId: getAisleBodyIdForAisleId(activeAisleIdRef.current),
  })

  const getPendingContentSnapshots = () => measureSlowOperation('editor pending content materialization', () =>
    Array.from(pendingContentRef.current.values()).map((pending) => {
      const snapshot = materializePendingContentDraft(pending)
      if (snapshot.aisleId === activeAisleIdRef.current) {
        lastEditorMarkdownRef.current = snapshot.markdown
      }
      lastEditorMarkdownByAisleRef.current.set(snapshot.aisleBodyId, snapshot.markdown)
      return snapshot
    }))

  const getFallbackActiveEditorSnapshot = (): EditorContentSnapshot[] => {
    if (!isMainViewRef.current || !editorRef.current || !activeNoteBody?.id) return []
    const currentEditor = editorRef.current
    const target = getActiveContentTarget()
    if (!target.aisleBodyId) return []
    const markdown = getSnapshotEditorMarkdown(currentEditor, lastEditorMarkdownRef.current, getNormalizedEditorMarkdown)
    lastEditorMarkdownRef.current = markdown
    lastEditorMarkdownByAisleRef.current.set(target.aisleBodyId, markdown)
    return [{ ...target, noteBodyId: activeNoteBody.id, aisleBodyId: target.aisleBodyId, markdown }]
  }

  const getMountedEditorSnapshots = () => measureSlowOperation('mounted editor snapshot provider', () => {
    const snapshots = mountedEditorSnapshotProviderRef.current?.() ?? []
    return snapshots.length > 0 ? snapshots : getFallbackActiveEditorSnapshot()
  })

  const buildLatestContentSnapshots = ({ includeMountedEditors = true } = {}) => [
    ...getPendingContentSnapshots(),
    ...(includeMountedEditors ? getMountedEditorSnapshots() : []),
  ]

  const applyContentSnapshots = (snapshots: EditorContentSnapshot[]) => {
    if (snapshots.length === 0) return
    const shouldMeasurePerf = import.meta.env?.DEV
    const startedAt = shouldMeasurePerf ? getAisleEditorPerfNow() : 0
    const snapshotCountsByAisleBodyId: Record<string, number> = {}
    if (shouldMeasurePerf) {
      snapshots.forEach((snapshot) => {
        const currentCount = snapshotCountsByAisleBodyId[snapshot.aisleBodyId] ?? 0
        snapshotCountsByAisleBodyId[snapshot.aisleBodyId] = currentCount + 1
      })
    }
    setState((previous) => {
      const applyStartedAt = shouldMeasurePerf ? getAisleEditorPerfNow() : 0
      const nextState = applyEditorContentSnapshotsToState(previous, snapshots)
      if (nextState !== previous) {
        markEditorContentStateMutation()
      }
      if (shouldMeasurePerf) {
        const applyDurationMs = getAisleEditorPerfNow() - applyStartedAt
        withAisleEditorPerfState((state) => {
          state.lastApplyEditorContentSnapshotsDurationMs = applyDurationMs
        })
      }
      return nextState
    })
    if (shouldMeasurePerf) {
      const endedAt = getAisleEditorPerfNow()
      withAisleEditorPerfState((state) => {
        state.flushCount += 1
        state.lastFlushStartedAt = startedAt
        state.lastFlushEndedAt = endedAt
        state.lastFlushDurationMs = endedAt - startedAt
        state.snapshotsApplied += snapshots.length
        state.snapshotsByAisleBodyId = snapshotCountsByAisleBodyId
        state.pendingMapSize = pendingContentRef.current.size
        state.pendingAisleBodyIds = Array.from(pendingContentRef.current.keys())
        state.contentCommitTimerArmed = false
        state.lastPendingUpdateAt = endedAt
      })
    }
  }

  const buildStateWithLatestEditorContent = ({ includeMountedEditors = true } = {}) => {
    const nextState = applyEditorContentSnapshotsToState(
      stateRef.current,
      buildLatestContentSnapshots({ includeMountedEditors }),
    )

    if (!isMainViewRef.current) return applyAutoPurgeToAppState(nextState)
    if (!editorRef.current) return applyActiveCursorToState(applyAutoPurgeToAppState(nextState))
    return applyActiveCursorToState(applyAutoPurgeToAppState(nextState))
  }

  const persistStateSnapshot = (
    latestState: AppState,
    options: AppStateSaveOptions = { preferSync: true },
  ) => {
    const serializedState = measureSlowOperation('app-state serialization', () => JSON.stringify(latestState))
    appPersistenceService.saveSerializedState(serializedState, {
      ...options,
      trigger: options.trigger ?? 'editor-state-snapshot',
    })
    void appPersistenceService.flushPendingSaves?.()
  }

  const persistLatestStateSnapshot = (options: AppStateSaveOptions = { preferSync: true }) => {
    persistStateSnapshot(buildStateWithLatestEditorContent(), options)
  }

  const clearPendingSaveTimer = () => {
    if (saveTimerRef.current === null) return
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    if (import.meta.env?.DEV) {
      withAisleEditorPerfState((state) => {
        state.contentCommitTimerArmed = false
      })
    }
  }

  const cancelFocusBoundaryFlush = () => {
    if (focusBoundaryFlushTimerRef.current === null) return
    window.clearTimeout(focusBoundaryFlushTimerRef.current)
    focusBoundaryFlushTimerRef.current = null
  }

  const flushAndPersistFocusBoundarySnapshot = (eventName: EditorFocusBoundaryEvent) => measureSlowOperation('editor focus-boundary persistence flush', () => {
    clearPendingSaveTimer()
    const pendingEditorCount = pendingContentRef.current.size
    const previousState = stateRef.current
    const latestState = buildStateWithLatestEditorContent({
      includeMountedEditors: shouldCollectMountedEditorSnapshotsForFocusBoundary(eventName),
    })
    const stateChanged = latestState !== previousState
    pendingContentRef.current.clear()
    if (stateChanged) setState(latestState)
    if (!shouldPersistFocusBoundarySnapshot({ eventName, pendingEditorCount, stateChanged })) return
    persistStateSnapshot(latestState, getEditorFocusBoundarySaveOptions(eventName, pendingEditorCount))
  })

  const scheduleFocusBoundaryFlush = (eventName: Extract<EditorFocusBoundaryEvent, 'blur' | 'visibilitychange'>) => {
    const action = resolveEditorFocusBoundaryFlushAction(
      eventName,
      focusBoundaryFlushTimerRef.current,
      typeof document === 'undefined' ? 'visible' : document.visibilityState,
    )
    if (action !== 'schedule') return
    focusBoundaryFlushTimerRef.current = window.setTimeout(() => {
      focusBoundaryFlushTimerRef.current = null
      flushAndPersistFocusBoundarySnapshot(eventName)
    }, EDITOR_FOCUS_BOUNDARY_FLUSH_DELAY_MS)
  }

  const flushPendingContent = (options: FlushPendingContentOptions = {}) => measureSlowOperation('editor pending content flush', () => {
    clearPendingSaveTimer()
    if (pendingContentRef.current.size === 0) {
      if (isCodeMirrorMarkdownEditor(editorRef.current) || isLexicalMarkdownEditor(editorRef.current)) return
      const activeMarkdown = lastEditorMarkdownRef.current || getNoteBodyMarkdown(activeNoteBody, activeAisleIdRef.current)
      if (!shouldCaptureActiveEditorSnapshotOnCleanFlush(activeMarkdown, options)) return
      const snapshots = getFallbackActiveEditorSnapshot()
      applyContentSnapshots(snapshots)
      return
    }

    const snapshots = getPendingContentSnapshots()
    if (import.meta.env?.DEV) {
      withAisleEditorPerfState((state) => {
        state.pendingMapSize = 0
        state.pendingAisleBodyIds = []
        state.contentCommitTimerArmed = false
      })
    }
    pendingContentRef.current.clear()
    applyContentSnapshots(snapshots)
  })

  const armPendingContentSaveTimer = () => {
    if (import.meta.env?.DEV) {
      withAisleEditorPerfState((state) => {
        const now = getAisleEditorPerfNow()
        state.lastPendingUpdateAt = now
        state.pendingMapSize = pendingContentRef.current.size
        state.pendingAisleBodyIds = Array.from(pendingContentRef.current.keys())
        state.contentCommitTimerArmed = true
      })
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      const snapshots = getPendingContentSnapshots()
      pendingContentRef.current.clear()
      applyContentSnapshots(snapshots)
    }, EDITOR_PENDING_CONTENT_COMMIT_DELAY_MS)
  }

  const scheduleContentCommit = (
    markdown: string,
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
    options: { aisleBodyId?: string | null; noteBodyId?: string | null } = {},
  ) => {
    const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
    const explicitAisleBodyId = typeof options.aisleBodyId === 'string' && options.aisleBodyId.trim()
      ? options.aisleBodyId.trim()
      : null
    const aisleBodyId = explicitAisleBodyId ?? getAisleBodyIdForAisleId(aisleId)
    const noteBodyId = typeof options.noteBodyId === 'string' && options.noteBodyId.trim()
      ? options.noteBodyId.trim()
      : activeNoteBody?.id ?? ''
    if (!noteBodyId || !aisleBodyId) return
    if (aisleId === activeAisleIdRef.current) {
      lastEditorMarkdownRef.current = normalizedMarkdown
    }
    lastEditorMarkdownByAisleRef.current.set(aisleBodyId, normalizedMarkdown)
    pendingContentRef.current.set(aisleBodyId, {
      noteBodyId,
      spaceId,
      tabId,
      subTabId,
      aisleId,
      aisleBodyId,
      markdown: normalizedMarkdown,
    })

    armPendingContentSaveTimer()
  }

  const scheduleKnownMarkdownDraftCommit = (
    markdown: string,
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
    options: KnownMarkdownDraftCommitOptions = {},
  ) => {
    const explicitAisleBodyId = typeof options.aisleBodyId === 'string' && options.aisleBodyId.trim()
      ? options.aisleBodyId.trim()
      : null
    const aisleBodyId = explicitAisleBodyId ?? getAisleBodyIdForAisleId(aisleId)
    const noteBodyId = typeof options.noteBodyId === 'string' && options.noteBodyId.trim()
      ? options.noteBodyId.trim()
      : activeNoteBody?.id ?? ''
    if (!noteBodyId || !aisleBodyId) return
    if (aisleId === activeAisleIdRef.current) {
      lastEditorMarkdownRef.current = markdown
    }
    lastEditorMarkdownByAisleRef.current.set(aisleBodyId, markdown)
    pendingContentRef.current.set(aisleBodyId, createKnownMarkdownPendingContentDraft({
      noteBodyId,
      spaceId,
      tabId,
      subTabId,
      aisleId,
      aisleBodyId,
      markdown,
    }, options.onMaterialized))

    armPendingContentSaveTimer()
  }

  const scheduleLazyContentCommit = (
    editor: Editor,
    fallbackMarkdown: string,
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
    options: LazyContentCommitOptions = {},
  ) => {
    const fallbackNormalizedMarkdown = normalizeLazyContentFallbackMarkdown(fallbackMarkdown, options)
    const explicitAisleBodyId = typeof options.aisleBodyId === 'string' && options.aisleBodyId.trim()
      ? options.aisleBodyId.trim()
      : null
    const aisleBodyId = explicitAisleBodyId ?? getAisleBodyIdForAisleId(aisleId)
    const noteBodyId = typeof options.noteBodyId === 'string' && options.noteBodyId.trim()
      ? options.noteBodyId.trim()
      : activeNoteBody?.id ?? ''
    if (!noteBodyId || !aisleBodyId) return

    pendingContentRef.current.set(aisleBodyId, {
      noteBodyId,
      spaceId,
      tabId,
      subTabId,
      aisleId,
      aisleBodyId,
      markdown: fallbackNormalizedMarkdown,
      resolveMarkdown: () => getNormalizedEditorMarkdown(editor),
      onMaterialized: options.onMaterialized,
    })

    armPendingContentSaveTimer()
  }

  const commitCurrentEditorContent = () => {
    if (!isMainViewRef.current) return
    const currentEditor = editorRef.current
    if (!currentEditor) return
    const markdown = getNormalizedEditorMarkdown(currentEditor)
    const activeAisleBodyId = getAisleBodyIdForAisleId(activeAisleIdRef.current)
    lastEditorMarkdownRef.current = markdown
    lastEditorMarkdownByAisleRef.current.set(activeAisleBodyId, markdown)
    scheduleContentCommit(
      markdown,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
    )
  }

  const commitActiveEditorMarkdownNow = (editor: Editor) => {
    const normalized = getNormalizedEditorMarkdown(editor)
    const activeAisleBodyId = getAisleBodyIdForAisleId(activeAisleIdRef.current)
    lastEditorMarkdownRef.current = normalized
    lastEditorMarkdownByAisleRef.current.set(activeAisleBodyId, normalized)
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const siblingPendingSnapshots = getPendingContentSnapshots()
      .filter((snapshot) => snapshot.aisleBodyId !== activeAisleBodyId)
    pendingContentRef.current.clear()
    applyContentSnapshots([...siblingPendingSnapshots, {
      noteBodyId: activeNoteBody?.id ?? '',
      spaceId: activeSpaceIdRef.current,
      tabId: activeTabIdRef.current,
      subTabId: activeSubTabIdRef.current,
      aisleId: activeAisleIdRef.current,
      aisleBodyId: activeAisleBodyId,
      markdown: normalized,
    }])
    return normalized
  }

  const replaceActiveEditorMarkdown = (markdown: string) => {
    const normalized = normalizeMarkdownForPersistence(markdown)
    const activeAisleBodyId = getAisleBodyIdForAisleId(activeAisleIdRef.current)
    lastEditorMarkdownRef.current = normalized
    lastEditorMarkdownByAisleRef.current.set(activeAisleBodyId, normalized)
    const currentEditor = editorRef.current
    if (currentEditor) {
      if (isCodeMirrorMarkdownEditor(currentEditor) || isLexicalMarkdownEditor(currentEditor)) {
        currentEditor.setMarkdown(normalized, false)
      } else {
        setEditorMarkdownForDisplay(currentEditor, normalized)
      }
    }
    if (currentEditor) {
      commitActiveEditorMarkdownNow(currentEditor)
      return
    }
    scheduleContentCommit(
      normalized,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
    )
  }

  const getActiveEditorMarkdown = () =>
    editorRef.current ? getNormalizedEditorMarkdown(editorRef.current) : getNoteBodyMarkdown(activeNoteBody, resolvedActiveAisleId)

  const registerMountedEditorSnapshotProvider = (provider: MountedEditorSnapshotProvider) => {
    mountedEditorSnapshotProviderRef.current = provider
    return () => {
      if (mountedEditorSnapshotProviderRef.current === provider) {
        mountedEditorSnapshotProviderRef.current = null
      }
    }
  }

  useEffect(() => {
    window.__tabsGetLatestAppState = () =>
      measureSlowOperation('app-state serialization', () => JSON.stringify(buildStateWithLatestEditorContent()))
    return () => {
      delete window.__tabsGetLatestAppState
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const flushOnExit = (event: PageTransitionEvent | Event) => {
      cancelFocusBoundaryFlush()
      clearPendingSaveTimer()
      const eventName: Extract<EditorFocusBoundaryEvent, 'beforeunload' | 'pagehide'> =
        event.type === 'pagehide' ? 'pagehide' : 'beforeunload'
      persistLatestStateSnapshot(getEditorFocusBoundarySaveOptions(eventName, pendingContentRef.current.size))
    }

    window.addEventListener('beforeunload', flushOnExit)
    window.addEventListener('pagehide', flushOnExit)
    return () => {
      window.removeEventListener('beforeunload', flushOnExit)
      window.removeEventListener('pagehide', flushOnExit)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const flushOnWindowBlur = () => scheduleFocusBoundaryFlush('blur')
    const flushOnHidden = () => scheduleFocusBoundaryFlush('visibilitychange')

    window.addEventListener('blur', flushOnWindowBlur)
    document.addEventListener('visibilitychange', flushOnHidden)
    return () => {
      window.removeEventListener('blur', flushOnWindowBlur)
      document.removeEventListener('visibilitychange', flushOnHidden)
      cancelFocusBoundaryFlush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const clearPendingLocalWrite = () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      pendingContentRef.current.clear()
      lastEditorMarkdownByAisleRef.current.clear()
    }

    window.addEventListener('tabs:external-app-state-updated', clearPendingLocalWrite)
    return () => window.removeEventListener('tabs:external-app-state-updated', clearPendingLocalWrite)
  }, [])

  useEffect(() => {
    return () => {
      clearPendingSaveTimer()
      cancelFocusBoundaryFlush()
    }
  }, [])

  return {
    pendingContentRef,
    saveTimerRef,
    lastEditorMarkdownRef,
    lastEditorMarkdownByAisleRef,
    normalizingContentRef,
    normalizingAisleIdsRef,
    buildStateWithLatestEditorContent,
    flushPendingContent,
    scheduleContentCommit,
    scheduleKnownMarkdownDraftCommit,
    scheduleLazyContentCommit,
    commitCurrentEditorContent,
    commitActiveEditorMarkdownNow,
    replaceActiveEditorMarkdown,
    getActiveEditorMarkdown,
    registerMountedEditorSnapshotProvider,
    persistLatestStateSnapshot,
  }
}
