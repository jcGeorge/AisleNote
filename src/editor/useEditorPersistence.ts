import { Editor } from '@toast-ui/editor'
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { getNoteBodyMarkdown } from '../notes/note-markdown'
import { applyAutoPurgeToAppState, applyMarkdownToAppState } from '../state/app-state'
import { appStateStore } from '../storage/app-state-store'
import type { AppState, NoteBody, PendingContent } from '../types/app'

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

  const applyContentToTarget = (
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
    markdown: string,
  ) => {
    setState((previous) => applyMarkdownToAppState(previous, spaceId, tabId, subTabId, aisleId, markdown))
  }

  const buildStateWithLatestEditorContent = () => {
    let nextState = stateRef.current
    const pending = pendingContentRef.current
    if (pending) {
      return applyActiveCursorToState(applyAutoPurgeToAppState(
        applyMarkdownToAppState(
          nextState,
          pending.spaceId,
          pending.tabId,
          pending.subTabId,
          pending.aisleId,
          pending.markdown,
        ),
      ))
    }

    if (!isMainViewRef.current) return applyAutoPurgeToAppState(nextState)

    if (!editorRef.current) return applyActiveCursorToState(applyAutoPurgeToAppState(nextState))
    const markdown = lastEditorMarkdownRef.current

    nextState = applyMarkdownToAppState(
      nextState,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
      markdown,
    )
    return applyActiveCursorToState(applyAutoPurgeToAppState(nextState))
  }

  const persistLatestStateSnapshot = () => {
    const latestState = buildStateWithLatestEditorContent()
    appStateStore.save(JSON.stringify(latestState))
  }

  const flushPendingContent = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    if (pendingContentRef.current) {
      const pending = pendingContentRef.current
      pendingContentRef.current = null
      applyContentToTarget(pending.spaceId, pending.tabId, pending.subTabId, pending.aisleId, pending.markdown)
      return
    }

    if (!isMainViewRef.current) return

    if (!editorRef.current) return
    const markdown = lastEditorMarkdownRef.current
    applyContentToTarget(
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
      markdown,
    )
  }

  const scheduleContentCommit = (
    markdown: string,
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
  ) => {
    const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
    if (aisleId === activeAisleIdRef.current) {
      lastEditorMarkdownRef.current = normalizedMarkdown
    }
    pendingContentRef.current = { spaceId, tabId, subTabId, aisleId, markdown: normalizedMarkdown }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      if (!pendingContentRef.current) return
      const next = pendingContentRef.current
      pendingContentRef.current = null
      applyContentToTarget(next.spaceId, next.tabId, next.subTabId, next.aisleId, next.markdown)
    }, 180)
  }

  const commitCurrentEditorContent = () => {
    if (!isMainViewRef.current) return
    const currentEditor = editorRef.current
    if (!currentEditor) return
    const markdown = getNormalizedEditorMarkdown(currentEditor)
    lastEditorMarkdownRef.current = markdown
    lastEditorMarkdownByAisleRef.current.set(activeAisleIdRef.current, markdown)
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
    lastEditorMarkdownRef.current = normalized
    lastEditorMarkdownByAisleRef.current.set(activeAisleIdRef.current, normalized)
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
    )
    return normalized
  }

  const replaceActiveEditorMarkdown = (markdown: string) => {
    const normalized = normalizeMarkdownForPersistence(markdown)
    lastEditorMarkdownRef.current = normalized
    const currentEditor = editorRef.current
    currentEditor?.setMarkdown(normalized, false)
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
    window.__tabsGetLatestAppState = () => JSON.stringify(buildStateWithLatestEditorContent())
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
  }
}
