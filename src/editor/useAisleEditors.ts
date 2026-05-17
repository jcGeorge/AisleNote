/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, type MutableRefObject } from 'react'
import { Editor } from '@toast-ui/editor'
import { buildAisleEditorKey, type AisleEditorMeta } from './aisle-editor'
import { createCodeBlockControlsPlugin } from './code-block-controls'
import {
  annotationLinePlugin,
  EDITOR_TOOLBAR_ITEMS,
  headingSpaceShortcutPlugin,
  installHeadingPopupActiveState,
  listMarkerPlugin,
  multiLineSelectionShortcutPlugin,
  thematicBreakShortcutPlugin,
  uncheckedTaskEnterPlugin,
} from './editor-setup'
import { terminalBlockLandingPlugin } from './terminal-block-landing'
import { createContextPreviewPlugin, type ContextPreviewData } from './note-preview-plugin'
import { getElementFromEventTarget } from './prosemirror-utils'
import {
  installCompletedTaskCheckboxBehavior,
  installTaskTextReorderBehavior,
} from './task-behavior'
import {
  materializeHorizontalRuleShortcut,
  normalizeMarkdownForPersistence,
} from '../markdown/markdown-utils'
import type { NoteAisle, NoteLocation, PendingContent, ToastTone, ViewMode } from '../types/app'
import type { NoteContextReferencePayload } from '../notes/note-references'
import type { PendingCursorRestore } from './useNoteCursorPersistence'

type ActivateAisleEditorOptions = {
  flushPrevious?: boolean
  focus?: boolean
  allowDuringPendingRename?: boolean
}

type UseAisleEditorsOptions = {
  viewMode: ViewMode
  activeNoteBodyId: string
  activeNoteAisles: NoteAisle[]
  resolvedActiveAisleId: string
  activeAisleId: string
  setActiveAisleId: (aisleId: string) => void
  editorRef: MutableRefObject<Editor | null>
  multiLineCursorPluginKeyRef: MutableRefObject<any>
  lastEditorMarkdownRef: MutableRefObject<string>
  lastEditorMarkdownByAisleRef: MutableRefObject<Map<string, string>>
  normalizingContentRef: MutableRefObject<boolean>
  normalizingAisleIdsRef: MutableRefObject<Set<string>>
  pendingContentRef: MutableRefObject<PendingContent | null>
  pendingCursorRestoreRef: MutableRefObject<PendingCursorRestore | null>
  activeSpaceIdRef: MutableRefObject<string>
  activeTabIdRef: MutableRefObject<string>
  activeSubTabIdRef: MutableRefObject<string | null>
  activeAisleIdRef: MutableRefObject<string>
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
  ) => void
  commitCurrentEditorContent: () => void
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
  maybeShowCompletedTaskUndoHint: (markdown: string) => void
  trackCompletedTaskQuickDelete: (beforeMarkdown: string) => void
  tryExpandMultilineSelection: (direction: 'up' | 'down') => boolean
  scheduleToolbarFormatStateSync: () => void
  getContextPreviewData: (payload: NoteContextReferencePayload, sourceNoteBodyId: string) => ContextPreviewData
  navigateToNoteLocation: (location: NoteLocation) => void
  deleteContextPreview: (tokenId: string) => void
}

