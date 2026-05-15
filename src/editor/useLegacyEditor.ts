/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, type MutableRefObject } from 'react'
import { Editor } from '@toast-ui/editor'
import {
  annotationLinePlugin,
  EDITOR_TOOLBAR_ITEMS,
  headingSpaceShortcutPlugin,
  installClearToolbarButton,
  installHeadingPopupActiveState,
  listMarkerPlugin,
  multiLineSelectionShortcutPlugin,
  thematicBreakShortcutPlugin,
  uncheckedTaskEnterPlugin,
} from './editor-setup'
import { terminalBlockLandingPlugin } from './terminal-block-landing'
import {
  installCompletedTaskCheckboxBehavior,
  installTaskTextReorderBehavior,
} from './task-behavior'
import { materializeHorizontalRuleShortcut } from '../markdown/markdown-utils'
import type { ViewMode } from '../types/app'

type UseLegacyEditorOptions = {
  viewMode: ViewMode
  isEditorView: boolean
  displayContent: string
  syncKey: string
  editorMountRef: MutableRefObject<HTMLDivElement | null>
  editorRef: MutableRefObject<Editor | null>
  multiLineCursorPluginKeyRef: MutableRefObject<any>
  lastEditorMarkdownRef: MutableRefObject<string>
  normalizingContentRef: MutableRefObject<boolean>
  activeSpaceIdRef: MutableRefObject<string>
  activeTabIdRef: MutableRefObject<string>
  activeSubTabIdRef: MutableRefObject<string | null>
  activeAisleIdRef: MutableRefObject<string>
  isMainViewRef: MutableRefObject<boolean>
  getNormalizedEditorMarkdown: (editor: Editor) => string
  scheduleContentCommit: (
    markdown: string,
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
  ) => void
  commitCurrentEditorContent: () => void
  clearActiveNoteContent: () => void
  flushPendingContent: () => void
  closeImageTools: () => void
  maybeShowCompletedTaskUndoHint: (markdown: string) => void
  trackCompletedTaskQuickDelete: (beforeMarkdown: string) => void
  tryExpandMultilineSelection: (direction: 'up' | 'down') => boolean
}

export function useLegacyEditor({
  viewMode,
  isEditorView,
  displayContent,
  syncKey,
  editorMountRef,
  editorRef,
  multiLineCursorPluginKeyRef,
  lastEditorMarkdownRef,
  normalizingContentRef,
  activeSpaceIdRef,
  activeTabIdRef,
  activeSubTabIdRef,
  activeAisleIdRef,
  isMainViewRef,
  getNormalizedEditorMarkdown,
  scheduleContentCommit,
  commitCurrentEditorContent,
  clearActiveNoteContent,
  flushPendingContent,
  closeImageTools,
  maybeShowCompletedTaskUndoHint,
  trackCompletedTaskQuickDelete,
  tryExpandMultilineSelection,
}: UseLegacyEditorOptions) {
  useEffect(() => {
    if (viewMode === 'main') return
    if (!isEditorView) return
    if (!editorMountRef.current || editorRef.current) return

    lastEditorMarkdownRef.current = displayContent
    editorRef.current = new Editor({
      el: editorMountRef.current,
      initialValue: displayContent,
      initialEditType: 'wysiwyg',
      previewStyle: 'tab',
      hideModeSwitch: true,
      toolbarItems: EDITOR_TOOLBAR_ITEMS,
      height: '100%',
      usageStatistics: false,
      plugins: [
        listMarkerPlugin,
        annotationLinePlugin,
        terminalBlockLandingPlugin,
        uncheckedTaskEnterPlugin,
        headingSpaceShortcutPlugin,
        thematicBreakShortcutPlugin,
        (context: any) =>
          multiLineSelectionShortcutPlugin({
            ...context,
            onExpand: tryExpandMultilineSelection,
            onPluginKeyReady: (pluginKey) => {
              multiLineCursorPluginKeyRef.current = pluginKey
            },
          }),
      ],
      hooks: {
        addImageBlobHook: (blob: Blob | File, callback: (url: string, text?: string) => void) => {
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : ''
            if (!dataUrl) return
            callback(dataUrl, blob instanceof File ? blob.name : 'image')
            window.setTimeout(() => commitCurrentEditorContent(), 30)
          }
          reader.readAsDataURL(blob)
        },
      },
      events: {
        change: () => {
          if (!isMainViewRef.current) return
          const currentEditor = editorRef.current
          if (!currentEditor) return
          const markdown = getNormalizedEditorMarkdown(currentEditor)
          const previousMarkdown = lastEditorMarkdownRef.current

          if (normalizingContentRef.current) {
            normalizingContentRef.current = false
            const normalizedMarkdown = lastEditorMarkdownRef.current
            scheduleContentCommit(
              normalizedMarkdown,
              activeSpaceIdRef.current,
              activeTabIdRef.current,
              activeSubTabIdRef.current,
              activeAisleIdRef.current,
            )
            return
          }

          const materializedHorizontalRule = materializeHorizontalRuleShortcut(previousMarkdown, markdown)
          if (materializedHorizontalRule && materializedHorizontalRule !== markdown) {
            normalizingContentRef.current = true
            lastEditorMarkdownRef.current = materializedHorizontalRule
            currentEditor.setMarkdown(materializedHorizontalRule, false)
            return
          }

          maybeShowCompletedTaskUndoHint(markdown)
          lastEditorMarkdownRef.current = markdown
          scheduleContentCommit(
            markdown,
            activeSpaceIdRef.current,
            activeTabIdRef.current,
            activeSubTabIdRef.current,
            activeAisleIdRef.current,
          )
        },
      },
    })

    installClearToolbarButton(editorMountRef.current, clearActiveNoteContent)
    const cleanupHeadingPopupActiveState = installHeadingPopupActiveState(editorMountRef.current, () => editorRef.current)
    const cleanupCompletedTaskCheckboxBehavior = installCompletedTaskCheckboxBehavior(
      editorMountRef.current,
      () => editorRef.current,
      trackCompletedTaskQuickDelete,
    )
    const cleanupTaskTextReorderBehavior = installTaskTextReorderBehavior(editorMountRef.current, () => editorRef.current)

    return () => {
      cleanupTaskTextReorderBehavior()
      cleanupCompletedTaskCheckboxBehavior()
      cleanupHeadingPopupActiveState()
      flushPendingContent()
      closeImageTools()
      try {
        editorRef.current?.destroy()
      } catch {
        // Toast UI can throw during teardown if the toolbar DOM was customized.
      }
      editorRef.current = null
      multiLineCursorPluginKeyRef.current = null
      if (editorMountRef.current) {
        editorMountRef.current.innerHTML = ''
      }
    }
  }, [isEditorView, viewMode])

  useEffect(() => {
    if (viewMode === 'main') return
    const instance = editorRef.current
    if (!instance) return

    const existing = instance.getMarkdown()
    if (existing !== displayContent) {
      lastEditorMarkdownRef.current = displayContent
      instance.setMarkdown(displayContent, false)
    }
  }, [displayContent, viewMode, syncKey])
}
