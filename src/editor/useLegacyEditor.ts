/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, type MutableRefObject } from 'react'
import { Editor } from '@toast-ui/editor'
import { createCodeBlockControlsPlugin } from './code-block-controls'
import {
  annotationLinePlugin,
  blockIndentPlugin,
  codeBlockBacktickShortcutPlugin,
  EDITOR_TOOLBAR_ITEMS,
  headingSpaceShortcutPlugin,
  highlightPlugin,
  installClearToolbarButton,
  installHeadingPopupActiveState,
  installToolbarAppTooltips,
  listMarkerPlugin,
  multiLineSelectionShortcutPlugin,
  tagAppearancePlugin,
  thematicBreakShortcutPlugin,
  uncheckedTaskEnterPlugin,
} from './editor-setup'
import { sanitizeEditorHtml } from './editor-sanitizer'
import { createMediaLinkPlugin } from './media-link-plugin'
import { terminalBlockLandingPlugin } from './terminal-block-landing'
import {
  installCompletedTaskCheckboxBehavior,
  installTaskTextReorderBehavior,
} from './task-behavior'
import { importImageBlobAsAssetUrl } from '../markdown/image-asset-registry'
import { withDefaultInsertedImageDisplayWidth } from './image-insertion'
import { measureSlowOperation } from '../performance/performance-logging'
import type { ToastTone, ViewMode } from '../types/app'
import { prepareMarkdownForEditorDisplay, restoreEditorBlankParagraphs, setEditorMarkdownForDisplay } from './editor-markdown-display'
import { markWysiwygLoadedUndoBoundary } from './prosemirror-utils'

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
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
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
  pushToast,
  maybeShowCompletedTaskUndoHint,
  trackCompletedTaskQuickDelete,
  tryExpandMultilineSelection,
}: UseLegacyEditorOptions) {
  const commitLegacyEditorMarkdown = (committedEditor: Editor) => {
    const markdown = getNormalizedEditorMarkdown(committedEditor)
    lastEditorMarkdownRef.current = markdown
    scheduleContentCommit(
      markdown,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
    )
  }

  useEffect(() => {
    if (viewMode === 'main') return
    if (!isEditorView) return
    if (!editorMountRef.current || editorRef.current) return

    lastEditorMarkdownRef.current = displayContent
    editorRef.current = new Editor({
      el: editorMountRef.current,
      initialValue: prepareMarkdownForEditorDisplay(displayContent),
      initialEditType: 'wysiwyg',
      previewStyle: 'tab',
      hideModeSwitch: true,
      customHTMLSanitizer: sanitizeEditorHtml,
      toolbarItems: EDITOR_TOOLBAR_ITEMS,
      height: '100%',
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
          void importImageBlobAsAssetUrl(blob, blob instanceof File ? blob.name : 'image').then((assetUrl) => {
            if (!assetUrl) {
              pushToast('could not import image.', 'warning')
              return
            }
            void withDefaultInsertedImageDisplayWidth(assetUrl, blob, editorMountRef.current).then((displayUrl) => {
              callback(displayUrl, blob instanceof File ? blob.name : 'image')
              window.setTimeout(() => commitCurrentEditorContent(), 30)
            })
          })
        },
      },
      events: {
        change: () => measureSlowOperation('legacy editor change', () => {
          if (!isMainViewRef.current) return
          const currentEditor = editorRef.current
          if (!currentEditor) return
          const markdown = getNormalizedEditorMarkdown(currentEditor)

          if (normalizingContentRef.current) {
            normalizingContentRef.current = false
            const normalizedMarkdown = lastEditorMarkdownRef.current
            if (markdown === normalizedMarkdown) {
              scheduleContentCommit(
                normalizedMarkdown,
                activeSpaceIdRef.current,
                activeTabIdRef.current,
                activeSubTabIdRef.current,
                activeAisleIdRef.current,
              )
              return
            }
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
        }),
      },
    })
    restoreEditorBlankParagraphs(editorRef.current, displayContent)
    markWysiwygLoadedUndoBoundary(editorRef.current)
    installClearToolbarButton(editorMountRef.current, clearActiveNoteContent)
    const cleanupToolbarAppTooltips = installToolbarAppTooltips(editorMountRef.current)
    const cleanupHeadingPopupActiveState = installHeadingPopupActiveState(editorMountRef.current, () => editorRef.current)
    const cleanupCompletedTaskCheckboxBehavior = installCompletedTaskCheckboxBehavior(
      editorMountRef.current,
      () => editorRef.current,
      trackCompletedTaskQuickDelete,
      commitLegacyEditorMarkdown,
    )
    const cleanupTaskTextReorderBehavior = installTaskTextReorderBehavior(editorMountRef.current, () => editorRef.current, {
      onReorderCommitted: () => commitCurrentEditorContent(),
    })

    return () => {
      cleanupToolbarAppTooltips()
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

    const existing = getNormalizedEditorMarkdown(instance)
    if (existing !== displayContent) {
      lastEditorMarkdownRef.current = displayContent
      setEditorMarkdownForDisplay(instance, displayContent)
    }
  }, [displayContent, viewMode, syncKey])
}
