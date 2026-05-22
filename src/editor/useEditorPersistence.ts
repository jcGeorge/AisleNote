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
    return getNormalizedEditorMarkdown(editor)
  } catch {
    return fallbackMarkdown
  }
}

export type EditorContentTarget = {
  spaceId: string
  tabId: string
  subTabId: string | null
  aisleId: string
  aisleBodyId?: string | null
}

export function pendingContentMatchesTarget(pending: PendingContent, target: EditorContentTarget): boolean {
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

export function applyFreshEditorSnapshotToState(
  sourceState: AppState,
  target: EditorContentTarget,
  markdown: string,
  pending: PendingContent | null | undefined,
): AppState {
  let nextState = applyMarkdownToAppState(
    sourceState,
    target.spaceId,
    target.tabId,
    target.subTabId,
    target.aisleId,
    markdown,
    { aisleBodyId: target.aisleBodyId },
  )
  if (pending && !pendingContentMatchesTarget(pending, target)) {
    nextState = applyMarkdownToAppState(
      nextState,
      pending.spaceId,
      pending.tabId,
      pending.subTabId,
      pending.aisleId,
      pending.markdown,
      { aisleBodyId: pending.aisleBodyId },
    )
  }
  return nextState
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
  const pendingContentRef = useRef<PendingContent | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const lastEditorMarkdownRef = useRef('')
  const lastEditorMarkdownByAisleRef = useRef<Map<string, string>>(new Map())
  const normalizingContentRef = useRef(false)
  const normalizingAisleIdsRef = useRef<Set<string>>(new Set())

  const getAisleBodyIdForAisleId = (aisleId: string) => {
    const aisle = activeNoteBody?.aisles.find((candidate) => candidate.id === aisleId)
    return aisle ? getAisleBodyId(aisle) : aisleId
  }

  const getActiveContentTarget = () => ({
    spaceId: activeSpaceIdRef.current,
    tabId: activeTabIdRef.current,
    subTabId: activeSubTabIdRef.current,
    aisleId: activeAisleIdRef.current,
    aisleBodyId: getAisleBodyIdForAisleId(activeAisleIdRef.current),
  })

  const applyContentToTarget = (
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
    markdown: string,
    aisleBodyId?: string | null,
  ) => {
    setState((previous) => applyMarkdownToAppState(previous, spaceId, tabId, subTabId, aisleId, markdown, { aisleBodyId }))
  }

  const buildStateWithLatestEditorContent = () => {
    let nextState = stateRef.current
    const pending = pendingContentRef.current

    if (isMainViewRef.current && editorRef.current) {
      const currentEditor = editorRef.current
      const target = getActiveContentTarget()
      const markdown = getSnapshotEditorMarkdown(currentEditor, lastEditorMarkdownRef.current, getNormalizedEditorMarkdown)
      lastEditorMarkdownRef.current = markdown
      lastEditorMarkdownByAisleRef.current.set(target.aisleBodyId, markdown)

      nextState = applyFreshEditorSnapshotToState(nextState, target, markdown, pending)
      return applyActiveCursorToState(applyAutoPurgeToAppState(nextState))
    }

    if (pending) {
      nextState = applyMarkdownToAppState(
        nextState,
        pending.spaceId,
        pending.tabId,
        pending.subTabId,
        pending.aisleId,
        pending.markdown,
        { aisleBodyId: pending.aisleBodyId },
      )
    }
    if (!isMainViewRef.current) return applyAutoPurgeToAppState(nextState)
    if (!editorRef.current) return applyActiveCursorToState(applyAutoPurgeToAppState(nextState))
    return applyActiveCursorToState(applyAutoPurgeToAppState(nextState))
  }

  const persistLatestStateSnapshot = (options: AppStateSaveOptions = { snapshotMode: 'force', preferSync: true }) => {
    const latestState = buildStateWithLatestEditorContent()
    const serializedState = measureSlowOperation('app-state serialization', () => JSON.stringify(latestState))
    appPersistenceService.saveSerializedState(serializedState, {
      ...options,
      preferSync: true,
    })
    void appPersistenceService.flushPendingSaves?.()
  }

  const flushPendingContent = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    const pending = pendingContentRef.current
    pendingContentRef.current = null

    if (!isMainViewRef.current || !editorRef.current) {
      if (pending) {
        applyContentToTarget(
          pending.spaceId,
          pending.tabId,
          pending.subTabId,
          pending.aisleId,
          pending.markdown,
          pending.aisleBodyId,
        )
      }
      return
    }

    const currentEditor = editorRef.current
    const target = getActiveContentTarget()
    const markdown = getSnapshotEditorMarkdown(currentEditor, lastEditorMarkdownRef.current, getNormalizedEditorMarkdown)
    lastEditorMarkdownRef.current = markdown
    lastEditorMarkdownByAisleRef.current.set(target.aisleBodyId, markdown)
    applyContentToTarget(
      target.spaceId,
      target.tabId,
      target.subTabId,
      target.aisleId,
      markdown,
      target.aisleBodyId,
    )
    if (pending && !pendingContentMatchesTarget(pending, target)) {
      applyContentToTarget(
        pending.spaceId,
        pending.tabId,
        pending.subTabId,
        pending.aisleId,
        pending.markdown,
        pending.aisleBodyId,
      )
    }
  }

  const scheduleContentCommit = (
    markdown: string,
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
    options: { aisleBodyId?: string | null } = {},
  ) => {
    const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
    const explicitAisleBodyId = typeof options.aisleBodyId === 'string' && options.aisleBodyId.trim()
      ? options.aisleBodyId.trim()
      : null
    const aisleBodyId = explicitAisleBodyId ?? getAisleBodyIdForAisleId(aisleId)
    if (aisleId === activeAisleIdRef.current) {
      lastEditorMarkdownRef.current = normalizedMarkdown
    }
    lastEditorMarkdownByAisleRef.current.set(aisleBodyId, normalizedMarkdown)
    pendingContentRef.current = { spaceId, tabId, subTabId, aisleId, aisleBodyId, markdown: normalizedMarkdown }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      if (!pendingContentRef.current) return
      const next = pendingContentRef.current
      pendingContentRef.current = null
      applyContentToTarget(next.spaceId, next.tabId, next.subTabId, next.aisleId, next.markdown, next.aisleBodyId)
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
    pendingContentRef.current = null
    applyContentToTarget(
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
      normalized,
      activeAisleBodyId,
    )
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
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
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
    const clearPendingLocalWrite = () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      pendingContentRef.current = null
      lastEditorMarkdownByAisleRef.current.clear()
    }

    window.addEventListener('tabs:external-app-state-updated', clearPendingLocalWrite)
    return () => window.removeEventListener('tabs:external-app-state-updated', clearPendingLocalWrite)
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
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
    persistLatestStateSnapshot,
  }
}