export function useAisleEditors({
  viewMode,
  activeNoteBodyId,
  activeNoteAisles,
  resolvedActiveAisleId,
  activeAisleId,
  setActiveAisleId,
  editorRef,
  multiLineCursorPluginKeyRef,
  lastEditorMarkdownRef,
  lastEditorMarkdownByAisleRef,
  normalizingContentRef,
  normalizingAisleIdsRef,
  pendingContentRef,
  pendingCursorRestoreRef,
  activeSpaceIdRef,
  activeTabIdRef,
  activeSubTabIdRef,
  activeAisleIdRef,
  isMainViewRef,
  closeImageToolsRef,
  closeImageToolsIfSelectedImageMissingRef,
  isPendingCreatedRenameActive,
  saveActiveCursorLocation,
  flushPendingContent,
  clearMultiLineEdit,
  getNormalizedEditorMarkdown,
  scheduleContentCommit,
  commitCurrentEditorContent,
  pushToast,
  maybeShowCompletedTaskUndoHint,
  trackCompletedTaskQuickDelete,
  tryExpandMultilineSelection,
  scheduleToolbarFormatStateSync,
  getContextPreviewData,
  navigateToNoteLocation,
  deleteContextPreview,
}: UseAisleEditorsOptions) {
  const aisleEditorRootsRef = useRef<Map<string, HTMLElement>>(new Map())
  const aisleEditorMetaRef = useRef<Map<string, AisleEditorMeta>>(new Map())

  const activateAisleEditor = (
    editorKey: string,
    options: ActivateAisleEditorOptions = {},
  ) => {
    if (isPendingCreatedRenameActive() && !options.allowDuringPendingRename) return false
    const meta = aisleEditorMetaRef.current.get(editorKey)
    if (!meta) return false

    const switchingAisle = activeAisleIdRef.current !== meta.aisleId
    if (switchingAisle && options.flushPrevious) {
      saveActiveCursorLocation()
      flushPendingContent()
      clearMultiLineEdit(false)
      closeImageToolsRef.current()
    }

    editorRef.current = meta.editor
    activeAisleIdRef.current = meta.aisleId
    multiLineCursorPluginKeyRef.current = meta.pluginKey
    const markdown = getNormalizedEditorMarkdown(meta.editor)
    lastEditorMarkdownRef.current = markdown
    lastEditorMarkdownByAisleRef.current.set(meta.aisleId, markdown)
    if (activeAisleId !== meta.aisleId) {
      setActiveAisleId(meta.aisleId)
    }
    if (options.focus) {
      meta.editor.focus()
    }
    scheduleToolbarFormatStateSync()
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

  const handleAisleEditorChange = (editorKey: string, aisleId: string, editor: Editor) => {
    if (!isMainViewRef.current) return
    activateAisleEditor(editorKey)
    closeImageToolsIfSelectedImageMissingRef.current()
    const markdown = getNormalizedEditorMarkdown(editor)
    const previousMarkdown = lastEditorMarkdownByAisleRef.current.get(aisleId) ?? ''

    if (normalizingAisleIdsRef.current.has(aisleId)) {
      normalizingAisleIdsRef.current.delete(aisleId)
      const normalizedMarkdown = lastEditorMarkdownByAisleRef.current.get(aisleId) ?? markdown
      lastEditorMarkdownRef.current = normalizedMarkdown
      scheduleContentCommit(
        normalizedMarkdown,
        activeSpaceIdRef.current,
        activeTabIdRef.current,
        activeSubTabIdRef.current,
        aisleId,
      )
      return
    }

    if (normalizingContentRef.current && activeAisleIdRef.current === aisleId) {
      normalizingContentRef.current = false
      const normalizedMarkdown = lastEditorMarkdownRef.current
      lastEditorMarkdownByAisleRef.current.set(aisleId, normalizedMarkdown)
      scheduleContentCommit(
        normalizedMarkdown,
        activeSpaceIdRef.current,
        activeTabIdRef.current,
        activeSubTabIdRef.current,
        aisleId,
      )
      return
    }

    const materializedHorizontalRule = materializeHorizontalRuleShortcut(previousMarkdown, markdown)
    if (materializedHorizontalRule && materializedHorizontalRule !== markdown) {
      normalizingAisleIdsRef.current.add(aisleId)
      lastEditorMarkdownRef.current = materializedHorizontalRule
      lastEditorMarkdownByAisleRef.current.set(aisleId, materializedHorizontalRule)
      editor.setMarkdown(materializedHorizontalRule, false)
      return
    }

    maybeShowCompletedTaskUndoHint(markdown)
    lastEditorMarkdownRef.current = markdown
    lastEditorMarkdownByAisleRef.current.set(aisleId, markdown)
    scheduleContentCommit(
      markdown,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      aisleId,
    )
  }

  const destroyAisleEditor = (editorKey: string) => {
    const meta = aisleEditorMetaRef.current.get(editorKey)
    if (!meta) return
    meta.cleanup()
    aisleEditorMetaRef.current.delete(editorKey)
    lastEditorMarkdownByAisleRef.current.delete(meta.aisleId)
    normalizingAisleIdsRef.current.delete(meta.aisleId)
    if (editorRef.current === meta.editor) {
      editorRef.current = null
      multiLineCursorPluginKeyRef.current = null
    }
  }

  const destroyAllAisleEditors = () => {
    Array.from(aisleEditorMetaRef.current.keys()).forEach((editorKey) => destroyAisleEditor(editorKey))
  }

  useEffect(() => {
    if (viewMode !== 'main' || !activeNoteBodyId) {
      destroyAllAisleEditors()
      return
    }

    const expectedKeys = new Set(activeNoteAisles.map((aisle) => buildAisleEditorKey(activeNoteBodyId, aisle.id)))

    for (const editorKey of Array.from(aisleEditorMetaRef.current.keys())) {
      if (!expectedKeys.has(editorKey)) {
        destroyAisleEditor(editorKey)
      }
    }

    for (const aisle of activeNoteAisles) {
      const editorKey = buildAisleEditorKey(activeNoteBodyId, aisle.id)
      const root = aisleEditorRootsRef.current.get(editorKey)
      if (!root || aisleEditorMetaRef.current.has(editorKey)) continue

      let pluginKey: unknown = null
      const editor = new Editor({
        el: root,
        initialValue: aisle.markdown,
        initialEditType: 'wysiwyg',
        previewStyle: 'tab',
        hideModeSwitch: true,
        toolbarItems: EDITOR_TOOLBAR_ITEMS,
        height: '100%',
        autofocus: false,
        usageStatistics: false,
        plugins: [
          listMarkerPlugin,
          annotationLinePlugin,
          terminalBlockLandingPlugin,
          createCodeBlockControlsPlugin({ pushToast }),
          uncheckedTaskEnterPlugin,
          headingSpaceShortcutPlugin,
          thematicBreakShortcutPlugin,
          (context: any) =>
            createContextPreviewPlugin(context, {
              sourceNoteBodyId: activeNoteBodyId,
              getContextPreviewData,
              navigateToNoteLocation,
              deleteContextPreview,
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
          change: () => handleAisleEditorChange(editorKey, aisle.id, editor),
          focus: () => activateAisleEditor(editorKey, { flushPrevious: true }),
        },
      })

      const activate = () => activateAisleEditor(editorKey, { flushPrevious: true })
      root.addEventListener('focusin', activate)
      root.addEventListener('pointerdown', activate, true)
      const cleanupHeadingPopupActiveState = installHeadingPopupActiveState(root, () => editor)
      const cleanupCompletedTaskCheckboxBehavior = installCompletedTaskCheckboxBehavior(
        root,
        () => editor,
        trackCompletedTaskQuickDelete,
      )
      const cleanupTaskTextReorderBehavior = installTaskTextReorderBehavior(root, () => editor, {
        onReorderCommitted: (committedEditor) => {
          pendingCursorRestoreRef.current = null
          const markdown = getNormalizedEditorMarkdown(committedEditor)
          lastEditorMarkdownRef.current = markdown
          lastEditorMarkdownByAisleRef.current.set(aisle.id, markdown)
          scheduleContentCommit(
            markdown,
            activeSpaceIdRef.current,
            activeTabIdRef.current,
            activeSubTabIdRef.current,
            aisle.id,
          )
        },
      })

      aisleEditorMetaRef.current.set(editorKey, {
        editor,
        root,
        aisleId: aisle.id,
        pluginKey,
        cleanup: () => {
          cleanupTaskTextReorderBehavior()
          cleanupCompletedTaskCheckboxBehavior()
          cleanupHeadingPopupActiveState()
          root.removeEventListener('focusin', activate)
          root.removeEventListener('pointerdown', activate, true)
          try {
            editor.destroy()
          } catch {
            // Toast UI can throw during teardown if the toolbar DOM was customized.
          }
          root.innerHTML = ''
        },
      })
      lastEditorMarkdownByAisleRef.current.set(aisle.id, normalizeMarkdownForPersistence(aisle.markdown))
    }

    const activeEditorKey = buildAisleEditorKey(activeNoteBodyId, resolvedActiveAisleId)
    if (aisleEditorMetaRef.current.has(activeEditorKey)) {
      activateAisleEditor(activeEditorKey)
    }
  }, [viewMode, activeNoteBodyId, activeNoteAisles, resolvedActiveAisleId])

  useEffect(() => () => destroyAllAisleEditors(), [])

  useEffect(() => {
    if (viewMode !== 'main' || !activeNoteBodyId) return
    for (const aisle of activeNoteAisles) {
      const editorKey = buildAisleEditorKey(activeNoteBodyId, aisle.id)
      const meta = aisleEditorMetaRef.current.get(editorKey)
      if (!meta) continue
      const pending = pendingContentRef.current
      const pendingMatches =
        pending &&
        pending.spaceId === activeSpaceIdRef.current &&
        pending.tabId === activeTabIdRef.current &&
        pending.subTabId === activeSubTabIdRef.current &&
        pending.aisleId === aisle.id
      const expectedMarkdown = pendingMatches ? pending.markdown : aisle.markdown
      const currentMarkdown = getNormalizedEditorMarkdown(meta.editor)
      if (currentMarkdown !== expectedMarkdown) {
        lastEditorMarkdownByAisleRef.current.set(aisle.id, normalizeMarkdownForPersistence(expectedMarkdown))
        if (activeAisleIdRef.current === aisle.id) {
          lastEditorMarkdownRef.current = normalizeMarkdownForPersistence(expectedMarkdown)
        }
        meta.editor.setMarkdown(expectedMarkdown, false)
      }
    }
  }, [viewMode, activeNoteBodyId, activeNoteAisles])

  return {
    activateAisleEditor,
    activateEditorFromEventTarget,
    registerAisleEditorRoot,
  }
}
