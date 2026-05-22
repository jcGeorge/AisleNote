import type { MutableRefObject } from 'react'
import type { Editor } from '@toast-ui/editor'
import { getCommandCapableEditor, getWysiwygView } from './prosemirror-utils'
import type { ToastTone } from '../types/app'

export type EditorOperationHistoryPolicy = 'default' | 'skip'
export type EditorOperationFocusIntent = 'focus' | 'none'
export type EditorOperationCommitMode = 'none' | 'immediate' | 'deferred'

export type EditorOperationToast = {
  message: string
  tone?: ToastTone
  durationMs?: number
}

export type EditorOperationResult = {
  handled: boolean
  changed: boolean
  historyPolicy: EditorOperationHistoryPolicy
  focus: EditorOperationFocusIntent
  toast?: EditorOperationToast
}

export type EditorOperationRuntime = {
  editorRef: MutableRefObject<Editor | null>
  commitActiveEditorMarkdownNow: (editor: Editor) => string
  replaceActiveEditorMarkdown?: (markdown: string) => void
  syncToolbarFormatState?: () => void
  pushToast?: (message: string, tone?: ToastTone, durationMs?: number) => void
}

export type EditorOperationContext = {
  editor: Editor
  view: any | null
  runtime: EditorOperationRuntime
}

type EditorOperationOptions = {
  historyPolicy?: EditorOperationHistoryPolicy
  focus?: EditorOperationFocusIntent
  commitMode?: EditorOperationCommitMode
  syncToolbar?: boolean
  scrollIntoView?: boolean
  toast?: EditorOperationToast
}

const DEFAULT_OPERATION_OPTIONS: Required<Omit<EditorOperationOptions, 'toast'>> = {
  historyPolicy: 'default',
  focus: 'focus',
  commitMode: 'immediate',
  syncToolbar: false,
  scrollIntoView: true,
}

export function getEditorOperationContext(runtime: EditorOperationRuntime): EditorOperationContext | null {
  const editor = runtime.editorRef.current
  if (!editor) return null
  return {
    editor,
    view: getWysiwygView(editor),
    runtime,
  }
}

function normalizeOptions(options: EditorOperationOptions = {}) {
  return {
    ...DEFAULT_OPERATION_OPTIONS,
    ...options,
  }
}

export function buildEditorOperationResult(
  handled: boolean,
  changed: boolean,
  options: EditorOperationOptions = {},
): EditorOperationResult {
  const normalized = normalizeOptions(options)
  return {
    handled,
    changed,
    historyPolicy: normalized.historyPolicy,
    focus: normalized.focus,
    ...(options.toast ? { toast: options.toast } : {}),
  }
}

export function finishEditorOperation(
  runtime: EditorOperationRuntime,
  editor: Editor,
  options: EditorOperationOptions = {},
): string | null {
  const normalized = normalizeOptions(options)
  const commit = () => {
    const markdown = runtime.commitActiveEditorMarkdownNow(editor)
    if (normalized.syncToolbar) runtime.syncToolbarFormatState?.()
    if (options.toast) runtime.pushToast?.(options.toast.message, options.toast.tone, options.toast.durationMs)
    return markdown
  }

  if (normalized.focus === 'focus') {
    editor.focus()
  }

  if (normalized.commitMode === 'none') {
    if (normalized.syncToolbar) runtime.syncToolbarFormatState?.()
    if (options.toast) runtime.pushToast?.(options.toast.message, options.toast.tone, options.toast.durationMs)
    return null
  }

  if (normalized.commitMode === 'deferred') {
    window.setTimeout(() => {
      if (runtime.editorRef.current === editor) {
        commit()
      }
    }, 0)
    return null
  }

  return commit()
}

export function dispatchEditorTransaction(
  runtime: EditorOperationRuntime,
  buildTransaction: (context: EditorOperationContext) => any | null | false,
  options: EditorOperationOptions = {},
): EditorOperationResult {
  const normalized = normalizeOptions(options)
  const context = getEditorOperationContext(runtime)
  if (!context?.view) return buildEditorOperationResult(false, false, normalized)

  let transaction = buildTransaction(context)
  if (!transaction) return buildEditorOperationResult(false, false, normalized)
  if (normalized.historyPolicy === 'skip') {
    transaction = transaction.setMeta('addToHistory', false)
  }
  if (normalized.scrollIntoView && typeof transaction.scrollIntoView === 'function') {
    transaction = transaction.scrollIntoView()
  }

  context.view.dispatch(transaction)
  const changed = transaction.docChanged !== false
  finishEditorOperation(runtime, context.editor, normalized)
  return buildEditorOperationResult(true, changed, normalized)
}

export function runEditorCommandOperation(
  runtime: EditorOperationRuntime,
  command: string,
  payload?: Record<string, unknown>,
  options: EditorOperationOptions = {},
): EditorOperationResult {
  const normalized = normalizeOptions(options)
  const context = getEditorOperationContext(runtime)
  if (!context) return buildEditorOperationResult(false, false, normalized)

  if (normalized.focus === 'focus') context.editor.focus()
  getCommandCapableEditor(context.editor).exec(command, payload)
  finishEditorOperation(runtime, context.editor, normalized)
  return buildEditorOperationResult(true, true, normalized)
}

export function insertEditorTextOperation(
  runtime: EditorOperationRuntime,
  text: string,
  options: EditorOperationOptions = {},
): EditorOperationResult {
  const normalized = normalizeOptions(options)
  const context = getEditorOperationContext(runtime)
  if (!context) return buildEditorOperationResult(false, false, normalized)

  if (normalized.focus === 'focus') context.editor.focus()
  getCommandCapableEditor(context.editor).insertText(text)
  finishEditorOperation(runtime, context.editor, normalized)
  return buildEditorOperationResult(true, text.length > 0, normalized)
}

export function replaceEditorMarkdownOperation(
  runtime: EditorOperationRuntime,
  markdown: string,
  options: EditorOperationOptions = {},
): EditorOperationResult {
  const normalized = normalizeOptions(options)
  const context = getEditorOperationContext(runtime)
  if (!runtime.replaceActiveEditorMarkdown) return buildEditorOperationResult(false, false, normalized)

  runtime.replaceActiveEditorMarkdown(markdown)
  if (context && normalized.focus === 'focus') context.editor.focus()
  if (normalized.syncToolbar) runtime.syncToolbarFormatState?.()
  if (options.toast) runtime.pushToast?.(options.toast.message, options.toast.tone, options.toast.durationMs)
  return buildEditorOperationResult(true, true, normalized)
}
