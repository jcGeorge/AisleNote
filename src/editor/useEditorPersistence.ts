import type { Editor } from '@toast-ui/editor'
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { getAisleBodyId, getNoteBodyMarkdown } from '../notes/aisle-body-state'
import { measureSlowOperation } from '../performance/performance-logging'
import { applyAutoPurgeToAppState, applyMarkdownToAppState } from '../state/app-state'
import { appPersistenceService } from '../storage/app-persistence-service'
import type { AppStateSaveOptions } from '../storage/persistence-debounce'
import type { AppState, NoteBody, PendingContent } from '../types/app'
import { setEditorMarkdownForDisplay } from './editor-markdown-display'

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
export type PendingContentMap = Map<string, PendingContent>
export type EditorFocusBoundaryEvent = 'blur' | 'visibilitychange' | 'beforeunload' | 'pagehide'
export type EditorFocusBoundaryFlushAction = 'schedule' | 'force' | 'ignore'

export const EDITOR_FOCUS_BOUNDARY_FLUSH_DELAY_MS = 60

export function resolveEditorFocusBoundaryFlushAction(
  eventName: EditorFocusBoundaryEvent,
  scheduledTimerId: number | null,
  visibilityState = 'visible',
): EditorFocusBoundaryFlushAction {
  if (eventName === 'beforeunload' || eventName === 'pagehide') return 'force'
  if (eventName === 'visibilitychange' && visibilityState !== 'hidden') return 'ignore'
  return scheduledTimerId === null ? 'schedule' : 'ignore'
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

function getLocationNoteBodyId(sourceState: AppState, target: EditorContentTarget): string | null {
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
  snapshotsByAisleBodyId.forEach((snapshot) => {
    nextState = applyMarkdownToAppState(
      nextState,
      snapshot.spaceId,
      snapshot.tabId,
      snapshot.subTabId,
      snapshot.aisleId,
      snapshot.markdown,
      { aisleBodyId: snapshot.aisleBodyId },
    )
  })
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

  const getPendingContentSnapshots = () => Array.from(pendingContentRef.current.values())

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

  const buildLatestContentSnapshots = () => [
    ...getPendingContentSnapshots(),
    ...getMountedEditorSnapshots(),
  ]

  const applyContentSnapshots = (snapshots: EditorContentSnapshot[]) => {
    if (snapshots.length === 0) return
    setState((previous) => applyEditorContentSnapshotsToState(previous, snapshots))
  }

  const buildStateWithLatestEditorContent = () => {
    const nextState = applyEditorContentSnapshotsToState(stateRef.current, buildLatestContentSnapshots())
    if (!isMainViewRef.current) return applyAutoPurgeToAppState(nextState)
    if (!editorRef.current) return applyActiveCursorToState(applyAutoPurgeToAppState(nextState))
    return applyActiveCursorToState(applyAutoPurgeToAppState(nextState))
  }

  const persistStateSnapshot = (
    latestState: AppState,
    options: AppStateSaveOptions = { snapshotMode: 'force', preferSync: true },
  ) => {
    const serializedState = measureSlowOperation('app-state serialization', () => JSON.stringify(latestState))
    appPersistenceService.saveSerializedState(serializedState, {
      ...options,
      preferSync: true,
    })
    void appPersistenceService.flushPendingSaves?.()
  }

  const persistLatestStateSnapshot = (options: AppStateSaveOptions = { snapshotMode: 'force', preferSync: true }) => {
    persistStateSnapshot(buildStateWithLatestEditorContent(), options)
  }

  const clearPendingSaveTimer = () => {
    if (saveTimerRef.current === null) return
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
  }

  const cancelFocusBoundaryFlush = () => {
    if (focusBoundaryFlushTimerRef.current === null) return
    window.clearTimeout(focusBoundaryFlushTimerRef.current)
    focusBoundaryFlushTimerRef.current = null
  }

  const flushAndPersistFocusBoundarySnapshot = () => measureSlowOperation('editor focus-boundary persistence flush', () => {
    clearPendingSaveTimer()
    const latestState = buildStateWithLatestEditorContent()
    pendingContentRef.current.clear()
    setState(latestState)
    persistStateSnapshot(latestState, { snapshotMode: 'force', preferSync: true })
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
      flushAndPersistFocusBoundarySnapshot()
    }, EDITOR_FOCUS_BOUNDARY_FLUSH_DELAY_MS)
  }

  const flushPendingContent = () => measureSlowOperation('editor pending content flush', () => {
    clearPendingSaveTimer()

    const snapshots = buildLatestContentSnapshots()
    pendingContentRef.current.clear()
    applyContentSnapshots(snapshots)
  })

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

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      const snapshots = getPendingContentSnapshots()
      pendingContentRef.current.clear()
      applyContentSnapshots(snapshots)
    }, 180)
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
    if (currentEditor) setEditorMarkdownForDisplay(currentEditor, normalized)
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
    const flushOnExit = () => {
      cancelFocusBoundaryFlush()
      clearPendingSaveTimer()
      persistLatestStateSnapshot()
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
    commitCurrentEditorContent,
    commitActiveEditorMarkdownNow,
    replaceActiveEditorMarkdown,
    getActiveEditorMarkdown,
    registerMountedEditorSnapshotProvider,
    persistLatestStateSnapshot,
  }
}
